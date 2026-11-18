import { Module } from '@nestjs/common';
import { StorageCleanupService } from '../services/storage-cleanup.service';
import { STORAGE_PROVIDER } from '../common/storage/storage-provider.interface';
import { LocalDiskStorageProvider } from '../common/storage/local-disk-storage.provider';

@Module({
  providers: [
    StorageCleanupService,
    LocalDiskStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      useClass: LocalDiskStorageProvider,
    },
  ],
  exports: [StorageCleanupService, LocalDiskStorageProvider, STORAGE_PROVIDER],
})
export class StorageModule {}
