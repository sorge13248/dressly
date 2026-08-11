import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Brand } from '../entities/brand.entity';
import { Color } from '../entities/color.entity';
import { Fit } from '../entities/fit.entity';
import { Material } from '../entities/material.entity';
import { Season } from '../entities/season.entity';
import { Temperature } from '../entities/temperature.entity';
import { Type } from '../entities/type.entity';
import { UseCase } from '../entities/use-case.entity';
import { User } from '../entities/user.entity';
import { defaultReferenceSeeds } from './default-reference-data';

export class MainSeeder implements Seeder {
  public async run(dataSource: DataSource, _factoryManager: SeederFactoryManager): Promise<void> {
    const userRepository = dataSource.getRepository(User);
    const subject = (process.env.SEED_USER_SUBJECT ?? '').trim();
    const emailRaw = (process.env.SEED_USER_EMAIL ?? '').trim();
    const displayName = (process.env.SEED_USER_DISPLAY_NAME ?? '').trim();

    if (!subject) {
      throw new Error('SEED_USER_SUBJECT is required to run seed data.');
    }

    const email = emailRaw || null;
    const resolvedDisplayName = displayName || subject;

    let user = await userRepository.findOne({ where: { subject } });
    if (!user) {
      user = userRepository.create({
        subject,
        email,
        displayName: resolvedDisplayName,
      });
      user = await userRepository.save(user);
    }

    const userId = user.id;

    await this.seedIfEmpty(dataSource.getRepository(Color), userId, defaultReferenceSeeds.colors);
    await this.seedIfEmpty(dataSource.getRepository(Brand), userId, defaultReferenceSeeds.brands.map((item) => ({ ...item, logoUrl: null })));
    await this.seedIfEmpty(dataSource.getRepository(Season), userId, defaultReferenceSeeds.seasons);
    await this.seedIfEmpty(dataSource.getRepository(Temperature), userId, defaultReferenceSeeds.temperatures);
    await this.seedIfEmpty(dataSource.getRepository(UseCase), userId, defaultReferenceSeeds.useCases);
    await this.seedIfEmpty(dataSource.getRepository(Fit), userId, defaultReferenceSeeds.fits);
    await this.seedIfEmpty(dataSource.getRepository(Material), userId, defaultReferenceSeeds.materials);
    await this.seedIfEmpty(dataSource.getRepository(Type), userId, defaultReferenceSeeds.types);
  }

  private async seedIfEmpty<T extends { userId: string }>(
    repository: { count: (args: { where: { userId: string } }) => Promise<number>; save: (items: T[]) => Promise<T[]> },
    userId: string,
    items: ReadonlyArray<Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>,
  ): Promise<void> {
    const existing = await repository.count({ where: { userId } });
    if (existing > 0) {
      return;
    }

    const payload = items.map((item) => ({ ...item, userId })) as T[];
    await repository.save(payload);
  }
}
