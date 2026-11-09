import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpStatus,
  Post,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MulterError, StorageEngine } from 'multer';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import { BearerJwtGuard } from '../common/auth/bearer-jwt.guard';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/auth/auth.types';
import { BackupService, BackupStatsDto, RestoreResultDto } from '../services/backup.service';

interface ResponseWriter {
  setHeader(name: string, value: string | number): void;
  end(data?: Buffer): void;
}

interface UploadedFilePayload {
  path?: string;
  buffer?: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const MAX_BACKUP_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB ceiling for large photographic wardrobes

export class SafeBackupDiskStorage implements StorageEngine {
  constructor(private readonly getDestination: () => string) {}

  _handleFile(
    req: unknown,
    file: { stream: NodeJS.ReadableStream; originalname: string },
    cb: (error?: unknown, info?: Partial<UploadedFilePayload>) => void,
  ): void {
    const ext = path.extname(file.originalname) || '.zip';
    const filename = `dressly-restore-${randomUUID()}${ext}`;
    const destination = this.getDestination();
    const finalPath = path.join(destination, filename);
    const outStream = createWriteStream(finalPath);

    let finished = false;

    const cleanup = () => {
      if (!finished) {
        finished = true;
        outStream.destroy();
        fs.unlink(finalPath).catch(() => {});
      }
    };

    // Client connection aborted or closed before request body was fully received
    const nodeReq = req as { once?: (event: string, listener: () => void) => void; complete?: boolean };
    if (typeof nodeReq?.once === 'function') {
      nodeReq.once('aborted', cleanup);
      nodeReq.once('close', () => {
        if (!nodeReq.complete) {
          cleanup();
        }
      });
    }

    file.stream.pipe(outStream);

    outStream.on('error', (err) => {
      cleanup();
      cb(err);
    });

    outStream.on('finish', () => {
      finished = true;
      cb(null, {
        path: finalPath,
        size: outStream.bytesWritten,
      });
    });
  }

  _removeFile(_req: unknown, file: { path?: string }, cb: (error: Error | null) => void): void {
    if (file?.path) {
      fs.unlink(file.path)
        .then(() => cb(null))
        .catch((err) => cb(err));
    } else {
      cb(null);
    }
  }
}

@Catch(MulterError)
export class BackupMulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let message = exception.message;
    if (exception.code === 'LIMIT_FILE_SIZE') {
      message = 'Il file di backup supera la dimensione massima consentita di 2 GB.';
    }

    response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message,
      error: 'Payload Too Large',
    });
  }
}

@Controller('backup')
@UseGuards(BearerJwtGuard)
@UseFilters(BackupMulterExceptionFilter)
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
      storage: new SafeBackupDiskStorage(() => os.tmpdir()),
      limits: { fileSize: MAX_BACKUP_FILE_SIZE_BYTES },
    }),
  )
  async restoreBackup(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedFilePayload | undefined,
    @Query('mode') modeQuery?: string,
  ): Promise<RestoreResultDto> {
    if (!file || (!file.path && !file.buffer)) {
      throw new BadRequestException('Nessun file ZIP caricato per il ripristino');
    }

    const mode: 'replace' | 'merge' = modeQuery === 'merge' ? 'merge' : 'replace';
    const zipSource = file.path || file.buffer!;

    try {
      return await this.backupService.restoreBackup(user, zipSource, mode);
    } finally {
      if (file.path) {
        await fs.unlink(file.path).catch(() => {});
      }
    }
  }
}
