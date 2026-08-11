import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityTarget, In, Repository } from 'typeorm';
import { AuthUser } from '../common/auth/auth.types';
import { Brand } from '../entities/brand.entity';
import { Color } from '../entities/color.entity';
import { Fit } from '../entities/fit.entity';
import { Material } from '../entities/material.entity';
import { Season } from '../entities/season.entity';
import { Tag } from '../entities/tag.entity';
import { Temperature } from '../entities/temperature.entity';
import { Type } from '../entities/type.entity';
import { UseCase } from '../entities/use-case.entity';

export type ReferenceDataType = 'colors' | 'brands' | 'seasons' | 'temperatures' | 'use-cases' | 'fits' | 'materials' | 'types' | 'tags';

type EntityInstance = Color | Brand | Season | Temperature | UseCase | Fit | Material | Type | Tag;

const entityMap: Record<ReferenceDataType, EntityTarget<EntityInstance>> = {
  colors: Color,
  brands: Brand,
  seasons: Season,
  temperatures: Temperature,
  'use-cases': UseCase,
  fits: Fit,
  materials: Material,
  types: Type,
  tags: Tag,
};

@Injectable()
export class ReferenceDataService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private repository(type: ReferenceDataType): Repository<EntityInstance> {
    return this.dataSource.getRepository(entityMap[type]);
  }

  async list(type: ReferenceDataType, user: AuthUser) {
    const order =
      type === 'brands' || type === 'types' || type === 'tags'
        ? ({ name: 'ASC' } as const)
        : ({ sortOrder: 'ASC', name: 'ASC' } as const);

    return this.repository(type).find({
      where: { userId: user.id },
      order: order as never,
    });
  }

  async create(type: ReferenceDataType, user: AuthUser, body: Record<string, unknown>) {
    const repository = this.repository(type);
    const entity = repository.create(this.mapPayload(type, user.id, body));

    try {
      return await repository.save(entity);
    } catch (error) {
      if (String(error).includes('UNIQUE')) {
        throw new ConflictException('Reference value already exists for this user');
      }
      throw error;
    }
  }

  async update(type: ReferenceDataType, user: AuthUser, id: string, body: Record<string, unknown>) {
    const repository = this.repository(type);
    const entity = await repository.findOne({ where: { id, userId: user.id } as never });
    if (!entity) {
      throw new NotFoundException();
    }

    repository.merge(entity, this.mapPayload(type, user.id, body, true));
    try {
      return await repository.save(entity);
    } catch (error) {
      if (String(error).includes('UNIQUE')) {
        throw new ConflictException('Reference value already exists for this user');
      }
      throw error;
    }
  }

  async remove(type: ReferenceDataType, user: AuthUser, id: string) {
    const repository = this.repository(type);
    const entity = await repository.findOne({ where: { id, userId: user.id } as never });
    if (!entity) {
      throw new NotFoundException();
    }

    await repository.remove(entity);
    return { deleted: true };
  }

  async resolveOwnedReferences<T extends EntityInstance>(
    type: ReferenceDataType,
    userId: string,
    ids: string[],
  ): Promise<T[]> {
    if (ids.length === 0) {
      return [];
    }

    const repository = this.repository(type);
    const rows = await repository.find({ where: { id: In(ids), userId } as never });
    if (rows.length !== ids.length) {
      throw new BadRequestException(`Some ${type} ids do not belong to the authenticated user`);
    }

    return rows as T[];
  }

  private mapPayload(type: ReferenceDataType, userId: string, body: Record<string, unknown>, partial = false) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!partial && !name) {
      throw new BadRequestException('name is required');
    }

    const payload: Record<string, unknown> = { userId };
    if (body.name !== undefined) payload.name = name;
    if (!['brands', 'types', 'tags'].includes(type) && body.sortOrder !== undefined) payload.sortOrder = Number(body.sortOrder);

    if (type === 'colors' && body.hexCode !== undefined) payload.hexCode = body.hexCode === null ? null : String(body.hexCode).trim();
    if (type === 'brands' && body.logoUrl !== undefined) payload.logoUrl = body.logoUrl === null ? null : String(body.logoUrl).trim();
    if ((type === 'seasons' || type === 'temperatures' || type === 'use-cases') && body.icon !== undefined) payload.icon = body.icon === null ? null : String(body.icon).trim();

    return payload;
  }
}