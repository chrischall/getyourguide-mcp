// Invariant: `npm publish` must never ship a tarball without dist/.
//
// Why this exists: getyourguide-mcp@1.0.0 reached npm without dist/
// (bin points at dist/index.js, so the published package couldn't
// start at all — issue #11). The CI publish path builds explicitly,
// but a manual `npm publish` from an unbuilt checkout had no guard.
// `prepublishOnly` closes that hole: npm runs it before every publish,
// so the build (tsc emits dist/index.js, esbuild emits dist/bundle.js)
// is guaranteed to have produced the files `bin` and `files` promise.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(
  readFileSync(join(ROOT, 'package.json'), 'utf8')
) as { scripts?: Record<string, string>; files?: string[]; bin?: Record<string, string> };

describe('publish guard', () => {
  it('prepublishOnly builds so a manual publish cannot ship without dist/', () => {
    expect(pkg.scripts?.prepublishOnly).toBe('npm run build');
  });

  it('the published file set still carries dist (what bin points into)', () => {
    expect(pkg.files).toContain('dist');
    expect(Object.values(pkg.bin ?? {})).toContain('dist/index.js');
  });
});
