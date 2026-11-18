import { Module } from '@nestjs/common';
import { ReferenceDataController } from '../controllers/reference-data.controller';
import { ReferenceDataService } from '../services/reference-data.service';

@Module({
  controllers: [ReferenceDataController],
  providers: [ReferenceDataService],
  exports: [ReferenceDataService],
})
export class ReferenceDataModule {}
