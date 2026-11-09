import { AttachmentItem } from '../../core/models';
import { getPrimaryAttachment, sortAttachments } from './attachment.utils';

describe('attachment.utils', () => {
  const makeAttachment = (overrides: Partial<AttachmentItem>): AttachmentItem => ({
    id: 'att-1',
    userId: 'u-1',
    clothesId: 'c-1',
    kind: 'photo',
    fileName: 'att.webp',
    originalName: 'att.jpg',
    mimeType: 'image/webp',
    size: 1024,
    sortOrder: 0,
    path: 'clothes/u-1/c-1/att.webp',
    previewPath: 'clothes/u-1/c-1/att.preview.webp',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  });

  describe('sortAttachments', () => {
    it('should sort attachments by sortOrder ASC', () => {
      const a1 = makeAttachment({ id: 'a1', sortOrder: 2 });
      const a2 = makeAttachment({ id: 'a2', sortOrder: 0 });
      const a3 = makeAttachment({ id: 'a3', sortOrder: 1 });

      const result = sortAttachments([a1, a2, a3]);
      expect(result.map((a) => a.id)).toEqual(['a2', 'a3', 'a1']);
    });

    it('should break ties using createdAt ASC', () => {
      const a1 = makeAttachment({ id: 'a1', sortOrder: 0, createdAt: '2026-01-01T12:00:00.000Z' });
      const a2 = makeAttachment({ id: 'a2', sortOrder: 0, createdAt: '2026-01-01T10:00:00.000Z' });

      const result = sortAttachments([a1, a2]);
      expect(result.map((a) => a.id)).toEqual(['a2', 'a1']);
    });

    it('should handle undefined or missing sortOrder safely', () => {
      const a1 = makeAttachment({ id: 'a1', sortOrder: undefined });
      const a2 = makeAttachment({ id: 'a2', sortOrder: -1 });

      const result = sortAttachments([a1, a2]);
      expect(result.map((a) => a.id)).toEqual(['a2', 'a1']);
    });
  });

  describe('getPrimaryAttachment', () => {
    it('should return null when item is null or has no attachments', () => {
      expect(getPrimaryAttachment(null)).toBeNull();
      expect(getPrimaryAttachment({})).toBeNull();
      expect(getPrimaryAttachment({ attachments: [] })).toBeNull();
    });

    it('should select primary image according to sortOrder even if array is unsorted', () => {
      const secondaryPhoto = makeAttachment({
        id: 'secondary',
        sortOrder: 1,
        mimeType: 'image/jpeg',
      });
      const primaryPhoto = makeAttachment({
        id: 'primary',
        sortOrder: 0,
        mimeType: 'image/webp',
      });

      // Pass array where secondary comes first
      const item = { attachments: [secondaryPhoto, primaryPhoto] };
      const result = getPrimaryAttachment(item);

      expect(result?.id).toBe('primary');
    });

    it('should prefer image attachments over non-image attachments', () => {
      const doc = makeAttachment({
        id: 'doc',
        sortOrder: 0,
        mimeType: 'application/pdf',
      });
      const photo = makeAttachment({
        id: 'photo',
        sortOrder: 1,
        mimeType: 'image/jpeg',
      });

      const item = { attachments: [doc, photo] };
      const result = getPrimaryAttachment(item);

      expect(result?.id).toBe('photo');
    });

    it('should fall back to first attachment if no image attachment exists', () => {
      const doc1 = makeAttachment({
        id: 'doc1',
        sortOrder: 2,
        mimeType: 'application/pdf',
      });
      const doc2 = makeAttachment({
        id: 'doc2',
        sortOrder: 1,
        mimeType: 'application/pdf',
      });

      const item = { attachments: [doc1, doc2] };
      const result = getPrimaryAttachment(item);

      expect(result?.id).toBe('doc2');
    });
  });
});
