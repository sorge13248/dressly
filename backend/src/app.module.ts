import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity';
import { Brand } from './entities/brand.entity';
import { Clothes } from './entities/clothes.entity';
import { Color } from './entities/color.entity';
import { BuyDetail } from './entities/buy-detail.entity';
import { DryingInstruction } from './entities/drying-instruction.entity';
import { Fit } from './entities/fit.entity';
import { IroningInstruction } from './entities/ironing-instruction.entity';
import { Material } from './entities/material.entity';
import { Season } from './entities/season.entity';
import { Tag } from './entities/tag.entity';
import { Temperature } from './entities/temperature.entity';
import { Type } from './entities/type.entity';
import { UseCase } from './entities/use-case.entity';
import { User } from './entities/user.entity';
import { WashingInstruction } from './entities/washing-instruction.entity';
import { AuthController } from './auth.controller';
import { BearerJwtGuard } from './common/auth/bearer-jwt.guard';
import { CurrentUserController } from './controllers/current-user.controller';
import { ClothesController } from './controllers/clothes.controller';
import { HealthController } from './health.controller';
import { PublicController } from './public.controller';
import { ReferenceDataController } from './controllers/reference-data.controller';
import { ClothesService } from './services/clothes.service';
import { ReferenceDataService } from './services/reference-data.service';
import { UsersService } from './services/users.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DB_PATH ?? '../dressly.sqlite',
      entities: [
        Attachment,
        Brand,
        Clothes,
        Color,
        BuyDetail,
        DryingInstruction,
        Fit,
        IroningInstruction,
        Material,
        Season,
        Tag,
        Temperature,
        Type,
        UseCase,
        User,
        WashingInstruction,
      ],
      autoLoadEntities: process.env.DB_AUTO_LOAD_ENTITIES !== 'false',
      synchronize: process.env.DB_SYNCHRONIZE !== 'false',
      logging: process.env.DB_LOGGING === 'true',
    }),
  ],
  controllers: [AuthController, HealthController, PublicController, CurrentUserController, ReferenceDataController, ClothesController],
  providers: [BearerJwtGuard, UsersService, ReferenceDataService, ClothesService],
})
export class AppModule {}