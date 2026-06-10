import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const MAX_XHS_ANALYSIS_FILE_LINES = 500;

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectTypeScriptFiles(entryPath);
    }

    return entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

describe('xhs-analysis source structure', () => {
  it('keeps every TypeScript file at 500 lines or below', () => {
    const oversizedFiles = collectTypeScriptFiles(__dirname)
      .map((filePath) => ({
        file: relative(__dirname, filePath),
        lines: readFileSync(filePath, 'utf8').split('\n').length,
      }))
      .filter((file) => file.lines > MAX_XHS_ANALYSIS_FILE_LINES);

    expect(oversizedFiles).toEqual([]);
  });
});
