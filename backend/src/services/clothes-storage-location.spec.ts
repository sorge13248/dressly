import assert from 'node:assert';
import { DataSource } from 'typeorm';
import { Attachment } from '../entities/attachment.entity';
import { Brand } from '../entities/brand.entity';
import { Clothes } from '../entities/clothes.entity';
import { Color } from '../entities/color.entity';
import { BuyDetail } from '../entities/buy-detail.entity';
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
import { AuthUser } from '../common/auth/auth.types';

async function runStorageLocationTests() {
  console.log('--- Running Storage & Location Tests ---');

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

  const user: AuthUser = {
    id: 'user-storage-1',
    subject: 'sub-storage-1',
    email: 'user@storage.test',
    displayName: 'Storage User',
    pictureUrl: null,
  };

  const refService = new ReferenceDataService(dataSource);
  const clothesService = new ClothesService(dataSource, refService);

  const typeTshirt = await refService.create('types', user, { name: 'T-Shirt' });
  const color1 = await refService.create('colors', user, { name: 'Blu' });
  const season1 = await refService.create('seasons', user, { name: 'Inverno' });
  const temp1 = await refService.create('temperatures', user, { name: 'Freddo' });

  // Test 1: Create Room and Location
  console.log('Test 1: Create Room and Location');
  const room = await refService.create('rooms', user, { name: 'Camera da letto', sortOrder: 1 });
  assert.ok(room.id);
  assert.strictEqual(room.name, 'Camera da letto');

  const location = (await refService.create('locations', user, {
    name: 'Scatola Lana #1',
    roomId: room.id,
    sortOrder: 1,
  })) as Location;
  assert.ok(location.id);
  assert.strictEqual(location.name, 'Scatola Lana #1');
  assert.strictEqual(location.roomId, room.id);
  assert.strictEqual(location.room?.name, 'Camera da letto');
  console.log('✓ Test 1 passed!');

  // Test 2: Create clothes with status and location
  console.log('Test 2: Create clothes with status and location');
  const c1 = await clothesService.create(user, {
    name: 'Maglione Pesante',
    type_id: typeTshirt.id,
    color_ids: [color1.id],
    season_ids: [season1.id],
    temperature_ids: [temp1.id],
    status: 'in_storage',
    locationId: location.id,
  });
  assert.strictEqual(c1.status, 'in_storage');
  assert.strictEqual(c1.locationId, location.id);

  const fetched = await clothesService.getOne(user, c1.id);
  assert.strictEqual(fetched.status, 'in_storage');
  assert.strictEqual(fetched.location?.id, location.id);
  assert.strictEqual(fetched.location?.room?.name, 'Camera da letto');
  console.log('✓ Test 2 passed!');

  // Test 3: Filter list by status, location, and room
  console.log('Test 3: Filter list by status, location, and room');
  const c2 = await clothesService.create(user, {
    name: 'T-Shirt Estiva',
    type_id: typeTshirt.id,
    color_ids: [color1.id],
    season_ids: [season1.id],
    temperature_ids: [temp1.id],
    status: 'in_wardrobe',
  });
  const c3 = await clothesService.create(user, {
    name: 'Giacca Dismessa',
    type_id: typeTshirt.id,
    color_ids: [color1.id],
    season_ids: [season1.id],
    temperature_ids: [temp1.id],
    status: 'dismissed',
  });

  const listWardrobe = await clothesService.list(user, { status: 'in_wardrobe' });
  assert.strictEqual(listWardrobe.items.length, 1);
  assert.strictEqual(listWardrobe.items[0].name, 'T-Shirt Estiva');

  const listStorage = await clothesService.list(user, { status: 'in_storage' });
  assert.strictEqual(listStorage.items.length, 1);
  assert.strictEqual(listStorage.items[0].name, 'Maglione Pesante');

  const listByLocation = await clothesService.list(user, { location_id: location.id });
  assert.strictEqual(listByLocation.items.length, 1);
  assert.strictEqual(listByLocation.items[0].name, 'Maglione Pesante');

  const listByRoom = await clothesService.list(user, { room_id: room.id });
  assert.strictEqual(listByRoom.items.length, 1);
  assert.strictEqual(listByRoom.items[0].name, 'Maglione Pesante');
  console.log('✓ Test 3 passed!');

  // Test 4: Bulk update status
  console.log('Test 4: Bulk update status');
  const bulkRes = await clothesService.bulkUpdateStatus(user, [c2.id], 'in_storage', location.id);
  assert.strictEqual(bulkRes.updated, 1);

  const updatedC2 = await clothesService.getOne(user, c2.id);
  assert.strictEqual(updatedC2.status, 'in_storage');
  assert.strictEqual(updatedC2.locationId, location.id);
  console.log('✓ Test 4 passed!');

  // Test 5: Revert to in_wardrobe
  console.log('Test 5: Revert to in_wardrobe');
  await clothesService.bulkUpdateStatus(user, [c2.id], 'in_wardrobe', null);
  const revertedC2 = await clothesService.getOne(user, c2.id);
  assert.strictEqual(revertedC2.status, 'in_wardrobe');
  assert.strictEqual(revertedC2.locationId, null);
  console.log('✓ Test 5 passed!');

  await dataSource.destroy();
  console.log('🎉 ALL STORAGE & LOCATION TESTS PASSED! 🎉');
}

runStorageLocationTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
