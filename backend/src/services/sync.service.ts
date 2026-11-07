import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { AuthUser } from '../common/auth/auth.types';
import {
  ClothesSyncInput,
  FieldUpdate,
  OutfitSyncInput,
  ReferenceDataSyncInput,
  SyncConflict,
  SyncPayloadDto,
  SyncResponseDto,
} from '../common/sync/sync.types';
import { Brand } from '../entities/brand.entity';
import { BuyDetail } from '../entities/buy-detail.entity';
import { Clothes } from '../entities/clothes.entity';
import { Color } from '../entities/color.entity';
import { DryingInstruction } from '../entities/drying-instruction.entity';
import { Fit } from '../entities/fit.entity';
import { IroningInstruction } from '../entities/ironing-instruction.entity';
import { IroningItem } from '../entities/ironing-item.entity';
import { Material } from '../entities/material.entity';
import { Season } from '../entities/season.entity';
import { SyncTombstone } from '../entities/sync-tombstone.entity';
import { Tag } from '../entities/tag.entity';
import { generateUniqueTagCode, normalizeTagCode } from '../common/utils/tag-code.util';
import { Temperature } from '../entities/temperature.entity';
import { Type } from '../entities/type.entity';
import { UseCase } from '../entities/use-case.entity';
import { WashingInstruction } from '../entities/washing-instruction.entity';
import { WashingItem } from '../entities/washing-item.entity';
import { Outfit } from '../entities/outfit.entity';
import { ReferenceDataService, ReferenceDataType } from './reference-data.service';

const REFERENCE_KINDS: ReferenceDataType[] = [
  'colors',
  'brands',
  'seasons',
  'temperatures',
  'use-cases',
  'fits',
  'materials',
  'types',
  'tags',
];

function toPlainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly referenceDataService: ReferenceDataService,
  ) {}

  async sync(user: AuthUser, payload: SyncPayloadDto): Promise<SyncResponseDto> {
    const serverTime = new Date().toISOString();
    const lastSyncDate = payload.lastSyncAt ? new Date(payload.lastSyncAt) : null;
    const conflicts: SyncConflict[] = [];
    const applied = {
      clothes: [] as string[],
      referenceData: [] as string[],
      laundry: false,
      outfits: [] as string[],
    };

    const changes = payload.changes ?? {};

    // 1. Process Reference Data Changes
    if (changes.referenceData && changes.referenceData.length > 0) {
      await this.processReferenceDataChanges(user, changes.referenceData, lastSyncDate, conflicts, applied.referenceData);
    }

    // 2. Process Clothes Changes (Field-level + LWW)
    if (changes.clothes && changes.clothes.length > 0) {
      await this.processClothesChanges(user, changes.clothes, lastSyncDate, conflicts, applied.clothes);
    }

    // 3. Process Laundry Changes
    if (changes.laundry) {
      await this.processLaundryChanges(user, changes.laundry);
      applied.laundry = true;
    }

    // 3.5. Process Outfit Changes
    if (changes.outfits && changes.outfits.length > 0) {
      await this.processOutfitChanges(user, changes.outfits, lastSyncDate, conflicts, applied.outfits);
    }

    // 4. Gather Server Changes to send back to client
    const serverChanges = await this.getServerChanges(user, lastSyncDate);

    const hasUnresolvedConflict = conflicts.some((c) => c.resolution === 'unresolved');

    return {
      serverTime,
      status: hasUnresolvedConflict ? 'conflict' : 'ok',
      conflicts,
      applied,
      serverChanges,
    };
  }

  private async processReferenceDataChanges(
    user: AuthUser,
    items: ReferenceDataSyncInput[],
    lastSyncDate: Date | null,
    conflicts: SyncConflict[],
    appliedIds: string[],
  ) {
    const tombstoneRepo = this.dataSource.getRepository(SyncTombstone);

    for (const item of items) {
      if (!REFERENCE_KINDS.includes(item.kind as ReferenceDataType)) {
        continue;
      }
      const kind = item.kind as ReferenceDataType;
      const repo = this.referenceDataService.repository(kind);
      const existing = (await repo.findOne({ where: { id: item.id, userId: user.id } as never })) as Record<
        string,
        unknown
      > | null;

      const clientTime = new Date(item.updatedAt).getTime();

      // Deletion
      if (item.deleted) {
        if (existing) {
          const serverTime = new Date(existing['updatedAt'] as string | Date).getTime();
          if (clientTime >= serverTime) {
            await repo.remove(existing as never);
            await tombstoneRepo.save(
              tombstoneRepo.create({
                userId: user.id,
                entityType: kind,
                entityId: item.id,
                deletedAt: new Date(item.updatedAt),
              }),
            );
            appliedIds.push(item.id);
          } else {
            conflicts.push({
              entityType: 'referenceData',
              entityId: item.id,
              kind,
              field: 'deleted',
              clientValue: true,
              serverValue: false,
              clientTimestamp: item.updatedAt,
              serverTimestamp: new Date(serverTime).toISOString(),
              resolution: 'server',
              message: `Elemento ${kind} modificato sul server dopo la cancellazione locale; mantenuta versione del server.`,
            });
          }
        }
        continue;
      }

      // Creation offline
      const fields = this.extractFieldUpdates(item);
      if (!existing) {
        const entityData: Record<string, unknown> = {
          id: item.id,
          userId: user.id,
          name: String(fields['name']?.value ?? item.data?.['name'] ?? '').trim(),
          sortOrder:
            fields['sortOrder']?.value !== undefined
              ? Number(fields['sortOrder'].value)
              : item.data?.['sortOrder'] !== undefined
                ? Number(item.data['sortOrder'])
                : 0,
        };

        if (kind === 'colors') {
          entityData['hexCode'] = fields['hexCode']?.value ?? item.data?.['hexCode'] ?? null;
        }

        const newEntity = repo.create(entityData as never) as unknown as Record<string, unknown>;
        newEntity['updatedAt'] = new Date(item.updatedAt);
        await repo.save(newEntity as never);
        appliedIds.push(item.id);
        continue;
      }

      // Existing item: Field-level merge with LWW
      const serverTime = new Date(existing['updatedAt'] as string | Date).getTime();
      let modified = false;

      for (const [fieldKey, fieldUpdate] of Object.entries(fields)) {
        const clientFieldTime = fieldUpdate.updatedAt
          ? new Date(fieldUpdate.updatedAt).getTime()
          : clientTime;
        const currentServerVal = existing[fieldKey];
        const clientVal = fieldUpdate.value;

        if (currentServerVal === clientVal) {
          continue;
        }

        // Check if server was updated after lastSync
        const serverUpdated = lastSyncDate ? serverTime > lastSyncDate.getTime() : false;

        if (!serverUpdated || clientFieldTime > serverTime) {
          // LWW: Client wins!
          existing[fieldKey] = clientVal;
          modified = true;
        } else if (serverTime > clientFieldTime) {
          // LWW: Server wins!
        } else {
          // Timestamps match and values differ -> Conflict!
          conflicts.push({
            entityType: 'referenceData',
            entityId: item.id,
            kind,
            field: fieldKey,
            clientValue: clientVal,
            serverValue: currentServerVal,
            clientTimestamp: new Date(clientFieldTime).toISOString(),
            serverTimestamp: new Date(serverTime).toISOString(),
            resolution: 'unresolved',
            message: `Conflitto su ${kind}.${fieldKey} con timestamp identico.`,
          });
        }
      }

      if (modified) {
        existing['updatedAt'] = new Date();
        await repo.save(existing as never);
      }
      appliedIds.push(item.id);
    }
  }

  private async processClothesChanges(
    user: AuthUser,
    items: ClothesSyncInput[],
    lastSyncDate: Date | null,
    conflicts: SyncConflict[],
    appliedIds: string[],
  ) {
    const clothesRepo = this.dataSource.getRepository(Clothes);
    const tombstoneRepo = this.dataSource.getRepository(SyncTombstone);

    for (const item of items) {
      const existing = await clothesRepo.findOne({
        where: { id: item.id, userId: user.id },
        relations: {
          brand: true,
          fit: true,
          type: true,
          colors: true,
          materials: true,
          seasons: true,
          temperatures: true,
          useCases: true,
          tags: true,
          washingInstruction: true,
          dryingInstruction: true,
          ironingInstruction: true,
          buyDetail: true,
          attachments: true,
        },
      });

      const clientTime = new Date(item.updatedAt).getTime();

      // Deletion
      if (item.deleted) {
        if (existing) {
          const serverTime = new Date(existing.updatedAt).getTime();
          if (clientTime >= serverTime) {
            await clothesRepo.remove(existing);
            await tombstoneRepo.save(
              tombstoneRepo.create({
                userId: user.id,
                entityType: 'clothes',
                entityId: item.id,
                deletedAt: new Date(item.updatedAt),
              }),
            );
            appliedIds.push(item.id);
          } else {
            conflicts.push({
              entityType: 'clothes',
              entityId: item.id,
              field: 'deleted',
              clientValue: true,
              serverValue: false,
              clientTimestamp: item.updatedAt,
              serverTimestamp: existing.updatedAt.toISOString(),
              resolution: 'server',
              message: 'Capo modificato sul server dopo la cancellazione locale; mantenuta versione del server.',
            });
          }
        }
        continue;
      }

      const clientFields = this.extractFieldUpdates(item);

      // Creation offline
      if (!existing) {
        const clothes = clothesRepo.create({ id: item.id, userId: user.id });
        await this.applyClothesFieldUpdates(user, clothes, clientFields);
        if (!clothes.code) {
          const assigned = await clothesRepo.find({
            where: { userId: user.id },
            select: { code: true },
          });
          const userCodes = new Set(assigned.map((c) => c.code).filter(Boolean) as string[]);
          clothes.code = generateUniqueTagCode(userCodes);
        }
        clothes.updatedAt = new Date(item.updatedAt);
        await clothesRepo.save(clothes);
        appliedIds.push(item.id);
        continue;
      }

      // Existing clothes: Field-level merge with LWW
      const serverTime = new Date(existing.updatedAt).getTime();
      const serverUpdatedAfterSync = lastSyncDate ? serverTime > lastSyncDate.getTime() : false;

      let hasModifications = false;

      for (const [fieldKey, fieldUpdate] of Object.entries(clientFields)) {
        const clientFieldTime = fieldUpdate.updatedAt
          ? new Date(fieldUpdate.updatedAt).getTime()
          : clientTime;

        const currentServerVal = this.getClothesFieldValue(existing, fieldKey);
        const clientVal = fieldUpdate.value;

        if (this.areFieldValuesEqual(fieldKey, clientVal, currentServerVal)) {
          continue;
        }

        if (!serverUpdatedAfterSync || clientFieldTime > serverTime) {
          // LWW: Client wins!
          await this.applySingleClothesField(user, existing, fieldKey, clientVal);
          hasModifications = true;
        } else if (serverTime > clientFieldTime) {
          // LWW: Server wins! Keep server value.
        } else {
          // Conflict: equal timestamps with different values
          conflicts.push({
            entityType: 'clothes',
            entityId: item.id,
            field: fieldKey,
            clientValue: clientVal,
            serverValue: currentServerVal,
            clientTimestamp: new Date(clientFieldTime).toISOString(),
            serverTimestamp: existing.updatedAt.toISOString(),
            resolution: 'unresolved',
            message: `Conflitto sul campo "${fieldKey}" con timestamp concorrente identico.`,
          });
        }
      }

      if (hasModifications) {
        existing.updatedAt = new Date();
        await clothesRepo.save(existing);
      }
      appliedIds.push(item.id);
    }
  }

  private async processLaundryChanges(
    user: AuthUser,
    laundry: {
      washing?: { added?: string[]; removed?: string[] };
      ironing?: { added?: string[]; removed?: string[] };
    },
  ) {
    const washingRepo = this.dataSource.getRepository(WashingItem);
    const ironingRepo = this.dataSource.getRepository(IroningItem);
    const clothesRepo = this.dataSource.getRepository(Clothes);

    if (laundry.washing?.removed?.length) {
      for (const clothesId of laundry.washing.removed) {
        const item = await washingRepo.findOne({ where: { userId: user.id, clothesId } });
        if (item) {
          if (item.quantity > 1) {
            item.quantity -= 1;
            await washingRepo.save(item);
          } else {
            await washingRepo.delete({ id: item.id });
          }
        }
      }
    }
    if (laundry.washing?.added?.length) {
      for (const clothesId of laundry.washing.added) {
        const item = await washingRepo.findOne({ where: { userId: user.id, clothesId } });
        if (item) {
          const cloth = await clothesRepo.findOne({ where: { id: clothesId, userId: user.id } });
          if (cloth?.isCumulative) {
            const maxQty = cloth.quantity && cloth.quantity > 0 ? cloth.quantity : 1;
            if (item.quantity < maxQty) {
              item.quantity += 1;
              await washingRepo.save(item);
            }
          }
        } else {
          await washingRepo.save(washingRepo.create({ userId: user.id, clothesId, quantity: 1 }));
        }
      }
    }

    if (laundry.ironing?.removed?.length) {
      for (const clothesId of laundry.ironing.removed) {
        const item = await ironingRepo.findOne({ where: { userId: user.id, clothesId } });
        if (item) {
          if (item.quantity > 1) {
            item.quantity -= 1;
            await ironingRepo.save(item);
          } else {
            await ironingRepo.delete({ id: item.id });
          }
        }
      }
    }
    if (laundry.ironing?.added?.length) {
      for (const clothesId of laundry.ironing.added) {
        const item = await ironingRepo.findOne({ where: { userId: user.id, clothesId } });
        if (item) {
          const cloth = await clothesRepo.findOne({ where: { id: clothesId, userId: user.id } });
          if (cloth?.isCumulative) {
            const maxQty = cloth.quantity && cloth.quantity > 0 ? cloth.quantity : 1;
            if (item.quantity < maxQty) {
              item.quantity += 1;
              await ironingRepo.save(item);
            }
          }
        } else {
          await ironingRepo.save(ironingRepo.create({ userId: user.id, clothesId, quantity: 1 }));
        }
      }
    }
  }

  private async processOutfitChanges(
    user: AuthUser,
    outfitChanges: OutfitSyncInput[],
    lastSyncDate: Date | null,
    conflicts: SyncConflict[],
    appliedIds: string[],
  ) {
    const outfitRepo = this.dataSource.getRepository(Outfit);
    const tombstoneRepo = this.dataSource.getRepository(SyncTombstone);
    const clothesRepo = this.dataSource.getRepository(Clothes);

    for (const change of outfitChanges) {
      const existing = await outfitRepo.findOne({
        where: { id: change.id, userId: user.id },
        relations: { clothes: true, seasons: true, temperatures: true, useCases: true },
      });

      if (change.deleted) {
        if (existing) {
          await outfitRepo.remove(existing);
        }
        await tombstoneRepo.save({
          userId: user.id,
          entityType: 'outfit',
          entityId: change.id,
          deletedAt: new Date(change.updatedAt || Date.now()),
        });
        appliedIds.push(change.id);
        continue;
      }

      const clientUpdated = new Date(change.updatedAt || Date.now());
      if (existing) {
        if (existing.updatedAt && existing.updatedAt > clientUpdated) {
          // Server wins
          continue;
        }

        if (change.name) {
          existing.name = change.name;
        } else if (change.fields && 'name' in change.fields) {
          const val = (change.fields['name'] as FieldUpdate)?.value ?? change.fields['name'];
          if (val) existing.name = String(val);
        }

        if (change.description !== undefined) {
          existing.description = change.description;
        }

        if (change.canvasLayout !== undefined) {
          existing.canvasLayout = change.canvasLayout;
        }

        if (Array.isArray(change.clothesIds)) {
          existing.clothes =
            change.clothesIds.length > 0
              ? await clothesRepo.find({ where: { id: In(change.clothesIds), userId: user.id } })
              : [];
        }

        if (Array.isArray(change.season_ids)) {
          existing.seasons = await this.referenceDataService.resolveOwnedReferences<Season>(
            'seasons',
            user.id,
            change.season_ids,
          );
        }

        if (Array.isArray(change.temperature_ids)) {
          existing.temperatures = await this.referenceDataService.resolveOwnedReferences<Temperature>(
            'temperatures',
            user.id,
            change.temperature_ids,
          );
        }

        if (Array.isArray(change.use_case_ids)) {
          existing.useCases = await this.referenceDataService.resolveOwnedReferences<UseCase>(
            'use-cases',
            user.id,
            change.use_case_ids,
          );
        }

        existing.updatedAt = clientUpdated;
        await outfitRepo.save(existing);
        appliedIds.push(existing.id);
      } else {
        let clothes: Clothes[] = [];
        if (Array.isArray(change.clothesIds) && change.clothesIds.length > 0) {
          clothes = await clothesRepo.find({ where: { id: In(change.clothesIds), userId: user.id } });
        }

        const seasons = Array.isArray(change.season_ids)
          ? await this.referenceDataService.resolveOwnedReferences<Season>('seasons', user.id, change.season_ids)
          : [];

        const temperatures = Array.isArray(change.temperature_ids)
          ? await this.referenceDataService.resolveOwnedReferences<Temperature>('temperatures', user.id, change.temperature_ids)
          : [];

        const useCases = Array.isArray(change.use_case_ids)
          ? await this.referenceDataService.resolveOwnedReferences<UseCase>('use-cases', user.id, change.use_case_ids)
          : [];

        const newOutfit = outfitRepo.create({
          id: change.id,
          userId: user.id,
          name: change.name || 'Nuovo abbinamento',
          description: change.description || null,
          canvasLayout: change.canvasLayout || null,
          clothes,
          seasons,
          temperatures,
          useCases,
          createdAt: clientUpdated,
          updatedAt: clientUpdated,
        });
        await outfitRepo.save(newOutfit);
        appliedIds.push(newOutfit.id);
      }
    }
  }

  private async getServerChanges(user: AuthUser, lastSyncDate: Date | null) {
    const clothesRepo = this.dataSource.getRepository(Clothes);
    const tombstoneRepo = this.dataSource.getRepository(SyncTombstone);

    // 1. Clothes changes
    const clothesQuery = clothesRepo
      .createQueryBuilder('clothes')
      .leftJoinAndSelect('clothes.brand', 'brand')
      .leftJoinAndSelect('clothes.fit', 'fit')
      .leftJoinAndSelect('clothes.type', 'type')
      .leftJoinAndSelect('clothes.colors', 'colors')
      .leftJoinAndSelect('clothes.materials', 'materials')
      .leftJoinAndSelect('clothes.seasons', 'seasons')
      .leftJoinAndSelect('clothes.temperatures', 'temperatures')
      .leftJoinAndSelect('clothes.useCases', 'useCases')
      .leftJoinAndSelect('clothes.tags', 'tags')
      .leftJoinAndSelect('clothes.attachments', 'attachments')
      .leftJoinAndSelect('clothes.washingInstruction', 'washingInstruction')
      .leftJoinAndSelect('clothes.dryingInstruction', 'dryingInstruction')
      .leftJoinAndSelect('clothes.ironingInstruction', 'ironingInstruction')
      .leftJoinAndSelect('clothes.buyDetail', 'buyDetail')
      .where('clothes.userId = :userId', { userId: user.id });

    if (lastSyncDate) {
      clothesQuery.andWhere('clothes.updatedAt > :lastSyncDate', { lastSyncDate });
    }

    const serverClothesEntities = await clothesQuery.getMany();
    const serverClothes = serverClothesEntities.map((item) => ({
      ...item,
      fullTitle: item.fullTitle,
    }));

    // 2. Deleted clothes
    let deletedClothesIds: string[] = [];
    if (lastSyncDate) {
      const tombstones = await tombstoneRepo.find({
        where: { userId: user.id, entityType: 'clothes' },
      });
      deletedClothesIds = tombstones
        .filter((t) => t.deletedAt > lastSyncDate)
        .map((t) => t.entityId);
    }

    // 3. Reference data changes
    const serverReferenceData: Record<string, unknown[]> = {};
    for (const kind of REFERENCE_KINDS) {
      const repo = this.referenceDataService.repository(kind);
      if (lastSyncDate) {
        const rows = await repo
          .createQueryBuilder('r')
          .where('r.userId = :userId', { userId: user.id })
          .andWhere('r.updatedAt > :lastSyncDate', { lastSyncDate })
          .getMany();
        serverReferenceData[kind] = rows;
      } else {
        const rows = await repo.find({ where: { userId: user.id } as never });
        serverReferenceData[kind] = rows;
      }
    }

    // 4. Deleted reference data
    let deletedReferenceData: Array<{ kind: string; id: string }> = [];
    if (lastSyncDate) {
      const refTombstones = await tombstoneRepo.find({
        where: { userId: user.id },
      });
      deletedReferenceData = refTombstones
        .filter((t) => t.entityType !== 'clothes' && t.deletedAt > lastSyncDate)
        .map((t) => ({ kind: t.entityType, id: t.entityId }));
    }

    // 5. Laundry lists
    const washingItems = await this.dataSource.getRepository(WashingItem).find({
      where: { userId: user.id },
      select: { clothesId: true, quantity: true },
    });
    const ironingItems = await this.dataSource.getRepository(IroningItem).find({
      where: { userId: user.id },
      select: { clothesId: true, quantity: true },
    });

    // 6. Outfits changes
    const outfitRepo = this.dataSource.getRepository(Outfit);
    const outfitQuery = outfitRepo
      .createQueryBuilder('outfit')
      .leftJoinAndSelect('outfit.clothes', 'clothes')
      .leftJoinAndSelect('clothes.brand', 'brand')
      .leftJoinAndSelect('clothes.type', 'type')
      .leftJoinAndSelect('clothes.colors', 'colors')
      .leftJoinAndSelect('clothes.attachments', 'attachments')
      .leftJoinAndSelect('outfit.seasons', 'seasons')
      .leftJoinAndSelect('outfit.temperatures', 'temperatures')
      .leftJoinAndSelect('outfit.useCases', 'useCases')
      .leftJoinAndSelect('outfit.attachments', 'outfit_attachments')
      .where('outfit.userId = :userId', { userId: user.id });

    if (lastSyncDate) {
      outfitQuery.andWhere('outfit.updatedAt > :lastSyncDate', { lastSyncDate });
    }

    const serverOutfitEntities = await outfitQuery.getMany();
    const serverOutfits = serverOutfitEntities.map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description ?? null,
      canvasLayout: o.canvasLayout ?? null,
      seasons: o.seasons ?? [],
      temperatures: o.temperatures ?? [],
      useCases: o.useCases ?? [],
      attachments: o.attachments ?? [],
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      clothesCount: o.clothes?.length ?? 0,
      clothes: (o.clothes ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        fullTitle: c.fullTitle,
        brand: c.brand,
        type: c.type,
        colors: c.colors,
        attachments: c.attachments,
        primaryAttachment:
          (c.attachments ?? []).find((a) => a.mimeType?.startsWith('image/')) ??
          c.attachments?.[0] ??
          null,
      })),
    }));

    // 7. Deleted outfits
    let deletedOutfitIds: string[] = [];
    if (lastSyncDate) {
      const outfitTombstones = await tombstoneRepo.find({
        where: { userId: user.id, entityType: 'outfit' },
      });
      deletedOutfitIds = outfitTombstones
        .filter((t) => t.deletedAt > lastSyncDate)
        .map((t) => t.entityId);
    }

    return {
      clothes: serverClothes,
      deletedClothesIds,
      referenceData: serverReferenceData,
      deletedReferenceData,
      laundry: {
        washingClothesIds: washingItems.flatMap((w) => Array.from({ length: w.quantity || 1 }, () => w.clothesId)),
        ironingClothesIds: ironingItems.flatMap((i) => Array.from({ length: i.quantity || 1 }, () => i.clothesId)),
      },
      outfits: serverOutfits,
      deletedOutfitIds,
    };
  }

  private extractFieldUpdates(item: ClothesSyncInput | ReferenceDataSyncInput): Record<string, FieldUpdate> {
    const result: Record<string, FieldUpdate> = {};
    if (item.fields) {
      for (const [key, val] of Object.entries(item.fields)) {
        if (val && typeof val === 'object' && 'value' in val) {
          result[key] = val as FieldUpdate;
        } else {
          result[key] = { value: val, updatedAt: item.updatedAt };
        }
      }
    } else if (item.data) {
      for (const [key, val] of Object.entries(item.data)) {
        result[key] = { value: val, updatedAt: item.updatedAt };
      }
    }
    return result;
  }

  private getClothesFieldValue(clothes: Clothes, key: string): unknown {
    switch (key) {
      case 'code':
        return clothes.code;
      case 'name':
        return clothes.name;
      case 'size':
        return clothes.size;
      case 'notes':
        return clothes.notes;
      case 'brand_id':
      case 'brandId':
        return clothes.brandId ?? clothes.brand?.id ?? null;
      case 'fit_id':
      case 'fitId':
        return clothes.fitId ?? clothes.fit?.id ?? null;
      case 'type_id':
      case 'typeId':
        return clothes.typeId ?? clothes.type?.id ?? null;
      case 'color_ids':
      case 'colors':
        return (clothes.colors ?? []).map((c) => c.id).sort();
      case 'material_ids':
      case 'materials':
        return (clothes.materials ?? []).map((m) => m.id).sort();
      case 'season_ids':
      case 'seasons':
        return (clothes.seasons ?? []).map((s) => s.id).sort();
      case 'temperature_ids':
      case 'temperatures':
        return (clothes.temperatures ?? []).map((t) => t.id).sort();
      case 'use_case_ids':
      case 'useCases':
        return (clothes.useCases ?? []).map((u) => u.id).sort();
      case 'tag_ids':
      case 'tags':
        return (clothes.tags ?? []).map((t) => t.id).sort();
      case 'washingInstruction':
        return clothes.washingInstruction ?? null;
      case 'dryingInstruction':
        return clothes.dryingInstruction ?? null;
      case 'ironingInstruction':
        return clothes.ironingInstruction ?? null;
      case 'buyDetail':
        return clothes.buyDetail ?? null;
      default:
        return (clothes as unknown as Record<string, unknown>)[key];
    }
  }

  private areFieldValuesEqual(fieldKey: string, a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null && b === undefined) return true;
    if (a === undefined && b === null) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      const sortedA = [...a].map(String).sort();
      const sortedB = [...b].map(String).sort();
      return sortedA.every((val, idx) => val === sortedB[idx]);
    }
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }

  private async applyClothesFieldUpdates(
    user: AuthUser,
    clothes: Clothes,
    fields: Record<string, FieldUpdate>,
  ) {
    for (const [key, update] of Object.entries(fields)) {
      await this.applySingleClothesField(user, clothes, key, update.value);
    }
  }

  private async applySingleClothesField(
    user: AuthUser,
    clothes: Clothes,
    key: string,
    value: unknown,
  ) {
    switch (key) {
      case 'code':
        clothes.code = normalizeTagCode(value !== null && value !== undefined ? String(value) : null);
        break;
      case 'name':
        clothes.name = value === null || value === undefined ? null : String(value).trim();
        break;
      case 'size':
        clothes.size = value === null || value === undefined ? null : String(value).trim();
        break;
      case 'notes':
        clothes.notes = value === null || value === undefined ? null : String(value).trim();
        break;
      case 'brand_id':
      case 'brandId': {
        const id = value ? String(value).trim() : null;
        if (!id) {
          clothes.brand = null;
          clothes.brandId = null;
        } else {
          const brands = await this.referenceDataService.resolveOwnedReferences<Brand>('brands', user.id, [id]);
          clothes.brand = brands[0] ?? null;
          clothes.brandId = brands[0]?.id ?? null;
        }
        break;
      }
      case 'fit_id':
      case 'fitId': {
        const id = value ? String(value).trim() : null;
        if (!id) {
          clothes.fit = null;
          clothes.fitId = null;
        } else {
          const fits = await this.referenceDataService.resolveOwnedReferences<Fit>('fits', user.id, [id]);
          clothes.fit = fits[0] ?? null;
          clothes.fitId = fits[0]?.id ?? null;
        }
        break;
      }
      case 'type_id':
      case 'typeId': {
        const id = value ? String(value).trim() : null;
        if (!id) {
          clothes.type = null;
          clothes.typeId = null;
        } else {
          const types = await this.referenceDataService.resolveOwnedReferences<Type>('types', user.id, [id]);
          clothes.type = types[0] ?? null;
          clothes.typeId = types[0]?.id ?? null;
        }
        break;
      }
      case 'color_ids':
      case 'colors': {
        const ids = Array.isArray(value) ? value.map(String) : [];
        clothes.colors = ids.length
          ? await this.referenceDataService.resolveOwnedReferences<Color>('colors', user.id, ids)
          : [];
        break;
      }
      case 'material_ids':
      case 'materials': {
        const ids = Array.isArray(value) ? value.map(String) : [];
        clothes.materials = ids.length
          ? await this.referenceDataService.resolveOwnedReferences<Material>('materials', user.id, ids)
          : [];
        break;
      }
      case 'season_ids':
      case 'seasons': {
        const ids = Array.isArray(value) ? value.map(String) : [];
        clothes.seasons = ids.length
          ? await this.referenceDataService.resolveOwnedReferences<Season>('seasons', user.id, ids)
          : [];
        break;
      }
      case 'temperature_ids':
      case 'temperatures': {
        const ids = Array.isArray(value) ? value.map(String) : [];
        clothes.temperatures = ids.length
          ? await this.referenceDataService.resolveOwnedReferences<Temperature>('temperatures', user.id, ids)
          : [];
        break;
      }
      case 'use_case_ids':
      case 'useCases': {
        const ids = Array.isArray(value) ? value.map(String) : [];
        clothes.useCases = ids.length
          ? await this.referenceDataService.resolveOwnedReferences<UseCase>('use-cases', user.id, ids)
          : [];
        break;
      }
      case 'tag_ids':
      case 'tags': {
        const ids = Array.isArray(value) ? value.map(String) : [];
        clothes.tags = ids.length
          ? await this.referenceDataService.resolveOwnedReferences<Tag>('tags', user.id, ids)
          : [];
        break;
      }
      case 'washingInstruction': {
        if (!value) {
          clothes.washingInstruction = null;
        } else {
          const raw = toPlainObject(value) ?? {};
          const inst = this.dataSource.getRepository(WashingInstruction).create({
            userId: user.id,
            washType: raw['washType'] as never,
            bleachType: raw['bleachType'] as never,
            temperature: raw['temperature'] ? String(raw['temperature']) : null,
            stretch: Boolean(raw['stretch']),
            reverseWashing: Boolean(raw['reverseWashing']),
            closedZips: Boolean(raw['closedZips']),
            similarColors: Boolean(raw['similarColors']),
            washSeparately: Boolean(raw['washSeparately']),
            useColorCatcher: Boolean(raw['useColorCatcher']),
            colorLossRisk: Boolean(raw['colorLossRisk']),
          });
          if (clothes.washingInstruction?.id) {
            inst.id = clothes.washingInstruction.id;
          }
          clothes.washingInstruction = inst;
        }
        break;
      }
      case 'dryingInstruction': {
        if (!value) {
          clothes.dryingInstruction = null;
        } else {
          const raw = toPlainObject(value) ?? {};
          const inst = this.dataSource.getRepository(DryingInstruction).create({
            userId: user.id,
            method: raw['method'] ? String(raw['method']) : null,
            tumbleDry: Boolean(raw['tumbleDry']),
            tumbleDryTemperature: (raw['tumbleDryTemperature'] as 'low' | 'medium' | 'high') ?? null,
          });
          if (clothes.dryingInstruction?.id) {
            inst.id = clothes.dryingInstruction.id;
          }
          clothes.dryingInstruction = inst;
        }
        break;
      }
      case 'ironingInstruction': {
        if (!value) {
          clothes.ironingInstruction = null;
        } else {
          const raw = toPlainObject(value) ?? {};
          const inst = this.dataSource.getRepository(IroningInstruction).create({
            userId: user.id,
            ironType: raw['ironType'] as never,
            ironInsideOut: Boolean(raw['ironInsideOut']),
            temperature: raw['temperature'] ? String(raw['temperature']) : null,
          });
          if (clothes.ironingInstruction?.id) {
            inst.id = clothes.ironingInstruction.id;
          }
          clothes.ironingInstruction = inst;
        }
        break;
      }
      case 'buyDetail': {
        if (!value) {
          clothes.buyDetail = null;
        } else {
          const raw = toPlainObject(value) ?? {};
          const inst = this.dataSource.getRepository(BuyDetail).create({
            userId: user.id,
            store: raw['store'] ? String(raw['store']) : null,
            purchaseDate: raw['purchaseDate'] ? String(raw['purchaseDate']) : null,
            shopUrl: raw['shopUrl'] ? String(raw['shopUrl']) : null,
            priceCents: raw['priceCents'] !== undefined && raw['priceCents'] !== null ? Number(raw['priceCents']) : null,
            receiptAttachmentId: raw['receiptAttachmentId'] ? String(raw['receiptAttachmentId']) : null,
          });
          if (clothes.buyDetail?.id) {
            inst.id = clothes.buyDetail.id;
          }
          clothes.buyDetail = inst;
        }
        break;
      }
    }
  }
}
