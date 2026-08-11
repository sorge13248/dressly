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
  ],
  synchronize: process.env.DB_SYNCHRONIZE !== 'false',
  logging: process.env.DB_LOGGING === 'true',
});

export default AppDataSource;
