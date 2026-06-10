import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const backendRoot = join(__dirname, '..');

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectTypeScriptFiles(entryPath);
    }

    return entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

describe('backend monorepo structure', () => {
  it('runs dev mode directly from workspace sources instead of prebuilding agent', () => {
    const packageJson = JSON.parse(
      readFileSync(join(backendRoot, 'package.json'), 'utf8'),
    ) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['start:dev']).not.toContain('start-dev');
  });

  it('uses cross-platform script syntax for environment variables', () => {
    const packageJson = JSON.parse(
      readFileSync(join(backendRoot, 'package.json'), 'utf8'),
    ) as {
      scripts?: Record<string, string>;
    };

    const unixEnvAssignment = /(^|&&\s+)[A-Z][A-Z0-9_]*=/;

    expect(
      Object.entries(packageJson.scripts ?? {}).filter(([, script]) =>
        unixEnvAssignment.test(script),
      ),
    ).toEqual([]);
  });

  it('does not import runtime code from compiled workspace package output', () => {
    const compiledOutputImports = collectTypeScriptFiles(join(__dirname))
      .map((filePath) => ({
        filePath,
        source: readFileSync(filePath, 'utf8'),
      }))
      .filter(({ filePath, source }) => {
        if (filePath.endsWith('backend-monorepo-structure.spec.ts')) {
          return false;
        }

        return source.includes('@rednote/agent/dist');
      });

    expect(compiledOutputImports).toEqual([]);
  });
});
