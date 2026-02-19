declare module 'bun:test' {
  export const describe: ((name: string, fn: () => void) => void) & { skip: (name: string, fn: () => void) => void };
  export const test: ((name: string, fn: () => void | Promise<void>) => void) & {
    skip: (name: string, fn?: () => void | Promise<void>) => void;
  };
  export function expect(value: unknown): any;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
}

declare const Bun: {
  argv: string[];
  jest?: unknown;
};

interface ImportMeta {
  main: boolean;
}
