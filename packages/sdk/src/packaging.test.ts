/**
 * Guards "zero runtime dependencies" on the built output, which is what customers
 * install. `verbatimModuleSyntax` alone does not: it permits value imports. Requires
 * `pnpm build` first, as CI does. See docs/adr/0008.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_BUSINESS_ID_LENGTH as CONTRACT_LIMIT } from '@ai-unit-economics/contracts';
import { describe, expect, it } from 'vitest';

import { MAX_BUSINESS_ID_LENGTH } from './limits.js';
import { SDK_NAME, SDK_VERSION } from './version.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

describe('packaging', () => {
  it('the built SDK never imports contracts or zod', () => {
    expect(existsSync(dist), 'dist missing: run pnpm build first').toBe(true);
    const files = readdirSync(dist).filter((f) => f.endsWith('.js') || f.endsWith('.d.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(dist, file), 'utf8');
      expect(source, file).not.toMatch(/from\s+['"](@ai-unit-economics\/contracts|zod)['"]/);
      expect(source, file).not.toMatch(/import\(\s*['"](@ai-unit-economics\/contracts|zod)['"]/);
    }
  });

  it('the duplicated id limit matches the contract', () => {
    expect(MAX_BUSINESS_ID_LENGTH).toBe(CONTRACT_LIMIT);
  });

  it('the reported SDK identity matches package.json', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
    };
    expect({ name: SDK_NAME, version: SDK_VERSION }).toEqual({
      name: pkg.name,
      version: pkg.version,
    });
  });
});
