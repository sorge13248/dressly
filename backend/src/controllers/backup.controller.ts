import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/auth/auth.types';
import { BackupService, BackupStatsDto, RestoreResultDto } from '../services/backup.service';

interface ResponseWriter {
  setHeader(name: string, value: string | number): void;
  end(data?: Buffer): void;
}

interface UploadedFilePayload {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Controller('backup')
@UseGuards(BearerJwtGuard)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('stats')
  async getStats(@CurrentUser() user: AuthUser): Promise<BackupStatsDto> {
    return this.backupService.getBackupStats(user);
  }

  @Get('export')
  async exportBackup(@CurrentUser() user: AuthUser, @Res() res: ResponseWriter): Promise<void> {
    const { buffer, filename } = await this.backupService.exportBackup(user);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Post('restore')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB ceiling for large wardrobes
    }),
  )
  async restoreBackup(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedFilePayload | undefined,
    @Query('mode') modeQuery?: string,
  ): Promise<RestoreResultDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Nessun file ZIP caricato per il ripristino');
    }

    const mode: 'replace' | 'merge' = modeQuery === 'merge' ? 'merge' : 'replace';
    return this.backupService.restoreBackup(user, file.buffer, mode);
  }
}
