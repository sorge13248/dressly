import { Module } from '@nestjs/common';
import { ClothesController } from '../controllers/clothes.controller';
import { ClothesService } from '../services/clothes.service';
import { ClothesPdfService } from '../services/clothes-pdf.service';
import { ClothesMigrationService } from '../services/clothes-migration.service';
import { ReferenceDataModule } from './reference-data.module';
import { StorageModule } from './storage.module';
import { LaundryModule } from './laundry.module';

@Module({
  imports: [ReferenceDataModule, StorageModule, LaundryModule],
  controllers: [ClothesController],
  providers: [ClothesService, ClothesPdfService, ClothesMigrationService],
  exports: [ClothesService, ClothesPdfService, ClothesMigrationService],
})
export class ClothesModule {}
