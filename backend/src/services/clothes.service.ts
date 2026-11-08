import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { DataSource, In, IsNull, Not } from 'typeorm';
import { AuthUser } from '../common/auth/auth.types';
import { generateUniqueTagCode, isValidTagCode, normalizeTagCode } from '../common/utils/tag-code.util';
import { Attachment } from '../entities/attachment.entity';
import { Brand } from '../entities/brand.entity';
import { Clothes } from '../entities/clothes.entity';
import { Color } from '../entities/color.entity';
import { DryingInstruction } from '../entities/drying-instruction.entity';
import { Fit } from '../entities/fit.entity';
import { IroningInstruction } from '../entities/ironing-instruction.entity';
import { Material } from '../entities/material.entity';
import { Season } from '../entities/season.entity';
import { SyncTombstone } from '../entities/sync-tombstone.entity';
import { Tag } from '../entities/tag.entity';
import { Temperature } from '../entities/temperature.entity';
import { Type } from '../entities/type.entity';
import { UseCase } from '../entities/use-case.entity';
import { WashingInstruction } from '../entities/washing-instruction.entity';
import { BuyDetail } from '../entities/buy-detail.entity';
import { WashingItem } from '../entities/washing-item.entity';
import { IroningItem } from '../entities/ironing-item.entity';
import { ReferenceDataService } from './reference-data.service';
import { StorageCleanupService } from './storage-cleanup.service';

function parseCsv(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toPlainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isDefaultAttachmentName(value: string) {
  return /^(?:photo|image|img|immagine|screenshot|pasted[ _-]?image|clipboard)(?:[ _-]*\d+)?(?:\.[a-z0-9]+)?$/i.test(value);
}

function trimToNull(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeStoredAttachmentPath(storedPath: string) {
  return storedPath.replace(/\\/g, '/');
}

const MAX_PREVIEW_SIZE = 500 * 1024;

@Injectable()
export class ClothesService implements OnModuleInit {
  private readonly logger = new Logger(ClothesService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly referenceDataService: ReferenceDataService,
    @Optional() private readonly storageCleanupService: StorageCleanupService = new StorageCleanupService(dataSource),
  ) {}

  async onModuleInit() {
    await this.generateMissingPreviews();
    await this.backfillMissingTagCodes();
  }

  async backfillMissingTagCodes() {
    const repository = this.dataSource.getRepository(Clothes);
    const unassigned = await repository.find({
      where: { code: IsNull() },
      order: { createdAt: 'ASC' },
    });

    if (unassigned.length === 0) return;

    this.logger.log(`Backfilling tag codes for ${unassigned.length} clothes items...`);

    const byUser = new Map<string, Clothes[]>();
    for (const item of unassigned) {
      const list = byUser.get(item.userId) ?? [];
      list.push(item);
      byUser.set(item.userId, list);
    }

    for (const [userId, items] of byUser.entries()) {
      const assigned = await repository.find({
        where: { userId, code: Not(IsNull()) },
        select: { code: true },
      });
      const userCodes = new Set(assigned.map((c) => c.code).filter(Boolean) as string[]);

      for (const item of items) {
        const newCode = generateUniqueTagCode(userCodes);
        userCodes.add(newCode);
        await repository.update(item.id, { code: newCode });
      }
    }

    this.logger.log(`Successfully backfilled tag codes for ${unassigned.length} clothes items.`);
  }

  async list(user: AuthUser, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(query.per_page ?? 50)));

    const qb = this.dataSource.getRepository(Clothes).createQueryBuilder('clothes')
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
      .where('clothes.userId = :userId', { userId: user.id })
      .distinct(true);

    const brandIds = parseCsv(query.brand_id);
    if (brandIds.length > 0) {
      qb.andWhere('brand.id IN (:...brandIds)', { brandIds });
    }

    const fitIds = parseCsv(query.fit_id);
    if (fitIds.length > 0) {
      qb.andWhere('fit.id IN (:...fitIds)', { fitIds });
    }

    const typeIds = Array.from(new Set([...parseCsv(query.type_id), ...parseCsv(query.type_ids)]));
    if (typeIds.length > 0) {
      qb.andWhere('type.id IN (:...typeIds)', { typeIds });
    }

    const tagIds = parseCsv(query.tag_ids);
    if (tagIds.length > 0) {
      qb.andWhere('tags.id IN (:...tagIds)', { tagIds });
    }

    const colorIds = Array.from(new Set([...parseCsv(query.color_id), ...parseCsv(query.color_ids)]));
    if (colorIds.length > 0) {
      qb.andWhere('colors.id IN (:...colorIds)', { colorIds });
    }

    const materialIds = Array.from(new Set([...parseCsv(query.material_id), ...parseCsv(query.material_ids)]));
    if (materialIds.length > 0) {
      qb.andWhere('materials.id IN (:...materialIds)', { materialIds });
    }

    const seasonIds = Array.from(new Set([...parseCsv(query.season_id), ...parseCsv(query.season_ids)]));
    if (seasonIds.length > 0) {
      qb.andWhere('seasons.id IN (:...seasonIds)', { seasonIds });
    }

    const temperatureIds = Array.from(new Set([...parseCsv(query.temperature_id), ...parseCsv(query.temperature_ids)]));
    if (temperatureIds.length > 0) {
      qb.andWhere('temperatures.id IN (:...temperatureIds)', { temperatureIds });
    }

    const useCaseIds = Array.from(new Set([...parseCsv(query.use_case_id), ...parseCsv(query.use_case_ids)]));
    if (useCaseIds.length > 0) {
      qb.andWhere('useCases.id IN (:...useCaseIds)', { useCaseIds });
    }

    if (query.size) qb.andWhere('clothes.size = :size', { size: query.size });
    if (query.search) {
      qb.andWhere('(clothes.name LIKE :search OR brand.name LIKE :search OR clothes.code LIKE :search OR clothes.notes LIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    const [items, total] = await qb.orderBy('clothes.createdAt', 'DESC').skip((page - 1) * perPage).take(perPage).getManyAndCount();
    for (const item of items) {
      this.sortAttachments(item);
    }

    const itemIds = items.map((item) => item.id);
    const washingEntries = itemIds.length > 0
      ? await this.dataSource.getRepository(WashingItem).find({
          where: { userId: user.id, clothesId: In(itemIds) },
          select: { clothesId: true, quantity: true },
        })
      : [];
    const washingMap = new Map(washingEntries.map((w) => [w.clothesId, w.quantity || 1]));

    const ironingEntries = itemIds.length > 0
      ? await this.dataSource.getRepository(IroningItem).find({
          where: { userId: user.id, clothesId: In(itemIds) },
          select: { clothesId: true, quantity: true },
        })
      : [];
    const ironingMap = new Map(ironingEntries.map((i) => [i.clothesId, i.quantity || 1]));

    return {
      items: items.map((item) => ({
        ...this.decorateResponse(item),
        isInWashing: washingMap.has(item.id),
        washingQuantity: washingMap.get(item.id) ?? 0,
        isInIroning: ironingMap.has(item.id),
        ironingQuantity: ironingMap.get(item.id) ?? 0,
      })),
      total,
      page,
      perPage,
    };
  }

  async getWashingList(user: AuthUser) {
    const washingEntries = await this.dataSource.getRepository(WashingItem).find({
      where: { userId: user.id },
      order: { addedAt: 'DESC' },
      select: { clothesId: true, quantity: true },
    });
    const ids = washingEntries.map((w) => w.clothesId);
    if (ids.length === 0) {
      return { items: [] };
    }
    const quantitiesByClothesId = new Map(washingEntries.map((w) => [w.clothesId, w.quantity || 1]));

    const qb = this.dataSource
      .getRepository(Clothes)
      .createQueryBuilder('clothes')
      .leftJoinAndSelect('clothes.brand', 'brand')
      .leftJoinAndSelect('clothes.type', 'type')
      .leftJoinAndSelect('clothes.colors', 'colors')
      .leftJoinAndSelect('clothes.washingInstruction', 'washingInstruction')
      .leftJoinAndSelect('clothes.attachments', 'attachments')
      .where('clothes.userId = :userId', { userId: user.id })
      .andWhere('clothes.id IN (:...ids)', { ids });

    const items = await qb.getMany();
    const itemsById = new Map(items.map((i) => [i.id, i]));
    const orderedItems = ids.map((id) => itemsById.get(id)).filter((item): item is Clothes => Boolean(item));

    for (const item of orderedItems) {
      this.sortAttachments(item);
    }

    return {
      items: orderedItems.map((item) => {
        const primaryAttachment =
          (item.attachments ?? []).find((att) => att.mimeType?.startsWith('image/')) ??
          item.attachments?.[0] ??
          null;
        return {
          id: item.id,
          code: item.code,
          name: item.name,
          fullTitle: item.fullTitle,
          isCumulative: item.isCumulative ?? false,
          quantity: item.quantity ?? 1,
          washingQuantity: quantitiesByClothesId.get(item.id) ?? 1,
          isInWashing: true,
          brand: item.brand ? { id: item.brand.id, name: item.brand.name } : null,
          type: item.type ? { id: item.type.id, name: item.type.name } : null,
          colors: (item.colors ?? []).map((c) => ({ id: c.id, name: c.name, hexCode: c.hexCode })),
          washingInstruction: item.washingInstruction
            ? {
                id: item.washingInstruction.id,
                temperature: item.washingInstruction.temperature,
                washType: item.washingInstruction.washType,
                bleachType: item.washingInstruction.bleachType,
                stretch: item.washingInstruction.stretch,
                reverseWashing: item.washingInstruction.reverseWashing,
                closedZips: item.washingInstruction.closedZips,
                similarColors: item.washingInstruction.similarColors,
                washSeparately: item.washingInstruction.washSeparately,
                useColorCatcher: item.washingInstruction.useColorCatcher,
                colorLossRisk: item.washingInstruction.colorLossRisk,
                colorLossTestTemperature: item.washingInstruction.colorLossTestTemperature,
              }
            : null,
          primaryAttachment: primaryAttachment
            ? {
                id: primaryAttachment.id,
                fileName: primaryAttachment.fileName,
                previewPath: primaryAttachment.previewPath,
                mimeType: primaryAttachment.mimeType,
              }
            : null,
        };
      }),
    };
  }

  async addToWashing(user: AuthUser, clothesIds: string[]) {
    if (!clothesIds || clothesIds.length === 0) {
      return { added: 0, existing: 0, total: 0 };
    }
    const countById = new Map<string, number>();
    for (const id of clothesIds.filter(Boolean)) {
      countById.set(id, (countById.get(id) ?? 0) + 1);
    }
    const uniqueIds = Array.from(countById.keys());
    const validClothes = await this.dataSource.getRepository(Clothes).find({
      where: { userId: user.id, id: In(uniqueIds) },
      select: { id: true, isCumulative: true, quantity: true },
    });
    if (validClothes.length === 0) {
      return { added: 0, existing: 0, total: 0 };
    }

    const washingRepo = this.dataSource.getRepository(WashingItem);
    const existingItems = await washingRepo.find({
      where: { userId: user.id, clothesId: In(validClothes.map((c) => c.id)) },
    });
    const existingMap = new Map(existingItems.map((e) => [e.clothesId, e]));

    let addedCount = 0;
    for (const cloth of validClothes) {
      const requested = countById.get(cloth.id) ?? 1;
      const existing = existingMap.get(cloth.id);
      if (existing) {
        if (cloth.isCumulative) {
          const maxQty = cloth.quantity && cloth.quantity > 0 ? cloth.quantity : 1;
          const newQty = Math.min(maxQty, (existing.quantity || 1) + requested);
          if (newQty > (existing.quantity || 1)) {
            addedCount += newQty - (existing.quantity || 1);
            existing.quantity = newQty;
            await washingRepo.save(existing);
          }
        }
      } else {
        const initialQty = cloth.isCumulative
          ? Math.min(cloth.quantity && cloth.quantity > 0 ? cloth.quantity : 1, requested)
          : 1;
        await washingRepo.save(washingRepo.create({ userId: user.id, clothesId: cloth.id, quantity: initialQty }));
        addedCount += initialQty;
      }
    }

    const counts = await this.getLaundryCounts(user);
    return {
      added: addedCount,
      existing: existingItems.length,
      total: counts.washingCount,
    };
  }

  async removeFromWashing(user: AuthUser, clothesId: string, quantityToRemove = 1, removeAll = false) {
    const washingRepo = this.dataSource.getRepository(WashingItem);
    const existing = await washingRepo.findOne({ where: { userId: user.id, clothesId } });
    if (existing) {
      const cloth = await this.dataSource.getRepository(Clothes).findOne({ where: { id: clothesId, userId: user.id } });
      if (removeAll || !cloth?.isCumulative || (existing.quantity || 1) <= quantityToRemove) {
        await washingRepo.delete({ id: existing.id });
      } else {
        existing.quantity = (existing.quantity || 1) - quantityToRemove;
        await washingRepo.save(existing);
      }
    }
    const counts = await this.getLaundryCounts(user);
    return { removed: true, total: counts.washingCount };
  }

  async clearWashing(user: AuthUser) {
    const washingRepo = this.dataSource.getRepository(WashingItem);
    await washingRepo.delete({ userId: user.id });
    return { cleared: true };
  }

  async moveWashingToIroning(user: AuthUser, clothesId: string, quantityToMove = 1, moveAll = false) {
    const washingRepo = this.dataSource.getRepository(WashingItem);
    const ironingRepo = this.dataSource.getRepository(IroningItem);

    const existingWashing = await washingRepo.findOne({ where: { userId: user.id, clothesId } });
    if (!existingWashing) {
      throw new NotFoundException('Capo non trovato nella lavatrice');
    }

    const cloth = await this.dataSource.getRepository(Clothes).findOne({
      where: { id: clothesId, userId: user.id },
    });
    if (!cloth) {
      throw new NotFoundException('Capo non trovato');
    }

    const actualMoveCount = moveAll || !cloth.isCumulative || (existingWashing.quantity || 1) <= quantityToMove
      ? (existingWashing.quantity || 1)
      : quantityToMove;

    if (actualMoveCount >= (existingWashing.quantity || 1)) {
      await washingRepo.delete({ id: existingWashing.id });
    } else {
      existingWashing.quantity = (existingWashing.quantity || 1) - actualMoveCount;
      await washingRepo.save(existingWashing);
    }

    const existingIroning = await ironingRepo.findOne({ where: { userId: user.id, clothesId } });
    if (existingIroning) {
      if (cloth.isCumulative) {
        const maxQty = cloth.quantity && cloth.quantity > 0 ? cloth.quantity : 1;
        existingIroning.quantity = Math.min(maxQty, (existingIroning.quantity || 1) + actualMoveCount);
        await ironingRepo.save(existingIroning);
      }
    } else {
      await ironingRepo.save(
        ironingRepo.create({
          userId: user.id,
          clothesId,
          quantity: cloth.isCumulative ? actualMoveCount : 1,
        }),
      );
    }

    const counts = await this.getLaundryCounts(user);
    return { moved: true, washingCount: counts.washingCount, ironingCount: counts.ironingCount };
  }

  async getIroningList(user: AuthUser, rawIds?: string) {
    let ids = parseCsv(rawIds);
    let ironingEntries: Array<{ clothesId: string; quantity: number }> = [];
    if (ids.length === 0) {
      ironingEntries = await this.dataSource.getRepository(IroningItem).find({
        where: { userId: user.id },
        order: { addedAt: 'DESC' },
        select: { clothesId: true, quantity: true },
      });
      ids = ironingEntries.map((item) => item.clothesId);
    } else {
      ironingEntries = await this.dataSource.getRepository(IroningItem).find({
        where: { userId: user.id, clothesId: In(ids) },
        select: { clothesId: true, quantity: true },
      });
    }
    if (ids.length === 0) {
      return { items: [] };
    }
    const ironingQuantities = new Map(ironingEntries.map((i) => [i.clothesId, i.quantity || 1]));

    const qb = this.dataSource
      .getRepository(Clothes)
      .createQueryBuilder('clothes')
      .leftJoinAndSelect('clothes.brand', 'brand')
      .leftJoinAndSelect('clothes.type', 'type')
      .leftJoinAndSelect('clothes.colors', 'colors')
      .leftJoinAndSelect('clothes.ironingInstruction', 'ironingInstruction')
      .leftJoinAndSelect('clothes.attachments', 'attachments')
      .where('clothes.userId = :userId', { userId: user.id })
      .andWhere('clothes.id IN (:...ids)', { ids });

    const items = await qb.getMany();
    const itemsById = new Map(items.map((i) => [i.id, i]));
    const orderedItems = ids.map((id) => itemsById.get(id)).filter((item): item is Clothes => Boolean(item));

    for (const item of orderedItems) {
      this.sortAttachments(item);
    }

    return {
      items: orderedItems.map((item) => {
        const primaryAttachment =
          (item.attachments ?? []).find((att) => att.mimeType?.startsWith('image/')) ??
          item.attachments?.[0] ??
          null;
        return {
          id: item.id,
          code: item.code,
          name: item.name,
          fullTitle: item.fullTitle,
          isCumulative: item.isCumulative ?? false,
          quantity: item.quantity ?? 1,
          ironingQuantity: ironingQuantities.get(item.id) ?? 1,
          isInIroning: true,
          brand: item.brand ? { id: item.brand.id, name: item.brand.name } : null,
          type: item.type ? { id: item.type.id, name: item.type.name } : null,
          colors: (item.colors ?? []).map((c) => ({ id: c.id, name: c.name, hexCode: c.hexCode })),
          ironingInstruction: item.ironingInstruction
            ? {
                id: item.ironingInstruction.id,
                temperature: item.ironingInstruction.temperature,
                ironType: item.ironingInstruction.ironType,
                ironInsideOut: item.ironingInstruction.ironInsideOut,
              }
            : null,
          primaryAttachment: primaryAttachment
            ? {
                id: primaryAttachment.id,
                fileName: primaryAttachment.fileName,
                previewPath: primaryAttachment.previewPath,
                mimeType: primaryAttachment.mimeType,
              }
            : null,
        };
      }),
    };
  }

  async addToIroning(user: AuthUser, clothesIds: string[]) {
    if (!clothesIds || clothesIds.length === 0) {
      return { added: 0, existing: 0, total: 0 };
    }
    const countById = new Map<string, number>();
    for (const id of clothesIds.filter(Boolean)) {
      countById.set(id, (countById.get(id) ?? 0) + 1);
    }
    const uniqueIds = Array.from(countById.keys());
    const validClothes = await this.dataSource.getRepository(Clothes).find({
      where: { userId: user.id, id: In(uniqueIds) },
      select: { id: true, isCumulative: true, quantity: true },
    });
    if (validClothes.length === 0) {
      return { added: 0, existing: 0, total: 0 };
    }

    const ironingRepo = this.dataSource.getRepository(IroningItem);
    const existingItems = await ironingRepo.find({
      where: { userId: user.id, clothesId: In(validClothes.map((c) => c.id)) },
    });
    const existingMap = new Map(existingItems.map((e) => [e.clothesId, e]));

    let addedCount = 0;
    for (const cloth of validClothes) {
      const requested = countById.get(cloth.id) ?? 1;
      const existing = existingMap.get(cloth.id);
      if (existing) {
        if (cloth.isCumulative) {
          const maxQty = cloth.quantity && cloth.quantity > 0 ? cloth.quantity : 1;
          const newQty = Math.min(maxQty, (existing.quantity || 1) + requested);
          if (newQty > (existing.quantity || 1)) {
            addedCount += newQty - (existing.quantity || 1);
            existing.quantity = newQty;
            await ironingRepo.save(existing);
          }
        }
      } else {
        const initialQty = cloth.isCumulative
          ? Math.min(cloth.quantity && cloth.quantity > 0 ? cloth.quantity : 1, requested)
          : 1;
        await ironingRepo.save(ironingRepo.create({ userId: user.id, clothesId: cloth.id, quantity: initialQty }));
        addedCount += initialQty;
      }
    }

    const counts = await this.getLaundryCounts(user);
    return {
      added: addedCount,
      existing: existingItems.length,
      total: counts.ironingCount,
    };
  }

  async removeFromIroning(user: AuthUser, clothesId: string, quantityToRemove = 1, removeAll = false) {
    const ironingRepo = this.dataSource.getRepository(IroningItem);
    const existing = await ironingRepo.findOne({ where: { userId: user.id, clothesId } });
    if (existing) {
      const cloth = await this.dataSource.getRepository(Clothes).findOne({ where: { id: clothesId, userId: user.id } });
      if (removeAll || !cloth?.isCumulative || (existing.quantity || 1) <= quantityToRemove) {
        await ironingRepo.delete({ id: existing.id });
      } else {
        existing.quantity = (existing.quantity || 1) - quantityToRemove;
        await ironingRepo.save(existing);
      }
    }
    const counts = await this.getLaundryCounts(user);
    return { removed: true, total: counts.ironingCount };
  }

  async clearIroning(user: AuthUser) {
    const ironingRepo = this.dataSource.getRepository(IroningItem);
    await ironingRepo.delete({ userId: user.id });
    return { cleared: true };
  }

  async getLaundryCounts(user: AuthUser) {
    const washingRes = await this.dataSource
      .getRepository(WashingItem)
      .createQueryBuilder('w')
      .where('w.userId = :userId', { userId: user.id })
      .select('COALESCE(SUM(w.quantity), 0)', 'total')
      .getRawOne();
    const ironingRes = await this.dataSource
      .getRepository(IroningItem)
      .createQueryBuilder('i')
      .where('i.userId = :userId', { userId: user.id })
      .select('COALESCE(SUM(i.quantity), 0)', 'total')
      .getRawOne();

    return {
      washingCount: Number(washingRes?.total ?? 0),
      ironingCount: Number(ironingRes?.total ?? 0),
    };
  }

  async getOne(user: AuthUser, id: string) {
    const item = await this.dataSource.getRepository(Clothes).findOne({
      where: { id, userId: user.id } as never,
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
        attachments: true,
        washingInstruction: true,
        dryingInstruction: true,
        ironingInstruction: true,
        buyDetail: true,
      },
    });

    if (!item) throw new NotFoundException();
    this.sortAttachments(item);

    const washingItem = await this.dataSource.getRepository(WashingItem).findOne({
      where: { userId: user.id, clothesId: id },
    });
    const ironingItem = await this.dataSource.getRepository(IroningItem).findOne({
      where: { userId: user.id, clothesId: id },
    });

    return {
      ...this.decorateResponse(item),
      isInWashing: Boolean(washingItem),
      washingQuantity: washingItem?.quantity ?? 0,
      isInIroning: Boolean(ironingItem),
      ironingQuantity: ironingItem?.quantity ?? 0,
    };
  }

  async create(user: AuthUser, body: Record<string, unknown>) {
    this.validateWizardPayload(body, { requireSelections: true });
    const clothes = await this.mapPayload(user, body);
    return this.dataSource.getRepository(Clothes).save(clothes);
  }

  async update(user: AuthUser, id: string, body: Record<string, unknown>) {
    this.validateWizardPayload(body, { requireSelections: false });
    const repository = this.dataSource.getRepository(Clothes);
    const existing = await repository.findOne({
      where: { id, userId: user.id } as never,
      relations: {
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
      },
    });

    if (!existing) throw new NotFoundException();

    const updated = await this.mapPayload(user, body, existing);
    updated.id = existing.id;
    return repository.save(updated);
  }

  async duplicate(user: AuthUser, id: string) {
    const clothesRepo = this.dataSource.getRepository(Clothes);
    const attachmentRepo = this.dataSource.getRepository(Attachment);

    const original = await clothesRepo.findOne({
      where: { id, userId: user.id } as never,
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
        attachments: true,
        washingInstruction: true,
        dryingInstruction: true,
        ironingInstruction: true,
        buyDetail: true,
      },
    });

    if (!original) {
      throw new NotFoundException('Capo non trovato');
    }

    const existingItems = await clothesRepo.find({
      where: { userId: user.id },
      select: { code: true, id: true },
    });
    const existingCodes = new Set(
      existingItems.map((c) => c.code).filter(Boolean) as string[],
    );
    const newCode = generateUniqueTagCode(existingCodes);

    let newName: string | null = null;
    if (original.name && original.name.trim()) {
      const baseName = original.name.trim();
      let candidate = `${baseName} (copia)`;
      let counter = 2;
      while (await clothesRepo.findOne({ where: { userId: user.id, name: candidate } as never })) {
        candidate = `${baseName} (copia ${counter})`;
        counter++;
      }
      newName = candidate;
    }

    const newClothesId = randomUUID();
    const newClothes = clothesRepo.create({
      id: newClothesId,
      userId: user.id,
      code: newCode,
      name: newName,
      size: original.size,
      notes: original.notes,
      isCumulative: original.isCumulative,
      quantity: original.quantity ?? 1,
      brand: original.brand,
      fit: original.fit,
      type: original.type,
      colors: original.colors ? [...original.colors] : [],
      materials: original.materials ? [...original.materials] : [],
      seasons: original.seasons ? [...original.seasons] : [],
      temperatures: original.temperatures ? [...original.temperatures] : [],
      useCases: original.useCases ? [...original.useCases] : [],
      tags: original.tags ? [...original.tags] : [],
    });

    if (original.washingInstruction) {
      newClothes.washingInstruction = this.dataSource.getRepository(WashingInstruction).create({
        userId: user.id,
        washType: original.washingInstruction.washType,
        bleachType: original.washingInstruction.bleachType,
        stretch: original.washingInstruction.stretch,
        temperature: original.washingInstruction.temperature,
        reverseWashing: original.washingInstruction.reverseWashing,
        closedZips: original.washingInstruction.closedZips,
        similarColors: original.washingInstruction.similarColors,
        washSeparately: original.washingInstruction.washSeparately,
        useColorCatcher: original.washingInstruction.useColorCatcher,
        colorLossRisk: original.washingInstruction.colorLossRisk,
        colorLossTestTemperature: original.washingInstruction.colorLossTestTemperature,
      });
    }

    if (original.dryingInstruction) {
      newClothes.dryingInstruction = this.dataSource.getRepository(DryingInstruction).create({
        userId: user.id,
        tumbleDry: original.dryingInstruction.tumbleDry,
        tumbleDryTemperature: original.dryingInstruction.tumbleDryTemperature,
        method: original.dryingInstruction.method,
      });
    }

    if (original.ironingInstruction) {
      newClothes.ironingInstruction = this.dataSource.getRepository(IroningInstruction).create({
        userId: user.id,
        ironType: original.ironingInstruction.ironType,
        ironInsideOut: original.ironingInstruction.ironInsideOut,
        temperature: original.ironingInstruction.temperature,
      });
    }

    if (original.buyDetail) {
      newClothes.buyDetail = this.dataSource.getRepository(BuyDetail).create({
        userId: user.id,
        store: original.buyDetail.store,
        purchaseDate: original.buyDetail.purchaseDate,
        shopUrl: original.buyDetail.shopUrl,
        priceCents: original.buyDetail.priceCents,
        receiptAttachmentId: original.buyDetail.receiptAttachmentId,
      });
    }

    await clothesRepo.save(newClothes);

    const oldAttachments = original.attachments ?? [];
    if (oldAttachments.length > 0) {
      const uploadsDir = path.join(this.getUploadsRootDir(), 'clothes', user.id, newClothesId);
      await fs.mkdir(uploadsDir, { recursive: true });

      const attachmentIdMap = new Map<string, string>();

      for (const oldAtt of oldAttachments) {
        const newAttId = randomUUID();
        attachmentIdMap.set(oldAtt.id, newAttId);

        const oldExt = path.extname(oldAtt.fileName) || path.extname(oldAtt.path) || '.jpg';
        const newFileName = `${newAttId}${oldExt}`;
        const newAbsoluteFilePath = path.join(uploadsDir, newFileName);
        const newRelativeFilePath = path.posix.join('clothes', user.id, newClothesId, newFileName);

        const oldAbsoluteFilePath = this.resolveAttachmentAbsolutePath(oldAtt.path);
        try {
          await fs.copyFile(oldAbsoluteFilePath, newAbsoluteFilePath);
        } catch (copyErr) {
          this.logger.warn(`Could not copy attachment file ${oldAbsoluteFilePath}: ${String(copyErr)}`);
        }

        let newRelativePreviewPath: string | null = null;
        if (oldAtt.previewPath) {
          const oldAbsolutePreviewPath = this.resolveAttachmentAbsolutePath(oldAtt.previewPath);
          const newPreviewFileName = `${newAttId}.preview.webp`;
          const newAbsolutePreviewPath = path.join(uploadsDir, newPreviewFileName);
          newRelativePreviewPath = path.posix.join('clothes', user.id, newClothesId, newPreviewFileName);

          try {
            await fs.copyFile(oldAbsolutePreviewPath, newAbsolutePreviewPath);
          } catch {
            try {
              const fileBuffer = await fs.readFile(newAbsoluteFilePath);
              const previewBuffer = await this.createPreview(fileBuffer);
              await fs.writeFile(newAbsolutePreviewPath, previewBuffer);
            } catch (genErr) {
              this.logger.warn(`Could not generate preview for cloned attachment ${newAttId}: ${String(genErr)}`);
              newRelativePreviewPath = null;
            }
          }
        }

        const newAttachment = attachmentRepo.create({
          id: newAttId,
          userId: user.id,
          clothesId: newClothesId,
          kind: oldAtt.kind ?? 'photo',
          fileName: newFileName,
          originalName: oldAtt.originalName,
          mimeType: oldAtt.mimeType,
          size: oldAtt.size,
          sortOrder: oldAtt.sortOrder,
          path: newRelativeFilePath,
          previewPath: newRelativePreviewPath,
        });

        await attachmentRepo.save(newAttachment);
      }

      if (newClothes.buyDetail && original.buyDetail?.receiptAttachmentId) {
        const mappedReceiptId = attachmentIdMap.get(original.buyDetail.receiptAttachmentId);
        if (mappedReceiptId) {
          newClothes.buyDetail.receiptAttachmentId = mappedReceiptId;
          await this.dataSource.getRepository(BuyDetail).save(newClothes.buyDetail);
        }
      }
    }

    return this.getOne(user, newClothesId);
  }

  async remove(user: AuthUser, id: string) {
    const repository = this.dataSource.getRepository(Clothes);
    const item = await repository.findOne({
      where: { id, userId: user.id } as never,
      relations: { attachments: true },
    });
    if (!item) throw new NotFoundException();

    if (item.attachments && item.attachments.length > 0) {
      for (const attachment of item.attachments) {
        await this.storageCleanupService.deleteAttachmentFiles(attachment);
      }
    }
    await this.storageCleanupService.deleteClothesFolder(user.id, item.id);

    await this.dataSource
      .createQueryBuilder()
      .delete()
      .from('outfit_clothes')
      .where('clothesId = :id', { id })
      .execute();
    await repository.remove(item);
    await this.dataSource.getRepository(SyncTombstone).save({
      userId: user.id,
      entityType: 'clothes',
      entityId: id,
      deletedAt: new Date(),
    });
    return { deleted: true };
  }

  async addAttachment(
    user: AuthUser,
    clothesId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
    body: Record<string, unknown>,
  ) {
    if (!file) throw new BadRequestException('file is required');
    const clothes = await this.getOne(user, clothesId);
    const uploadsDir = path.join(this.getUploadsRootDir(), 'clothes', user.id, clothes.id);
    await fs.mkdir(uploadsDir, { recursive: true });
    const id = randomUUID();
    const extension = path.extname(file.originalname);
    const fileName = `${id}${extension}`;
    const absoluteFilePath = path.join(uploadsDir, fileName);
    const relativeFilePath = path.posix.join('clothes', user.id, clothes.id, fileName);
    await fs.writeFile(absoluteFilePath, file.buffer);

    let previewPath: string | null = null;
    if (file.mimetype.startsWith('image/')) {
      const previewFileName = `${id}.preview.webp`;
      const absolutePreviewPath = path.join(uploadsDir, previewFileName);
      const previewBuffer = await this.createPreview(file.buffer);
      await fs.writeFile(absolutePreviewPath, previewBuffer);
      previewPath = path.posix.join('clothes', user.id, clothes.id, previewFileName);
    }

    const parsedSortOrder = Number(body.sortOrder);
    const hasValidSortOrder = Number.isFinite(parsedSortOrder) && parsedSortOrder >= 0;
    const sortOrder = hasValidSortOrder ? Math.floor(parsedSortOrder) : await this.nextAttachmentSortOrder(clothes.id, user.id);

    const attachment = this.dataSource.getRepository(Attachment).create({
      id,
      userId: user.id,
      clothesId: clothes.id,
      kind: typeof body.kind === 'string' ? body.kind : 'photo',
      fileName,
      originalName: this.normalizeAttachmentOriginalName(
        typeof body.originalName === 'string' ? body.originalName : file.originalname,
      ),
      mimeType: file.mimetype,
      size: file.size,
      sortOrder,
      path: relativeFilePath,
      previewPath,
    });

    return this.dataSource.getRepository(Attachment).save(attachment);
  }

  private normalizeAttachmentOriginalName(value: string | null | undefined) {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    if (isDefaultAttachmentName(normalized)) {
      return null;
    }

    return normalized;
  }
  async removeAttachment(user: AuthUser, clothesId: string, attachmentId: string) {
    const repository = this.dataSource.getRepository(Attachment);
    const attachment = await repository.findOne({ where: { id: attachmentId, clothesId, userId: user.id } as never });
    if (!attachment) throw new NotFoundException();

    await this.storageCleanupService.deleteAttachmentFiles(attachment);

    await repository.remove(attachment);
    return { deleted: true };
  }

  async reorderAttachments(user: AuthUser, clothesId: string, attachmentIds: unknown) {
    if (!Array.isArray(attachmentIds)) {
      throw new BadRequestException('attachment_ids must be an array');
    }

    const ids = attachmentIds.map(String);
    const uniqueIds = Array.from(new Set(ids));
    if (ids.length !== uniqueIds.length) {
      throw new BadRequestException('attachment_ids contains duplicates');
    }

    const clothes = await this.getOne(user, clothesId);
    const currentAttachments = clothes.attachments ?? [];
    if (currentAttachments.length === 0) {
      return [];
    }

    const currentIds = currentAttachments.map((attachment) => attachment.id);
    if (ids.length !== currentIds.length) {
      throw new BadRequestException('attachment_ids length mismatch');
    }

    const currentIdSet = new Set(currentIds);
    for (const id of ids) {
      if (!currentIdSet.has(id)) {
        throw new BadRequestException('attachment_ids contains invalid ids');
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Attachment);
      for (let index = 0; index < ids.length; index += 1) {
        await repository.update({ id: ids[index], clothesId, userId: user.id } as never, { sortOrder: index });
      }
    });

    const updated = await this.dataSource.getRepository(Attachment).find({ where: { clothesId, userId: user.id } as never });
    updated.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
    return updated;
  }

  async getAttachmentFile(user: AuthUser, clothesId: string, attachmentId: string, variant?: string) {
    const attachment = await this.dataSource.getRepository(Attachment).findOne({
      where: { id: attachmentId, clothesId, userId: user.id } as never,
    });

    if (!attachment) {
      throw new NotFoundException();
    }

    try {
      const previewFilePath = variant === 'preview' ? attachment.previewPath : null;
      const usePreview = Boolean(previewFilePath);
      const storedFilePath = previewFilePath ?? attachment.path;
      const content = await fs.readFile(this.resolveAttachmentAbsolutePath(storedFilePath));
      return {
        content,
        mimeType: usePreview ? 'image/webp' : attachment.mimeType || 'application/octet-stream',
        fileName: attachment.originalName || attachment.fileName,
      };
    } catch {
      throw new NotFoundException();
    }
  }

  private async mapPayload(user: AuthUser, body: Record<string, unknown>, existing?: Clothes) {
    const repository = this.dataSource.getRepository(Clothes);
    const clothes = existing ?? repository.create({ userId: user.id });

    if ('code' in body) {
      const normalized = normalizeTagCode(body.code !== null && body.code !== undefined ? String(body.code) : null);
      if (normalized) {
        if (!isValidTagCode(normalized)) {
          throw new BadRequestException('Il codice etichetta deve essere composto da esattamente 3 caratteri alfanumerici.');
        }
        if (!existing || existing.code !== normalized) {
          const collision = await repository.findOne({
            where: { userId: user.id, code: normalized },
          });
          if (collision && collision.id !== existing?.id) {
            throw new ConflictException(`Il codice etichetta "${normalized}" è già utilizzato per un altro capo.`);
          }
        }
        clothes.code = normalized;
      } else {
        const existingItems = await repository.find({
          where: { userId: user.id },
          select: { code: true, id: true },
        });
        const existingCodes = new Set(
          existingItems
            .filter((c) => c.id !== existing?.id)
            .map((c) => c.code)
            .filter(Boolean) as string[],
        );
        clothes.code = generateUniqueTagCode(existingCodes);
      }
    } else if (!existing || !clothes.code) {
      const existingItems = await repository.find({
        where: { userId: user.id },
        select: { code: true, id: true },
      });
      const existingCodes = new Set(
        existingItems
          .filter((c) => c.id !== existing?.id)
          .map((c) => c.code)
          .filter(Boolean) as string[],
      );
      clothes.code = generateUniqueTagCode(existingCodes);
    }

    if (body.name !== undefined) clothes.name = body.name === null ? null : String(body.name).trim();
    if (body.size !== undefined) {
      clothes.size = body.size === null || String(body.size).trim() === '' ? null : String(body.size).trim();
    }
    if (body.notes !== undefined) clothes.notes = body.notes === null ? null : String(body.notes).trim();
    if (body.is_cumulative !== undefined || body.isCumulative !== undefined) {
      clothes.isCumulative = Boolean(body.is_cumulative ?? body.isCumulative);
    }
    if (body.quantity !== undefined) {
      const parsedQty = parseInt(String(body.quantity), 10);
      clothes.quantity = Number.isFinite(parsedQty) && parsedQty >= 1 ? parsedQty : 1;
    }
    if (!clothes.isCumulative) {
      clothes.quantity = 1;
    }
    if (body.brand_id !== undefined) {
      if (body.brand_id === null || String(body.brand_id).trim() === '') {
        clothes.brand = null;
      } else {
        const brand = await this.referenceDataService.resolveOwnedReferences<Brand>('brands', user.id, [String(body.brand_id)]);
        clothes.brand = brand[0];
      }
    }
    if (body.fit_id !== undefined) {
      if (body.fit_id === null || String(body.fit_id).trim() === '') {
        clothes.fit = null;
      } else {
        const fit = await this.referenceDataService.resolveOwnedReferences<Fit>('fits', user.id, [String(body.fit_id)]);
        clothes.fit = fit[0];
      }
    }
    if (body.type_id !== undefined) {
      if (body.type_id === null || String(body.type_id).trim() === '') {
        clothes.type = null;
      } else {
        const type = await this.referenceDataService.resolveOwnedReferences<Type>('types', user.id, [String(body.type_id)]);
        clothes.type = type[0];
      }
    }

    clothes.colors = (await this.resolveRelationIds('colors', user.id, body.color_ids)) as Color[];
    clothes.materials = (await this.resolveRelationIds('materials', user.id, body.material_ids)) as Material[];
    clothes.seasons = (await this.resolveRelationIds('seasons', user.id, body.season_ids)) as Season[];
    clothes.temperatures = (await this.resolveRelationIds('temperatures', user.id, body.temperature_ids)) as Temperature[];
    clothes.useCases = (await this.resolveRelationIds('use-cases', user.id, body.use_case_ids)) as UseCase[];
    clothes.tags = (await this.resolveRelationIds('tags', user.id, body.tag_ids)) as Tag[];

    if ('washingInstruction' in body) {
      if (body.washingInstruction) {
        const washingBody = toPlainObject(body.washingInstruction) ?? {};
        const washingTemperature = this.toOptionalNumber(
          washingBody.washing_temperature ?? washingBody.temperature,
          'washingInstruction.washing_temperature',
        );
        const washType = trimToNull(washingBody.washType ?? washingBody.wash_type);
        const bleachType = trimToNull(washingBody.bleachType ?? washingBody.bleach_type);
        const stretch = this.toBooleanWithDefault(washingBody.stretch, false);
        const reverseWashing = this.toBooleanWithDefault(washingBody.reverseWashing ?? washingBody.reverse_washing, false);
        const closedZips = this.toBooleanWithDefault(washingBody.closedZips ?? washingBody.closed_zips, false);
        const similarColors = this.toBooleanWithDefault(washingBody.similarColors ?? washingBody.similar_colors, false);
        const washSeparately = this.toBooleanWithDefault(
          washingBody.washSeparately ?? washingBody.wash_separately,
          false,
        );
        const useColorCatcher = this.toBooleanWithDefault(
          washingBody.useColorCatcher ?? washingBody.use_color_catcher,
          false,
        );
        const colorLossRisk = this.toBooleanWithDefault(washingBody.colorLossRisk ?? washingBody.color_loss, false);
        const colorLossTestTemperature = this.toOptionalNumber(
          washingBody.colorLossTestTemperature ?? washingBody.color_loss_test_temperature,
          'washingInstruction.color_loss_test_temperature',
        );
        const normalizedWashingTemperature = washType === 'washer_ok' ? washingTemperature : null;

        const next = this.dataSource
          .getRepository(WashingInstruction)
          .create({
            userId: user.id,
            washType: washType as WashingInstruction['washType'],
            bleachType: bleachType as WashingInstruction['bleachType'],
            stretch,
            temperature: normalizedWashingTemperature === null ? null : String(normalizedWashingTemperature),
            reverseWashing,
            closedZips,
            similarColors,
            washSeparately,
            useColorCatcher,
            colorLossRisk,
            colorLossTestTemperature,
          });
        if (existing?.washingInstruction?.id) {
          next.id = existing.washingInstruction.id;
        }
        clothes.washingInstruction = next;
      } else {
        clothes.washingInstruction = null;
      }
    }

    if ('dryingInstruction' in body) {
      if (body.dryingInstruction) {
        const dryingBody = toPlainObject(body.dryingInstruction) ?? {};
        const tumbleDry = this.toBooleanWithDefault(dryingBody.tumbleDry ?? dryingBody.tumble_dry, false);
        const tumbleDryTemperature = trimToNull(dryingBody.tumbleDryTemperature ?? dryingBody.tumble_dry_temperature);
        const method = trimToNull(dryingBody.method) ?? (tumbleDry ? `tumble_dry:${tumbleDryTemperature ?? 'medium'}` : 'air_dry');

        const next = this.dataSource
          .getRepository(DryingInstruction)
          .create({
            userId: user.id,
            tumbleDry,
            tumbleDryTemperature: tumbleDryTemperature as DryingInstruction['tumbleDryTemperature'],
            method,
          });
        if (existing?.dryingInstruction?.id) {
          next.id = existing.dryingInstruction.id;
        }
        clothes.dryingInstruction = next;
      } else {
        clothes.dryingInstruction = null;
      }
    }

    if ('ironingInstruction' in body) {
      if (body.ironingInstruction) {
        const ironingBody = toPlainObject(body.ironingInstruction) ?? {};
        const ironingTemperature = this.toOptionalNumber(
          ironingBody.ironing_temperature ?? ironingBody.temperature,
          'ironingInstruction.ironing_temperature',
        );
        const ironType = trimToNull(ironingBody.ironType ?? ironingBody.iron_type);
        const ironInsideOut = this.toBooleanWithDefault(ironingBody.ironInsideOut ?? ironingBody.inside_out, false);

        const next = this.dataSource
          .getRepository(IroningInstruction)
          .create({
            userId: user.id,
            ironType: ironType as IroningInstruction['ironType'],
            ironInsideOut,
            temperature: ironingTemperature === null ? null : String(ironingTemperature),
          });
        if (existing?.ironingInstruction?.id) {
          next.id = existing.ironingInstruction.id;
        }
        clothes.ironingInstruction = next;
      } else {
        clothes.ironingInstruction = null;
      }
    }

    if ('buyDetail' in body) {
      if (body.buyDetail) {
        const buyBody = toPlainObject(body.buyDetail) ?? {};

        const next = this.dataSource
          .getRepository(BuyDetail)
          .create({
            userId: user.id,
            store: trimToNull(buyBody.store ?? buyBody.shop_name),
            purchaseDate: trimToNull(buyBody.purchaseDate ?? buyBody.purchase_date),
            shopUrl: trimToNull(buyBody.shopUrl ?? buyBody.shop_url),
            priceCents: this.toOptionalNumber(buyBody.priceCents, 'buyDetail.priceCents'),
            receiptAttachmentId: trimToNull(buyBody.receiptAttachmentId),
          });
        if (existing?.buyDetail?.id) {
          next.id = existing.buyDetail.id;
        }
        clothes.buyDetail = next;
      } else {
        clothes.buyDetail = null;
      }
    }

    return clothes;
  }

  private validateWizardPayload(body: Record<string, unknown>, options: { requireSelections: boolean }) {
    const requireSelections = options.requireSelections;

    if (requireSelections || 'color_ids' in body) {
      this.validateRequiredSelection(body.color_ids, 'color_ids', 'Seleziona almeno un colore');
    }
    if (requireSelections || 'season_ids' in body) {
      this.validateRequiredSelection(body.season_ids, 'season_ids', 'Seleziona almeno una stagione');
    }
    if (requireSelections || 'temperature_ids' in body) {
      this.validateRequiredSelection(body.temperature_ids, 'temperature_ids', 'Seleziona almeno una temperatura');
    }

    const washing = toPlainObject(body.washingInstruction);
    if (washing) {
      const washTypeRaw = washing.washType ?? washing.wash_type;
      const washType = washTypeRaw === null || washTypeRaw === undefined ? null : String(washTypeRaw).trim();
      const washingTemperature = this.toOptionalNumber(
        washing.washing_temperature ?? washing.temperature,
        'washingInstruction.washing_temperature',
      );

      if (washType === 'washer_ok' && washingTemperature === null) {
        throw new BadRequestException('Temperatura lavaggio obbligatoria (0-95)');
      }

      if (washType === 'washer_ok' && washingTemperature !== null && (washingTemperature < 0 || washingTemperature > 95)) {
        throw new BadRequestException('Temperatura lavaggio obbligatoria (0-95)');
      }

      const colorLossTestTemperature = this.toOptionalNumber(
        washing.colorLossTestTemperature ?? washing.color_loss_test_temperature,
        'washingInstruction.color_loss_test_temperature',
      );
      if (colorLossTestTemperature !== null && (colorLossTestTemperature < 0 || colorLossTestTemperature > 95)) {
        throw new BadRequestException('Temperatura test perdita colore non valida (0-95)');
      }
    }

    const drying = toPlainObject(body.dryingInstruction);
    if (drying) {
      const tumbleDry = this.toOptionalBoolean(drying.tumbleDry ?? drying.tumble_dry, 'dryingInstruction.tumbleDry');
      const tumbleDryTemperatureRaw = drying.tumbleDryTemperature ?? drying.tumble_dry_temperature;
      const tumbleDryTemperature =
        tumbleDryTemperatureRaw === null || tumbleDryTemperatureRaw === undefined
          ? null
          : String(tumbleDryTemperatureRaw).trim();

      if (tumbleDry === true) {
        if (!tumbleDryTemperature) {
          throw new BadRequestException('Seleziona la temperatura tumble dry');
        }
        if (!['low', 'medium', 'high'].includes(tumbleDryTemperature)) {
          throw new BadRequestException('Temperatura tumble dry non valida');
        }
      }

      const method = drying.method === null || drying.method === undefined ? null : String(drying.method).trim();
      if (method) {
        if (method === 'air_dry') {
          // valid
        } else if (method.startsWith('tumble_dry:')) {
          const level = method.slice('tumble_dry:'.length).trim();
          if (!['low', 'medium', 'high'].includes(level)) {
            throw new BadRequestException('Temperatura tumble dry non valida');
          }
        } else {
          throw new BadRequestException('Metodo asciugatura non valido');
        }
      }
    }

    const ironing = toPlainObject(body.ironingInstruction);
    if (ironing) {
      const ironTypeRaw = ironing.ironType ?? ironing.iron_type;
      const ironType = ironTypeRaw === undefined || ironTypeRaw === null ? null : String(ironTypeRaw).trim();
      const ironingTemperature = this.toOptionalNumber(
        ironing.ironing_temperature ?? ironing.temperature,
        'ironingInstruction.ironing_temperature',
      );

      if (ironType && ironType !== 'no' && ironingTemperature === null) {
        throw new BadRequestException('Temperatura stiraggio obbligatoria (0-230)');
      }

      if (ironingTemperature !== null && (ironingTemperature < 0 || ironingTemperature > 230)) {
        throw new BadRequestException('Temperatura stiraggio obbligatoria (0-230)');
      }
    }

    const buyDetail = toPlainObject(body.buyDetail);
    if (buyDetail) {
      const rawShopUrl =
        typeof buyDetail.shopUrl === 'string'
          ? buyDetail.shopUrl.trim()
          : typeof buyDetail.shop_url === 'string'
            ? buyDetail.shop_url.trim()
            : '';

      if (rawShopUrl && !/^https?:\/\/.+/i.test(rawShopUrl)) {
        throw new BadRequestException('Inserisci un URL valido (http:// o https://)');
      }
    }
  }

  private validateRequiredSelection(value: unknown, fieldName: string, message: string) {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} must be an array`);
    }

    const ids = value
      .map((item) => String(item).trim())
      .filter(Boolean);
    if (ids.length === 0) {
      throw new BadRequestException(message);
    }
  }

  private toOptionalNumber(value: unknown, fieldName: string) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(`${fieldName} must be a valid number`);
    }

    return parsed;
  }

  private toOptionalBoolean(value: unknown, fieldName: string) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${fieldName} must be a boolean`);
    }

    return value;
  }

  private toBooleanWithDefault(value: unknown, defaultValue: boolean) {
    if (value === null || value === undefined) {
      return defaultValue;
    }

    if (typeof value !== 'boolean') {
      throw new BadRequestException('Boolean field must be a boolean');
    }

    return value;
  }

  private async resolveRelationIds<T extends Color | Material | Season | Temperature | UseCase | Tag>(
    type: 'colors' | 'materials' | 'seasons' | 'temperatures' | 'use-cases' | 'tags',
    userId: string,
    value: unknown,
  ): Promise<T[]> {
    const ids = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
    return this.referenceDataService.resolveOwnedReferences<T>(type, userId, ids);
  }

  private sortAttachments(clothes: Clothes) {
    if (!clothes.attachments) {
      return;
    }

    clothes.attachments = [...clothes.attachments].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  private async nextAttachmentSortOrder(clothesId: string, userId: string) {
    const row = await this.dataSource
      .getRepository(Attachment)
      .createQueryBuilder('attachment')
      .select('MAX(attachment.sortOrder)', 'maxSortOrder')
      .where('attachment.clothesId = :clothesId', { clothesId })
      .andWhere('attachment.userId = :userId', { userId })
      .getRawOne<{ maxSortOrder: number | string | null }>();

    const maxSortOrder = row?.maxSortOrder;
    if (maxSortOrder === null || maxSortOrder === undefined) {
      return 0;
    }

    const parsed = Number(maxSortOrder);
    return Number.isFinite(parsed) ? parsed + 1 : 0;
  }

  private async createPreview(buffer: Buffer) {
    const widths = [1600, 1200, 1000, 800, 640, 480, 320, 240, 160];
    const qualities = [75, 60, 50, 40, 30, 20];
    let smallestBuffer: Buffer | undefined;

    for (const width of widths) {
      for (const quality of qualities) {
        const preview = await sharp(buffer)
          .rotate()
          .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
          .webp({ quality })
          .toBuffer();
        smallestBuffer = preview;
        if (preview.length <= MAX_PREVIEW_SIZE) {
          return preview;
        }
      }
    }

    return smallestBuffer as Buffer;
  }

  private async generateMissingPreviews() {
    const repository = this.dataSource.getRepository(Attachment);
    const attachments = await repository.find();
    let generated = 0;

    for (const attachment of attachments) {
      if (!attachment.mimeType?.startsWith('image/')) {
        continue;
      }

      const originalPath = this.resolveAttachmentAbsolutePath(attachment.path);
      const previewPath = attachment.previewPath ?? path.posix.join(
        path.posix.dirname(normalizeStoredAttachmentPath(attachment.path)),
        `${attachment.id}.preview.webp`,
      );
      const absolutePreviewPath = this.resolveAttachmentAbsolutePath(previewPath);

      try {
        await fs.access(absolutePreviewPath);
      } catch {
        try {
          const originalBuffer = await fs.readFile(originalPath);
          const previewBuffer = await this.createPreview(originalBuffer);
          await fs.writeFile(absolutePreviewPath, previewBuffer);
        } catch (error) {
          this.logger.warn(`Impossibile generare la preview per l'allegato ${attachment.id}: ${String(error)}`);
          continue;
        }
      }

      if (attachment.previewPath !== previewPath) {
        await repository.update(attachment.id, { previewPath });
      }
      generated += 1;
    }

    if (generated > 0) {
      this.logger.log(`Preview immagini verificate: ${generated}`);
    }
  }

  private resolveAttachmentAbsolutePath(storedPath: string) {
    if (path.isAbsolute(storedPath)) {
      return storedPath;
    }

    const uploadsRootDir = this.getUploadsRootDir();
    const normalizedStoredPath = normalizeStoredAttachmentPath(storedPath);

    // Backward compatibility for older rows saved as "uploads/...".
    if (normalizedStoredPath.startsWith('uploads/')) {
      return path.join(uploadsRootDir, normalizedStoredPath.slice('uploads/'.length));
    }

    return path.join(uploadsRootDir, normalizedStoredPath);
  }

  private getUploadsRootDir() {
    const configuredRoot = process.env.UPLOADS_DIR?.trim();
    if (configuredRoot) {
      return path.resolve(configuredRoot);
    }

    return path.resolve(process.cwd(), 'uploads');
  }

  private decorateResponse(item: Clothes) {
    return {
      ...item,
      fullTitle: item.fullTitle,
    };
  }
}