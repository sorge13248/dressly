import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import { DataSource, In, IsNull, Not } from 'typeorm';
import { AuthUser } from '../common/auth/auth.types';
import { generateUniqueTagCode, isValidTagCode, normalizeTagCode } from '../common/utils/tag-code.util';
import {
  createImagePreview,
  ensureAttachmentPreview,
  resolveAttachmentFile,
  sortAttachments,
} from '../common/utils/attachment-preview.util';
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
import { Location } from '../entities/location.entity';
import { WashingProgram } from '../entities/washing-program.entity';
import { Detergent } from '../entities/detergent.entity';
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

function getCurrentSeasonName(date = new Date()): 'Primavera' | 'Estate' | 'Autunno' | 'Inverno' {
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();
  if ((month === 2 && day >= 21) || month === 3 || month === 4 || (month === 5 && day <= 20)) {
    return 'Primavera';
  }
  if ((month === 5 && day >= 21) || month === 6 || month === 7 || (month === 8 && day <= 20)) {
    return 'Estate';
  }
  if ((month === 8 && day >= 21) || month === 9 || month === 10 || (month === 11 && day <= 20)) {
    return 'Autunno';
  }
  return 'Inverno';
}

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
    await this.migrateColorLossRiskTriState();
  }

  async migrateColorLossRiskTriState() {
    try {
      await this.dataSource.query(
        'CREATE TABLE IF NOT EXISTS _app_migrations (id TEXT PRIMARY KEY, appliedAt DATETIME);',
      );
      const applied = await this.dataSource.query(
        'SELECT id FROM _app_migrations WHERE id = ?;',
        ['20261113_color_loss_risk_tri_state'],
      );
      if (applied && applied.length > 0) {
        return;
      }

      this.logger.log('Running one-time migration: 20261113_color_loss_risk_tri_state...');
      // Treat false (0) as null if test temperature was not set, otherwise keep false (0)
      await this.dataSource.query(`
        UPDATE washing_instructions
        SET colorLossRisk = NULL
        WHERE (colorLossRisk = 0 OR colorLossRisk = FALSE)
          AND colorLossTestTemperature IS NULL;
      `);

      await this.dataSource.query(
        'INSERT INTO _app_migrations (id, appliedAt) VALUES (?, CURRENT_TIMESTAMP);',
        ['20261113_color_loss_risk_tri_state'],
      );
      this.logger.log('Migration 20261113_color_loss_risk_tri_state completed successfully.');
    } catch (err) {
      this.logger.warn(`Could not run colorLossRisk migration: ${String(err)}`);
    }
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
      .leftJoinAndSelect('clothes.location', 'location')
      .leftJoinAndSelect('location.room', 'room')
      .where('clothes.userId = :userId', { userId: user.id })
      .distinct(true);

    const status = query.status?.trim();
    if (status && status !== 'all') {
      qb.andWhere('clothes.status = :status', { status });
    }

    const locationIds = Array.from(new Set([...parseCsv(query.location_id), ...parseCsv(query.location_ids)]));
    if (locationIds.length > 0) {
      qb.andWhere('location.id IN (:...locationIds)', { locationIds });
    }

    const roomIds = Array.from(new Set([...parseCsv(query.room_id), ...parseCsv(query.room_ids)]));
    if (roomIds.length > 0) {
      qb.andWhere('room.id IN (:...roomIds)', { roomIds });
    }

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

    const sort = (query.sort || 'created_desc').trim();
    switch (sort) {
      case 'created_asc':
        qb.orderBy('clothes.createdAt', 'ASC');
        break;
      case 'name_asc':
        qb.addSelect('LOWER(COALESCE(clothes.name, type.name, clothes.code, \'\'))', 'sort_name')
          .orderBy('sort_name', 'ASC')
          .addOrderBy('clothes.createdAt', 'DESC');
        break;
      case 'name_desc':
        qb.addSelect('LOWER(COALESCE(clothes.name, type.name, clothes.code, \'\'))', 'sort_name')
          .orderBy('sort_name', 'DESC')
          .addOrderBy('clothes.createdAt', 'DESC');
        break;
      case 'type_order':
        qb.addSelect(
          `(CASE
            WHEN LOWER(type.name) LIKE '%t-shirt%' OR LOWER(type.name) LIKE '%polo%' OR LOWER(type.name) LIKE '%camicia%' OR LOWER(type.name) LIKE '%top%' OR LOWER(type.name) LIKE '%canotta%' THEN 10
            WHEN LOWER(type.name) LIKE '%maglion%' OR LOWER(type.name) LIKE '%cardigan%' OR LOWER(type.name) LIKE '%felpa%' OR LOWER(type.name) LIKE '%hoodie%' THEN 20
            WHEN LOWER(type.name) LIKE '%giacca%' OR LOWER(type.name) LIKE '%blazer%' OR LOWER(type.name) LIKE '%cappotto%' OR LOWER(type.name) LIKE '%piumino%' OR LOWER(type.name) LIKE '%trench%' OR LOWER(type.name) LIKE '%gilet%' THEN 30
            WHEN LOWER(type.name) LIKE '%jean%' OR LOWER(type.name) LIKE '%pantalon%' OR LOWER(type.name) LIKE '%chino%' OR LOWER(type.name) LIKE '%short%' OR LOWER(type.name) LIKE '%jogger%' OR LOWER(type.name) LIKE '%legging%' OR LOWER(type.name) LIKE '%gonna%' THEN 40
            WHEN LOWER(type.name) LIKE '%vestit%' OR LOWER(type.name) LIKE '%tuta%' OR LOWER(type.name) LIKE '%completo%' THEN 50
            WHEN LOWER(type.name) LIKE '%intimo%' OR LOWER(type.name) LIKE '%pigiama%' OR LOWER(type.name) LIKE '%costume%' THEN 60
            WHEN LOWER(type.name) LIKE '%scarp%' OR LOWER(type.name) LIKE '%sneaker%' OR LOWER(type.name) LIKE '%stival%' OR LOWER(type.name) LIKE '%sandal%' OR LOWER(type.name) LIKE '%ciabatt%' OR LOWER(type.name) LIKE '%mocassin%' THEN 70
            ELSE 90
          END)`,
          'sort_type_order',
        )
          .orderBy('sort_type_order', 'ASC')
          .addOrderBy('type.name', 'ASC')
          .addOrderBy('clothes.createdAt', 'DESC');
        break;
      case 'type_asc':
        qb.orderBy('type.name', 'ASC')
          .addOrderBy('clothes.createdAt', 'DESC');
        break;
      case 'code_asc':
        qb.addSelect('CASE WHEN clothes.code IS NULL OR clothes.code = \'\' THEN 1 ELSE 0 END', 'sort_code_null')
          .orderBy('sort_code_null', 'ASC')
          .addOrderBy('clothes.code', 'ASC')
          .addOrderBy('clothes.createdAt', 'DESC');
        break;
      case 'availability':
        qb.addSelect(
          '(CASE WHEN EXISTS (SELECT 1 FROM washing_items wi WHERE wi.clothesId = clothes.id AND wi.userId = :userId) THEN 2 ' +
          'WHEN EXISTS (SELECT 1 FROM ironing_items ii WHERE ii.clothesId = clothes.id AND ii.userId = :userId) THEN 1 ELSE 0 END)',
          'sort_avail',
        )
          .orderBy('sort_avail', 'ASC')
          .addOrderBy('clothes.createdAt', 'DESC');
        break;
      case 'season_current': {
        const curSeason = getCurrentSeasonName();
        qb.setParameter('curSeasonPattern', `%${curSeason.toLowerCase()}%`);
        qb.addSelect(
          '(CASE WHEN EXISTS (SELECT 1 FROM clothes_seasons cs JOIN seasons s ON s.id = cs.seasonsId WHERE cs.clothesId = clothes.id AND LOWER(s.name) LIKE :curSeasonPattern) THEN 0 ' +
          'WHEN EXISTS (SELECT 1 FROM clothes_seasons cs JOIN seasons s ON s.id = cs.seasonsId WHERE cs.clothesId = clothes.id AND LOWER(s.name) LIKE \'%tutte%\') THEN 1 ELSE 2 END)',
          'sort_season_current',
        )
          .orderBy('sort_season_current', 'ASC')
          .addOrderBy('clothes.createdAt', 'DESC');
        break;
      }
      case 'season_cycle':
        qb.addSelect(
          '(SELECT COALESCE(MIN(s.sortOrder), 99) FROM clothes_seasons cs JOIN seasons s ON s.id = cs.seasonsId WHERE cs.clothesId = clothes.id)',
          'sort_season_cycle',
        )
          .orderBy('sort_season_cycle', 'ASC')
          .addOrderBy('clothes.createdAt', 'DESC');
        break;
      case 'created_desc':
      default:
        qb.orderBy('clothes.createdAt', 'DESC');
        break;
    }

    const [items, total] = await qb.skip((page - 1) * perPage).take(perPage).getManyAndCount();
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
      .leftJoinAndSelect('washingInstruction.washingProgram', 'washingProgram')
      .leftJoinAndSelect('washingInstruction.detergent', 'detergent')
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
                notes: item.washingInstruction.notes,
                washingProgramId: item.washingInstruction.washingProgramId,
                washingProgram: item.washingInstruction.washingProgram
                  ? {
                      id: item.washingInstruction.washingProgram.id,
                      name: item.washingInstruction.washingProgram.name,
                      temperature: item.washingInstruction.washingProgram.temperature,
                      spinSpeed: item.washingInstruction.washingProgram.spinSpeed,
                    }
                  : null,
                detergentId: item.washingInstruction.detergentId,
                detergent: item.washingInstruction.detergent
                  ? {
                      id: item.washingInstruction.detergent.id,
                      name: item.washingInstruction.detergent.name,
                      description: item.washingInstruction.detergent.description,
                    }
                  : null,
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
        washingInstruction: { washingProgram: true, detergent: true },
        dryingInstruction: true,
        ironingInstruction: true,
        buyDetail: true,
        location: { room: true },
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
        washingInstruction: { washingProgram: true, detergent: true },
        dryingInstruction: true,
        ironingInstruction: true,
        buyDetail: true,
        location: { room: true },
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
        washingInstruction: { washingProgram: true, detergent: true },
        dryingInstruction: true,
        ironingInstruction: true,
        buyDetail: true,
        location: { room: true },
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
      status: original.status ?? 'in_wardrobe',
      location: original.location,
      locationId: original.locationId,
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
        notes: original.washingInstruction.notes,
        washingProgramId: original.washingInstruction.washingProgramId,
        detergentId: original.washingInstruction.detergentId,
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
              const previewBuffer = await createImagePreview(fileBuffer);
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
      const previewBuffer = await createImagePreview(file.buffer);
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

    const saved = await this.dataSource.getRepository(Attachment).save(attachment);
    await this.dataSource.getRepository(Clothes).update({ id: clothes.id, userId: user.id }, { updatedAt: new Date() });
    return saved;
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
    await this.dataSource.getRepository(Clothes).update({ id: clothesId, userId: user.id }, { updatedAt: new Date() });
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
      await manager.getRepository(Clothes).update({ id: clothesId, userId: user.id }, { updatedAt: new Date() });
    });

    const updated = await this.dataSource.getRepository(Attachment).find({ where: { clothesId, userId: user.id } as never });
    return sortAttachments(updated);
  }

  async getAttachmentFile(user: AuthUser, clothesId: string, attachmentId: string, variant?: string) {
    const repository = this.dataSource.getRepository(Attachment);
    const attachment = await repository.findOne({
      where: { id: attachmentId, clothesId, userId: user.id } as never,
    });

    if (!attachment) {
      throw new NotFoundException();
    }

    return resolveAttachmentFile({
      attachment,
      variant,
      resolveAbsolutePath: (rel) => this.resolveAttachmentAbsolutePath(rel),
      onPreviewPersisted: async (previewRelPath) => {
        await repository.update(attachment.id, { previewPath: previewRelPath });
        attachment.previewPath = previewRelPath;
      },
    });
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

    if (body.status !== undefined) {
      const rawStatus = String(body.status).trim();
      if (['in_wardrobe', 'in_storage', 'dismissed'].includes(rawStatus)) {
        clothes.status = rawStatus as 'in_wardrobe' | 'in_storage' | 'dismissed';
      }
    } else if (!existing) {
      clothes.status = 'in_wardrobe';
    }

    const rawLocationId = body.location_id !== undefined ? body.location_id : body.locationId;
    if (rawLocationId !== undefined) {
      if (rawLocationId === null || String(rawLocationId).trim() === '') {
        clothes.location = null;
        clothes.locationId = null;
      } else {
        const loc = await this.referenceDataService.resolveOwnedReferences<Location>('locations', user.id, [String(rawLocationId)]);
        clothes.location = loc[0] ?? null;
        clothes.locationId = loc[0]?.id ?? null;
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
        const washingProgramId = trimToNull(washingBody.washingProgramId ?? washingBody.washing_program_id);
        if (washingProgramId) {
          const wp = await this.dataSource.getRepository(WashingProgram).findOne({
            where: { id: washingProgramId, userId: user.id },
          });
          if (!wp) {
            throw new BadRequestException('Programma lavatrice non valido');
          }
        }

        const detergentId = trimToNull(washingBody.detergentId ?? washingBody.detergent_id);
        if (detergentId) {
          const det = await this.dataSource.getRepository(Detergent).findOne({
            where: { id: detergentId, userId: user.id },
          });
          if (!det) {
            throw new BadRequestException('Detersivo non valido');
          }
        }

        const rawColorLoss = washingBody.colorLossRisk !== undefined ? washingBody.colorLossRisk : washingBody.color_loss;
        let colorLossRisk: number | null = null;
        if (rawColorLoss === null || rawColorLoss === undefined || rawColorLoss === '') {
          colorLossRisk = null;
        } else if (rawColorLoss === 1 || rawColorLoss === true || rawColorLoss === '1') {
          colorLossRisk = 1;
        } else if (rawColorLoss === 0 || rawColorLoss === false || rawColorLoss === '0') {
          colorLossRisk = 0;
        }

        const colorLossTestTemperature = this.toOptionalNumber(
          washingBody.colorLossTestTemperature ?? washingBody.color_loss_test_temperature,
          'washingInstruction.color_loss_test_temperature',
        );
        const notes = trimToNull(washingBody.notes);
        const normalizedWashingTemperature =
          washType === 'washer_ok' && !washingProgramId ? washingTemperature : null;

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
            notes,
            washingProgramId: washType === 'washer_ok' ? washingProgramId : null,
            detergentId: washType !== 'do_not_wash' ? detergentId : null,
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
      const washingProgramId = trimToNull(washing.washingProgramId ?? washing.washing_program_id);
      const washingTemperature = this.toOptionalNumber(
        washing.washing_temperature ?? washing.temperature,
        'washingInstruction.washing_temperature',
      );

      if (washType === 'washer_ok' && washingTemperature === null && !washingProgramId) {
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

    clothes.attachments = sortAttachments(clothes.attachments);
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

  private async generateMissingPreviews() {
    const repository = this.dataSource.getRepository(Attachment);
    const attachments = await repository.find();
    let generated = 0;

    for (const attachment of attachments) {
      if (!attachment.mimeType?.startsWith('image/')) {
        continue;
      }

      const preview = await ensureAttachmentPreview({
        attachment,
        resolveAbsolutePath: (rel) => this.resolveAttachmentAbsolutePath(rel),
        onPreviewPersisted: async (previewPath) => {
          await repository.update(attachment.id, { previewPath });
        },
      });

      if (preview) {
        generated += 1;
      }
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

  async bulkUpdateStatus(
    user: AuthUser,
    clothesIds: string[],
    status: 'in_wardrobe' | 'in_storage' | 'dismissed',
    locationId?: string | null,
  ) {
    if (!clothesIds || clothesIds.length === 0) {
      return { updated: 0 };
    }

    const clothesRepo = this.dataSource.getRepository(Clothes);
    const items = await clothesRepo.find({
      where: { id: In(clothesIds), userId: user.id },
      relations: { location: true },
    });

    if (items.length === 0) {
      return { updated: 0 };
    }

    let resolvedLocation: Location | null = null;
    let resolvedLocationId: string | null = null;
    if (locationId) {
      const locations = await this.referenceDataService.resolveOwnedReferences<Location>('locations', user.id, [locationId]);
      resolvedLocation = locations[0] ?? null;
      resolvedLocationId = resolvedLocation?.id ?? null;
    }

    for (const item of items) {
      item.status = status;
      if (locationId !== undefined) {
        item.location = resolvedLocation;
        item.locationId = resolvedLocationId;
      }
    }

    await clothesRepo.save(items);
    return { updated: items.length };
  }

  private decorateResponse(item: Clothes) {
    return {
      ...item,
      fullTitle: item.fullTitle,
    };
  }

  async generateClothPdf(user: AuthUser, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const item = await this.getOne(user, id);

    // Primary photo preparation
    const primaryAttachment = item.attachments?.find((a) => a.kind === 'photo') ?? item.attachments?.[0];
    let primaryPhotoBuffer: Buffer | null = null;
    if (primaryAttachment) {
      try {
        const photoAbsPath = this.resolveAttachmentAbsolutePath(primaryAttachment.path);
        primaryPhotoBuffer = await sharp(photoAbsPath)
          .rotate()
          .resize(400, 500, { fit: 'inside' })
          .jpeg({ quality: 88 })
          .toBuffer();
      } catch (err) {
        this.logger.warn(`Could not load primary photo for PDF generation: ${String(err)}`);
      }
    }

    // Secondary photos (up to 4 thumbnails)
    const secondaryAttachments = (item.attachments ?? []).filter((a) => a.id !== primaryAttachment?.id).slice(0, 4);
    const secondaryPhotoBuffers: Buffer[] = [];
    for (const secAtt of secondaryAttachments) {
      try {
        let secPath = secAtt.previewPath ? this.resolveAttachmentAbsolutePath(secAtt.previewPath) : null;
        if (!secPath || !existsSync(secPath)) {
          secPath = this.resolveAttachmentAbsolutePath(secAtt.path);
        }
        const buf = await sharp(secPath)
          .rotate()
          .resize(120, 120, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toBuffer();
        secondaryPhotoBuffers.push(buf);
      } catch {
        // Ignore unreadable secondary previews
      }
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
      info: {
        Title: item.name || item.code || 'Scheda Capo Dressly',
        Author: 'Dressly Digital Wardrobe',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    const sanitize = (val: string | null | undefined) => {
      if (!val) return '';
      return val
        .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}]/gu, '')
        .trim();
    };

    // --- Header Section ---
    // Top blue accent bar
    doc.rect(36, 36, 523, 4).fill('#0284c7');

    // Title / Brand
    doc.fillColor('#0284c7').font('Helvetica-Bold').fontSize(16).text('DRESSLY', 36, 46);
    doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text('SCHEDA TECNICA CAPO', 36, 64);

    // Tag Code pill on the right
    if (item.code) {
      doc.roundedRect(460, 44, 99, 26, 5).fillAndStroke('#e0f2fe', '#0284c7');
      doc.fillColor('#0369a1').font('Helvetica-Bold').fontSize(13).text(item.code, 460, 50, { width: 99, align: 'center' });
    }

    const genDateStr = `Generato il ${new Date().toLocaleDateString('it-IT')}`;
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8).text(genDateStr, 300, 65, { width: 150, align: 'right' });

    // Divider line
    doc.moveTo(36, 78).lineTo(559, 78).strokeColor('#e2e8f0').lineWidth(0.8).stroke();

    // --- Hero Section (Photo + Metadata) ---
    const heroY = 88;
    const photoWidth = 185;
    const photoHeight = 225;

    // Photo Box Frame
    doc.roundedRect(36, heroY, photoWidth, photoHeight, 6).fillAndStroke('#f8fafc', '#cbd5e1');

    if (primaryPhotoBuffer) {
      doc.image(primaryPhotoBuffer, 38, heroY + 2, {
        fit: [photoWidth - 4, photoHeight - 4],
        align: 'center',
        valign: 'center',
      });
    } else {
      doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(11).text('Nessuna Foto', 36, heroY + 100, {
        width: photoWidth,
        align: 'center',
      });
    }

    // Metadata column on the right
    const metaX = 232;
    const metaWidth = 327;
    let currentY = heroY + 2;

    // Item Title
    const titleText = sanitize(item.fullTitle || item.name || 'Capo senza nome');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(15).text(titleText, metaX, currentY, {
      width: metaWidth,
      lineBreak: true,
    });
    currentY = doc.y + 6;

    // Status Badge
    let statusLabel = "Nell'armadio";
    let statusBg = '#d1fae5';
    let statusColor = '#065f46';
    let statusBorder = '#10b981';

    if (item.status === 'in_storage') {
      const roomLocParts = [item.location?.room?.name, item.location?.name].filter(Boolean).join(' > ');
      statusLabel = `In Deposito${roomLocParts ? ': ' + sanitize(roomLocParts) : ''}`;
      statusBg = '#fef3c7';
      statusColor = '#92400e';
      statusBorder = '#f59e0b';
    } else if (item.status === 'dismissed') {
      statusLabel = 'Dismesso';
      statusBg = '#f1f5f9';
      statusColor = '#475569';
      statusBorder = '#94a3b8';
    }

    doc.font('Helvetica-Bold').fontSize(8.5);
    const badgeWidth = Math.min(220, doc.widthOfString(statusLabel) + 16);
    doc.roundedRect(metaX, currentY, badgeWidth, 18, 4).fillAndStroke(statusBg, statusBorder);
    doc.fillColor(statusColor).font('Helvetica-Bold').fontSize(8.5).text(statusLabel, metaX, currentY + 4, {
      width: badgeWidth,
      align: 'center',
    });

    if (item.isInWashing) {
      const washX = metaX + badgeWidth + 6;
      doc.roundedRect(washX, currentY, 65, 18, 4).fillAndStroke('#e0f2fe', '#0284c7');
      doc.fillColor('#0369a1').font('Helvetica-Bold').fontSize(8).text('In Lavatrice', washX, currentY + 4, { width: 65, align: 'center' });
    } else if (item.isInIroning) {
      const ironX = metaX + badgeWidth + 6;
      doc.roundedRect(ironX, currentY, 65, 18, 4).fillAndStroke('#fef3c7', '#d97706');
      doc.fillColor('#b45309').font('Helvetica-Bold').fontSize(8).text('Da Stirare', ironX, currentY + 4, { width: 65, align: 'center' });
    }

    currentY += 26;

    // Key properties grid
    const properties: Array<{ label: string; value: string; isColors?: boolean }> = [];
    if (item.isCumulative || (item.quantity && item.quantity > 1)) {
      properties.push({ label: 'Quantita', value: String(item.quantity || 1) });
    }
    if (item.size) properties.push({ label: 'Taglia', value: sanitize(item.size) });
    if (item.brand?.name) properties.push({ label: 'Brand', value: sanitize(item.brand.name) });
    if (item.type?.name) properties.push({ label: 'Categoria', value: sanitize(item.type.name) });
    if (item.fit?.name) properties.push({ label: 'Fit', value: sanitize(item.fit.name) });

    if (item.seasons && item.seasons.length > 0) {
      properties.push({ label: 'Stagioni', value: item.seasons.map((s) => sanitize(s.name)).join(', ') });
    }
    if (item.temperatures && item.temperatures.length > 0) {
      properties.push({ label: 'Temperature', value: item.temperatures.map((t) => sanitize(t.name)).join(', ') });
    }
    if (item.useCases && item.useCases.length > 0) {
      properties.push({ label: 'Occasioni', value: item.useCases.map((u) => sanitize(u.name)).join(', ') });
    }
    if (item.colors && item.colors.length > 0) {
      properties.push({ label: 'Colori', value: item.colors.map((c) => sanitize(c.name)).join(', '), isColors: true });
    }
    if (item.materials && item.materials.length > 0) {
      properties.push({ label: 'Materiali', value: item.materials.map((m) => sanitize(m.name)).join(', ') });
    }
    if (item.tags && item.tags.length > 0) {
      properties.push({ label: 'Tag', value: item.tags.map((t) => '#' + sanitize(t.name)).join(' ') });
    }

    for (const prop of properties) {
      if (currentY > heroY + photoHeight + 10) break;
      doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8.5).text(prop.label, metaX, currentY, { width: 75 });

      if (prop.isColors && item.colors && item.colors.length > 0) {
        let colX = metaX + 80;
        for (const col of item.colors) {
          if (col.hexCode && /^#[0-9A-Fa-f]{6}$/.test(col.hexCode)) {
            doc.circle(colX + 4, currentY + 5, 4).fillAndStroke(col.hexCode, '#cbd5e1');
            colX += 12;
          }
          const colName = sanitize(col.name);
          doc.fillColor('#1e293b').font('Helvetica').fontSize(8.5).text(colName + '  ', colX, currentY);
          colX += doc.widthOfString(colName + '  ');
        }
      } else {
        doc.fillColor('#1e293b').font('Helvetica').fontSize(8.5).text(prop.value, metaX + 80, currentY, {
          width: metaWidth - 85,
          lineBreak: false,
          ellipsis: true,
        });
      }
      currentY += 15;
    }

    // --- Notes Section ---
    let sectionY = Math.max(heroY + photoHeight + 14, currentY + 10);
    if (item.notes) {
      const noteText = sanitize(item.notes);
      doc.font('Helvetica').fontSize(8.5);
      const noteHeight = Math.min(48, Math.max(28, doc.heightOfString(noteText, { width: 505 }) + 14));
      doc.roundedRect(36, sectionY, 523, noteHeight, 5).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fillColor('#0284c7').font('Helvetica-Bold').fontSize(7.5).text('NOTE', 44, sectionY + 4);
      doc.fillColor('#334155').font('Helvetica-Oblique').fontSize(8.5).text(noteText, 44, sectionY + 14, {
        width: 505,
        height: noteHeight - 16,
        ellipsis: true,
      });
      sectionY += noteHeight + 12;
    }

    // --- Care Instructions Grid (4 panels) ---
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('CURA E MANUTENZIONE', 36, sectionY);
    sectionY += 16;

    const careCardWidth = 125;
    const careCardHeight = 110;
    const cardGap = 8;

    // Card 1: Lavaggio
    const washX = 36;
    doc.roundedRect(washX, sectionY, careCardWidth, careCardHeight, 5).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.rect(washX, sectionY, careCardWidth, 18).fill('#e0f2fe');
    doc.fillColor('#0369a1').font('Helvetica-Bold').fontSize(8.5).text('LAVAGGIO', washX, sectionY + 5, { width: careCardWidth, align: 'center' });

    let washDetails = 'Nessuna indicazione';
    if (item.washingInstruction) {
      const wi = item.washingInstruction;
      const lines: string[] = [];
      if (wi.washType === 'do_not_wash') lines.push('Non lavare');
      else if (wi.washType === 'hand_wash_only') lines.push('Solo lavaggio a mano');
      else if (wi.washType === 'washer_ok') lines.push('Lavabile in lavatrice');

      if (wi.temperature) {
        lines.push(wi.temperature === '0' ? 'A freddo' : `${wi.temperature}°C max`);
      }
      if (wi.bleachType === 'no_bleach') lines.push('Non candeggiare');
      else if (wi.bleachType === 'non_chlorine_bleach') lines.push('Solo senza cloro');
      else if (wi.bleachType === 'any_bleach') lines.push('Candeggio consentito');

      if (wi.washSeparately) lines.push('Separatamente');
      if (wi.reverseWashing) lines.push('Al rovescio');
      washDetails = lines.join('\n');
    }
    doc.fillColor('#334155').font('Helvetica').fontSize(7.5).text(washDetails, washX + 8, sectionY + 24, {
      width: careCardWidth - 16,
      lineBreak: true,
    });

    // Card 2: Asciugatura
    const dryX = washX + careCardWidth + cardGap;
    doc.roundedRect(dryX, sectionY, careCardWidth, careCardHeight, 5).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.rect(dryX, sectionY, careCardWidth, 18).fill('#e0f2fe');
    doc.fillColor('#0369a1').font('Helvetica-Bold').fontSize(8.5).text('ASCIUGATURA', dryX, sectionY + 5, { width: careCardWidth, align: 'center' });

    let dryDetails = 'Nessuna indicazione';
    if (item.dryingInstruction) {
      const di = item.dryingInstruction;
      const lines: string[] = [];
      if (di.tumbleDry === false) {
        lines.push('Asciugatrice vietata');
      } else if (di.tumbleDry === true) {
        if (di.tumbleDryTemperature === 'low') lines.push('Asciugatrice bassa temp (*)');
        else if (di.tumbleDryTemperature === 'medium') lines.push('Asciugatrice media temp (**)');
        else if (di.tumbleDryTemperature === 'high') lines.push('Asciugatrice alta temp (***)');
        else lines.push('Asciugatrice consentita');
      }

      if (di.method) {
        const methodMap: Record<string, string> = {
          line_dry: 'Stendere all\'aperto',
          flat_dry: 'Asciugare disteso in piano',
          drip_dry: 'Asciugare gocciolante',
          line_shade: 'All\'ombra appeso',
          flat_shade: 'All\'ombra disteso',
        };
        lines.push(methodMap[di.method] || sanitize(di.method));
      }
      dryDetails = lines.join('\n');
    }
    doc.fillColor('#334155').font('Helvetica').fontSize(7.5).text(dryDetails, dryX + 8, sectionY + 24, {
      width: careCardWidth - 16,
      lineBreak: true,
    });

    // Card 3: Stiratura
    const ironX = dryX + careCardWidth + cardGap;
    doc.roundedRect(ironX, sectionY, careCardWidth, careCardHeight, 5).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.rect(ironX, sectionY, careCardWidth, 18).fill('#e0f2fe');
    doc.fillColor('#0369a1').font('Helvetica-Bold').fontSize(8.5).text('STIRATURA', ironX, sectionY + 5, { width: careCardWidth, align: 'center' });

    let ironDetails = 'Nessuna indicazione';
    if (item.ironingInstruction) {
      const ii = item.ironingInstruction;
      const lines: string[] = [];
      if (ii.ironType === 'no') lines.push('Non stirare');
      else if (ii.ironType === 'without_steam') lines.push('Stirare senza vapore');
      else if (ii.ironType === 'yes') lines.push('Stirabile con vapore');

      const temp = Number(ii.temperature);
      if (temp === 1) lines.push('Bassa temp 110°C (*)');
      else if (temp === 2) lines.push('Media temp 150°C (**)');
      else if (temp === 3) lines.push('Alta temp 200°C (***)');

      if (ii.ironInsideOut) lines.push('Stirare al rovescio');
      ironDetails = lines.join('\n');
    }
    doc.fillColor('#334155').font('Helvetica').fontSize(7.5).text(ironDetails, ironX + 8, sectionY + 24, {
      width: careCardWidth - 16,
      lineBreak: true,
    });

    // Card 4: Dettagli Acquisto
    const buyX = ironX + careCardWidth + cardGap;
    doc.roundedRect(buyX, sectionY, careCardWidth, careCardHeight, 5).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.rect(buyX, sectionY, careCardWidth, 18).fill('#f1f5f9');
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8.5).text('ACQUISTO', buyX, sectionY + 5, { width: careCardWidth, align: 'center' });

    let buyDetails = 'Non specificato';
    if (item.buyDetail) {
      const bd = item.buyDetail;
      const lines: string[] = [];
      if (bd.store) lines.push(`Negozio: ${sanitize(bd.store)}`);
      if (bd.purchaseDate) lines.push(`Data: ${sanitize(bd.purchaseDate)}`);
      if (bd.priceCents != null) {
        lines.push(`Prezzo: ${(bd.priceCents / 100).toFixed(2)} EUR`);
      }
      if (bd.shopUrl) lines.push('Link store disponibile');
      buyDetails = lines.join('\n') || 'Non specificato';
    }
    doc.fillColor('#334155').font('Helvetica').fontSize(7.5).text(buyDetails, buyX + 8, sectionY + 24, {
      width: careCardWidth - 16,
      lineBreak: true,
    });

    sectionY += careCardHeight + 14;

    // --- Secondary Photos Strip (if any) ---
    if (secondaryPhotoBuffers.length > 0 && sectionY < 720) {
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text('GALLERIA FOTOGRAFICA', 36, sectionY);
      sectionY += 14;

      const thumbSize = 65;
      let thumbX = 36;
      for (const thumbBuf of secondaryPhotoBuffers) {
        doc.roundedRect(thumbX, sectionY, thumbSize, thumbSize, 4).fillAndStroke('#f8fafc', '#cbd5e1');
        doc.image(thumbBuf, thumbX + 1, sectionY + 1, {
          fit: [thumbSize - 2, thumbSize - 2],
          align: 'center',
          valign: 'center',
        });
        thumbX += thumbSize + 10;
      }
    }

    // --- Footer ---
    doc.moveTo(36, 792).lineTo(559, 792).strokeColor('#e2e8f0').lineWidth(0.8).stroke();
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8).text('Dressly — Guardaroba Digitale Personale', 36, 800);
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8).text('Pagina 1 / 1', 460, 800, { width: 99, align: 'right' });

    doc.end();

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const slug = (item.name || item.code || 'capo')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30);
    const filename = `capo-${item.code ? item.code + '-' : ''}${slug}.pdf`;

    return { buffer, filename };
  }
}