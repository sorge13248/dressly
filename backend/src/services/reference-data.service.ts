import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityTarget, In, Repository } from 'typeorm';
import { AuthUser } from '../common/auth/auth.types';
import { Brand } from '../entities/brand.entity';
import { Color } from '../entities/color.entity';
import { Fit } from '../entities/fit.entity';
import { Material } from '../entities/material.entity';
import { Season } from '../entities/season.entity';
import { SyncTombstone } from '../entities/sync-tombstone.entity';
import { Tag } from '../entities/tag.entity';
import { Temperature } from '../entities/temperature.entity';
import { Type } from '../entities/type.entity';
import { UseCase } from '../entities/use-case.entity';
import { Room } from '../entities/room.entity';
import { Location } from '../entities/location.entity';
import { WashingProgram } from '../entities/washing-program.entity';
import { Detergent } from '../entities/detergent.entity';

export type ReferenceDataType =
  | 'colors'
  | 'brands'
  | 'seasons'
  | 'temperatures'
  | 'use-cases'
  | 'fits'
  | 'materials'
  | 'types'
  | 'tags'
  | 'rooms'
  | 'locations'
  | 'washing-programs'
  | 'detergents';

type EntityInstance =
  | Color
  | Brand
  | Season
  | Temperature
  | UseCase
  | Fit
  | Material
  | Type
  | Tag
  | Room
  | Location
  | WashingProgram
  | Detergent;

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
  rooms: Room,
  locations: Location,
  'washing-programs': WashingProgram,
  detergents: Detergent,
};

@Injectable()
export class ReferenceDataService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  repository(type: ReferenceDataType): Repository<EntityInstance> {
    return this.dataSource.getRepository(entityMap[type]);
  }

  async list(type: ReferenceDataType, user: AuthUser) {
    const order =
      type === 'brands' || type === 'types' || type === 'tags' || type === 'colors'
        ? ({ name: 'ASC' } as const)
        : ({ sortOrder: 'ASC', name: 'ASC' } as const);

    const relations = type === 'locations' ? { room: true } : undefined;

    return this.repository(type).find({
      where: { userId: user.id } as never,
      order: order as never,
      relations: relations as never,
    });
  }

  async listAll(user: AuthUser) {
    const [
      colors,
      brands,
      seasons,
      temperatures,
      useCases,
      fits,
      materials,
      types,
      tags,
      rooms,
      locations,
      washingPrograms,
      detergents,
    ] = await Promise.all([
      this.list('colors', user),
      this.list('brands', user),
      this.list('seasons', user),
      this.list('temperatures', user),
      this.list('use-cases', user),
      this.list('fits', user),
      this.list('materials', user),
      this.list('types', user),
      this.list('tags', user),
      this.list('rooms', user),
      this.list('locations', user),
      this.list('washing-programs', user),
      this.list('detergents', user),
    ]);

    return {
      colors,
      brands,
      seasons,
      temperatures,
      'use-cases': useCases,
      fits,
      materials,
      types,
      tags,
      rooms,
      locations,
      'washing-programs': washingPrograms,
      detergents,
    };
  }

  async create(type: ReferenceDataType, user: AuthUser, body: Record<string, unknown>) {
    const repository = this.repository(type);
    const payload = await this.mapPayloadAsync(type, user.id, body);
    const entity = repository.create(payload);

    try {
      const saved = await repository.save(entity);
      if (type === 'locations') {
        return await repository.findOne({ where: { id: (saved as Location).id, userId: user.id } as never, relations: { room: true } as never });
      }
      return saved;
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

    const payload = await this.mapPayloadAsync(type, user.id, body, true);
    repository.merge(entity, payload);
    try {
      const saved = await repository.save(entity);
      if (type === 'locations') {
        return await repository.findOne({ where: { id, userId: user.id } as never, relations: { room: true } as never });
      }
      return saved;
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
    await this.dataSource.getRepository(SyncTombstone).save({
      userId: user.id,
      entityType: type,
      entityId: id,
      deletedAt: new Date(),
    });
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

  private async mapPayloadAsync(type: ReferenceDataType, userId: string, body: Record<string, unknown>, partial = false) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!partial && !name) {
      throw new BadRequestException('name is required');
    }

    const payload: Record<string, unknown> = { userId };
    if (body.name !== undefined) payload.name = name;
    if (!['brands', 'types', 'tags', 'colors'].includes(type) && body.sortOrder !== undefined) payload.sortOrder = Number(body.sortOrder);

    if (type === 'colors' && body.hexCode !== undefined) payload.hexCode = body.hexCode === null ? null : String(body.hexCode).trim();
    if (type === 'brands' && body.logoUrl !== undefined) payload.logoUrl = body.logoUrl === null ? null : String(body.logoUrl).trim();
    if ((type === 'seasons' || type === 'temperatures' || type === 'use-cases') && body.icon !== undefined) payload.icon = body.icon === null ? null : String(body.icon).trim();

    if (type === 'washing-programs') {
      if (body.temperature !== undefined) {
        if (body.temperature === null || body.temperature === '') {
          payload.temperature = null;
        } else {
          const tempNum = Number(body.temperature);
          if (Number.isNaN(tempNum) || tempNum < 0 || tempNum > 95) {
            throw new BadRequestException('temperature must be a number between 0 and 95');
          }
          payload.temperature = Math.round(tempNum);
        }
      }
      const rawSpin = body.spinSpeed !== undefined ? body.spinSpeed : body.spin_speed;
      if (rawSpin !== undefined) {
        if (rawSpin === null || rawSpin === '') {
          payload.spinSpeed = null;
        } else {
          const spinNum = Number(rawSpin);
          if (Number.isNaN(spinNum) || spinNum < 0) {
            throw new BadRequestException('spinSpeed must be a number >= 0');
          }
          payload.spinSpeed = Math.round(spinNum);
        }
      }
    }

    if (type === 'detergents') {
      if (body.description !== undefined) {
        payload.description = body.description === null ? null : String(body.description).trim();
      }
    }

    if (type === 'locations') {
      const rawRoomId = body.roomId !== undefined ? body.roomId : body.room_id;
      if (rawRoomId !== undefined) {
        const roomIdStr = rawRoomId ? String(rawRoomId).trim() : null;
        if (roomIdStr) {
          // verify room belongs to user
          const roomRepo = this.dataSource.getRepository(Room);
          const room = await roomRepo.findOne({ where: { id: roomIdStr, userId } });
          if (!room) {
            throw new BadRequestException('Room does not belong to the authenticated user');
          }
          payload.roomId = roomIdStr;
        } else {
          payload.roomId = null;
        }
      }
    }

    return payload;
  }
}
