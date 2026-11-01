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
import { OutfitsService } from './outfits.service';
import { ReferenceDataService } from './reference-data.service';
import { AuthUser } from '../common/auth/auth.types';

async function runOutfitTests() {
  console.log('--- Running OutfitsService Unit & Integration Tests ---');

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

  const user: AuthUser = {
    id: 'user-1',
    subject: 'sub-1',
    email: 'user@test.com',
    displayName: 'Test User',
    pictureUrl: null,
  };

  // Create user
  await dataSource.getRepository(User).save({
    id: user.id,
    subject: user.subject,
    email: user.email,
    displayName: user.displayName,
  });

  // Create clothes
  const clothesRepo = dataSource.getRepository(Clothes);
  const cloth1 = await clothesRepo.save({
    id: 'c1',
    userId: user.id,
    name: 'Camicia Oxford',
  });
  const cloth2 = await clothesRepo.save({
    id: 'c2',
    userId: user.id,
    name: 'Pantaloni Chino',
  });
  const cloth3 = await clothesRepo.save({
    id: 'c3',
    userId: user.id,
    name: 'Giacca Blu',
  });

  const referenceDataService = new ReferenceDataService(dataSource);
  const outfitsService = new OutfitsService(dataSource, referenceDataService);

  // Test 1: Create outfit
  console.log('Test 1: Create outfit with initial clothes');
  const created = await outfitsService.create(user, {
    name: 'Business Casual',
    clothesIds: [cloth1.id, cloth2.id],
  });
  assert.strictEqual(created.name, 'Business Casual');
  assert.strictEqual(created.clothesCount, 2);
  assert.strictEqual(created.clothes.length, 2);
  console.log('✓ Test 1 passed!');

  // Test 2: List outfits
  console.log('Test 2: List outfits');
  const list = await outfitsService.list(user);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].id, created.id);
  assert.strictEqual(list[0].clothesCount, 2);
  console.log('✓ Test 2 passed!');

  // Test 3: Get single outfit detail
  console.log('Test 3: Get one outfit');
  const single = await outfitsService.getOne(user, created.id);
  assert.strictEqual(single.id, created.id);
  assert.strictEqual(single.name, 'Business Casual');
  console.log('✓ Test 3 passed!');

  // Test 4: Add clothes to outfit
  console.log('Test 4: Add clothes to outfit');
  const withAdded = await outfitsService.addClothes(user, created.id, [cloth3.id]);
  assert.strictEqual(withAdded.clothesCount, 3);
  assert.ok(withAdded.clothes.some((c) => c.id === cloth3.id));
  console.log('✓ Test 4 passed!');

  // Test 5: Remove clothes from outfit
  console.log('Test 5: Remove clothes from outfit');
  const withRemoved = await outfitsService.removeClothes(user, created.id, cloth1.id);
  assert.strictEqual(withRemoved.clothesCount, 2);
  assert.ok(!withRemoved.clothes.some((c) => c.id === cloth1.id));
  console.log('✓ Test 5 passed!');

  // Test 6: Delete outfit
  console.log('Test 6: Delete outfit');
  const deleteRes = await outfitsService.remove(user, created.id);
  assert.strictEqual(deleteRes.deleted, true);
  const listAfterDelete = await outfitsService.list(user);
  assert.strictEqual(listAfterDelete.length, 0);

  // Clothes themselves should still exist!
  const remainingClothes = await clothesRepo.find();
  assert.strictEqual(remainingClothes.length, 3);
  console.log('✓ Test 6 passed!');

  // Test 7: Description, canvasLayout, seasons, temperatures, useCases
  console.log('Test 7: Outfit with description, canvasLayout, and context tags');
  const season = await dataSource.getRepository(Season).save({
    id: 's-primavera',
    userId: user.id,
    name: 'Primavera',
  });
  const temp = await dataSource.getRepository(Temperature).save({
    id: 't-mite',
    userId: user.id,
    name: 'Mite',
  });
  const useCase = await dataSource.getRepository(UseCase).save({
    id: 'u-lavoro',
    userId: user.id,
    name: 'Lavoro',
  });

  const outfitWithContext = await outfitsService.create(user, {
    name: 'Look Ufficio Primavera',
    description: 'Abbinamento fresco e professionale per mezze stagioni.',
    clothesIds: [cloth2.id, cloth3.id],
    season_ids: [season.id],
    temperature_ids: [temp.id],
    use_case_ids: [useCase.id],
    canvasLayout: {
      c2: { x: 50, y: 120, scale: 1 },
      c3: { x: 50, y: 20, scale: 1.1 },
    },
  });

  assert.strictEqual(outfitWithContext.name, 'Look Ufficio Primavera');
  assert.strictEqual(outfitWithContext.description, 'Abbinamento fresco e professionale per mezze stagioni.');
  assert.strictEqual(outfitWithContext.seasons.length, 1);
  assert.strictEqual(outfitWithContext.temperatures.length, 1);
  assert.strictEqual(outfitWithContext.useCases.length, 1);
  assert.deepStrictEqual(outfitWithContext.canvasLayout, {
    c2: { x: 50, y: 120, scale: 1 },
    c3: { x: 50, y: 20, scale: 1.1 },
  });

  // Update canvas layout and description
  const updatedOutfit = await outfitsService.update(user, outfitWithContext.id, {
    description: 'Nuova descrizione aggiornata',
    canvasLayout: {
      c2: { x: 60, y: 130, scale: 1 },
      c3: { x: 60, y: 25, scale: 1 },
    },
  });
  assert.strictEqual(updatedOutfit.description, 'Nuova descrizione aggiornata');
  assert.strictEqual(updatedOutfit.canvasLayout?.['c2']?.x, 60);
  console.log('✓ Test 7 passed!');

  // Test 8: Outfit attachment upload & deletion
  console.log('Test 8: Add and remove outfit attachment');
  // 1x1 transparent PNG buffer
  const samplePngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  const attachment = await outfitsService.addAttachment(
    user,
    updatedOutfit.id,
    {
      buffer: samplePngBuffer,
      originalname: 'selfie-outfit.png',
      mimetype: 'image/png',
      size: samplePngBuffer.length,
    },
    { kind: 'photo' },
  );
  assert.strictEqual(attachment.outfitId, updatedOutfit.id);
  assert.strictEqual(attachment.clothesId, null);

  const outfitWithAttachment = await outfitsService.getOne(user, updatedOutfit.id);
  assert.strictEqual(outfitWithAttachment.attachments.length, 1);

  const removeAttRes = await outfitsService.removeAttachment(user, updatedOutfit.id, attachment.id);
  assert.strictEqual(removeAttRes.deleted, true);

  const outfitWithoutAtt = await outfitsService.getOne(user, updatedOutfit.id);
  assert.strictEqual(outfitWithoutAtt.attachments.length, 0);
  console.log('✓ Test 8 passed!');

  // Cleanup
  await outfitsService.remove(user, updatedOutfit.id);

  await dataSource.destroy();
  console.log('🎉 ALL OUTFIT TESTS PASSED SUCCESSFULLY! 🎉');
}

runOutfitTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});

