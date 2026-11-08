import 'reflect-metadata';
import assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { DataSource } from 'typeorm';
import { Attachment } from '../entities/attachment.entity';
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
import { Temperature } from '../entities/temperature.entity';
import { Type } from '../entities/type.entity';
import { UseCase } from '../entities/use-case.entity';
import { User } from '../entities/user.entity';
import { WashingInstruction } from '../entities/washing-instruction.entity';
import { WashingItem } from '../entities/washing-item.entity';
import { Outfit } from '../entities/outfit.entity';
import { Room } from '../entities/room.entity';
import { Location } from '../entities/location.entity';
import { ClothesService } from './clothes.service';
import { ReferenceDataService } from './reference-data.service';
import { StorageCleanupService } from './storage-cleanup.service';
import { SyncService } from './sync.service';
import { AuthUser } from '../common/auth/auth.types';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runStorageCleanupTests() {
  console.log('--- Running StorageCleanupService Unit & Integration Tests ---');

  // Setup temporary uploads directory
  const tempUploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dressly-test-uploads-'));
  process.env.UPLOADS_DIR = tempUploadsDir;

  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      Attachment,
      Brand,
      Clothes,
      Color,
      BuyDetail,
      DryingInstruction,
      Fit,
      IroningInstruction,
      Material,
      Season,
      Tag,
      Temperature,
      Type,
      UseCase,
      User,
      WashingInstruction,
      WashingItem,
      IroningItem,
      Outfit,
      Room,
      Location,
      SyncTombstone,
    ],
    synchronize: true,
  });

  await dataSource.initialize();

  const user: AuthUser = { id: 'test-user-1', email: 'test@dressly.local', subject: 'sub-test-user-1' };
  const userRepo = dataSource.getRepository(User);
  await userRepo.save(userRepo.create({ id: user.id, email: user.email, subject: user.subject, displayName: 'Test User' }));

  const refService = new ReferenceDataService(dataSource);
  const storageCleanupService = new StorageCleanupService(dataSource);
  const clothesService = new ClothesService(dataSource, refService, storageCleanupService);
  const syncService = new SyncService(dataSource, refService, storageCleanupService);

  // ----------------------------------------------------
  // Test 1: Orphan detection and permanent removal
  // ----------------------------------------------------
  console.log('Test 1: Startup orphan cleanup deletes only unreferenced files and prunes empty dirs');

  const type = await dataSource.getRepository(Type).save({ name: 'Camicia', userId: user.id });
  const fit = await dataSource.getRepository(Fit).save({ name: 'Slim', userId: user.id });
  const color = await dataSource.getRepository(Color).save({ name: 'Bianco', hexCode: '#ffffff', userId: user.id });
  const material = await dataSource.getRepository(Material).save({ name: 'Cotone', userId: user.id });
  const season = await dataSource.getRepository(Season).save({ name: 'Estate', userId: user.id });
  const temp = await dataSource.getRepository(Temperature).save({ name: 'Caldo', userId: user.id });
  const useCase = await dataSource.getRepository(UseCase).save({ name: 'Quotidiano', userId: user.id });

  // 1. Create a valid clothes item with an attachment
  const samplePngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  const cloth1 = await clothesService.create(user, {
    name: 'Camicia Bianca',
    type_id: type.id,
    fit_id: fit.id,
    color_ids: [color.id],
    material_ids: [material.id],
    season_ids: [season.id],
    temperature_ids: [temp.id],
    use_case_ids: [useCase.id],
  });
  const validAttachment = await clothesService.addAttachment(
    user,
    cloth1.id,
    {
      buffer: samplePngBuffer,
      originalname: 'camicia.png',
      mimetype: 'image/png',
      size: samplePngBuffer.length,
    },
    { kind: 'photo' },
  );

  const validFilePath = storageCleanupService.resolveAttachmentAbsolutePath(validAttachment.path);
  const validPreviewPath = validAttachment.previewPath
    ? storageCleanupService.resolveAttachmentAbsolutePath(validAttachment.previewPath)
    : null;

  assert.strictEqual(await fileExists(validFilePath), true, 'Valid file should exist on disk');
  if (validPreviewPath) {
    assert.strictEqual(await fileExists(validPreviewPath), true, 'Valid preview should exist on disk');
  }

  // 2. Create orphan files and empty directories
  const orphanDir = path.join(tempUploadsDir, 'clothes', user.id, 'orphan-clothes-id');
  await fs.mkdir(orphanDir, { recursive: true });

  const orphanFilePath1 = path.join(orphanDir, 'orphan-1.png');
  const orphanPreviewPath1 = path.join(orphanDir, 'orphan-1.preview.webp');
  await fs.writeFile(orphanFilePath1, Buffer.from('fake-orphan-image-data-1'));
  await fs.writeFile(orphanPreviewPath1, Buffer.from('fake-orphan-preview-data-1'));

  const emptyOutfitDir = path.join(tempUploadsDir, 'outfits', user.id, 'empty-outfit-id');
  await fs.mkdir(emptyOutfitDir, { recursive: true });

  assert.strictEqual(await fileExists(orphanFilePath1), true);
  assert.strictEqual(await fileExists(orphanPreviewPath1), true);
  assert.strictEqual(await fileExists(emptyOutfitDir), true);

  // 3. Run orphan cleanup
  const cleanupStats = await storageCleanupService.cleanupOrphans();

  assert.strictEqual(cleanupStats.removedFiles, 2, 'Should have removed exactly 2 orphan files');
  assert.strictEqual(await fileExists(orphanFilePath1), false, 'Orphan file 1 should be deleted');
  assert.strictEqual(await fileExists(orphanPreviewPath1), false, 'Orphan preview 1 should be deleted');
  assert.strictEqual(await fileExists(orphanDir), false, 'Empty orphan directory should be pruned');
  assert.strictEqual(await fileExists(emptyOutfitDir), false, 'Empty outfit directory should be pruned');

  // Verify valid attachment files are intact
  assert.strictEqual(await fileExists(validFilePath), true, 'Valid attachment file must NOT be deleted');
  if (validPreviewPath) {
    assert.strictEqual(await fileExists(validPreviewPath), true, 'Valid preview must NOT be deleted');
  }

  console.log('✓ Test 1 passed!');

  // ----------------------------------------------------
  // Test 2: Deleting a clothes item removes files from filesystem
  // ----------------------------------------------------
  console.log('Test 2: Deleting clothes item permanently deletes all photo files and clothes folder');

  const clothDir = path.join(tempUploadsDir, 'clothes', user.id, cloth1.id);
  assert.strictEqual(await fileExists(clothDir), true, 'Clothes directory should exist before delete');

  const removeResult = await clothesService.remove(user, cloth1.id);
  assert.strictEqual(removeResult.deleted, true);

  // Verify DB removal
  const attachmentRepo = dataSource.getRepository(Attachment);
  const remainingAtts = await attachmentRepo.find({ where: { clothesId: cloth1.id } });
  assert.strictEqual(remainingAtts.length, 0, 'Attachments in DB must be 0');

  // Verify Filesystem removal
  assert.strictEqual(await fileExists(validFilePath), false, 'Attachment file on disk must be deleted');
  if (validPreviewPath) {
    assert.strictEqual(await fileExists(validPreviewPath), false, 'Preview file on disk must be deleted');
  }
  assert.strictEqual(await fileExists(clothDir), false, 'Clothes folder on disk must be deleted');

  console.log('✓ Test 2 passed!');

  // ----------------------------------------------------
  // Test 3: Sync deletion removes attachment files and folder from disk
  // ----------------------------------------------------
  console.log('Test 3: Offline sync delete removes attachment files and clothes folder');

  const cloth2 = await clothesService.create(user, {
    name: 'Pantaloni Neri',
    type_id: type.id,
    fit_id: fit.id,
    color_ids: [color.id],
    material_ids: [material.id],
    season_ids: [season.id],
    temperature_ids: [temp.id],
    use_case_ids: [useCase.id],
  });
  const syncAttachment = await clothesService.addAttachment(
    user,
    cloth2.id,
    {
      buffer: samplePngBuffer,
      originalname: 'pantaloni.png',
      mimetype: 'image/png',
      size: samplePngBuffer.length,
    },
    { kind: 'photo' },
  );

  const syncFilePath = storageCleanupService.resolveAttachmentAbsolutePath(syncAttachment.path);
  const syncClothDir = path.join(tempUploadsDir, 'clothes', user.id, cloth2.id);

  assert.strictEqual(await fileExists(syncFilePath), true);
  assert.strictEqual(await fileExists(syncClothDir), true);

  // Perform sync with deleted: true
  const syncResponse = await syncService.sync(user, {
    clientTime: new Date().toISOString(),
    lastSyncAt: new Date(Date.now() - 60000).toISOString(),
    changes: {
      clothes: [
        {
          id: cloth2.id,
          updatedAt: new Date(Date.now() + 1000).toISOString(),
          deleted: true,
        },
      ],
    },
  });

  assert.strictEqual(syncResponse.status, 'ok');
  assert.strictEqual(await fileExists(syncFilePath), false, 'Sync-deleted attachment file must be unlinked');
  assert.strictEqual(await fileExists(syncClothDir), false, 'Sync-deleted clothes folder must be removed');

  console.log('✓ Test 3 passed!');

  // ----------------------------------------------------
  // Test 4: Idempotent & safe when directories are already clean
  // ----------------------------------------------------
  console.log('Test 4: Subsequent cleanup is safe and reports 0 orphans');
  const cleanStats = await storageCleanupService.cleanupOrphans();
  assert.strictEqual(cleanStats.removedFiles, 0);
  console.log('✓ Test 4 passed!');

  // ----------------------------------------------------
  // Test 5: Failsafe on DB failure prevents file deletion
  // ----------------------------------------------------
  console.log('Test 5: Failsafe aborts cleanup when DB query fails');
  const dummyFile = path.join(tempUploadsDir, 'clothes', 'unknown-file.txt');
  await fs.mkdir(path.dirname(dummyFile), { recursive: true });
  await fs.writeFile(dummyFile, 'important content');

  const brokenDataSource = {
    getRepository: () => {
      throw new Error('Database connection lost');
    },
  } as unknown as DataSource;

  const failingCleanupService = new StorageCleanupService(brokenDataSource);
  const failedStats = await failingCleanupService.cleanupOrphans();
  assert.strictEqual(failedStats.removedFiles, 0);
  assert.strictEqual(await fileExists(dummyFile), true, 'File must not be deleted on DB failure');
  console.log('✓ Test 5 passed!');

  // Cleanup temp dir and dataSource
  await dataSource.destroy();
  await fs.rm(tempUploadsDir, { recursive: true, force: true }).catch(() => {});
  console.log('🎉 ALL STORAGE CLEANUP TESTS PASSED SUCCESSFULLY! 🎉');
}

runStorageCleanupTests().catch((err) => {
  console.error('Storage cleanup tests failed:', err);
  process.exit(1);
});
