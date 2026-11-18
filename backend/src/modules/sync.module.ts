import { Module } from '@nestjs/common';
import { SyncController } from '../controllers/sync.controller';
import { SyncService } from '../services/sync.service';
import { ReferenceDataModule } from './reference-data.module';
import { StorageModule } from './storage.module';

@Module({
  imports: [ReferenceDataModule, StorageModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
