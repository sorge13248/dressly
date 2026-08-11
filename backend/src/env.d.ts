declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};

declare module 'node:path' {
  export function resolve(...segments: string[]): string;
}

declare module 'dotenv' {
  export function config(options?: { path?: string }): { parsed?: Record<string, string> };
}