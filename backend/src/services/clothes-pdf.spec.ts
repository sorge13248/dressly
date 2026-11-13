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

async function runPdfTests() {
  console.log('--- Running ClothesService PDF Export Tests ---');

  const testUploadsDir = path.join(process.cwd(), 'test-uploads-pdf');
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

  const userA: AuthUser = { id: 'pdf-user-a', email: 'usera@example.com' };
  const userB: AuthUser = { id: 'pdf-user-b', email: 'userb@example.com' };

  await dataSource.getRepository(User).save([
    { id: userA.id, subject: userA.id, email: userA.email, displayName: 'User A' },
    { id: userB.id, subject: userB.id, email: userB.email, displayName: 'User B' },
  ]);

  const referenceDataService = new ReferenceDataService(dataSource);
  const clothesService = new ClothesService(dataSource, referenceDataService);

  // Setup sample domains
  const [brand] = await dataSource.getRepository(Brand).save([{ userId: userA.id, name: 'Ralph Lauren' }]);
  const [type] = await dataSource.getRepository(Type).save([{ userId: userA.id, name: 'Camicia' }]);
  const [color] = await dataSource.getRepository(Color).save([{ userId: userA.id, name: 'Celeste', hexCode: '#38bdf8' }]);
  const [season] = await dataSource.getRepository(Season).save([{ userId: userA.id, name: 'Primavera', icon: '🌸' }]);
  const [temp] = await dataSource.getRepository(Temperature).save([{ userId: userA.id, name: 'Mite (15-22°C)' }]);
  const [useCase] = await dataSource.getRepository(UseCase).save([{ userId: userA.id, name: 'Lavoro' }]);
  const [material] = await dataSource.getRepository(Material).save([{ userId: userA.id, name: 'Cotone' }]);
  const [tag] = await dataSource.getRepository(Tag).save([{ userId: userA.id, name: 'elegante' }]);

  try {
    // Test 1: Generate PDF for a cloth with no attachments
    console.log('Test 1: Generate PDF for cloth without photos');
    const cloth1 = await clothesService.create(userA, {
      name: 'Camicia Oxford Celeste',
      size: 'L',
      brand_id: brand.id,
      type_id: type.id,
      color_ids: [color.id],
      season_ids: [season.id],
      temperature_ids: [temp.id],
      use_case_ids: [useCase.id],
      material_ids: [material.id],
      tag_ids: [tag.id],
      notes: 'Lavare con cura a 30 gradi.',
      washingInstruction: {
        washType: 'washer_ok',
        washing_temperature: 30,
        bleachType: 'no_bleach',
      },
      ironingInstruction: {
        ironType: 'yes',
        ironing_temperature: 2,
        inside_out: true,
      },
      dryingInstruction: {
        tumbleDry: false,
        method: 'air_dry',
      },
      buyDetail: {
        store: 'Boutique Milano',
        price: 89,
        purchaseDate: '2026-05-15',
      },
    });

    const pdfResult1 = await clothesService.generateClothPdf(userA, cloth1.id);
    assert.ok(pdfResult1.buffer instanceof Buffer);
    assert.ok(pdfResult1.buffer.length > 1000, 'PDF buffer should be larger than 1KB');
    // PDF files always start with %PDF-
    const header1 = pdfResult1.buffer.subarray(0, 5).toString('ascii');
    assert.strictEqual(header1, '%PDF-', 'Buffer must start with %PDF-');
    assert.ok(pdfResult1.filename.endsWith('.pdf'), 'Filename must end with .pdf');
    assert.ok(pdfResult1.filename.includes(cloth1.code), 'Filename should contain tag code');
    console.log(`✓ Test 1 passed! Generated PDF size: ${pdfResult1.buffer.length} bytes, file: ${pdfResult1.filename}`);

    // Test 2: Generate PDF for cloth WITH primary and secondary photos
    console.log('Test 2: Generate PDF for cloth with attachments');
    const clothDir = path.join(testUploadsDir, 'clothes', userA.id, cloth1.id);
    await fs.mkdir(clothDir, { recursive: true });

    // Generate a dummy image with sharp
    const dummyImg = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 56, g: 189, b: 248 } },
    }).png().toBuffer();

    const photoFile = 'primary.png';
    const photoPath = path.join(clothDir, photoFile);
    await fs.writeFile(photoPath, dummyImg);

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

    const pdfResult2 = await clothesService.generateClothPdf(userA, cloth1.id);
    assert.ok(pdfResult2.buffer.length > pdfResult1.buffer.length, 'PDF with photo should be larger than without photo');
    const header2 = pdfResult2.buffer.subarray(0, 5).toString('ascii');
    assert.strictEqual(header2, '%PDF-');
    console.log(`✓ Test 2 passed! Generated PDF with image size: ${pdfResult2.buffer.length} bytes`);

    // Test 3: Unauthorized user cannot generate PDF
    console.log('Test 3: Authorization check for user B');
    let threw = false;
    try {
      await clothesService.generateClothPdf(userB, cloth1.id);
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, true, 'User B must not be able to generate PDF of user A cloth');
    console.log('✓ Test 3 passed!');

    console.log('🎉 ALL CLOTHES PDF EXPORT TESTS PASSED! 🎉');
  } finally {
    await dataSource.destroy();
    await fs.rm(testUploadsDir, { recursive: true, force: true }).catch(() => {});
  }
}

runPdfTests().catch((err) => {
  console.error('PDF tests failed:', err);
  process.exit(1);
});
