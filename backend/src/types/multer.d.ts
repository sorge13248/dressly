declare module 'multer' {
  export interface StorageEngine {
    _handleFile(req: unknown, file: unknown, cb: (error?: unknown, info?: unknown) => void): void;
    _removeFile(req: unknown, file: unknown, cb: (error: Error | null) => void): void;
  }

  export interface DiskStorageOptions {
    destination?: string | ((req: unknown, file: { originalname: string }, cb: (error: Error | null, destination: string) => void) => void);
    filename?: (req: unknown, file: { originalname: string }, cb: (error: Error | null, filename: string) => void) => void;
  }

  export function diskStorage(options: DiskStorageOptions): StorageEngine;

  export class MulterError extends Error {
    name: string;
    code: string;
    message: string;
    field?: string;
  }
}
