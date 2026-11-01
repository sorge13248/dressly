import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { AuthUser } from '../common/auth/auth.types';
import { Clothes } from '../entities/clothes.entity';
import { Outfit } from '../entities/outfit.entity';
import { Attachment } from '../entities/attachment.entity';
import { Season } from '../entities/season.entity';
import { Temperature } from '../entities/temperature.entity';
import { UseCase } from '../entities/use-case.entity';
import { WashingItem } from '../entities/washing-item.entity';
import { IroningItem } from '../entities/ironing-item.entity';
import { SyncTombstone } from '../entities/sync-tombstone.entity';
import { ReferenceDataService } from './reference-data.service';

function isDefaultAttachmentName(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith('image.') ||
    normalized.startsWith('image_') ||
    normalized.startsWith('photo.') ||
    normalized.startsWith('photo_') ||
    normalized.startsWith('upload.') ||
    normalized.startsWith('blob.')
  );
}

@Injectable()
export class OutfitsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly referenceDataService: ReferenceDataService,
  ) {}

  private getUploadsRootDir(): string {
    const configured = process.env.UPLOADS_DIR;
    if (configured && configured.trim().length > 0) {
      return path.resolve(configured);
    }
    return path.resolve(__dirname, '../../uploads');
  }

  private resolveAttachmentAbsolutePath(relativePath: string): string {
    return path.resolve(this.getUploadsRootDir(), relativePath);
  }

  private async createPreview(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .rotate()
      .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  }

  private normalizeAttachmentOriginalName(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    if (!normalized || isDefaultAttachmentName(normalized)) {
      return null;
    }
    return normalized;
  }

  private async nextAttachmentSortOrder(outfitId: string, userId: string): Promise<number> {
    const row = await this.dataSource
      .getRepository(Attachment)
      .createQueryBuilder('attachment')
      .select('MAX(attachment.sortOrder)', 'maxSortOrder')
      .where('attachment.outfitId = :outfitId', { outfitId })
      .andWhere('attachment.userId = :userId', { userId })
      .getRawOne<{ maxSortOrder: number | string | null }>();

    const maxSortOrder = row?.maxSortOrder;
    if (maxSortOrder === null || maxSortOrder === undefined) {
      return 0;
    }
    const parsed = Number(maxSortOrder);
    return Number.isFinite(parsed) ? parsed + 1 : 0;
  }

  async list(user: AuthUser) {
    const repository = this.dataSource.getRepository(Outfit);
    const outfits = await repository.find({
      where: { userId: user.id },
      order: { updatedAt: 'DESC' },
      relations: {
        seasons: true,
        temperatures: true,
        useCases: true,
        attachments: true,
        clothes: {
          brand: true,
          type: true,
          colors: true,
          attachments: true,
        },
      },
    });

    for (const outfit of outfits) {
      if (outfit.attachments) {
        outfit.attachments.sort(
          (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }
      if (outfit.clothes) {
        for (const item of outfit.clothes) {
          if (item.attachments) {
            item.attachments.sort(
              (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
            );
          }
        }
      }
    }

    return outfits.map((o) => ({
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
      clothes: (o.clothes ?? []).map((c) => {
        const primaryAttachment =
          (c.attachments ?? []).find((a) => a.mimeType?.startsWith('image/')) ??
          c.attachments?.[0] ??
          null;

        return {
          id: c.id,
          name: c.name,
          fullTitle: c.fullTitle,
          brand: c.brand,
          type: c.type,
          colors: c.colors,
          attachments: c.attachments,
          primaryAttachment,
        };
      }),
    }));
  }

  async getOne(user: AuthUser, id: string) {
    const repository = this.dataSource.getRepository(Outfit);
    const outfit = await repository.findOne({
      where: { id, userId: user.id },
      relations: {
        seasons: true,
        temperatures: true,
        useCases: true,
        attachments: true,
        clothes: {
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
      },
    });

    if (!outfit) {
      throw new NotFoundException('Abbinamento non trovato');
    }

    if (outfit.attachments) {
      outfit.attachments.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
      );
    }

    const itemIds = (outfit.clothes ?? []).map((c) => c.id);
    const washingIds =
      itemIds.length > 0
        ? new Set(
            (
              await this.dataSource.getRepository(WashingItem).find({
                where: { userId: user.id, clothesId: In(itemIds) },
                select: { clothesId: true },
              })
            ).map((w) => w.clothesId),
          )
        : new Set<string>();

    const ironingIds =
      itemIds.length > 0
        ? new Set(
            (
              await this.dataSource.getRepository(IroningItem).find({
                where: { userId: user.id, clothesId: In(itemIds) },
                select: { clothesId: true },
              })
            ).map((i) => i.clothesId),
          )
        : new Set<string>();

    for (const item of outfit.clothes ?? []) {
      if (item.attachments) {
        item.attachments.sort(
          (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }
    }

    return {
      id: outfit.id,
      name: outfit.name,
      description: outfit.description ?? null,
      canvasLayout: outfit.canvasLayout ?? null,
      seasons: outfit.seasons ?? [],
      temperatures: outfit.temperatures ?? [],
      useCases: outfit.useCases ?? [],
      attachments: outfit.attachments ?? [],
      createdAt: outfit.createdAt,
      updatedAt: outfit.updatedAt,
      clothesCount: outfit.clothes?.length ?? 0,
      clothes: (outfit.clothes ?? []).map((c) => {
        const primaryAttachment =
          (c.attachments ?? []).find((a) => a.mimeType?.startsWith('image/')) ??
          c.attachments?.[0] ??
          null;

        return {
          ...c,
          fullTitle: c.fullTitle,
          primaryAttachment,
          isInWashing: washingIds.has(c.id),
          isInIroning: ironingIds.has(c.id),
        };
      }),
    };
  }

  async create(
    user: AuthUser,
    body: {
      name: string;
      description?: string | null;
      clothesIds?: string[];
      season_ids?: string[];
      temperature_ids?: string[];
      use_case_ids?: string[];
      canvasLayout?: Record<string, any> | null;
    },
  ) {
    const name = String(body.name || '').trim();
    if (!name) {
      throw new BadRequestException('Il nome dell\'abbinamento è obbligatorio');
    }

    let clothes: Clothes[] = [];
    const clothesIds = Array.isArray(body.clothesIds)
      ? body.clothesIds.map(String).filter(Boolean)
      : [];

    if (clothesIds.length > 0) {
      clothes = await this.dataSource.getRepository(Clothes).find({
        where: { id: In(clothesIds), userId: user.id },
      });
    }

    const seasons = body.season_ids
      ? await this.referenceDataService.resolveOwnedReferences<Season>('seasons', user.id, body.season_ids)
      : [];

    const temperatures = body.temperature_ids
      ? await this.referenceDataService.resolveOwnedReferences<Temperature>('temperatures', user.id, body.temperature_ids)
      : [];

    const useCases = body.use_case_ids
      ? await this.referenceDataService.resolveOwnedReferences<UseCase>('use-cases', user.id, body.use_case_ids)
      : [];

    const outfit = this.dataSource.getRepository(Outfit).create({
      userId: user.id,
      name,
      description: body.description?.trim() || null,
      canvasLayout: body.canvasLayout || null,
      clothes,
      seasons,
      temperatures,
      useCases,
    });

    const saved = await this.dataSource.getRepository(Outfit).save(outfit);
    return this.getOne(user, saved.id);
  }

  async update(
    user: AuthUser,
    id: string,
    body: {
      name?: string;
      description?: string | null;
      clothesIds?: string[];
      season_ids?: string[];
      temperature_ids?: string[];
      use_case_ids?: string[];
      canvasLayout?: Record<string, any> | null;
    },
  ) {
    const repository = this.dataSource.getRepository(Outfit);
    const outfit = await repository.findOne({
      where: { id, userId: user.id },
      relations: {
        clothes: true,
        seasons: true,
        temperatures: true,
        useCases: true,
      },
    });
    if (!outfit) {
      throw new NotFoundException('Abbinamento non trovato');
    }

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        throw new BadRequestException('Il nome dell\'abbinamento non può essere vuoto');
      }
      outfit.name = name;
    }

    if (body.description !== undefined) {
      outfit.description = body.description ? body.description.trim() : null;
    }

    if (body.canvasLayout !== undefined) {
      outfit.canvasLayout = body.canvasLayout;
    }

    if (Array.isArray(body.clothesIds)) {
      const clothesIds = body.clothesIds.map(String).filter(Boolean);
      outfit.clothes =
        clothesIds.length > 0
          ? await this.dataSource.getRepository(Clothes).find({
              where: { id: In(clothesIds), userId: user.id },
            })
          : [];
    }

    if (Array.isArray(body.season_ids)) {
      outfit.seasons = await this.referenceDataService.resolveOwnedReferences<Season>(
        'seasons',
        user.id,
        body.season_ids,
      );
    }

    if (Array.isArray(body.temperature_ids)) {
      outfit.temperatures = await this.referenceDataService.resolveOwnedReferences<Temperature>(
        'temperatures',
        user.id,
        body.temperature_ids,
      );
    }

    if (Array.isArray(body.use_case_ids)) {
      outfit.useCases = await this.referenceDataService.resolveOwnedReferences<UseCase>(
        'use-cases',
        user.id,
        body.use_case_ids,
      );
    }

    outfit.updatedAt = new Date();
    await repository.save(outfit);
    return this.getOne(user, outfit.id);
  }

  async addClothes(user: AuthUser, id: string, clothesIds: string[]) {
    const repository = this.dataSource.getRepository(Outfit);
    const outfit = await repository.findOne({
      where: { id, userId: user.id },
      relations: { clothes: true },
    });
    if (!outfit) {
      throw new NotFoundException('Abbinamento non trovato');
    }

    const currentIds = new Set((outfit.clothes ?? []).map((c) => c.id));
    const newIds = clothesIds.filter((cid) => !currentIds.has(cid));

    if (newIds.length > 0) {
      const clothesToAdd = await this.dataSource.getRepository(Clothes).find({
        where: { id: In(newIds), userId: user.id },
      });
      outfit.clothes = [...(outfit.clothes ?? []), ...clothesToAdd];
      outfit.updatedAt = new Date();
      await repository.save(outfit);
    }

    return this.getOne(user, outfit.id);
  }

  async removeClothes(user: AuthUser, id: string, clothesId: string) {
    const repository = this.dataSource.getRepository(Outfit);
    const outfit = await repository.findOne({
      where: { id, userId: user.id },
      relations: { clothes: true },
    });
    if (!outfit) {
      throw new NotFoundException('Abbinamento non trovato');
    }

    outfit.clothes = (outfit.clothes ?? []).filter((c) => c.id !== clothesId);
    outfit.updatedAt = new Date();
    await repository.save(outfit);
    return this.getOne(user, outfit.id);
  }

  async remove(user: AuthUser, id: string) {
    const repository = this.dataSource.getRepository(Outfit);
    const outfit = await repository.findOne({
      where: { id, userId: user.id },
      relations: { attachments: true },
    });
    if (!outfit) {
      throw new NotFoundException('Abbinamento non trovato');
    }

    // Remove attachment files from disk
    if (outfit.attachments) {
      for (const attachment of outfit.attachments) {
        const absolutePath = this.resolveAttachmentAbsolutePath(attachment.path);
        try {
          await fs.unlink(absolutePath);
        } catch {}
        if (attachment.previewPath) {
          const previewPath = this.resolveAttachmentAbsolutePath(attachment.previewPath);
          try {
            await fs.unlink(previewPath);
          } catch {}
        }
      }
    }

    await repository.remove(outfit);
    await this.dataSource.getRepository(SyncTombstone).save({
      userId: user.id,
      entityType: 'outfit',
      entityId: id,
      deletedAt: new Date(),
    });
    return { deleted: true };
  }

  // --- Attachment methods for Outfits ---

  async addAttachment(
    user: AuthUser,
    outfitId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
    body: Record<string, unknown>,
  ) {
    if (!file) throw new BadRequestException('file is required');
    const outfit = await this.getOne(user, outfitId);
    const uploadsDir = path.join(this.getUploadsRootDir(), 'outfits', user.id, outfit.id);
    await fs.mkdir(uploadsDir, { recursive: true });
    const id = randomUUID();
    const extension = path.extname(file.originalname);
    const fileName = `${id}${extension}`;
    const absoluteFilePath = path.join(uploadsDir, fileName);
    const relativeFilePath = path.posix.join('outfits', user.id, outfit.id, fileName);
    await fs.writeFile(absoluteFilePath, file.buffer);

    let previewPath: string | null = null;
    if (file.mimetype.startsWith('image/')) {
      const previewFileName = `${id}.preview.webp`;
      const absolutePreviewPath = path.join(uploadsDir, previewFileName);
      const previewBuffer = await this.createPreview(file.buffer);
      await fs.writeFile(absolutePreviewPath, previewBuffer);
      previewPath = path.posix.join('outfits', user.id, outfit.id, previewFileName);
    }

    const parsedSortOrder = Number(body.sortOrder);
    const hasValidSortOrder = Number.isFinite(parsedSortOrder) && parsedSortOrder >= 0;
    const sortOrder = hasValidSortOrder
      ? Math.floor(parsedSortOrder)
      : await this.nextAttachmentSortOrder(outfit.id, user.id);

    const attachment = this.dataSource.getRepository(Attachment).create({
      id,
      userId: user.id,
      outfitId: outfit.id,
      clothesId: null,
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

    // Update outfit updatedAt
    await this.dataSource
      .getRepository(Outfit)
      .update(outfit.id, { updatedAt: new Date() });

    return saved;
  }

  async removeAttachment(user: AuthUser, outfitId: string, attachmentId: string) {
    const repository = this.dataSource.getRepository(Attachment);
    const attachment = await repository.findOne({
      where: { id: attachmentId, outfitId, userId: user.id } as never,
    });
    if (!attachment) throw new NotFoundException();

    const absolutePath = this.resolveAttachmentAbsolutePath(attachment.path);
    try {
      await fs.unlink(absolutePath);
    } catch {}
    if (attachment.previewPath) {
      const previewPath = this.resolveAttachmentAbsolutePath(attachment.previewPath);
      try {
        await fs.unlink(previewPath);
      } catch {}
    }

    await repository.remove(attachment);

    await this.dataSource
      .getRepository(Outfit)
      .update(outfitId, { updatedAt: new Date() });

    return { deleted: true };
  }

  async getAttachmentFile(
    user: AuthUser,
    outfitId: string,
    attachmentId: string,
    variant?: string,
  ) {
    const repository = this.dataSource.getRepository(Attachment);
    const attachment = await repository.findOne({
      where: { id: attachmentId, outfitId, userId: user.id } as never,
    });
    if (!attachment) throw new NotFoundException();

    let targetPath = attachment.path;
    let mimeType = attachment.mimeType;

    if (variant === 'preview' && attachment.previewPath) {
      targetPath = attachment.previewPath;
      mimeType = 'image/webp';
    }

    const absolutePath = this.resolveAttachmentAbsolutePath(targetPath);
    try {
      const content = await fs.readFile(absolutePath);
      return {
        content,
        fileName: attachment.originalName ?? attachment.fileName,
        mimeType,
      };
    } catch {
      throw new NotFoundException('File non trovato');
    }
  }

  async reorderAttachments(user: AuthUser, outfitId: string, attachmentIds: unknown) {
    if (!Array.isArray(attachmentIds)) {
      throw new BadRequestException('attachment_ids must be an array');
    }

    const ids = attachmentIds.map(String).filter(Boolean);
    const repository = this.dataSource.getRepository(Attachment);
    const attachments = await repository.find({
      where: { outfitId, userId: user.id } as never,
    });

    const attachmentMap = new Map(attachments.map((att) => [att.id, att]));
    const updates: Promise<unknown>[] = [];

    ids.forEach((id, index) => {
      const item = attachmentMap.get(id);
      if (item && item.sortOrder !== index) {
        item.sortOrder = index;
        updates.push(repository.save(item));
      }
    });

    await Promise.all(updates);

    await this.dataSource
      .getRepository(Outfit)
      .update(outfitId, { updatedAt: new Date() });

    return this.getOne(user, outfitId);
  }
}
