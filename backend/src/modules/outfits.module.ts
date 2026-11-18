import { Module } from '@nestjs/common';
import { OutfitsController } from '../controllers/outfits.controller';
import { OutfitsService } from '../services/outfits.service';
import { StorageModule } from './storage.module';
import { ReferenceDataModule } from './reference-data.module';

@Module({
  imports: [StorageModule, ReferenceDataModule],
  controllers: [OutfitsController],
  providers: [OutfitsService],
  exports: [OutfitsService],
})
export class OutfitsModule {}
