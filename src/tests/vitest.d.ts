import 'vitest';

declare module 'vitest' {
  interface TaskMeta {
    coverageUnavailable?: string;
  }
}
