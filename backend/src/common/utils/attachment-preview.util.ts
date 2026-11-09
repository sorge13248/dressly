import { NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import { Attachment } from '../../entities/attachment.entity';

export const PREVIEW_IMAGE_MAX_DIMENSION = 640;
export const PREVIEW_IMAGE_QUALITY = 80;

/**
 * Generates an auto-rotated, downscaled WebP preview buffer from an image buffer.
 */
export async function createImagePreview(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({
      width: PREVIEW_IMAGE_MAX_DIMENSION,
      height: PREVIEW_IMAGE_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: PREVIEW_IMAGE_QUALITY })
    .toBuffer();
}

/**
 * Computes the relative storage path for an attachment's preview file.
 * Defaults to `${dir}/${attachment.id}.preview.webp` if `attachment.previewPath` is not set.
 */
export function resolvePreviewRelativePath(
  attachment: Pick<Attachment, 'id' | 'path' | 'previewPath'>,
): string {
  if (attachment.previewPath) {
    return attachment.previewPath;
  }
  const normalized = attachment.path.replace(/\\/g, '/');
  return path.posix.join(path.posix.dirname(normalized), `${attachment.id}.preview.webp`);
}

export interface EnsureAttachmentPreviewOptions {
  attachment: Attachment;
  resolveAbsolutePath: (relativePath: string) => string;
  onPreviewPersisted?: (previewRelPath: string) => Promise<void> | void;
}

export interface EnsureAttachmentPreviewResult {
  buffer: Buffer;
  relativePath: string;
  absolutePath: string;
}

/**
 * Ensures that the preview WebP file for an attachment exists on disk.
 * If present, reads and returns it. If missing, dynamically regenerates it
 * from the original photo on disk, writes it to the file system, updates
 * the previewPath via callback if necessary, and returns the buffer.
 *
 * Returns null if the attachment is not an image or if regeneration fails.
 */
export async function ensureAttachmentPreview(
  options: EnsureAttachmentPreviewOptions,
): Promise<EnsureAttachmentPreviewResult | null> {
  const { attachment, resolveAbsolutePath, onPreviewPersisted } = options;
  const previewRelPath = resolvePreviewRelativePath(attachment);
  const absPreviewPath = resolveAbsolutePath(previewRelPath);

  // 1. Try reading existing preview on disk
  try {
    const buffer = await fs.readFile(absPreviewPath);
    return { buffer, relativePath: previewRelPath, absolutePath: absPreviewPath };
  } catch {
    // 2. Preview missing on disk: dynamically regenerate from original photo
    try {
      const originalAbsPath = resolveAbsolutePath(attachment.path);
      const originalBuffer = await fs.readFile(originalAbsPath);
      const previewBuffer = await createImagePreview(originalBuffer);

      await fs.mkdir(path.dirname(absPreviewPath), { recursive: true });
      await fs.writeFile(absPreviewPath, previewBuffer);

      if (attachment.previewPath !== previewRelPath && onPreviewPersisted) {
        await onPreviewPersisted(previewRelPath);
      }

      return { buffer: previewBuffer, relativePath: previewRelPath, absolutePath: absPreviewPath };
    } catch {
      return null;
    }
  }
}

export interface ResolvedAttachmentFile {
  content: Buffer;
  fileName: string;
  mimeType: string;
}

export interface ResolveAttachmentFileOptions {
  attachment: Attachment;
  variant?: string;
  resolveAbsolutePath: (relativePath: string) => string;
  onPreviewPersisted?: (previewRelPath: string) => Promise<void> | void;
}

/**
 * Resolves an attachment file for streaming to HTTP clients.
 * When `variant === 'preview'`, attempts to serve or regenerate the preview thumbnail.
 * Falls back to the master attachment file if preview generation is impossible or not requested.
 */
export async function resolveAttachmentFile(
  options: ResolveAttachmentFileOptions,
): Promise<ResolvedAttachmentFile> {
  const { attachment, variant, resolveAbsolutePath, onPreviewPersisted } = options;

  if (variant === 'preview') {
    const previewResult = await ensureAttachmentPreview({
      attachment,
      resolveAbsolutePath,
      onPreviewPersisted,
    });

    if (previewResult) {
      return {
        content: previewResult.buffer,
        fileName: `${attachment.id}.preview.webp`,
        mimeType: 'image/webp',
      };
    }
  }

  // Master file resolution (or fallback when preview generation fails)
  const originalAbsPath = resolveAbsolutePath(attachment.path);
  try {
    const content = await fs.readFile(originalAbsPath);
    return {
      content,
      fileName: attachment.originalName || attachment.fileName,
      mimeType: attachment.mimeType || 'application/octet-stream',
    };
  } catch {
    throw new NotFoundException();
  }
}
