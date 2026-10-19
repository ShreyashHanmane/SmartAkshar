import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Regression: a bare `data/` rule in .gitignore once hid src/data/*.ts, so fresh clones failed to build.
describe('repository', () => {
  it('does not git-ignore any source file', () => {
    const ignored = execFileSync(
      'git',
      ['ls-files', '--others', '--ignored', '--exclude-standard', '--', 'src', 'server', 'tests'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter((f) => /\.(ts|tsx|css|json|html)$/.test(f));
    expect(ignored).toEqual([]);
  });
});
