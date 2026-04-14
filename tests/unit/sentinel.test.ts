/**
 * Sentinel test — proves the Jest + ts-jest + TypeScript harness is wired correctly.
 * Do not remove. If this ever fails, the test harness itself is broken.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Sprint 0 foundation wiring', () => {
  const repoRoot = join(__dirname, '..', '..');

  it('has CLAUDE.md at repo root', () => {
    expect(existsSync(join(repoRoot, 'CLAUDE.md'))).toBe(true);
  });

  it('has the four required layer directories', () => {
    for (const dir of ['directives', 'execution', 'services', 'tests']) {
      expect(existsSync(join(repoRoot, dir))).toBe(true);
    }
  });

  it('has governance artifact directory', () => {
    expect(existsSync(join(repoRoot, 'tmp'))).toBe(true);
  });

  it('TypeScript strict mode is active (compile-time check)', () => {
    const sum = (a: number, b: number): number => a + b;
    expect(sum(2, 3)).toBe(5);
  });
});
