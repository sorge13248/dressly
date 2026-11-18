import { Injectable } from '@nestjs/common';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { IFileStorageProvider } from './storage-provider.interface';

@Injectable()
export class LocalDiskStorageProvider implements IFileStorageProvider {
  getUploadsRootDir(): string {
    const configured = process.env.UPLOADS_DIR?.trim();
    if (configured) {
      return path.resolve(configured);
    }
    return path.resolve(__dirname, '../../../uploads');
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

  async readFile(storedPath: string): Promise<Buffer> {
    const absPath = this.resolveAttachmentAbsolutePath(storedPath);
    return fs.readFile(absPath);
  }

  async saveFile(relativePath: string, buffer: Buffer): Promise<string> {
    const absPath = this.resolveAttachmentAbsolutePath(relativePath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, buffer);
    return absPath;
  }

  fileExists(storedPath: string): boolean {
    const absPath = this.resolveAttachmentAbsolutePath(storedPath);
    return existsSync(absPath);
  }

  async deleteFile(storedPath: string): Promise<void> {
    const absPath = this.resolveAttachmentAbsolutePath(storedPath);
    try {
      await fs.unlink(absPath);
    } catch {
      // Ignore if file was already removed
    }
  }
}
