import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import sharp from 'sharp';
import { Attachment } from '../../entities/attachment.entity';
import {
  createImagePreview,
  ensureAttachmentPreview,
  resolveAttachmentFile,
  resolvePreviewRelativePath,
} from './attachment-preview.util';

async function runTests() {
  console.log('--- Running Attachment Preview Utility Unit Tests ---');

  const testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dressly-preview-util-test-'));

  try {
    // Generate a test 1000x800 PNG image
    const sourceImageBuffer = await sharp({
      create: {
        width: 1000,
        height: 800,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .png()
      .toBuffer();

    // Test 1: createImagePreview generates a WebP image with max dimension 640
    console.log('Test 1: createImagePreview downscales to 640x640 inside webp');
    const previewBuf = await createImagePreview(sourceImageBuffer);
    const meta = await sharp(previewBuf).metadata();
    if (meta.format !== 'webp') {
      throw new Error(`Expected webp format, got ${meta.format}`);
    }
    if ((meta.width ?? 0) > 640 || (meta.height ?? 0) > 640) {
      throw new Error(`Expected dimensions <= 640, got ${meta.width}x${meta.height}`);
    }
    console.log('✓ Test 1 passed!');

    // Test 2: resolvePreviewRelativePath
    console.log('Test 2: resolvePreviewRelativePath');
    const mockAttachment = {
      id: 'att-123',
      path: 'clothes/user-1/cloth-99/orig.jpg',
      previewPath: null,
    } as unknown as Attachment;
    const computed = resolvePreviewRelativePath(mockAttachment);
    if (computed !== 'clothes/user-1/cloth-99/att-123.preview.webp') {
      throw new Error(`Unexpected computed preview path: ${computed}`);
    }

    const explicitAttachment = {
      id: 'att-123',
      path: 'clothes/user-1/cloth-99/orig.jpg',
      previewPath: 'custom/path/preview.webp',
    } as unknown as Attachment;
    if (resolvePreviewRelativePath(explicitAttachment) !== 'custom/path/preview.webp') {
      throw new Error('Did not respect explicit previewPath');
    }
    console.log('✓ Test 2 passed!');

    // Test 3: ensureAttachmentPreview generates preview when missing and saves to disk
    console.log('Test 3: ensureAttachmentPreview generates missing preview on demand');
    const origRelPath = 'clothes/user-1/cloth-1/orig.png';
    const origAbsPath = path.join(testTempDir, origRelPath);
    await fs.mkdir(path.dirname(origAbsPath), { recursive: true });
    await fs.writeFile(origAbsPath, sourceImageBuffer);

    let persistedPath: string | null = null;
    const testAttachment = {
      id: 'att-real-1',
      userId: 'user-1',
      clothesId: 'cloth-1',
      outfitId: null,
      fileName: 'orig.png',
      mimeType: 'image/png',
      path: origRelPath,
      previewPath: null,
    } as unknown as Attachment;

    const resolveAbs = (rel: string) => path.join(testTempDir, rel);

    const generated = await ensureAttachmentPreview({
      attachment: testAttachment,
      resolveAbsolutePath: resolveAbs,
      onPreviewPersisted: async (rel) => {
        persistedPath = rel;
      },
    });

    if (!generated) {
      throw new Error('Expected ensureAttachmentPreview to return generated preview');
    }
    if (persistedPath !== 'clothes/user-1/cloth-1/att-real-1.preview.webp') {
      throw new Error(`Unexpected persisted path: ${persistedPath}`);
    }

    // Check file exists on disk
    const onDisk = await fs.readFile(generated.absolutePath);
    if (onDisk.length !== generated.buffer.length) {
      throw new Error('On disk preview length does not match buffer');
    }
    console.log('✓ Test 3 passed!');

    // Test 4: ensureAttachmentPreview reads existing preview from disk without re-encoding
    console.log('Test 4: ensureAttachmentPreview reads existing preview from disk');
    let persistCalled = false;
    const cached = await ensureAttachmentPreview({
      attachment: { ...testAttachment, previewPath: persistedPath } as unknown as Attachment,
      resolveAbsolutePath: resolveAbs,
      onPreviewPersisted: async () => {
        persistCalled = true;
      },
    });
    if (!cached || cached.buffer.length !== generated.buffer.length) {
      throw new Error('Expected cached preview to match previously generated preview');
    }
    if (persistCalled) {
      throw new Error('onPreviewPersisted should not be called when preview already exists');
    }
    console.log('✓ Test 4 passed!');

    // Test 5: resolveAttachmentFile for preview and master
    console.log('Test 5: resolveAttachmentFile variant=preview and default');
    const previewResult = await resolveAttachmentFile({
      attachment: testAttachment,
      variant: 'preview',
      resolveAbsolutePath: resolveAbs,
    });
    if (previewResult.mimeType !== 'image/webp' || !previewResult.fileName.endsWith('.preview.webp')) {
      throw new Error(`Unexpected preview result: ${JSON.stringify(previewResult)}`);
    }

    const masterResult = await resolveAttachmentFile({
      attachment: testAttachment,
      variant: undefined,
      resolveAbsolutePath: resolveAbs,
    });
    if (masterResult.mimeType !== 'image/png' || masterResult.fileName !== 'orig.png') {
      throw new Error(`Unexpected master result: ${JSON.stringify(masterResult)}`);
    }
    console.log('✓ Test 5 passed!');

    // Test 6: resolveAttachmentFile throws NotFoundException if file does not exist
    console.log('Test 6: resolveAttachmentFile throws NotFoundException if missing');
    const ghostAttachment = {
      id: 'att-ghost',
      fileName: 'ghost.png',
      mimeType: 'image/png',
      path: 'non-existent/file.png',
      previewPath: null,
    } as unknown as Attachment;

    let threw = false;
    try {
      await resolveAttachmentFile({
        attachment: ghostAttachment,
        resolveAbsolutePath: resolveAbs,
      });
    } catch {
      threw = true;
    }
    if (!threw) {
      throw new Error('Expected NotFoundException when file is missing');
    }
    console.log('✓ Test 6 passed!');

    console.log('🎉 ALL ATTACHMENT PREVIEW UTIL TESTS PASSED! 🎉');
  } finally {
    await fs.rm(testTempDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
