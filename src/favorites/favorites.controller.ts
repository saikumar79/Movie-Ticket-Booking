import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { GetUser, UserPayload } from '../auth/get-user.decorator';
import { PaginationDto } from '../common/pagination.dto';
import { Movie } from '../movies/movie.schema';
import { FavoritesService } from './favorites.service';
import { ApiTags } from '@nestjs/swagger';
import { ToggleFavoriteDto, ToggleFavoriteResponse } from './favorites.dto';

@UseGuards(AuthGuard)
@ApiTags('favorites')
@Controller('favorites')
export class FavoritesController {

  constructor(
      private readonly favoritesService: FavoritesService,
  ) {}

  @Get()
  getAllFavorites(
      @GetUser() user: UserPayload,
      @Query() dto: PaginationDto,
  ): Promise<Movie[]> {
    return this.favoritesService.getAllFavorites(user, dto);
  }

  @Post()
  toggleFavorite(
      @GetUser() user: UserPayload,
      @Body() dto: ToggleFavoriteDto,
  ): Promise<ToggleFavoriteResponse> {
    return this.favoritesService.toggleFavorite(user, dto);
  }
}
