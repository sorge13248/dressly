import 'reflect-metadata';
import assert from 'node:assert';
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
import {
  generateRandomTagCode,
  generateUniqueTagCode,
  isValidTagCode,
  normalizeTagCode,
  TAG_CODE_CHARSET,
  TAG_CODE_LENGTH,
} from '../common/utils/tag-code.util';

async function runTagCodeTests() {
  console.log('--- Running Tag Code Utility & Clothes Service Integration Tests ---');

  // Test 1: Tag code utility functions
  console.log('Test 1: Tag code utility functions');
  assert.strictEqual(TAG_CODE_LENGTH, 3);
  assert.strictEqual(isValidTagCode('7KX'), true);
  assert.strictEqual(isValidTagCode('a2b'), true);
  assert.strictEqual(isValidTagCode('AB'), false); // too short
  assert.strictEqual(isValidTagCode('ABCD'), false); // too long
  assert.strictEqual(isValidTagCode('A-1'), false); // special char
  assert.strictEqual(normalizeTagCode(' 7kx '), '7KX');
  assert.strictEqual(normalizeTagCode(''), null);
  assert.strictEqual(normalizeTagCode(null), null);

  const randomCode = generateRandomTagCode();
  assert.strictEqual(randomCode.length, 3);
  for (const char of randomCode) {
    assert.ok(TAG_CODE_CHARSET.includes(char), `Character ${char} must belong to marker-friendly charset`);
  }
  console.log('✓ Test 1 passed!');

  // Setup in-memory DB
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

  // Setup users in DB
  const userRepo = dataSource.getRepository(User);
  await userRepo.save([
    { id: userA.id, email: userA.email, subject: 'sub-a', displayName: 'User A' },
    { id: userB.id, email: userB.email, subject: 'sub-b', displayName: 'User B' },
  ]);

  // Setup basic reference data for wizard
  const colorRepo = dataSource.getRepository(Color);
  const seasonRepo = dataSource.getRepository(Season);
  const tempRepo = dataSource.getRepository(Temperature);
  const brandRepo = dataSource.getRepository(Brand);

  const color1 = await colorRepo.save({ name: 'Blu', hexCode: '#0000ff', userId: userA.id });
  const season1 = await seasonRepo.save({ name: 'Estate', userId: userA.id });
  const temp1 = await tempRepo.save({ name: 'Caldo', userId: userA.id });
  const brand1 = await brandRepo.save({ name: 'Zara', userId: userA.id });

  const colorB = await colorRepo.save({ name: 'Blu B', hexCode: '#0000ff', userId: userB.id });
  const seasonB = await seasonRepo.save({ name: 'Estate B', userId: userB.id });
  const tempB = await tempRepo.save({ name: 'Caldo B', userId: userB.id });

  // Test 2: Auto-generation of unique 3-char code on creation
  console.log('Test 2: Auto-generation of unique 3-char code on creation');
  const created1 = await clothesService.create(userA, {
    name: 'T-Shirt Blu',
    color_ids: [color1.id],
    season_ids: [season1.id],
    temperature_ids: [temp1.id],
    brand_id: brand1.id,
  });

  assert.ok(created1.code, 'Capo 1 must have an auto-generated code');
  assert.strictEqual(created1.code.length, 3, 'Auto-generated code must be 3 characters');
  assert.ok(isValidTagCode(created1.code), 'Code must be valid alphanumeric');
  console.log(`✓ Test 2 passed! Generated code: ${created1.code}`);

  // Test 3: Explicit code assignment and case-insensitivity
  console.log('Test 3: Explicit code assignment and case-insensitivity');
  const created2 = await clothesService.create(userA, {
    name: 'Camicia Bianca',
    code: '7kx',
    color_ids: [color1.id],
    season_ids: [season1.id],
    temperature_ids: [temp1.id],
  });

  assert.strictEqual(created2.code, '7KX', 'Explicit code must be normalized to uppercase');
  console.log('✓ Test 3 passed!');

  // Test 4: Duplicate code detection for the SAME user
  console.log('Test 4: Duplicate code detection for the SAME user');
  let duplicateThrew = false;
  try {
    await clothesService.create(userA, {
      name: 'Altra Camicia',
      code: '7kx', // Same code for userA
      color_ids: [color1.id],
      season_ids: [season1.id],
      temperature_ids: [temp1.id],
    });
  } catch (err: any) {
    duplicateThrew = true;
    assert.strictEqual(err.status, 409, 'ConflictException expected');
  }
  assert.ok(duplicateThrew, 'Duplicate code for same user must throw ConflictException');
  console.log('✓ Test 4 passed!');

  // Test 5: Per-user uniqueness allows user B to have the SAME code
  console.log('Test 5: Per-user uniqueness allows user B to have the SAME code');
  const createdUserB = await clothesService.create(userB, {
    name: 'Giacca User B',
    code: '7kx', // Same code, different user
    color_ids: [colorB.id],
    season_ids: [seasonB.id],
    temperature_ids: [tempB.id],
  });
  assert.strictEqual(createdUserB.code, '7KX');
  console.log('✓ Test 5 passed!');

  // Test 6: Search by code in list/findAll
  console.log('Test 6: Search by code in list/findAll');
  const searchResultsLower = await clothesService.list(userA, { search: '7kx' });
  assert.strictEqual(searchResultsLower.items.length, 1);
  assert.strictEqual(searchResultsLower.items[0].id, created2.id);

  const searchResultsUpper = await clothesService.list(userA, { search: '7KX' });
  assert.strictEqual(searchResultsUpper.items.length, 1);
  assert.strictEqual(searchResultsUpper.items[0].id, created2.id);
  console.log('✓ Test 6 passed!');

  // Test 7: Backfill missing codes for existing items
  console.log('Test 7: Backfill missing codes for existing items');
  const clothesRepo = dataSource.getRepository(Clothes);
  const rawItem = clothesRepo.create({
    userId: userA.id,
    name: 'Vecchio Capo Senza Codice',
    code: null,
  });
  await clothesRepo.save(rawItem);

  assert.strictEqual(rawItem.code, null);
  await clothesService.backfillMissingTagCodes();

  const refreshedItem = await clothesRepo.findOneBy({ id: rawItem.id });
  assert.ok(refreshedItem?.code, 'Backfill must assign a code');
  assert.strictEqual(refreshedItem?.code?.length, 3);
  console.log(`✓ Test 7 passed! Backfilled code: ${refreshedItem?.code}`);

  // Test 8: Cumulative clothes and quantity in washing/ironing
  console.log('Test 8: Cumulative clothes creation and incremental laundry/ironing');
  const cumulativeCloth = await clothesService.create(userA, {
    name: 'Maglietta Bianca Cumulativa',
    color_ids: [color1.id],
    season_ids: [season1.id],
    temperature_ids: [temp1.id],
    is_cumulative: true,
    quantity: 3,
  });
  assert.strictEqual(cumulativeCloth.isCumulative, true);
  assert.strictEqual(cumulativeCloth.quantity, 3);

  // Add to washing (1st time)
  await clothesService.addToWashing(userA, [cumulativeCloth.id]);
  let washingList = await clothesService.getWashingList(userA);
  let washItem = washingList.items.find((i) => i.id === cumulativeCloth.id);
  assert.strictEqual(washItem?.washingQuantity, 1);

  // Add to washing (2nd time) -> increments
  await clothesService.addToWashing(userA, [cumulativeCloth.id]);
  washingList = await clothesService.getWashingList(userA);
  washItem = washingList.items.find((i) => i.id === cumulativeCloth.id);
  assert.strictEqual(washItem?.washingQuantity, 2);

  // Move 1 to ironing
  await clothesService.moveWashingToIroning(userA, cumulativeCloth.id, 1);
  washingList = await clothesService.getWashingList(userA);
  washItem = washingList.items.find((i) => i.id === cumulativeCloth.id);
  assert.strictEqual(washItem?.washingQuantity, 1);

  const ironingList = await clothesService.getIroningList(userA);
  const ironItem = ironingList.items.find((i) => i.id === cumulativeCloth.id);
  assert.strictEqual(ironItem?.ironingQuantity, 1);

  const counts = await clothesService.getLaundryCounts(userA);
  assert.strictEqual(counts.washingCount, 1);
  assert.strictEqual(counts.ironingCount, 1);

  // Clean up
  await clothesService.removeFromWashing(userA, cumulativeCloth.id, 1, true);
  await clothesService.removeFromIroning(userA, cumulativeCloth.id, 1, true);
  console.log('✓ Test 8 passed!');

  // Test 9: Cold wash temperature 0 allowed and persisted
  console.log('Test 9: Cold wash temperature 0 allowed and persisted');
  const coldCloth = await clothesService.create(userA, {
    name: 'Seta fredda',
    color_ids: [color1.id],
    season_ids: [season1.id],
    temperature_ids: [temp1.id],
    washingInstruction: {
      washType: 'washer_ok',
      washing_temperature: 0,
      bleachType: 'no_bleach',
    },
  });
  assert.strictEqual(coldCloth.washingInstruction?.temperature, '0');

  // Verify invalid negative temperature rejected
  let rejectedNegative = false;
  try {
    await clothesService.create(userA, {
      name: 'Temp negativa',
      color_ids: [color1.id],
      season_ids: [season1.id],
      temperature_ids: [temp1.id],
      washingInstruction: {
        washType: 'washer_ok',
        washing_temperature: -5,
      },
    });
  } catch {
    rejectedNegative = true;
  }
  assert.strictEqual(rejectedNegative, true);
  console.log('✓ Test 9 passed!');

  // Test 10: migrateColorLossRiskTriState executes without syntax errors and records migration
  console.log('Test 10: migrateColorLossRiskTriState migration runs cleanly');
  await clothesService.migrateColorLossRiskTriState();
  const migrations = await dataSource.query('SELECT * FROM _app_migrations WHERE id = ?;', ['20261113_color_loss_risk_tri_state']);
  assert.strictEqual(migrations.length, 1);
  assert.ok(migrations[0].appliedAt);
  // Re-running migration is idempotent
  await clothesService.migrateColorLossRiskTriState();
  console.log('✓ Test 10 passed!');

  await dataSource.destroy();
  console.log('🎉 ALL TAG CODE TESTS PASSED SUCCESSFULLY! 🎉');
}

runTagCodeTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
