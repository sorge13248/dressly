import { Module } from '@nestjs/common';
import { LaundryService } from '../services/laundry.service';

@Module({
  providers: [LaundryService],
  exports: [LaundryService],
})
export class LaundryModule {}
