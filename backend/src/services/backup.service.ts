import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import AdmZip from 'adm-zip';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataSource, In, IsNull, Not } from 'typeorm';
import { AuthUser } from '../common/auth/auth.types';
import { generateUniqueTagCode } from '../common/utils/tag-code.util';
import { Attachment } from '../entities/attachment.entity';
import { Brand } from '../entities/brand.entity';
import { BuyDetail } from '../entities/buy-detail.entity';
import { Clothes } from '../entities/clothes.entity';
import { Color } from '../entities/color.entity';
import { DryingInstruction } from '../entities/drying-instruction.entity';
import { Fit } from '../entities/fit.entity';
import { IroningInstruction } from '../entities/ironing-instruction.entity';
import { IroningItem } from '../entities/ironing-item.entity';
import { Location } from '../entities/location.entity';
import { Material } from '../entities/material.entity';
import { Outfit } from '../entities/outfit.entity';
import { Room } from '../entities/room.entity';
import { Season } from '../entities/season.entity';
import { SyncTombstone } from '../entities/sync-tombstone.entity';
import { Tag } from '../entities/tag.entity';
import { Temperature } from '../entities/temperature.entity';
import { Type } from '../entities/type.entity';
import { UseCase } from '../entities/use-case.entity';
import { WashingInstruction } from '../entities/washing-instruction.entity';
import { WashingItem } from '../entities/washing-item.entity';

export interface BackupStatsDto {
  clothesCount: number;
  outfitsCount: number;
  referenceDataCount: number;
  attachmentsCount: number;
  totalFileSizeBytes: number;
}

export interface RestoreResultDto {
  success: boolean;
  mode: 'replace' | 'merge';
  stats: {
    clothesCount: number;
    outfitsCount: number;
    referenceDataCount: number;
    filesCount: number;
  };
}

interface BackupManifest {
  version: string;
  format: 'dressly-backup-v1';
  exportedAt: string;
  appVersion: string;
  userId: string;
  stats: BackupStatsDto;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private getUploadsRootDir(): string {
    const configuredRoot = process.env.UPLOADS_DIR?.trim();
    if (configuredRoot) {
      return path.resolve(configuredRoot);
    }
    return path.resolve(process.cwd(), 'uploads');
  }

  private resolveAttachmentAbsolutePath(storedPath: string): string {
    if (path.isAbsolute(storedPath)) {
      return storedPath;
    }
    const uploadsRootDir = this.getUploadsRootDir();
    let normalized = storedPath.replace(/\\/g, '/');
    if (normalized.startsWith('uploads/')) {
      normalized = normalized.slice('uploads/'.length);
    }
    return path.join(uploadsRootDir, normalized);
  }

  async getBackupStats(user: AuthUser): Promise<BackupStatsDto> {
    const clothesCount = await this.dataSource.getRepository(Clothes).count({ where: { userId: user.id } });
    const outfitsCount = await this.dataSource.getRepository(Outfit).count({ where: { userId: user.id } });

    const refRepos = [
      this.dataSource.getRepository(Brand),
      this.dataSource.getRepository(Color),
      this.dataSource.getRepository(Fit),
      this.dataSource.getRepository(Material),
      this.dataSource.getRepository(Season),
      this.dataSource.getRepository(Tag),
      this.dataSource.getRepository(Temperature),
      this.dataSource.getRepository(Type),
      this.dataSource.getRepository(UseCase),
      this.dataSource.getRepository(Room),
      this.dataSource.getRepository(Location),
    ];

    let referenceDataCount = 0;
    for (const repo of refRepos) {
      referenceDataCount += await repo.count({ where: { userId: user.id } });
    }

    const attachments = await this.dataSource.getRepository(Attachment).find({
      where: { userId: user.id },
      select: { id: true, path: true, previewPath: true, size: true },
    });

    let totalFileSizeBytes = 0;
    for (const att of attachments) {
      totalFileSizeBytes += att.size || 0;
    }

    return {
      clothesCount,
      outfitsCount,
      referenceDataCount,
      attachmentsCount: attachments.length,
      totalFileSizeBytes,
    };
  }

  async exportBackup(user: AuthUser): Promise<{ buffer: Buffer; filename: string }> {
    this.logger.log(`Starting full backup export for user ${user.id}...`);

    // 1. Fetch Reference Data
    const brands = await this.dataSource.getRepository(Brand).find({ where: { userId: user.id } });
    const colors = await this.dataSource.getRepository(Color).find({ where: { userId: user.id } });
    const fits = await this.dataSource.getRepository(Fit).find({ where: { userId: user.id } });
    const materials = await this.dataSource.getRepository(Material).find({ where: { userId: user.id } });
    const seasons = await this.dataSource.getRepository(Season).find({ where: { userId: user.id } });
    const tags = await this.dataSource.getRepository(Tag).find({ where: { userId: user.id } });
    const temperatures = await this.dataSource.getRepository(Temperature).find({ where: { userId: user.id } });
    const types = await this.dataSource.getRepository(Type).find({ where: { userId: user.id } });
    const useCases = await this.dataSource.getRepository(UseCase).find({ where: { userId: user.id } });
    const rooms = await this.dataSource.getRepository(Room).find({ where: { userId: user.id } });
    const locations = await this.dataSource.getRepository(Location).find({ where: { userId: user.id } });

    const referenceData = {
      brands,
      colors,
      fits,
      materials,
      seasons,
      tags,
      temperatures,
      types,
      useCases,
      rooms,
      locations,
    };

    // 2. Fetch Clothes with all relations and instructions
    const clothes = await this.dataSource.getRepository(Clothes).find({
      where: { userId: user.id },
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
        location: { room: true },
      },
    });

    const serializedClothes = clothes.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      quantity: c.quantity,
      isCumulative: c.isCumulative,
      size: c.size,
      status: c.status,
      notes: c.notes,
      brandId: c.brandId,
      typeId: c.typeId,
      fitId: c.fitId,
      locationId: c.locationId,
      colorIds: (c.colors ?? []).map((x) => x.id),
      materialIds: (c.materials ?? []).map((x) => x.id),
      seasonIds: (c.seasons ?? []).map((x) => x.id),
      temperatureIds: (c.temperatures ?? []).map((x) => x.id),
      useCaseIds: (c.useCases ?? []).map((x) => x.id),
      tagIds: (c.tags ?? []).map((x) => x.id),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      washingInstruction: c.washingInstruction
        ? {
            temperature: c.washingInstruction.temperature,
            washType: c.washingInstruction.washType,
            bleachType: c.washingInstruction.bleachType,
            stretch: c.washingInstruction.stretch,
            reverseWashing: c.washingInstruction.reverseWashing,
            closedZips: c.washingInstruction.closedZips,
            similarColors: c.washingInstruction.similarColors,
            washSeparately: c.washingInstruction.washSeparately,
            colorLossTestTemperature: c.washingInstruction.colorLossTestTemperature,
            useColorCatcher: c.washingInstruction.useColorCatcher,
            colorLossRisk: c.washingInstruction.colorLossRisk,
          }
        : null,
      dryingInstruction: c.dryingInstruction
        ? {
            tumbleDry: c.dryingInstruction.tumbleDry,
            tumbleDryTemperature: c.dryingInstruction.tumbleDryTemperature,
            method: c.dryingInstruction.method,
          }
        : null,
      ironingInstruction: c.ironingInstruction
        ? {
            ironType: c.ironingInstruction.ironType,
            ironInsideOut: c.ironingInstruction.ironInsideOut,
            temperature: c.ironingInstruction.temperature,
          }
        : null,
      buyDetail: c.buyDetail
        ? {
            store: c.buyDetail.store,
            purchaseDate: c.buyDetail.purchaseDate,
            shopUrl: c.buyDetail.shopUrl,
            priceCents: c.buyDetail.priceCents,
            receiptAttachmentId: c.buyDetail.receiptAttachmentId,
          }
        : null,
      attachments: (c.attachments ?? []).map((a) => ({
        id: a.id,
        kind: a.kind,
        fileName: a.fileName,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size: a.size,
        sortOrder: a.sortOrder,
        path: a.path,
        previewPath: a.previewPath,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    }));

    // 3. Fetch Outfits
    const outfits = await this.dataSource.getRepository(Outfit).find({
      where: { userId: user.id },
      relations: {
        clothes: true,
        seasons: true,
        temperatures: true,
        useCases: true,
        attachments: true,
      },
    });

    const serializedOutfits = outfits.map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description,
      canvasLayout: o.canvasLayout,
      clothesIds: (o.clothes ?? []).map((c) => c.id),
      seasonIds: (o.seasons ?? []).map((s) => s.id),
      temperatureIds: (o.temperatures ?? []).map((t) => t.id),
      useCaseIds: (o.useCases ?? []).map((u) => u.id),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      attachments: (o.attachments ?? []).map((a) => ({
        id: a.id,
        kind: a.kind,
        fileName: a.fileName,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size: a.size,
        sortOrder: a.sortOrder,
        path: a.path,
        previewPath: a.previewPath,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    }));

    // 4. Fetch Laundry Queues
    const washingItems = await this.dataSource.getRepository(WashingItem).find({ where: { userId: user.id } });
    const ironingItems = await this.dataSource.getRepository(IroningItem).find({ where: { userId: user.id } });

    const serializedLaundry = {
      washingItems: washingItems.map((w) => ({ clothesId: w.clothesId, quantity: w.quantity, addedAt: w.addedAt })),
      ironingItems: ironingItems.map((i) => ({ clothesId: i.clothesId, quantity: i.quantity, addedAt: i.addedAt })),
    };

    // 5. Gather Physical Files
    const allAttachments: Attachment[] = [];
    for (const c of clothes) {
      if (c.attachments) allAttachments.push(...c.attachments);
    }
    for (const o of outfits) {
      if (o.attachments) allAttachments.push(...o.attachments);
    }

    const zip = new AdmZip();

    let filesCount = 0;
    let totalFileSizeBytes = 0;

    for (const att of allAttachments) {
      // Add primary file
      if (att.path) {
        try {
          const absPath = this.resolveAttachmentAbsolutePath(att.path);
          const fileBuf = await fs.readFile(absPath);
          const zipEntryPath = att.clothesId
            ? `files/clothes/${att.clothesId}/${att.fileName}`
            : `files/outfits/${att.outfitId}/${att.fileName}`;
          zip.addFile(zipEntryPath, fileBuf);
          filesCount++;
          totalFileSizeBytes += fileBuf.length;
        } catch {
          this.logger.warn(`Could not read attachment file ${att.path} for backup`);
        }
      }
    }

    const stats: BackupStatsDto = {
      clothesCount: clothes.length,
      outfitsCount: outfits.length,
      referenceDataCount:
        brands.length +
        colors.length +
        fits.length +
        materials.length +
        seasons.length +
        tags.length +
        temperatures.length +
        types.length +
        useCases.length +
        rooms.length +
        locations.length,
      attachmentsCount: allAttachments.length,
      totalFileSizeBytes,
    };

    const manifest: BackupManifest = {
      version: '1.0',
      format: 'dressly-backup-v1',
      exportedAt: new Date().toISOString(),
      appVersion: '1.6.0',
      userId: user.id,
      stats,
    };

    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    zip.addFile('data/reference-data.json', Buffer.from(JSON.stringify(referenceData, null, 2), 'utf8'));
    zip.addFile('data/clothes.json', Buffer.from(JSON.stringify(serializedClothes, null, 2), 'utf8'));
    zip.addFile('data/outfits.json', Buffer.from(JSON.stringify(serializedOutfits, null, 2), 'utf8'));
    zip.addFile('data/laundry.json', Buffer.from(JSON.stringify(serializedLaundry, null, 2), 'utf8'));

    const buffer = zip.toBuffer();
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `dressly-backup-${dateStr}.zip`;

    this.logger.log(`Backup export complete: ${buffer.length} bytes, ${filesCount} files.`);
    return { buffer, filename };
  }

  async restoreBackup(user: AuthUser, zipSource: Buffer | string, mode: 'replace' | 'merge'): Promise<RestoreResultDto> {
    this.logger.log(`Starting backup restore for user ${user.id} in mode: ${mode}`);

    let zip: AdmZip;
    try {
      zip = new AdmZip(zipSource);
    } catch (err) {
      throw new BadRequestException(`Archivio ZIP non valido o corrotto: ${String(err)}`);
    }

    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) {
      throw new BadRequestException('Archivio non valido: file manifest.json assente');
    }

    let manifest: BackupManifest;
    try {
      manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
    } catch {
      throw new BadRequestException('manifest.json non valido o corrotto');
    }

    if (manifest.format !== 'dressly-backup-v1') {
      throw new BadRequestException(`Formato backup non supportato: ${String(manifest.format)}`);
    }

    // Read JSON files
    const refDataEntry = zip.getEntry('data/reference-data.json');
    const clothesEntry = zip.getEntry('data/clothes.json');
    const outfitsEntry = zip.getEntry('data/outfits.json');
    const laundryEntry = zip.getEntry('data/laundry.json');

    if (!refDataEntry || !clothesEntry) {
      throw new BadRequestException('Archivio non valido: dati capi o catalogo mancanti');
    }

    const refData = JSON.parse(refDataEntry.getData().toString('utf8'));
    const clothesData: any[] = JSON.parse(clothesEntry.getData().toString('utf8'));
    const outfitsData: any[] = outfitsEntry ? JSON.parse(outfitsEntry.getData().toString('utf8')) : [];
    const laundryData: any = laundryEntry ? JSON.parse(laundryEntry.getData().toString('utf8')) : { washingItems: [], ironingItems: [] };

    const uploadsRootDir = this.getUploadsRootDir();
    let restoredFilesCount = 0;

    await this.dataSource.transaction(async (manager) => {
      if (mode === 'replace') {
        this.logger.log(`[Replace Mode] Purging existing data for user ${user.id}...`);

        // 1. Delete laundry queues
        await manager.delete(WashingItem, { userId: user.id });
        await manager.delete(IroningItem, { userId: user.id });

        // 2. Delete outfits & outfit attachments
        await manager.delete(Attachment, { userId: user.id, outfitId: Not(IsNull()) });
        await manager.delete(Outfit, { userId: user.id });

        // 3. Delete clothes & clothes attachments & child entities
        await manager.delete(Attachment, { userId: user.id, clothesId: Not(IsNull()) });
        await manager.delete(WashingInstruction, { userId: user.id });
        await manager.delete(IroningInstruction, { userId: user.id });
        await manager.delete(DryingInstruction, { userId: user.id });
        await manager.delete(BuyDetail, { userId: user.id });
        await manager.delete(Clothes, { userId: user.id });

        // 4. Delete locations & rooms
        await manager.delete(Location, { userId: user.id });
        await manager.delete(Room, { userId: user.id });

        // 5. Delete reference catalogs
        await manager.delete(Brand, { userId: user.id });
        await manager.delete(Color, { userId: user.id });
        await manager.delete(Fit, { userId: user.id });
        await manager.delete(Material, { userId: user.id });
        await manager.delete(Season, { userId: user.id });
        await manager.delete(Tag, { userId: user.id });
        await manager.delete(Temperature, { userId: user.id });
        await manager.delete(Type, { userId: user.id });
        await manager.delete(UseCase, { userId: user.id });

        // 6. Delete user upload folders
        const userClothesDir = path.join(uploadsRootDir, 'clothes', user.id);
        const userOutfitsDir = path.join(uploadsRootDir, 'outfits', user.id);
        await fs.rm(userClothesDir, { recursive: true, force: true }).catch(() => {});
        await fs.rm(userOutfitsDir, { recursive: true, force: true }).catch(() => {});

        // 7. Re-insert Reference Data
        const refIdMap = new Map<string, string>();

        const restoreRefList = async (entityClass: any, items: any[], extraFields?: (it: any) => Record<string, unknown>) => {
          for (const item of items ?? []) {
            const collision = await manager.findOne(entityClass, { where: { id: item.id } });
            const finalId = collision ? randomUUID() : item.id;
            refIdMap.set(item.id, finalId);
            const extra = extraFields ? extraFields(item) : {};
            await manager.save(entityClass, {
              id: finalId,
              userId: user.id,
              name: item.name,
              sortOrder: item.sortOrder ?? 0,
              ...extra,
            });
          }
        };

        await restoreRefList(Brand, refData.brands);
        await restoreRefList(Color, refData.colors, (it) => ({ hexCode: it.hexCode ?? null }));
        await restoreRefList(Fit, refData.fits);
        await restoreRefList(Material, refData.materials);
        await restoreRefList(Season, refData.seasons, (it) => ({ icon: it.icon ?? null, isCurrent: Boolean(it.isCurrent) }));
        await restoreRefList(Tag, refData.tags);
        await restoreRefList(Temperature, refData.temperatures, (it) => ({ icon: it.icon ?? null }));
        await restoreRefList(Type, refData.types);
        await restoreRefList(UseCase, refData.useCases, (it) => ({ icon: it.icon ?? null }));
        await restoreRefList(Room, refData.rooms);

        for (const item of refData.locations ?? []) {
          const collision = await manager.findOne(Location, { where: { id: item.id } });
          const finalId = collision ? randomUUID() : item.id;
          refIdMap.set(item.id, finalId);
          const remappedRoomId = item.roomId ? (refIdMap.get(item.roomId) ?? null) : null;
          await manager.save(Location, {
            id: finalId,
            userId: user.id,
            name: item.name,
            roomId: remappedRoomId,
            sortOrder: item.sortOrder ?? 0,
          });
        }

        // 8. Re-insert Clothes with mapped relations
        const clothesIdMap = new Map<string, string>();

        for (const c of clothesData) {
          const collision = await manager.findOne(Clothes, { where: { id: c.id } });
          const newClothesId = collision ? randomUUID() : c.id;
          clothesIdMap.set(c.id, newClothesId);

          const remapRefIds = (ids: string[] | undefined) =>
            (ids ?? []).map((oldId) => refIdMap.get(oldId) || oldId).map((id) => ({ id }));

          const cloth = manager.getRepository(Clothes).create({
            id: newClothesId,
            userId: user.id,
            code: c.code,
            name: c.name,
            quantity: c.quantity || 1,
            isCumulative: Boolean(c.isCumulative),
            size: c.size,
            status: c.status || 'in_wardrobe',
            notes: c.notes,
            brandId: c.brandId ? (refIdMap.get(c.brandId) ?? c.brandId) : null,
            typeId: c.typeId ? (refIdMap.get(c.typeId) ?? c.typeId) : null,
            fitId: c.fitId ? (refIdMap.get(c.fitId) ?? c.fitId) : null,
            locationId: c.locationId ? (refIdMap.get(c.locationId) ?? c.locationId) : null,
            colors: remapRefIds(c.colorIds),
            materials: remapRefIds(c.materialIds),
            seasons: remapRefIds(c.seasonIds),
            temperatures: remapRefIds(c.temperatureIds),
            useCases: remapRefIds(c.useCaseIds),
            tags: remapRefIds(c.tagIds),
          });

          if (c.washingInstruction) {
            cloth.washingInstruction = manager.getRepository(WashingInstruction).create({
              ...c.washingInstruction,
              userId: user.id,
            }) as unknown as WashingInstruction;
          }
          if (c.dryingInstruction) {
            cloth.dryingInstruction = manager.getRepository(DryingInstruction).create({
              ...c.dryingInstruction,
              userId: user.id,
            }) as unknown as DryingInstruction;
          }
          if (c.ironingInstruction) {
            cloth.ironingInstruction = manager.getRepository(IroningInstruction).create({
              ...c.ironingInstruction,
              userId: user.id,
            }) as unknown as IroningInstruction;
          }
          if (c.buyDetail) {
            cloth.buyDetail = manager.getRepository(BuyDetail).create({
              ...c.buyDetail,
              userId: user.id,
            }) as unknown as BuyDetail;
          }

          await manager.save(Clothes, cloth);

          // Save attachments metadata
          for (const att of c.attachments ?? []) {
            const attCollision = await manager.findOne(Attachment, { where: { id: att.id } });
            const finalAttId = attCollision ? randomUUID() : att.id;
            await manager.save(Attachment, {
              id: finalAttId,
              userId: user.id,
              clothesId: newClothesId,
              kind: att.kind || 'photo',
              fileName: att.fileName,
              originalName: att.originalName,
              mimeType: att.mimeType,
              size: att.size,
              sortOrder: att.sortOrder ?? 0,
              path: path.posix.join('clothes', user.id, newClothesId, att.fileName),
              previewPath: att.previewPath ? path.posix.join('clothes', user.id, newClothesId, path.basename(att.previewPath)) : null,
            });
          }
        }

        // 9. Re-insert Outfits with remapped clothes
        const outfitIdMap = new Map<string, string>();
        for (const o of outfitsData) {
          const collision = await manager.findOne(Outfit, { where: { id: o.id } });
          const newOutfitId = collision ? randomUUID() : o.id;
          outfitIdMap.set(o.id, newOutfitId);

          const remappedClothes = (o.clothesIds ?? [])
            .map((cid: string) => clothesIdMap.get(cid) || cid)
            .map((id: string) => ({ id }));

          const remapRefIds = (ids: string[] | undefined) =>
            (ids ?? []).map((oldId) => refIdMap.get(oldId) || oldId).map((id) => ({ id }));

          const outfit = manager.getRepository(Outfit).create({
            id: newOutfitId,
            userId: user.id,
            name: o.name,
            description: o.description,
            canvasLayout: o.canvasLayout,
            clothes: remappedClothes,
            seasons: remapRefIds(o.seasonIds),
            temperatures: remapRefIds(o.temperatureIds),
            useCases: remapRefIds(o.useCaseIds),
          });
          await manager.save(Outfit, outfit);

          for (const att of o.attachments ?? []) {
            const attCollision = await manager.findOne(Attachment, { where: { id: att.id } });
            const finalAttId = attCollision ? randomUUID() : att.id;
            await manager.save(Attachment, {
              id: finalAttId,
              userId: user.id,
              outfitId: newOutfitId,
              kind: att.kind || 'photo',
              fileName: att.fileName,
              originalName: att.originalName,
              mimeType: att.mimeType,
              size: att.size,
              sortOrder: att.sortOrder ?? 0,
              path: path.posix.join('outfits', user.id, newOutfitId, att.fileName),
              previewPath: att.previewPath ? path.posix.join('outfits', user.id, newOutfitId, path.basename(att.previewPath)) : null,
            });
          }
        }

        // 10. Re-insert Laundry Items
        for (const w of laundryData.washingItems ?? []) {
          const remappedClothId = clothesIdMap.get(w.clothesId) || w.clothesId;
          await manager.save(WashingItem, { userId: user.id, clothesId: remappedClothId, quantity: w.quantity || 1 });
        }
        for (const i of laundryData.ironingItems ?? []) {
          const remappedClothId = clothesIdMap.get(i.clothesId) || i.clothesId;
          await manager.save(IroningItem, { userId: user.id, clothesId: remappedClothId, quantity: i.quantity || 1 });
        }

        // 11. Extract Files directly to target folders
        for (const entry of zip.getEntries()) {
          if (entry.entryName.startsWith('files/') && !entry.isDirectory) {
            const parts = entry.entryName.split('/');
            if (parts.length >= 4) {
              const scope = parts[1]; // 'clothes' or 'outfits'
              const originalEntityId = parts[2];
              const mappedEntityId = scope === 'clothes'
                ? (clothesIdMap.get(originalEntityId) || originalEntityId)
                : (outfitIdMap.get(originalEntityId) || originalEntityId);
              const fileName = parts.slice(3).join('/');
              const destDir = path.join(uploadsRootDir, scope, user.id, mappedEntityId);
              await fs.mkdir(destDir, { recursive: true });
              await fs.writeFile(path.join(destDir, fileName), entry.getData());
              restoredFilesCount++;
            }
          }
        }
      } else {
        // --- MERGE MODE ---
        this.logger.log(`[Merge Mode] Merging backup data with existing data for user ${user.id}...`);

        // Helper map to remap IDs: oldId -> newOrExistingId
        const idMap = new Map<string, string>();

        // 1. Deduplicate / Map Reference Data
        const mergeCatalog = async <T extends { id: string; name: string }>(
          entityClass: any,
          backupItems: any[],
          extraFields?: (b: any) => Record<string, unknown>,
        ) => {
          const existingList = (await manager.find(entityClass, { where: { userId: user.id } as never })) as T[];
          const byName = new Map<string, string>();
          for (const item of existingList) {
            byName.set(item.name.toLowerCase().trim(), item.id);
          }

          for (const b of backupItems ?? []) {
            const key = b.name.toLowerCase().trim();
            if (byName.has(key)) {
              idMap.set(b.id, byName.get(key)!);
            } else {
              const newId = randomUUID();
              idMap.set(b.id, newId);
              const extra = extraFields ? extraFields(b) : {};
              await manager.save(entityClass, {
                id: newId,
                userId: user.id,
                name: b.name,
                sortOrder: b.sortOrder ?? 0,
                ...extra,
              });
              byName.set(key, newId);
            }
          }
        };

        await mergeCatalog(Brand, refData.brands);
        await mergeCatalog(Color, refData.colors, (b) => ({ hexCode: b.hexCode ?? null }));
        await mergeCatalog(Fit, refData.fits);
        await mergeCatalog(Material, refData.materials);
        await mergeCatalog(Season, refData.seasons, (b) => ({ icon: b.icon ?? null, isCurrent: Boolean(b.isCurrent) }));
        await mergeCatalog(Tag, refData.tags);
        await mergeCatalog(Temperature, refData.temperatures, (b) => ({ icon: b.icon ?? null }));
        await mergeCatalog(Type, refData.types);
        await mergeCatalog(UseCase, refData.useCases, (b) => ({ icon: b.icon ?? null }));
        await mergeCatalog(Room, refData.rooms);

        // Locations: remap roomId first
        const existingLocations = await manager.find(Location, { where: { userId: user.id } });
        const locByKey = new Map<string, string>();
        for (const loc of existingLocations) {
          locByKey.set(`${loc.roomId || ''}::${loc.name.toLowerCase().trim()}`, loc.id);
        }
        for (const b of refData.locations ?? []) {
          const remappedRoomId = b.roomId ? (idMap.get(b.roomId) ?? null) : null;
          const locKey = `${remappedRoomId || ''}::${b.name.toLowerCase().trim()}`;
          if (locByKey.has(locKey)) {
            idMap.set(b.id, locByKey.get(locKey)!);
          } else {
            const newLocId = randomUUID();
            idMap.set(b.id, newLocId);
            await manager.save(Location, {
              id: newLocId,
              userId: user.id,
              name: b.name,
              roomId: remappedRoomId,
              sortOrder: b.sortOrder ?? 0,
            });
            locByKey.set(locKey, newLocId);
          }
        }

        // 2. Fetch existing tag codes to prevent collision
        const existingClothes = await manager.find(Clothes, { where: { userId: user.id }, select: { id: true, code: true } });
        const usedCodes = new Set<string>();
        for (const c of existingClothes) {
          if (c.code) usedCodes.add(c.code.toUpperCase());
        }

        // 3. Import Clothes (assign fresh UUIDs, remap relations, resolve tag and name collisions)
        for (const c of clothesData) {
          const newClothesId = randomUUID();
          idMap.set(c.id, newClothesId);

          let finalCode = c.code ? c.code.toUpperCase() : null;
          if (finalCode && usedCodes.has(finalCode)) {
            finalCode = generateUniqueTagCode(usedCodes);
          }
          if (finalCode) {
            usedCodes.add(finalCode);
          }

          let finalName = c.name ? c.name.trim() : null;
          if (finalName) {
            let candidate = finalName;
            let counter = 2;
            while (await manager.findOne(Clothes, { where: { userId: user.id, name: candidate } })) {
              candidate = `${finalName} (importato${counter > 2 ? ` ${counter - 1}` : ''})`;
              counter++;
            }
            finalName = candidate;
          }

          const remapIds = (ids: string[] | undefined) =>
            (ids ?? []).map((oldId) => idMap.get(oldId)).filter((nid): nid is string => Boolean(nid)).map((id) => ({ id }));

          const cloth = manager.getRepository(Clothes).create({
            id: newClothesId,
            userId: user.id,
            code: finalCode,
            name: finalName,
            quantity: c.quantity || 1,
            isCumulative: Boolean(c.isCumulative),
            size: c.size,
            status: c.status || 'in_wardrobe',
            notes: c.notes,
            brandId: c.brandId ? (idMap.get(c.brandId) ?? null) : null,
            typeId: c.typeId ? (idMap.get(c.typeId) ?? null) : null,
            fitId: c.fitId ? (idMap.get(c.fitId) ?? null) : null,
            locationId: c.locationId ? (idMap.get(c.locationId) ?? null) : null,
            colors: remapIds(c.colorIds),
            materials: remapIds(c.materialIds),
            seasons: remapIds(c.seasonIds),
            temperatures: remapIds(c.temperatureIds),
            useCases: remapIds(c.useCaseIds),
            tags: remapIds(c.tagIds),
          });

          if (c.washingInstruction) {
            cloth.washingInstruction = manager.getRepository(WashingInstruction).create({
              ...c.washingInstruction,
              userId: user.id,
            }) as unknown as WashingInstruction;
          }
          if (c.dryingInstruction) {
            cloth.dryingInstruction = manager.getRepository(DryingInstruction).create({
              ...c.dryingInstruction,
              userId: user.id,
            }) as unknown as DryingInstruction;
          }
          if (c.ironingInstruction) {
            cloth.ironingInstruction = manager.getRepository(IroningInstruction).create({
              ...c.ironingInstruction,
              userId: user.id,
            }) as unknown as IroningInstruction;
          }
          if (c.buyDetail) {
            cloth.buyDetail = manager.getRepository(BuyDetail).create({
              ...c.buyDetail,
              userId: user.id,
            }) as unknown as BuyDetail;
          }

          await manager.save(Clothes, cloth);

          // Save attachment records and copy files
          const targetClothDir = path.join(uploadsRootDir, 'clothes', user.id, newClothesId);
          for (const att of c.attachments ?? []) {
            const newAttId = randomUUID();
            const ext = path.extname(att.fileName) || '.jpg';
            const newFileName = `${newAttId}${ext}`;

            // Find file in zip
            const originalZipPath = `files/clothes/${c.id}/${att.fileName}`;
            const zipFileEntry = zip.getEntry(originalZipPath);
            if (zipFileEntry) {
              await fs.mkdir(targetClothDir, { recursive: true });
              await fs.writeFile(path.join(targetClothDir, newFileName), zipFileEntry.getData());
              restoredFilesCount++;
            }

            let newPreviewRelPath = path.posix.join('clothes', user.id, newClothesId, `${newAttId}.preview.webp`);
            if (att.previewPath) {
              const previewBase = path.basename(att.previewPath);
              const zipPreviewEntry = zip.getEntry(`files/clothes/${c.id}/${previewBase}`);
              if (zipPreviewEntry) {
                const newPreviewFileName = `${newAttId}.preview.webp`;
                await fs.writeFile(path.join(targetClothDir, newPreviewFileName), zipPreviewEntry.getData());
                newPreviewRelPath = path.posix.join('clothes', user.id, newClothesId, newPreviewFileName);
                restoredFilesCount++;
              }
            }

            await manager.save(Attachment, {
              id: newAttId,
              userId: user.id,
              clothesId: newClothesId,
              kind: att.kind || 'photo',
              fileName: newFileName,
              originalName: att.originalName,
              mimeType: att.mimeType,
              size: att.size,
              sortOrder: att.sortOrder ?? 0,
              path: path.posix.join('clothes', user.id, newClothesId, newFileName),
              previewPath: newPreviewRelPath,
            });
          }
        }

        // 4. Import Outfits (remap clothes and reference data)
        for (const o of outfitsData) {
          const newOutfitId = randomUUID();
          const remappedClothes = (o.clothesIds ?? [])
            .map((cid: string) => idMap.get(cid))
            .filter((nid: string | undefined): nid is string => Boolean(nid))
            .map((id: string) => ({ id }));

          const remapOutfitIds = (ids: string[] | undefined) =>
            (ids ?? [])
              .map((oldId: string) => idMap.get(oldId))
              .filter((nid: string | undefined): nid is string => Boolean(nid))
              .map((id: string) => ({ id }));

          const outfit = manager.getRepository(Outfit).create({
            id: newOutfitId,
            userId: user.id,
            name: o.name,
            description: o.description,
            canvasLayout: o.canvasLayout,
            clothes: remappedClothes,
            seasons: remapOutfitIds(o.seasonIds),
            temperatures: remapOutfitIds(o.temperatureIds),
            useCases: remapOutfitIds(o.useCaseIds),
          });
          await manager.save(Outfit, outfit);

          const targetOutfitDir = path.join(uploadsRootDir, 'outfits', user.id, newOutfitId);
          for (const att of o.attachments ?? []) {
            const newAttId = randomUUID();
            const ext = path.extname(att.fileName) || '.jpg';
            const newFileName = `${newAttId}${ext}`;

            const originalZipPath = `files/outfits/${o.id}/${att.fileName}`;
            const zipFileEntry = zip.getEntry(originalZipPath);
            if (zipFileEntry) {
              await fs.mkdir(targetOutfitDir, { recursive: true });
              await fs.writeFile(path.join(targetOutfitDir, newFileName), zipFileEntry.getData());
              restoredFilesCount++;
            }

            let newPreviewRelPath = path.posix.join('outfits', user.id, newOutfitId, `${newAttId}.preview.webp`);
            if (att.previewPath) {
              const previewBase = path.basename(att.previewPath);
              const zipPreviewEntry = zip.getEntry(`files/outfits/${o.id}/${previewBase}`);
              if (zipPreviewEntry) {
                const newPreviewFileName = `${newAttId}.preview.webp`;
                await fs.writeFile(path.join(targetOutfitDir, newPreviewFileName), zipPreviewEntry.getData());
                newPreviewRelPath = path.posix.join('outfits', user.id, newOutfitId, newPreviewFileName);
                restoredFilesCount++;
              }
            }

            await manager.save(Attachment, {
              id: newAttId,
              userId: user.id,
              outfitId: newOutfitId,
              kind: att.kind || 'photo',
              fileName: newFileName,
              originalName: att.originalName,
              mimeType: att.mimeType,
              size: att.size,
              sortOrder: att.sortOrder ?? 0,
              path: path.posix.join('outfits', user.id, newOutfitId, newFileName),
              previewPath: newPreviewRelPath,
            });
          }
        }

        // 5. Merge Laundry Items
        for (const w of laundryData.washingItems ?? []) {
          const remappedClothId = idMap.get(w.clothesId);
          if (remappedClothId) {
            const existing = await manager.findOne(WashingItem, { where: { userId: user.id, clothesId: remappedClothId } });
            if (!existing) {
              await manager.save(WashingItem, { userId: user.id, clothesId: remappedClothId, quantity: w.quantity || 1 });
            }
          }
        }
        for (const i of laundryData.ironingItems ?? []) {
          const remappedClothId = idMap.get(i.clothesId);
          if (remappedClothId) {
            const existing = await manager.findOne(IroningItem, { where: { userId: user.id, clothesId: remappedClothId } });
            if (!existing) {
              await manager.save(IroningItem, { userId: user.id, clothesId: remappedClothId, quantity: i.quantity || 1 });
            }
          }
        }
      }
    });

    this.logger.log(`Restore finished successfully in mode '${mode}'. Restored ${clothesData.length} clothes, ${outfitsData.length} outfits, ${restoredFilesCount} files.`);

    return {
      success: true,
      mode,
      stats: {
        clothesCount: clothesData.length,
        outfitsCount: outfitsData.length,
        referenceDataCount: manifest.stats?.referenceDataCount ?? 0,
        filesCount: restoredFilesCount,
      },
    };
  }
}
