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
import { ReferenceDataService } from './reference-data.service';
import { SyncService } from './sync.service';

async function runTests() {
  console.log('--- Running SyncService Integration & Unit Tests ---');

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
      SyncTombstone,
    ],
    synchronize: true,
  });

  await dataSource.initialize();

  const referenceDataService = new ReferenceDataService(dataSource);
  const syncService = new SyncService(dataSource, referenceDataService);

  const testUser = {
    id: 'user_123',
    subject: 'sub_123',
    email: 'test@dressly.local',
    displayName: 'Test User',
  };

  const userRepo = dataSource.getRepository(User);
  await userRepo.save(userRepo.create(testUser));

  // Test 1: Field-level merge
  console.log('Test 1: Field-level merge between non-overlapping changes');
  {
    const clothesRepo = dataSource.getRepository(Clothes);
    const item = clothesRepo.create({
      id: 'clothes_test_1',
      userId: testUser.id,
      name: 'Polo Ralph',
      size: 'M',
      notes: 'Nota del server',
    });
    item.updatedAt = new Date('2026-11-01T15:00:00.000Z');
    await clothesRepo.save(item);

    // Client modified 'size' to 'L' while offline
    const response = await syncService.sync(testUser, {
      lastSyncAt: '2026-11-01T14:00:00.000Z',
      changes: {
        clothes: [
          {
            id: 'clothes_test_1',
            updatedAt: '2026-11-01T15:30:00.000Z',
            fields: {
              size: { value: 'L', updatedAt: '2026-11-01T15:30:00.000Z' },
            },
          },
        ],
      },
    });

    const updated = await clothesRepo.findOne({ where: { id: 'clothes_test_1' } });
    assert.strictEqual(updated?.size, 'L', 'Size should be updated to client value');
    assert.strictEqual(updated?.notes, 'Nota del server', 'Notes should remain unchanged from server (field-level merge!)');
    assert.strictEqual(response.status, 'ok');
    console.log('✓ Test 1 passed!');
  }

  // Test 2: Last-Write-Wins (LWW) when the same field was modified
  console.log('Test 2: LWW on same field modified');
  {
    const clothesRepo = dataSource.getRepository(Clothes);
    const existing = await clothesRepo.findOne({ where: { id: 'clothes_test_1' } });
    assert(existing);
    existing.updatedAt = new Date('2026-11-01T16:00:00.000Z');
    existing.notes = 'Server revision at 16:00';
    await clothesRepo.save(existing);

    // Case 2A: Client is NEWER (16:30 > 16:00) -> Client wins
    const resA = await syncService.sync(testUser, {
      lastSyncAt: '2026-11-01T15:00:00.000Z',
      changes: {
        clothes: [
          {
            id: 'clothes_test_1',
            updatedAt: '2026-11-01T16:30:00.000Z',
            fields: {
              notes: { value: 'Client win at 16:30', updatedAt: '2026-11-01T16:30:00.000Z' },
            },
          },
        ],
      },
    });

    const afterA = await clothesRepo.findOne({ where: { id: 'clothes_test_1' } });
    assert.strictEqual(afterA?.notes, 'Client win at 16:30', 'Client should win because timestamp is newer');

    // Case 2B: Server is NEWER (17:00 > 16:15) -> Server wins
    afterA!.updatedAt = new Date('2026-11-01T17:00:00.000Z');
    afterA!.notes = 'Server win at 17:00';
    await clothesRepo.save(afterA!);

    await syncService.sync(testUser, {
      lastSyncAt: '2026-11-01T15:00:00.000Z',
      changes: {
        clothes: [
          {
            id: 'clothes_test_1',
            updatedAt: '2026-11-01T16:15:00.000Z',
            fields: {
              notes: { value: 'Old client edit at 16:15', updatedAt: '2026-11-01T16:15:00.000Z' },
            },
          },
        ],
      },
    });

    const afterB = await clothesRepo.findOne({ where: { id: 'clothes_test_1' } });
    assert.strictEqual(afterB?.notes, 'Server win at 17:00', 'Server should win because server timestamp is newer');
    console.log('✓ Test 2 passed!');
  }

  // Test 3: Conflict detection on equal timestamp with different values
  console.log('Test 3: Conflict detection on equal timestamp with differing values');
  {
    const clothesRepo = dataSource.getRepository(Clothes);
    const item = await clothesRepo.findOne({ where: { id: 'clothes_test_1' } });
    assert(item);
    item.updatedAt = new Date('2026-11-01T18:00:00.000Z');
    item.notes = 'Server version';
    await clothesRepo.save(item);

    const res = await syncService.sync(testUser, {
      lastSyncAt: '2026-11-01T15:00:00.000Z',
      changes: {
        clothes: [
          {
            id: 'clothes_test_1',
            updatedAt: '2026-11-01T18:00:00.000Z',
            fields: {
              notes: { value: 'Client conflicting version', updatedAt: '2026-11-01T18:00:00.000Z' },
            },
          },
        ],
      },
    });

    assert.strictEqual(res.status, 'conflict', 'Sync status should be conflict');
    assert.strictEqual(res.conflicts.length, 1, 'Should report 1 conflict');
    assert.strictEqual(res.conflicts[0].field, 'notes');
    console.log('✓ Test 3 passed!');
  }

  // Test 4: Offline creation and soft deletion with tombstones
  console.log('Test 4: Offline creation and deletion tracking');
  {
    const clothesRepo = dataSource.getRepository(Clothes);
    const tombstoneRepo = dataSource.getRepository(SyncTombstone);

    // Create offline
    const createRes = await syncService.sync(testUser, {
      lastSyncAt: '2026-11-01T18:00:00.000Z',
      changes: {
        clothes: [
          {
            id: 'clothes_offline_created',
            updatedAt: '2026-11-01T18:15:00.000Z',
            fields: {
              name: { value: 'Giacca Invernale', updatedAt: '2026-11-01T18:15:00.000Z' },
              size: { value: 'XL', updatedAt: '2026-11-01T18:15:00.000Z' },
            },
          },
        ],
      },
    });

    const created = await clothesRepo.findOne({ where: { id: 'clothes_offline_created' } });
    assert(created, 'Clothes item created offline should be saved in DB');
    assert.strictEqual(created.name, 'Giacca Invernale');

    // Delete offline
    const deleteRes = await syncService.sync(testUser, {
      lastSyncAt: '2026-11-01T18:15:00.000Z',
      changes: {
        clothes: [
          {
            id: 'clothes_offline_created',
            updatedAt: '2026-11-01T18:30:00.000Z',
            deleted: true,
          },
        ],
      },
    });

    const afterDelete = await clothesRepo.findOne({ where: { id: 'clothes_offline_created' } });
    assert.strictEqual(afterDelete, null, 'Item should be removed from database');

    const tombstone = await tombstoneRepo.findOne({ where: { entityId: 'clothes_offline_created' } });
    assert(tombstone, 'Tombstone must be created for deleted item');
    assert.strictEqual(tombstone.entityType, 'clothes');

    // Verify delta query returns deletedClothesIds
    const deltaRes = await syncService.sync(testUser, {
      lastSyncAt: '2026-11-01T18:20:00.000Z',
    });
    assert(
      deltaRes.serverChanges.deletedClothesIds.includes('clothes_offline_created'),
      'Deleted item ID should be returned in delta query',
    );
    console.log('✓ Test 4 passed!');
  }

  // Test 5: Reference Data & Laundry syncing
  console.log('Test 5: Reference data and laundry sync');
  {
    const brandRepo = dataSource.getRepository(Brand);
    const washingRepo = dataSource.getRepository(WashingItem);

    const res = await syncService.sync(testUser, {
      lastSyncAt: null,
      changes: {
        referenceData: [
          {
            kind: 'brands',
            id: 'brand_offline_1',
            updatedAt: '2026-11-01T19:00:00.000Z',
            fields: {
              name: { value: 'Armani', updatedAt: '2026-11-01T19:00:00.000Z' },
            },
          },
        ],
        laundry: {
          washing: { added: ['clothes_test_1'] },
        },
      },
    });

    const brand = await brandRepo.findOne({ where: { id: 'brand_offline_1' } });
    assert(brand, 'Brand created offline should be saved');
    assert.strictEqual(brand.name, 'Armani');

    const washing = await washingRepo.findOne({ where: { clothesId: 'clothes_test_1' } });
    assert(washing, 'Clothes should be added to washing');
    console.log('✓ Test 5 passed!');
  }

  await dataSource.destroy();
  console.log('🎉 ALL BACKEND SYNC TESTS PASSED SUCCESSFULLY! 🎉');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
