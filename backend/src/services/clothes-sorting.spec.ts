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
import { ClothesService } from './clothes.service';
import { ReferenceDataService } from './reference-data.service';
import { AuthUser } from '../common/auth/auth.types';

async function runSortingTests() {
  console.log('--- Running Clothes Sorting Integration Tests ---');

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

  const refService = new ReferenceDataService(dataSource);
  const clothesService = new ClothesService(dataSource, refService);

  const user: AuthUser = { id: 'sort-user', email: 'sort@dressly.test' };
  const userRepo = dataSource.getRepository(User);
  await userRepo.save({ id: user.id, email: user.email, subject: 'sub-sort', displayName: 'Sort User' });

  const typeRepo = dataSource.getRepository(Type);
  const typeTshirt = await typeRepo.save({ name: 'T-shirt', sortOrder: 1, userId: user.id });
  const typePants = await typeRepo.save({ name: 'Pantaloni', sortOrder: 2, userId: user.id });
  const typeJacket = await typeRepo.save({ name: 'Giacca', sortOrder: 3, userId: user.id });

  const colorRepo = dataSource.getRepository(Color);
  const color1 = await colorRepo.save({ name: 'Blu', hexCode: '#0000ff', userId: user.id });

  const tempRepo = dataSource.getRepository(Temperature);
  const temp1 = await tempRepo.save({ name: 'Mite', sortOrder: 1, userId: user.id });

  const seasonRepo = dataSource.getRepository(Season);
  const seasonAutunno = await seasonRepo.save({ name: 'Autunno', sortOrder: 1, userId: user.id });
  const seasonInverno = await seasonRepo.save({ name: 'Inverno', sortOrder: 2, userId: user.id });
  const seasonPrimavera = await seasonRepo.save({ name: 'Primavera', sortOrder: 3, userId: user.id });

  // Create test items
  // Item 1: Zebra Camicia, code: "ZZZ"
  const item1 = await clothesService.create(user, {
    name: 'Zebra Camicia',
    code: 'ZZZ',
    type_id: typeJacket.id,
    color_ids: [color1.id],
    season_ids: [seasonInverno.id],
    temperature_ids: [temp1.id],
  });

  // Item 2: Apple Maglia, code: "AAA"
  const item2 = await clothesService.create(user, {
    name: 'Apple Maglia',
    code: 'AAA',
    type_id: typeTshirt.id,
    color_ids: [color1.id],
    season_ids: [seasonAutunno.id],
    temperature_ids: [temp1.id],
  });

  // Item 3: Banana Pantalone, code: "MMM"
  const item3 = await clothesService.create(user, {
    name: 'Banana Pantalone',
    code: 'MMM',
    type_id: typePants.id,
    color_ids: [color1.id],
    season_ids: [seasonPrimavera.id],
    temperature_ids: [temp1.id],
  });

  // Test 1: Name ascending
  console.log('Test 1: Name ASC');
  const resNameAsc = await clothesService.list(user, { sort: 'name_asc' });
  const namesAsc = resNameAsc.items.map((i) => i.name);
  assert.deepStrictEqual(namesAsc, ['Apple Maglia', 'Banana Pantalone', 'Zebra Camicia']);
  console.log('✓ Test 1 passed!');

  // Test 2: Name descending
  console.log('Test 2: Name DESC');
  const resNameDesc = await clothesService.list(user, { sort: 'name_desc' });
  const namesDesc = resNameDesc.items.map((i) => i.name);
  assert.deepStrictEqual(namesDesc, ['Zebra Camicia', 'Banana Pantalone', 'Apple Maglia']);
  console.log('✓ Test 2 passed!');

  // Test 3: Code ascending
  console.log('Test 3: Code ASC');
  const resCodeAsc = await clothesService.list(user, { sort: 'code_asc' });
  const codesAsc = resCodeAsc.items.map((i) => i.code);
  assert.deepStrictEqual(codesAsc, ['AAA', 'MMM', 'ZZZ']);
  console.log('✓ Test 3 passed!');

  // Test 4: Type order (wardrobe hierarchy: Tops -> Outerwear -> Bottoms)
  console.log('Test 4: Type Order');
  const resTypeOrder = await clothesService.list(user, { sort: 'type_order' });
  const typesOrder = resTypeOrder.items.map((i) => i.type?.name);
  assert.deepStrictEqual(typesOrder, ['T-shirt', 'Giacca', 'Pantaloni']);
  console.log('✓ Test 4 passed!');

  // Test 5: Type alphabetical (A-Z)
  console.log('Test 5: Type ASC (A-Z)');
  const resTypeAsc = await clothesService.list(user, { sort: 'type_asc' });
  const typesAsc = resTypeAsc.items.map((i) => i.type?.name);
  assert.deepStrictEqual(typesAsc, ['Giacca', 'Pantaloni', 'T-shirt']);
  console.log('✓ Test 5 passed!');

  // Test 6: Availability
  console.log('Test 6: Availability');
  // Put item2 in washing
  await dataSource.getRepository(WashingItem).save({ userId: user.id, clothesId: item2.id, quantity: 1 });
  // Put item3 in ironing
  await dataSource.getRepository(IroningItem).save({ userId: user.id, clothesId: item3.id, quantity: 1 });
  // item1 is clean/available
  const resAvail = await clothesService.list(user, { sort: 'availability' });
  assert.strictEqual(resAvail.items[0].id, item1.id, 'Clean item must be first');
  assert.strictEqual(resAvail.items[1].id, item3.id, 'Ironing item must be second');
  assert.strictEqual(resAvail.items[2].id, item2.id, 'Washing item must be third');
  console.log('✓ Test 6 passed!');

  // Test 7: Season cycle
  console.log('Test 7: Season Cycle');
  const resSeasonCycle = await clothesService.list(user, { sort: 'season_cycle' });
  // Autunno (sortOrder 1), Inverno (2), Primavera (3)
  assert.strictEqual(resSeasonCycle.items[0].id, item2.id, 'Autunno item first');
  assert.strictEqual(resSeasonCycle.items[1].id, item1.id, 'Inverno item second');
  assert.strictEqual(resSeasonCycle.items[2].id, item3.id, 'Primavera item third');
  console.log('✓ Test 7 passed!');

  // Test 8: Season current (smart season)
  console.log('Test 8: Season Current (Smart Season)');
  const resSeasonCurrent = await clothesService.list(user, { sort: 'season_current' });
  // Today is November (Autunno), so item2 must be first
  assert.strictEqual(resSeasonCurrent.items[0].id, item2.id, 'Current season item must be first');
  console.log('✓ Test 8 passed!');

  await dataSource.destroy();
  console.log('🎉 ALL CLOTHES SORTING INTEGRATION TESTS PASSED! 🎉');
}

runSortingTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
