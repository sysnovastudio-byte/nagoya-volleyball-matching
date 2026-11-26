// 本番用のビルド結果に、開発専用のダミーデータ・開発用の帯が含まれていないことを確かめる。
// src/dev/ の各ファイルは、この目印を含む markDevModule('DEV-ONLY-DUMMY-DATA:<ファイル名>') を呼ぶ。
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url));

// src/dev/marker.ts の DEV_DATA_MARKER と同じ値にする。
const MARKER = 'DEV-ONLY-DUMMY-DATA';

const entries = await readdir(DIST_DIR, { recursive: true, withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name));

if (files.length === 0) {
  console.error('dist にファイルがありません。先に npm run build を実行してください。');
  process.exit(1);
}

const leaked = [];
for (const file of files) {
  const content = await readFile(file, 'utf8');
  if (content.includes(MARKER)) leaked.push(file);
}

if (leaked.length > 0) {
  console.error(`開発専用のダミーデータが含まれています:\n${leaked.join('\n')}`);
  process.exit(1);
}

console.log(`${files.length}個のファイルに、開発専用のダミーデータは含まれていません。`);
