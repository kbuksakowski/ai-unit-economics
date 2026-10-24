import { defineConfig } from 'vitest/config';

// Nest resolves constructor dependencies from `design:paramtypes`. Vite's default
// transform neither parses legacy decorators nor emits that metadata, so both are turned
// on here, matching tsconfig.json.
export default defineConfig({
  oxc: {
    decorator: { legacy: true, emitDecoratorMetadata: true },
  },
  test: {
    globalSetup: ['./test/global-setup.ts'],
  },
});
