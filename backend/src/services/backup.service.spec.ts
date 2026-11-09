import 'reflect-metadata';
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
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
import { User } from '../entities/user.entity';
import { WashingInstruction } from '../entities/washing-instruction.entity';
import { WashingItem } from '../entities/washing-item.entity';
import { BackupService } from './backup.service';
import { ClothesService } from './clothes.service';
import { OutfitsService } from './outfits.service';
import { ReferenceDataService } from './reference-data.service';
import { AuthUser } from '../common/auth/auth.types';

async function runBackupTests() {
  console.log('--- Running BackupService Export & Restore Integration Tests ---');

  const testUploadsDir = path.join(process.cwd(), 'test-uploads-backup');
  process.env.UPLOADS_DIR = testUploadsDir;

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

  const userA: AuthUser = { id: 'backup-user-a', email: 'usera@example.com' };
  const userB: AuthUser = { id: 'backup-user-b', email: 'userb@example.com' };

  await dataSource.getRepository(User).save([
    { id: userA.id, subject: userA.id, email: userA.email, displayName: 'User A' },
    { id: userB.id, subject: userB.id, email: userB.email, displayName: 'User B' },
  ]);

  const referenceDataService = new ReferenceDataService(dataSource);
  const clothesService = new ClothesService(dataSource, referenceDataService);
  const outfitsService = new OutfitsService(dataSource);
  const backupService = new BackupService(dataSource);

  try {
    // 1. Populate initial data for User A
    const [brand] = await dataSource.getRepository(Brand).save([{ userId: userA.id, name: 'Levi\'s' }]);
    const [type] = await dataSource.getRepository(Type).save([{ userId: userA.id, name: 'Jeans' }]);
    const [color] = await dataSource.getRepository(Color).save([{ userId: userA.id, name: 'Blu Denim', hexCode: '#1e3a8a' }]);
    const [season] = await dataSource.getRepository(Season).save([{ userId: userA.id, name: 'Tutto l\'anno' }]);
    const [temp] = await dataSource.getRepository(Temperature).save([{ userId: userA.id, name: 'Tutte le temp' }]);
    const [room] = await dataSource.getRepository(Room).save([{ userId: userA.id, name: 'Camera' }]);
    const [location] = await dataSource.getRepository(Location).save([{ userId: userA.id, roomId: room.id, name: 'Armadio Destro' }]);

    const cloth1 = await clothesService.create(userA, {
      name: 'Jeans 501 Original',
      size: '32',
      brand_id: brand.id,
      type_id: type.id,
      color_ids: [color.id],
      season_ids: [season.id],
      temperature_ids: [temp.id],
      location_id: location.id,
      washingInstruction: {
        washType: 'washer_ok',
        washing_temperature: 40,
      },
    });

    // Create a real file on disk and attachment
    const clothDir = path.join(testUploadsDir, 'clothes', userA.id, cloth1.id);
    await fs.mkdir(clothDir, { recursive: true });
    const dummyImg = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 30, g: 58, b: 138 } },
    }).png().toBuffer();
    const photoFile = 'jeans.png';
    await fs.writeFile(path.join(clothDir, photoFile), dummyImg);

    await dataSource.getRepository(Attachment).save({
      userId: userA.id,
      clothesId: cloth1.id,
      kind: 'photo',
      fileName: photoFile,
      mimeType: 'image/png',
      size: dummyImg.length,
      sortOrder: 0,
      path: path.posix.join('clothes', userA.id, cloth1.id, photoFile),
    });

    // Create outfit for User A
    const outfit1 = await outfitsService.create(userA, {
      name: 'Casual Weekend',
      description: 'Jeans comodi e t-shirt',
      clothesIds: [cloth1.id],
    });

    // Add to laundry
    await clothesService.addToWashing(userA, [cloth1.id]);

    // Test 1: getBackupStats
    console.log('Test 1: getBackupStats');
    const statsA = await backupService.getBackupStats(userA);
    assert.strictEqual(statsA.clothesCount, 1);
    assert.strictEqual(statsA.outfitsCount, 1);
    assert.ok(statsA.referenceDataCount >= 5);
    assert.strictEqual(statsA.attachmentsCount, 1);
    assert.strictEqual(statsA.totalFileSizeBytes, dummyImg.length);
    console.log('✓ Test 1 passed!');

    // Test 2: exportBackup ZIP
    console.log('Test 2: exportBackup ZIP archive');
    const exportResult = await backupService.exportBackup(userA);
    assert.ok(exportResult.buffer instanceof Buffer);
    assert.ok(exportResult.buffer.length > 500);
    assert.ok(exportResult.filename.startsWith('dressly-backup-'));
    assert.ok(exportResult.filename.endsWith('.zip'));

    // Check ZIP content with AdmZip
    const AdmZip = (await import('adm-zip')).default;
    const testZip = new AdmZip(exportResult.buffer);
    assert.ok(testZip.getEntry('manifest.json'));
    assert.ok(testZip.getEntry('data/clothes.json'));
    assert.ok(testZip.getEntry('data/reference-data.json'));
    assert.ok(testZip.getEntry('data/outfits.json'));
    assert.ok(testZip.getEntry('data/laundry.json'));
    assert.ok(testZip.getEntry(`files/clothes/${cloth1.id}/${photoFile}`));

    // Assert that NO preview files are included in the backup ZIP
    const zipEntries = testZip.getEntries().map((e) => e.entryName);
    assert.ok(
      !zipEntries.some((name) => name.includes('.preview.webp')),
      'Backup ZIP must NOT contain any preview files',
    );
    console.log(`✓ Test 2 passed! Generated ZIP size: ${exportResult.buffer.length} bytes (previews excluded)`);

    // Test 3: restoreBackup in REPLACE mode on User B
    console.log('Test 3: restoreBackup in REPLACE mode on user B');
    // Pre-populate User B with some dummy data that should be wiped
    const [dummyBrand] = await dataSource.getRepository(Brand).save([{ userId: userB.id, name: 'Old Brand' }]);
    const [dummyColor] = await dataSource.getRepository(Color).save([{ userId: userB.id, name: 'Old Color' }]);
    const [dummySeason] = await dataSource.getRepository(Season).save([{ userId: userB.id, name: 'Old Season' }]);
    const [dummyTemp] = await dataSource.getRepository(Temperature).save([{ userId: userB.id, name: 'Old Temp' }]);
    await clothesService.create(userB, {
      name: 'Old User B Cloth',
      color_ids: [dummyColor.id],
      season_ids: [dummySeason.id],
      temperature_ids: [dummyTemp.id],
    });

    const restoreResult = await backupService.restoreBackup(userB, exportResult.buffer, 'replace');
    assert.strictEqual(restoreResult.success, true);
    assert.strictEqual(restoreResult.mode, 'replace');
    assert.strictEqual(restoreResult.stats.clothesCount, 1);
    assert.strictEqual(restoreResult.stats.outfitsCount, 1);

    // Verify User B now has the restored clothes and outfits, and old data is gone
    const userBClothes = await dataSource.getRepository(Clothes).find({ where: { userId: userB.id } });
    assert.strictEqual(userBClothes.length, 1);
    assert.strictEqual(userBClothes[0].name, 'Jeans 501 Original');
    assert.strictEqual(userBClothes[0].code, cloth1.code);

    const oldBrandCheck = await dataSource.getRepository(Brand).findOne({ where: { userId: userB.id, name: 'Old Brand' } });
    assert.strictEqual(oldBrandCheck, null, 'Old brand should be deleted in replace mode');

    // Verify file was extracted to user B directory
    const restoredFile = path.join(testUploadsDir, 'clothes', userB.id, userBClothes[0].id, photoFile);
    const restoredFileExists = await fs.stat(restoredFile).then(() => true).catch(() => false);
    assert.strictEqual(restoredFileExists, true, 'File must exist on disk for user B');

    // Verify preview file was NOT in the zip and was not written to disk during restore
    const userBAttachments = await dataSource.getRepository(Attachment).find({ where: { clothesId: userBClothes[0].id } });
    assert.strictEqual(userBAttachments.length, 1);
    const previewFilePath = path.join(testUploadsDir, 'clothes', userB.id, userBClothes[0].id, `${userBAttachments[0].id}.preview.webp`);
    assert.strictEqual(await fs.stat(previewFilePath).then(() => true).catch(() => false), false, 'Preview should not exist before on-demand request');

    // Verify on-demand dynamic preview generation in clothesService
    const previewResult = await clothesService.getAttachmentFile(userB, userBClothes[0].id, userBAttachments[0].id, 'preview');
    assert.strictEqual(previewResult.mimeType, 'image/webp');
    assert.ok(previewResult.content.length > 0);
    assert.strictEqual(await fs.stat(previewFilePath).then(() => true).catch(() => false), true, 'Preview must be generated on disk on demand');
    console.log('✓ Test 3 passed! On-demand preview verified.');

    // Test 4: restoreBackup in MERGE mode on User B
    console.log('Test 4: restoreBackup in MERGE mode on user B');
    // User B now already has 1 cloth. Restoring in merge mode will append the cloth, deduplicate brand,
    // and generate a new unique code if collision occurs.
    const mergeResult = await backupService.restoreBackup(userB, exportResult.buffer, 'merge');
    assert.strictEqual(mergeResult.success, true);
    assert.strictEqual(mergeResult.mode, 'merge');

    const userBClothesAfterMerge = await dataSource.getRepository(Clothes).find({ where: { userId: userB.id } });
    assert.strictEqual(userBClothesAfterMerge.length, 2, 'Should have 2 clothes now');
    assert.notStrictEqual(userBClothesAfterMerge[0].code, userBClothesAfterMerge[1].code, 'Tag codes must be unique');

    // Brands should not be duplicated
    const userBBrands = await dataSource.getRepository(Brand).find({ where: { userId: userB.id, name: 'Levi\'s' } });
    assert.strictEqual(userBBrands.length, 1, 'Brand should be deduplicated in merge mode');
    console.log('✓ Test 4 passed!');

    // Test 5: Invalid ZIP payload rejects with BadRequestException
    console.log('Test 5: Error handling on invalid ZIP');
    let errCaught = false;
    try {
      await backupService.restoreBackup(userB, Buffer.from('not a zip file'), 'replace');
    } catch {
      errCaught = true;
    }
    assert.strictEqual(errCaught, true);
    console.log('✓ Test 5 passed!');

    // Test 6: restoreBackup using file path on disk (diskStorage streaming)
    console.log('Test 6: restoreBackup using file path on disk (Multer diskStorage)');
    const diskZipPath = path.join(testUploadsDir, 'temp-restore-test.zip');
    await fs.writeFile(diskZipPath, exportResult.buffer);
    const diskRestoreResult = await backupService.restoreBackup(userB, diskZipPath, 'replace');
    assert.strictEqual(diskRestoreResult.success, true);
    assert.strictEqual(diskRestoreResult.stats.clothesCount, 1);
    await fs.unlink(diskZipPath).catch(() => {});
    console.log('✓ Test 6 passed!');

    // Test 7: SafeBackupDiskStorage deletes partial file on client abort
    console.log('Test 7: SafeBackupDiskStorage cleans up immediately if client aborts');
    const { SafeBackupDiskStorage } = await import('../controllers/backup.controller');
    const storageEngine = new SafeBackupDiskStorage(() => testUploadsDir);
    const { EventEmitter } = await import('node:events');
    const { Readable } = await import('node:stream');

    const fakeReq = new EventEmitter() as any;
    fakeReq.complete = false;

    const brokenStream = new Readable({
      read() {
        this.push(Buffer.from('partial zip data'));
        process.nextTick(() => {
          fakeReq.emit('close');
        });
      },
    });

    await new Promise<void>((resolve) => {
      storageEngine._handleFile(
        fakeReq,
        { stream: brokenStream, originalname: 'broken.zip' } as any,
        () => {},
      );
      setTimeout(resolve, 80);
    });

    const remainingFiles = await fs.readdir(testUploadsDir);
    const orphanBroken = remainingFiles.filter((f) => f.startsWith('dressly-restore-'));
    assert.strictEqual(orphanBroken.length, 0, 'Partial file must be unlinked when request closes prematurely');
    console.log('✓ Test 7 passed!');

    console.log('🎉 ALL BACKUP & RESTORE INTEGRATION TESTS PASSED! 🎉');
  } finally {
    await dataSource.destroy();
    await fs.rm(testUploadsDir, { recursive: true, force: true }).catch(() => {});
  }
}

runBackupTests().catch((err) => {
  console.error('Backup tests failed:', err);
  process.exit(1);
});
