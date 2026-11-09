import { AttachmentItem } from '../../core/models';

/**
 * Deterministically sorts attachment items by `sortOrder ASC`,
 * using `createdAt ASC` as tie-breaker.
 */
export function sortAttachments<T extends { sortOrder?: number | null; createdAt?: string | null }>(attachments: T[]): T[] {
  return [...attachments].sort((a, b) => {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) {
      return orderDiff;
    }
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });
}

/**
 * Returns the primary attachment from an item's attachments list:
 * prefers the first image attachment ordered by `sortOrder ASC` (and `createdAt ASC`).
 * Falls back to the first non-image attachment in sortOrder, or null if empty.
 */
export function getPrimaryAttachment(item: { attachments?: AttachmentItem[] | null } | null | undefined): AttachmentItem | null {
  if (!item?.attachments || item.attachments.length === 0) {
    return null;
  }
  const sorted = sortAttachments(item.attachments);
  const imageAttachment = sorted.find((attachment) => attachment.mimeType?.startsWith('image/'));
  return imageAttachment ?? sorted[0] ?? null;
}
