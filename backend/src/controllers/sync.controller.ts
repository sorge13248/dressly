import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { SyncPayloadDto, SyncResponseDto } from '../common/sync/sync.types';
import { SyncService } from '../services/sync.service';

@Controller('sync')
@UseGuards(BearerJwtGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  async sync(
    @CurrentUser() user: AuthUser,
    @Body() body: SyncPayloadDto,
  ): Promise<SyncResponseDto> {
    return this.syncService.sync(user, body);
  }

  @Get()
  async getSyncState(
    @CurrentUser() user: AuthUser,
    @Query('since') since?: string,
  ): Promise<SyncResponseDto> {
    return this.syncService.sync(user, { lastSyncAt: since ?? null });
  }
}

