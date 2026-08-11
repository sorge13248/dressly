import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuthUser } from '../common/auth/auth.types';
import { Attachment } from '../entities/attachment.entity';
import { Brand } from '../entities/brand.entity';
import { Clothes } from '../entities/clothes.entity';
import { Color } from '../entities/color.entity';
import { DryingInstruction } from '../entities/drying-instruction.entity';
import { Fit } from '../entities/fit.entity';
import { IroningInstruction } from '../entities/ironing-instruction.entity';
import { Material } from '../entities/material.entity';
import { Season } from '../entities/season.entity';
import { Tag } from '../entities/tag.entity';
import { Temperature } from '../entities/temperature.entity';
import { Type } from '../entities/type.entity';
import { UseCase } from '../entities/use-case.entity';
import { WashingInstruction } from '../entities/washing-instruction.entity';
import { BuyDetail } from '../entities/buy-detail.entity';
import { ReferenceDataService } from './reference-data.service';

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

@Injectable()
export class ClothesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly referenceDataService: ReferenceDataService,
  ) {}

  async list(user: AuthUser, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(query.per_page ?? 20)));

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
    if (query.search) qb.andWhere('(clothes.name LIKE :search OR brand.name LIKE :search)', { search: `%${query.search}%` });

    const [items, total] = await qb.orderBy('clothes.createdAt', 'DESC').skip((page - 1) * perPage).take(perPage).getManyAndCount();
    for (const item of items) {
      this.sortAttachments(item);
    }
    return { items: items.map((item) => this.decorateResponse(item)), total, page, perPage };
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
    return this.decorateResponse(item);
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

  async remove(user: AuthUser, id: string) {
    const repository = this.dataSource.getRepository(Clothes);
    const item = await repository.findOne({ where: { id, userId: user.id } as never });
    if (!item) throw new NotFoundException();
    await repository.remove(item);
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

    const absolutePath = this.resolveAttachmentAbsolutePath(attachment.path);
    try {
      await fs.unlink(absolutePath);
    } catch {
      // Keep delete idempotent even if file is already missing.
    }

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

  async getAttachmentFile(user: AuthUser, clothesId: string, attachmentId: string) {
    const attachment = await this.dataSource.getRepository(Attachment).findOne({
      where: { id: attachmentId, clothesId, userId: user.id } as never,
    });

    if (!attachment) {
      throw new NotFoundException();
    }

    try {
      const content = await fs.readFile(this.resolveAttachmentAbsolutePath(attachment.path));
      return {
        content,
        mimeType: attachment.mimeType || 'application/octet-stream',
        fileName: attachment.originalName || attachment.fileName,
      };
    } catch {
      throw new NotFoundException();
    }
  }

  private async mapPayload(user: AuthUser, body: Record<string, unknown>, existing?: Clothes) {
    const repository = this.dataSource.getRepository(Clothes);
    const clothes = existing ?? repository.create({ userId: user.id });

    if (body.name !== undefined) clothes.name = body.name === null ? null : String(body.name).trim();
    if (body.size !== undefined) {
      clothes.size = body.size === null || String(body.size).trim() === '' ? null : String(body.size).trim();
    }
    if (body.notes !== undefined) clothes.notes = body.notes === null ? null : String(body.notes).trim();
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
        throw new BadRequestException('Temperatura lavaggio obbligatoria (20-60)');
      }

      if (washType === 'washer_ok' && washingTemperature !== null && (washingTemperature < 20 || washingTemperature > 60)) {
        throw new BadRequestException('Temperatura lavaggio obbligatoria (20-60)');
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