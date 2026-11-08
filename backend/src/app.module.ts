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
import { SyncTombstone } from './entities/sync-tombstone.entity';
import { WashingItem } from './entities/washing-item.entity';
import { IroningItem } from './entities/ironing-item.entity';
import { Outfit } from './entities/outfit.entity';
import { Room } from './entities/room.entity';
import { Location } from './entities/location.entity';
import { AuthController } from './auth.controller';
import { BearerJwtGuard } from './common/auth/bearer-jwt.guard';
import { CurrentUserController } from './controllers/current-user.controller';
import { ClothesController } from './controllers/clothes.controller';
import { OutfitsController } from './controllers/outfits.controller';
import { SyncController } from './controllers/sync.controller';
import { HealthController } from './health.controller';
import { PublicController } from './public.controller';
import { ReferenceDataController } from './controllers/reference-data.controller';
import { BackupController } from './controllers/backup.controller';
import { ClothesService } from './services/clothes.service';
import { OutfitsService } from './services/outfits.service';
import { ReferenceDataService } from './services/reference-data.service';
import { StorageCleanupService } from './services/storage-cleanup.service';
import { SyncService } from './services/sync.service';
import { UsersService } from './services/users.service';
import { BackupService } from './services/backup.service';

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
        WashingItem,
        IroningItem,
        Outfit,
        Room,
        Location,
        SyncTombstone,
      ],
      autoLoadEntities: process.env.DB_AUTO_LOAD_ENTITIES !== 'false',
      synchronize: process.env.DB_SYNCHRONIZE !== 'false',
      logging: process.env.DB_LOGGING === 'true',
    }),
  ],
  controllers: [
    AuthController,
    HealthController,
    PublicController,
    CurrentUserController,
    ReferenceDataController,
    ClothesController,
    OutfitsController,
    SyncController,
    BackupController,
  ],
  providers: [
    BearerJwtGuard,
    UsersService,
    ReferenceDataService,
    StorageCleanupService,
    ClothesService,
    OutfitsService,
    SyncService,
    BackupService,
  ],
})
export class AppModule {}