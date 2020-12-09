import { HttpService, Injectable, Logger } from '@nestjs/common';
import { ConfigKey, ConfigService } from '../../config/config.service';
import { catchError, concatMap, filter, ignoreElements, map, mapTo, mergeMap, tap, toArray } from 'rxjs/operators';
import { defer, EMPTY, from, Observable, of, zip } from 'rxjs';
import { Movie } from '../movie.schema';
import { CreateDocumentDefinition, Model } from 'mongoose';
import { Category } from '../../categories/category.schema';
import { MovieCategory } from '../movie-category.schema';
import { Person } from '../../people/person.schema';
import { fromArray } from 'rxjs/internal/observable/fromArray';
import { InjectModel } from '@nestjs/mongoose';
import dayjs = require('dayjs');
import * as fs from 'fs';
import { ShowTime } from "../../show-times/show-time.schema";
import { Theatre } from "../../theatres/theatre.schema";
import { Comment } from "../../comments/comment.schema";
import { Ticket } from "../../seats/ticket.schema";
import { Reservation } from "../../reservations/reservation.schema";
import { Notification } from "../../notifications/notification.schema";

@Injectable()
export class MovieDbService {
  private readonly logger = new Logger('MovieDbService');

  private readonly catDocByName = new Map<string, Category>();
  private readonly personByFullName = new Map<string, Person>();

  private readonly days = Array
      .from({ length: 7 * 32 }, (_, i) => i)
      .map(i => dayjs(new Date()).add(i - 7, 'day').toDate());
  private dayCount = 0;

  constructor(
      private readonly httpService: HttpService,
      private readonly configService: ConfigService,
      @InjectModel(Movie.name) private readonly movieModel: Model<Movie>,
      @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
      @InjectModel(MovieCategory.name) private readonly movieCategoryModel: Model<MovieCategory>,
      @InjectModel(Person.name) private readonly personModel: Model<Person>,
      @InjectModel(ShowTime.name) private readonly showTimeModel: Model<ShowTime>,
      @InjectModel(Theatre.name) private readonly theatreModel: Model<Theatre>,
      @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
      @InjectModel(Ticket.name) private readonly ticketModel: Model<Ticket>,
      @InjectModel(Reservation.name) private readonly reservationModel: Model<Reservation>,
      @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
  ) {
  }

  seed(query: string, page: number, year: number) {
    return this.search(query, page, year)
        .pipe(
            map(res => res.results),
            tap(results => this.logger.debug(`Search ${query} ${page} ${year} -> ${results.length} items`)),
            mergeMap(results => fromArray(results)),
            map(movie => movie.id),
            concatMap(id =>
                zip(this.detail(id), this.credits(id))
                    .pipe(
                        mergeMap(([detail, credits]) =>
                            this.saveMovieDetail(detail, credits)
                        )
                    )
            ),
            ignoreElements(),
            tap({ complete: () => this.logger.debug('Saved done') })
        );
  }

  private get apiKey() {
    return this.configService.get(ConfigKey.MOVIE_DB_API_KEY);
  }

  private search(query: string, page: number, year: number): Observable<SearchMovieResponseResult> {
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${this.apiKey}&language=en-US&query=${query}&page=${page}&include_adult=false&year=${year}`;
    return this.httpService
        .get(url)
        .pipe(map(response => response.data as SearchMovieResponseResult));
  }

  private detail(movieId: number): Observable<MovieDetailResponseResult> {
    const url = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${this.apiKey}&language=en-US&append_to_response=videos`;
    return this.httpService
        .get(url)
        .pipe(map(response => response.data as MovieDetailResponseResult));
  }

  private credits(movieId: number) {
    const url = `https://api.themoviedb.org/3/movie/${movieId}/credits?api_key=${this.apiKey}`;
    return this.httpService
        .get(url)
        .pipe(map(response => response.data as MovieCreditsResponseResult));
  }

  //
  //
  //

  private async getCategories(cats: Genre[]): Promise<Category[]> {
    const categories: Category[] = [];

    const catNames = cats.map(c => c.name);
    for (const name of catNames) {
      const cache = this.catDocByName.get(name);
      if (cache) {
        this.logger.debug(`Get category by '${name}' hits cache`);
        categories.push(cache);
        continue;
      }

      const found = await this.categoryModel.findOne({ name });
      if (!found) {
        throw Error(`Not found category by name: ${name}`);
      }
      this.logger.debug(`Get category by '${name}' found`);

      this.catDocByName.set(name, found);
      categories.push(found);
    }

    return categories;
  }

  private async getPeople(peopleRaw: { profile_path: string, name: string }[]) {
    const people: Person[] = [];

    for (const p of peopleRaw) {
      const cache = this.personByFullName.get(p.name);
      if (cache) {
        this.logger.debug(`Get person by '${p.name}' hits cache`);
        people.push(cache);
        continue;
      }

      const found = await this.personModel.findOne({ full_name: p.name });
      if (found) {
        this.logger.debug(`Get person by '${p.name}' found`);
        this.personByFullName.set(p.name, found);
        people.push(found);
        continue;
      }

      const personDoc: Omit<CreateDocumentDefinition<Person>, '_id'> = {
        avatar: 'http://image.tmdb.org/t/p/w185' + p.profile_path,
        full_name: p.name,
        is_active: true
      };
      const created = await this.personModel.create(personDoc);
      this.logger.debug(`Get person by '${p.name}' created ${JSON.stringify(created)}`);

      this.personByFullName.set(p.name, created);
      people.push(created);
    }

    return people;
  }

  private async saveMovieCategory(saved: Movie, categories: Category[]) {
    for (const category of categories) {
      const movieCategory: Partial<Pick<MovieCategory, keyof MovieCategory>> = {
        'category_id': category._id,
        'movie_id': saved._id,
      };
      await this.movieCategoryModel.findOneAndUpdate(
          movieCategory,
          movieCategory,
          { upsert: true }
      );
    }
  }

  private async saveMovieDetail(v: MovieDetailResponseResult, c: MovieCreditsResponseResult) {
    this.logger.debug('Start save movie detail');

    if (await this.movieModel.findOne({ title: v.title })) {
      this.logger.debug('End save movie detail [found]');
      return;
    }

    this.dayCount = (this.dayCount + 1) % this.days.length;

    const actors = await this.getPeople(c.cast.slice(0, 10));
    const directors = await this.getPeople(c.crew.filter(c => c.job === 'Director'));

    const videoKey = v.videos.results?.[0]?.key;
    const movieDoc: Omit<CreateDocumentDefinition<Movie>, '_id'> = {
      rate_star: 0,
      total_rate: 0,
      total_favorite: 0,
      age_type: 'P',
      title: v.title,
      trailer_video_url: videoKey ? `https://www.youtube.com/watch?v=${videoKey}` : null,
      poster_url: v.poster_path ? `https://image.tmdb.org/t/p/w342${v.poster_path}` : null,
      overview: v.overview,
      released_date: this.days[this.dayCount],
      duration: v.runtime ?? 100,
      directors: directors.map(d => d._id),
      actors: actors.map(d => d._id),
      is_active: true,
      original_language: v.original_language
    };
    const saved = await this.movieModel.create(movieDoc);

    const categories = await this.getCategories(v.genres);
    await this.saveMovieCategory(saved, categories);

    this.logger.debug('End save movie detail');
  };

  updateVideoUrl() {
    return defer(() =>
        this.movieModel
            .find({
              $or: [
                { trailer_video_url: { $exists: false } },
                { trailer_video_url: null },
                { trailer_video_url: '' },
              ]
            })
            .sort({ createdAt: -1 })
    )
        .pipe(
            tap(movies => this.logger.debug(`Start update video url ${movies.length}`)),
            mergeMap(movies => from(movies)),
            concatMap((movie, index) =>
                this.search(movie.title, 1, null)
                    .pipe(
                        map(searchResults => searchResults.results[0]?.id),
                        filter(id => !!id),
                        mergeMap(id => this.detail(id)),
                        mergeMap(async v => {
                          const videoKey = v.videos.results?.[0]?.key;
                          if (videoKey) {
                            movie.trailer_video_url = `https://www.youtube.com/watch?v=${videoKey}`;
                            await movie.save();
                            this.logger.debug(`Update ${index} ${movie._id} -> ${movie.trailer_video_url}`);
                          }
                        }),
                    )
            ),
            tap({ complete: () => this.logger.debug(`Done update video url`) }),
        );
  }

  removeAdultMovies() {
    const array: { detail: MovieDetailResponseResult, found: string | undefined }[] = [];

    return defer(() => this.movieModel.find({}).sort({ createdAt: -1 })).pipe(
        tap(a => this.logger.debug(`All ${a.length} movies`)),
        mergeMap(from),
        concatMap((movie: Movie, index: number): Observable<Movie> => {
          this.logger.debug(index);

          return this
              .search(movie.title, 1, null)
              .pipe(
                  map(searchResults => searchResults.results?.find(i => i.title === movie.title)?.id),
                  filter(id => !!id),
                  mergeMap(id => this.detail(id)),
                  filter(d => {
                    const removed = d.adult || (() => {
                      delete d.adult;
                      const s = JSON.stringify(d).toLowerCase();

                      const found = [
                        'sex',
                        'gay',
                        'adult',
                        'mother',
                        'mother-in-law',
                        'porn',
                        'sexuality',
                        'unfaithfulness',
                        'sexologist',
                        'sex',
                        'school',
                        'teenage',
                        'lgbt',
                        'teen',
                        'black',
                        'teenage',
                        'protagonist',
                        'sex',
                        'scandal',
                        'anal',
                        'pistols',
                        'sex',
                        'rough sex',
                        'phone sex',
                        'artistic sex',
                        'sex fiend',
                        'sex tourism',
                        'sex game',
                        'oral sex',
                        'sex video',
                        'sex club',
                        'sex class',
                        'sex pest',
                        'sex robot',
                        'car sex',
                        'sex',
                        'sex positive',
                        'sex-shop',
                        'group sex',
                        'sex therapy',
                        'public sex',
                        'sex talk',
                        'unprotected sex',
                        'sex industry',
                        'telephone sex',
                        'taboo sex',
                        'kinky sex',
                        'sex show',
                        'sex performer',
                        'sex work',
                        'forced sex',
                        'simulated sex',
                        'sex assignment',
                        'pornography',
                        'porn actor',
                        'pornographic video',
                        'porn star',
                        'porn director',
                        'internet porn',
                        'porn industry',
                        'porn parody',
                        'porn actress',
                        'pornographer',
                        'porn magazine',
                        'feature porn',
                        'torture porn',
                        'roman porno',
                        'porn producer',
                        'gay pornography',
                        'porn tape',
                        'food porn',
                        'porno industry',
                        'pornochanchada',
                        'adult education center',
                        'becoming an adult',
                        'adult humor',
                        'adult animation',
                        'child as an adult',
                        'disbelieving adult',
                        'adult filmmaking',
                        'adult as a child',
                        'young adult',
                        'adult in college',
                        'adult illiteracy',
                        'adult child friendship',
                        'adult children',
                        'based on young adult novel',
                        'adult babies',
                        'adult theatre',
                        'adult magazine',
                        'adult',
                        'adult swim: made in spain',
                        'adult movie star',
                      ]
                          .find(v => s.includes(v.toLowerCase()));

                      array.push({
                        detail: d,
                        found,
                      });

                      return found;
                    })();
                    // this.logger.debug(`${index}-${movie.title}-${movie._id} is adult? ${removed}`);
                    return !!removed;
                  }),
                  mapTo(movie),
                  catchError(() => EMPTY),
              );
        }),
        toArray(),
        mergeMap(async movies => {
          this.logger.debug(array.length);

          await new Promise(((resolve, reject) => {
            fs.writeFile('./movie.json', JSON.stringify(array), {}, (e) => {
              if (e) reject(e)
              else resolve();
            });
          }));

          const ids = movies.map(m => m._id);

          const inIds = { $in: ids };
          await this.movieModel.deleteMany({ _id: inIds });
          await this.movieCategoryModel.deleteMany({ movie_id: inIds });
          await this.commentModel.deleteMany({ movie: inIds })

          const st = await this.showTimeModel.find({ movie: inIds });
          const relSt = { show_time: { $in: st.map(s => s._id) } };

          await this.showTimeModel.deleteMany({ movie: inIds });
          await this.ticketModel.deleteMany(relSt);
          await this.reservationModel.deleteMany(relSt);

          this.logger.debug(movies.length);
          return movies.length;
        }),
    )
  }
}

//
// SEARCH
//

export interface SearchMovieResponseResult {
  page: number;
  total_results: number;
  total_pages: number;
  results: SearchMovie[];
}

export interface SearchMovie {
  popularity: number;
  vote_count: number;
  video: boolean;
  poster_path: null | string;
  id: number;
  adult: boolean;
  backdrop_path: null | string;
  original_language: string;
  original_title: string;
  genre_ids: number[];
  title: string;
  vote_average: number;
  overview: string;
  release_date: string;
}

//
// DETAIL
//

export interface MovieDetailResponseResult {
  adult: boolean;
  backdrop_path: string;
  belongs_to_collection: null;
  budget: number;
  genres: Genre[];
  homepage: string;
  id: number;
  imdb_id: string;
  original_language: string;
  original_title: string;
  overview: string;
  popularity: number;
  poster_path: string;
  production_companies: ProductionCompany[];
  production_countries: ProductionCountry[];
  release_date: string;
  revenue: number;
  runtime: number;
  spoken_languages: SpokenLanguage[];
  status: string;
  tagline: string;
  title: string;
  video: boolean;
  vote_average: number;
  vote_count: number;
  videos: Videos;
}

export interface Videos {
  results: VideoResult[];
}

export interface VideoResult {
  id: string;
  iso_639_1: string;
  iso_3166_1: string;
  key: string;
  name: string;
  site: string;
  size: number;
  type: string;
}

export interface Genre {
  id: number;
  name: string;
}

export interface ProductionCompany {
  id: number;
  logo_path: null | string;
  name: string;
  origin_country: string;
}

export interface ProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface SpokenLanguage {
  iso_639_1: string;
  name: string;
}

//
// CREDITS
//

export interface MovieCreditsResponseResult {
  id: number;
  cast: Cast[];
  crew: Crew[];
}

export interface Cast {
  cast_id: number;
  character: string;
  credit_id: string;
  gender: number;
  id: number;
  name: string;
  order: number;
  profile_path: null | string;
}

export interface Crew {
  credit_id: string;
  department: string;
  gender: number;
  id: number;
  job: string;
  name: string;
  profile_path: null | string;
}
