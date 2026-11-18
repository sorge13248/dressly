export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface IFileStorageProvider {
  /**
   * Returns the root uploads directory configured in environment or default.
   */
  getUploadsRootDir(): string;

  /**
   * Normalizes path slashes to POSIX standard.
   */
  normalizeStoredAttachmentPath(storedPath: string): string;

  /**
   * Resolves a stored relative attachment path to an absolute filesystem path.
   */
  resolveAttachmentAbsolutePath(storedPath: string): string;

  /**
   * Reads file contents from a stored path (relative or absolute).
   */
  readFile(storedPath: string): Promise<Buffer>;

  /**
   * Writes buffer to a destination path (creates parent directory if needed).
   */
  saveFile(relativePath: string, buffer: Buffer): Promise<string>;

  /**
   * Checks whether a file exists.
   */
  fileExists(storedPath: string): boolean;

  /**
   * Safely deletes a file from storage.
   */
  deleteFile(storedPath: string): Promise<void>;
}
