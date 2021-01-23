# Movie-Ticket-Booking

A movie tickets booking and management application using Flutter and NestJS.

## Features

-   Flutter BLoC pattern and RxDart for state management.
-   Firebase authentication.
-   Backend using NestJS, MongoDB database and Neo4j.
-   Recommendation using Neo4j database and Collaborative filtering via Cypher query.

## Directory structure
```
project
│   README.md
│
└───Backend
│   └───main                   <- [Backend]
│       │   ...
│       │   ...
│   
└───Docs
│   │   Database.zip
│   │   Diagram.png
│   │   diagram_sql.png
│
└───MobileApp
│   └───datn                   <- [User mobile app]
│   │   │   ...
│   │   │   ...
│   │
│   └───movie_admin            <- [Admin, staff mobile app]
│       │   ...
│       │   ...
│
└───Screenshots
    │   Screenshot_add_card.png
    │   Screenshot_add_comment.png
    │   ...
```

## Setup and run

-   Download APK
    -   [User APK](https://github.com/hoc081098/DATN/blob/master/MobileApp/datn/build/app/outputs/flutter-apk/app-release.apk)
    -   [Admin APK](https://github.com/hoc081098/DATN/blob/master/MobileApp/movie_admin/build/app/outputs/flutter-apk/app-release.apk)
    
-   Before you start
    -   Backend
        -	Install [Node.js](https://nodejs.org/en/download/), [NestJS](https://docs.nestjs.com/)
        -	Install [MongoDB](https://docs.mongodb.com/manual/installation/), [Neo4j](https://neo4j.com/docs/operations-manual/current/installation/windows/)
        -	Create [Stripe secret API key](https://stripe.com/docs/keys)
        -   Start MongoDB and Neo4j.
        -   Create .env file `./Backend/main/.env`

    -   Flutter
    
## Screenshots

|  |  |  |
| :---:  | :---:  | :---:  |
| ![](Screenshots/Screenshot_login0.png) | ![](Screenshots/Screenshot_login1.png) | ![](Screenshots/Screenshot_home0.png) 
| ![](Screenshots/Screenshot_home1.png)  | ![](Screenshots/Screenshot_home2.png)  | ![](Screenshots/Screenshot_home3.png) 
| ![](Screenshots/Screenshot_home4.png)  | ![](Screenshots/Screenshot_home5.png)  | ![](Screenshots/Screenshot_home0.png) 