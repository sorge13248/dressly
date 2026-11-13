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
import { WashingProgram } from '../entities/washing-program.entity';
import { Detergent } from '../entities/detergent.entity';
import { ClothesService } from './clothes.service';
import { ReferenceDataService } from './reference-data.service';
import { AuthUser } from '../common/auth/auth.types';

async function runDuplicateTests() {
  console.log('--- Running ClothesService Duplicate Integration Tests ---');

  const testUploadsDir = path.join(process.cwd(), 'test-uploads-duplicate');
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
      WashingProgram,
      Detergent,
    ],
    synchronize: true,
  });

  await dataSource.initialize();

  const refService = new ReferenceDataService(dataSource);
  const clothesService = new ClothesService(dataSource, refService);

  const userA: AuthUser = { id: 'user-a', email: 'userA@dressly.test' };
  const userB: AuthUser = { id: 'user-b', email: 'userB@dressly.test' };

  const userRepo = dataSource.getRepository(User);
  await userRepo.save([
    { id: userA.id, email: userA.email, subject: 'sub-a', displayName: 'User A' },
    { id: userB.id, email: userB.email, subject: 'sub-b', displayName: 'User B' },
  ]);

  const brand = await dataSource.getRepository(Brand).save({ name: 'Ralph Lauren', userId: userA.id });
  const type = await dataSource.getRepository(Type).save({ name: 'Camicia', userId: userA.id });
  const fit = await dataSource.getRepository(Fit).save({ name: 'Slim', userId: userA.id });
  const color = await dataSource.getRepository(Color).save({ name: 'Azzurro', hexCode: '#3b82f6', userId: userA.id });
  const material = await dataSource.getRepository(Material).save({ name: 'Lino 100%', userId: userA.id });
  const season = await dataSource.getRepository(Season).save({ name: 'Primavera', userId: userA.id });
  const temp = await dataSource.getRepository(Temperature).save({ name: 'Mite', userId: userA.id });
  const useCase = await dataSource.getRepository(UseCase).save({ name: 'Lavoro', userId: userA.id });
  const tag = await dataSource.getRepository(Tag).save({ name: 'Preferiti', userId: userA.id });

  // Test 1: Duplicate cloth with all attributes and instructions
  console.log('Test 1: Duplicate cloth with all attributes and instructions');
  const original = await clothesService.create(userA, {
    name: 'Camicia Lino Azzurra',
    brand_id: brand.id,
    type_id: type.id,
    fit_id: fit.id,
    size: 'M',
    notes: 'Stirare con cura',
    is_cumulative: false,
    color_ids: [color.id],
    material_ids: [material.id],
    season_ids: [season.id],
    temperature_ids: [temp.id],
    use_case_ids: [useCase.id],
    tag_ids: [tag.id],
    washingInstruction: {
      washType: 'washer_ok',
      washing_temperature: 30,
      bleachType: 'no_bleach',
      reverseWashing: true,
    },
    dryingInstruction: {
      tumbleDry: false,
      method: 'air_dry',
    },
    ironingInstruction: {
      ironType: 'yes',
      ironing_temperature: 2,
      inside_out: true,
    },
    buyDetail: {
      shop_name: 'Zalando',
      purchase_date: '2026-05-10',
      shop_url: 'https://zalando.it/item',
      priceCents: 7990,
    },
  });

  // Put original into washing
  await clothesService.addToWashing(userA, [original.id]);
  const originalWithStatus = await clothesService.getOne(userA, original.id);
  assert.strictEqual(originalWithStatus.isInWashing, true);

  // Duplicate
  const clone1 = await clothesService.duplicate(userA, original.id);

  assert.notStrictEqual(clone1.id, original.id);
  assert.strictEqual(clone1.name, 'Camicia Lino Azzurra (copia)');
  assert.ok(clone1.code);
  assert.strictEqual(clone1.code?.length, 3);
  assert.notStrictEqual(clone1.code, original.code);
  assert.strictEqual(clone1.brand?.id, brand.id);
  assert.strictEqual(clone1.type?.id, type.id);
  assert.strictEqual(clone1.fit?.id, fit.id);
  assert.strictEqual(clone1.size, 'M');
  assert.strictEqual(clone1.notes, 'Stirare con cura');
  assert.strictEqual(clone1.colors?.length, 1);
  assert.strictEqual(clone1.colors[0].id, color.id);
  assert.strictEqual(clone1.materials?.length, 1);
  assert.strictEqual(clone1.materials[0].id, material.id);
  assert.strictEqual(clone1.seasons?.length, 1);
  assert.strictEqual(clone1.tags?.length, 1);

  // Instructions
  assert.ok(clone1.washingInstruction);
  assert.notStrictEqual(clone1.washingInstruction.id, originalWithStatus.washingInstruction?.id);
  assert.strictEqual(clone1.washingInstruction.temperature, '30');
  assert.strictEqual(clone1.washingInstruction.reverseWashing, true);

  assert.ok(clone1.dryingInstruction);
  assert.notStrictEqual(clone1.dryingInstruction.id, originalWithStatus.dryingInstruction?.id);
  assert.strictEqual(clone1.dryingInstruction.method, 'air_dry');

  assert.ok(clone1.ironingInstruction);
  assert.notStrictEqual(clone1.ironingInstruction.id, originalWithStatus.ironingInstruction?.id);
  assert.strictEqual(clone1.ironingInstruction.ironInsideOut, true);

  assert.ok(clone1.buyDetail);
  assert.notStrictEqual(clone1.buyDetail.id, originalWithStatus.buyDetail?.id);
  assert.strictEqual(clone1.buyDetail.store, 'Zalando');

  // Verify clean laundry state for the clone
  assert.strictEqual(clone1.isInWashing, false);
  assert.strictEqual(clone1.washingQuantity, 0);
  assert.strictEqual(clone1.isInIroning, false);
  assert.strictEqual(clone1.ironingQuantity, 0);
  console.log('✓ Test 1 passed!');

  // Test 2: Second duplicate increments name to "(copia 2)"
  console.log('Test 2: Second duplicate increments name to "(copia 2)"');
  const clone2 = await clothesService.duplicate(userA, original.id);
  assert.strictEqual(clone2.name, 'Camicia Lino Azzurra (copia 2)');
  assert.notStrictEqual(clone2.code, clone1.code);
  assert.notStrictEqual(clone2.code, original.code);
  console.log('✓ Test 2 passed!');

  // Test 3: Cloth with null name retains null name
  console.log('Test 3: Cloth with null name retains null name');
  const nullNameCloth = await clothesService.create(userA, {
    name: null,
    color_ids: [color.id],
    season_ids: [season.id],
    temperature_ids: [temp.id],
  });
  const nullNameClone = await clothesService.duplicate(userA, nullNameCloth.id);
  assert.strictEqual(nullNameClone.name, null);
  assert.notStrictEqual(nullNameClone.code, nullNameCloth.code);
  console.log('✓ Test 3 passed!');

  // Test 4: Duplicate cloth with attachments (including file copy on disk)
  console.log('Test 4: Duplicate cloth with attachments');
  const validJpegBuffer = await sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 50, g: 100, b: 200 } },
  })
    .jpeg()
    .toBuffer();

  const uploadResult = await clothesService.addAttachment(
    userA,
    original.id,
    {
      buffer: validJpegBuffer,
      originalname: 'camicia-fronte.jpg',
      mimetype: 'image/jpeg',
      size: validJpegBuffer.length,
    },
    { kind: 'photo', sortOrder: 0 },
  );

  const cloneWithAttachment = await clothesService.duplicate(userA, original.id);
  assert.strictEqual(cloneWithAttachment.attachments.length, 1);
  const clonedAttachment = cloneWithAttachment.attachments[0];
  assert.notStrictEqual(clonedAttachment.id, uploadResult.id);
  assert.strictEqual(clonedAttachment.originalName, 'camicia-fronte.jpg');
  assert.strictEqual(clonedAttachment.mimeType, 'image/jpeg');

  // Verify file was copied to new clothes folder on disk
  const expectedNewFilePath = path.join(
    testUploadsDir,
    'clothes',
    userA.id,
    cloneWithAttachment.id,
    clonedAttachment.fileName,
  );
  const fileExists = await fs
    .access(expectedNewFilePath)
    .then(() => true)
    .catch(() => false);
  assert.strictEqual(fileExists, true, `Cloned file must exist at ${expectedNewFilePath}`);
  const copiedContent = await fs.readFile(expectedNewFilePath);
  assert.deepStrictEqual(copiedContent, validJpegBuffer);
  console.log('✓ Test 4 passed!');

  // Test 5: Authorization and 404
  console.log('Test 5: Authorization and 404 for another user');
  let userBFailed = false;
  try {
    await clothesService.duplicate(userB, original.id);
  } catch (err: any) {
    userBFailed = true;
    assert.strictEqual(err.status, 404);
  }
  assert.strictEqual(userBFailed, true);
  console.log('✓ Test 5 passed!');

  // Clean up
  try {
    await fs.rm(testUploadsDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error
  }
  await dataSource.destroy();
  console.log('🎉 ALL CLOTHES DUPLICATE TESTS PASSED! 🎉');
}

runDuplicateTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
