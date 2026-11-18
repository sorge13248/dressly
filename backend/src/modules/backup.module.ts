import { Module } from '@nestjs/common';
import { BackupController } from '../controllers/backup.controller';
import { BackupService } from '../services/backup.service';
import { ClothesModule } from './clothes.module';
import { ReferenceDataModule } from './reference-data.module';
import { StorageModule } from './storage.module';

@Module({
  imports: [ClothesModule, ReferenceDataModule, StorageModule],
  controllers: [BackupController],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
