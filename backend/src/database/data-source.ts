import 'reflect-metadata';
import '../load-env';
import { DataSource } from 'typeorm';
import { Attachment } from '../entities/attachment.entity';
import { Brand } from '../entities/brand.entity';
import { Clothes } from '../entities/clothes.entity';
import { Color } from '../entities/color.entity';
import { BuyDetail } from '../entities/buy-detail.entity';
import { DryingInstruction } from '../entities/drying-instruction.entity';
import { Fit } from '../entities/fit.entity';
import { IroningInstruction } from '../entities/ironing-instruction.entity';
import { Material } from '../entities/material.entity';
import { Season } from '../entities/season.entity';
import { Tag } from '../entities/tag.entity';
import { Temperature } from '../entities/temperature.entity';
import { Type } from '../entities/type.entity';
import { UseCase } from '../entities/use-case.entity';
import { User } from '../entities/user.entity';
import { WashingInstruction } from '../entities/washing-instruction.entity';
import { SyncTombstone } from '../entities/sync-tombstone.entity';
import { WashingItem } from '../entities/washing-item.entity';
import { IroningItem } from '../entities/ironing-item.entity';
import { Outfit } from '../entities/outfit.entity';
import { Room } from '../entities/room.entity';
import { Location } from '../entities/location.entity';
import { WashingProgram } from '../entities/washing-program.entity';
import { Detergent } from '../entities/detergent.entity';

export const AppDataSource = new DataSource({
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
    WashingProgram,
    Detergent,
  ],
  synchronize: process.env.DB_SYNCHRONIZE !== 'false',
  logging: process.env.DB_LOGGING === 'true',
  prepareDatabase: (db: any) => {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
  },
});

export default AppDataSource;
