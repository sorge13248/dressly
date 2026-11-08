import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Attachment } from '../entities/attachment.entity';

export interface CleanupStats {
  removedFiles: number;
  freedBytes: number;
  removedDirectories: number;
}

@Injectable()
export class StorageCleanupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StorageCleanupService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    await this.cleanupOrphans();
  }

  getUploadsRootDir(): string {
    const configured = process.env.UPLOADS_DIR?.trim();
    if (configured) {
      return path.resolve(configured);
    }
    return path.resolve(__dirname, '../../uploads');
  }

  normalizeStoredAttachmentPath(storedPath: string): string {
    return storedPath.replace(/\\/g, '/');
  }

  resolveAttachmentAbsolutePath(storedPath: string): string {
    if (path.isAbsolute(storedPath)) {
      return storedPath;
    }

    const uploadsRootDir = this.getUploadsRootDir();
    const normalizedStoredPath = this.normalizeStoredAttachmentPath(storedPath);

    // Backward compatibility for older rows saved as "uploads/...".
    if (normalizedStoredPath.startsWith('uploads/')) {
      return path.join(uploadsRootDir, normalizedStoredPath.slice('uploads/'.length));
    }

    return path.join(uploadsRootDir, normalizedStoredPath);
  }

  async deleteAttachmentFiles(attachment: { path: string; previewPath?: string | null }): Promise<void> {
    if (attachment.path) {
      const absolutePath = this.resolveAttachmentAbsolutePath(attachment.path);
      try {
        await fs.unlink(absolutePath);
      } catch {
        // Keep delete idempotent even if file is missing
      }
    }

    if (attachment.previewPath) {
      const absolutePreviewPath = this.resolveAttachmentAbsolutePath(attachment.previewPath);
      try {
        await fs.unlink(absolutePreviewPath);
      } catch {
        // Keep delete idempotent even if preview is missing
      }
    }
  }

  async deleteClothesFolder(userId: string, clothesId: string): Promise<void> {
    const folderPath = path.join(this.getUploadsRootDir(), 'clothes', userId, clothesId);
    try {
      await fs.rm(folderPath, { recursive: true, force: true });
    } catch {
      // Idempotent
    }
  }

  async deleteOutfitFolder(userId: string, outfitId: string): Promise<void> {
    const folderPath = path.join(this.getUploadsRootDir(), 'outfits', userId, outfitId);
    try {
      await fs.rm(folderPath, { recursive: true, force: true });
    } catch {
      // Idempotent
    }
  }

  async cleanupOrphans(): Promise<CleanupStats> {
    const stats: CleanupStats = {
      removedFiles: 0,
      freedBytes: 0,
      removedDirectories: 0,
    };

    const uploadsRootDir = this.getUploadsRootDir();
    if (!existsSync(uploadsRootDir)) {
      this.logger.log(`Uploads root directory does not exist (${uploadsRootDir}); skipping orphan cleanup.`);
      return stats;
    }

    // Failsafe: Query all active attachments from DB
    let attachments: Attachment[];
    try {
      const attachmentRepo = this.dataSource.getRepository(Attachment);
      attachments = await attachmentRepo.find();
    } catch (error) {
      this.logger.error(
        `Failed to query attachments from database. Aborting orphan cleanup to prevent accidental file deletion: ${String(error)}`,
      );
      return stats;
    }

    const validAbsolutePaths = new Set<string>();
    for (const att of attachments) {
      if (att.path) {
        validAbsolutePaths.add(path.resolve(this.resolveAttachmentAbsolutePath(att.path)));
      }
      if (att.previewPath) {
        validAbsolutePaths.add(path.resolve(this.resolveAttachmentAbsolutePath(att.previewPath)));
      }
    }

    // Recursively scan all files under uploadsRootDir and unlink any orphan
    await this.scanAndCleanOrphans(uploadsRootDir, validAbsolutePaths, stats);

    // Prune empty directories, preserving base directories
    const subEntries = await fs.readdir(uploadsRootDir, { withFileTypes: true }).catch(() => []);
    for (const entry of subEntries) {
      if (entry.isDirectory()) {
        const topLevelDir = path.join(uploadsRootDir, entry.name);
        await this.pruneEmptyDirectories(topLevelDir, topLevelDir, stats);
      }
    }

    if (stats.removedFiles > 0 || stats.removedDirectories > 0) {
      this.logger.log(
        `Storage cleanup completed: removed ${stats.removedFiles} orphan file(s) (${this.formatBytes(stats.freedBytes)}) and pruned ${stats.removedDirectories} empty director(y/ies).`,
      );
    } else {
      this.logger.log('Storage cleanup check: no orphan files found.');
    }

    return stats;
  }

  private async scanAndCleanOrphans(
    currentDir: string,
    validAbsolutePaths: Set<string>,
    stats: CleanupStats,
  ): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await this.scanAndCleanOrphans(fullPath, validAbsolutePaths, stats);
      } else if (entry.isFile()) {
        const resolvedPath = path.resolve(fullPath);
        if (!validAbsolutePaths.has(resolvedPath)) {
          try {
            const fileStat = await fs.stat(resolvedPath);
            await fs.unlink(resolvedPath);
            stats.removedFiles += 1;
            stats.freedBytes += fileStat.size;
            this.logger.debug(`Deleted orphan file: ${resolvedPath} (${fileStat.size} bytes)`);
          } catch (err) {
            this.logger.warn(`Failed to delete orphan file ${resolvedPath}: ${String(err)}`);
          }
        }
      }
    }
  }

  private async pruneEmptyDirectories(
    currentDir: string,
    preservedRoot: string,
    stats: CleanupStats,
  ): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = path.join(currentDir, entry.name);
        await this.pruneEmptyDirectories(subDir, preservedRoot, stats);
      }
    }

    if (currentDir !== preservedRoot) {
      const remaining = await fs.readdir(currentDir).catch(() => ['error']);
      if (remaining.length === 0) {
        try {
          await fs.rmdir(currentDir);
          stats.removedDirectories += 1;
          this.logger.debug(`Pruned empty directory: ${currentDir}`);
        } catch {
          // Ignore if directory cannot be removed
        }
      }
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }
}
