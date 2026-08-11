import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthUser } from '../common/auth/auth.types';
import { defaultReferenceSeeds } from '../seed/default-reference-data';
import { Brand } from '../entities/brand.entity';
import { Color } from '../entities/color.entity';
import { Season } from '../entities/season.entity';
import { Temperature } from '../entities/temperature.entity';
import { UseCase } from '../entities/use-case.entity';
import { Fit } from '../entities/fit.entity';
import { Material } from '../entities/material.entity';
import { Type } from '../entities/type.entity';
import { User } from '../entities/user.entity';

const FALLBACK_DISPLAY_NAME = 'Dressly user';

@Injectable()
export class UsersService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async ensureUser(user: AuthUser) {
    const repository = this.dataSource.getRepository(User);
    const normalizedDisplayName = user.displayName.trim() || FALLBACK_DISPLAY_NAME;
    let persisted = await repository.findOne({ where: [{ subject: user.subject }, { email: user.email ?? undefined }] });

    if (!persisted) {
      persisted = repository.create({
        subject: user.subject,
        email: user.email,
        displayName: normalizedDisplayName,
        pictureUrl: user.pictureUrl,
      });
      persisted = await repository.save(persisted);
      await this.seedReferenceDataForUser(persisted.id);
      return persisted;
    }

    const shouldKeepPersistedName =
      normalizedDisplayName === FALLBACK_DISPLAY_NAME && persisted.displayName !== FALLBACK_DISPLAY_NAME;
    const nextDisplayName = shouldKeepPersistedName ? persisted.displayName : normalizedDisplayName;
    const needsUpdate =
      persisted.displayName !== nextDisplayName ||
      persisted.email !== user.email ||
      persisted.pictureUrl !== user.pictureUrl;
    if (needsUpdate) {
      persisted.displayName = nextDisplayName;
      persisted.email = user.email;
      persisted.pictureUrl = user.pictureUrl;
      persisted = await repository.save(persisted);
    }

    await this.ensureUserSeeded(persisted.id);
    return persisted;
  }

  async ensureUserSeeded(userId: string) {
    const [colorCount, typeCount] = await Promise.all([
      this.dataSource.getRepository(Color).count({ where: { userId } }),
      this.dataSource.getRepository(Type).count({ where: { userId } }),
    ]);

    if (colorCount === 0) {
      await this.seedReferenceDataForUser(userId);
      return;
    }

    if (typeCount === 0) {
      await this.dataSource.getRepository(Type).save(defaultReferenceSeeds.types.map((item) => ({ ...item, userId })));
    }
  }

  private async seedReferenceDataForUser(userId: string) {
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Color).save(defaultReferenceSeeds.colors.map((item) => ({ ...item, userId })));
      await manager.getRepository(Brand).save(defaultReferenceSeeds.brands.map((item) => ({ ...item, userId })));
      await manager.getRepository(Season).save(defaultReferenceSeeds.seasons.map((item) => ({ ...item, userId })));
      await manager.getRepository(Temperature).save(defaultReferenceSeeds.temperatures.map((item) => ({ ...item, userId })));
      await manager.getRepository(UseCase).save(defaultReferenceSeeds.useCases.map((item) => ({ ...item, userId })));
      await manager.getRepository(Fit).save(defaultReferenceSeeds.fits.map((item) => ({ ...item, userId })));
      await manager.getRepository(Material).save(defaultReferenceSeeds.materials.map((item) => ({ ...item, userId })));
      await manager.getRepository(Type).save(defaultReferenceSeeds.types.map((item) => ({ ...item, userId })));
    });
  }
}