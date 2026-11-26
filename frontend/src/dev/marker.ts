/**
 * 【開発専用】本番用のビルドに入っていないことを scripts/check-dist.mjs が確かめるための目印。
 * src/dev/ の各ファイルは、先頭で markDevModule('DEV-ONLY-DUMMY-DATA:<ファイル名>') を呼ぶ。
 * 文字列をファイルごとに直接書くのは、どのファイルが混入しても見つけられるようにするため。
 * 呼び出しは副作用として残るため、ビルドの最適化で消えない。
 */
export const DEV_DATA_MARKER = 'DEV-ONLY-DUMMY-DATA';

const loadedModules = new Set<string>();

export function markDevModule(name: string) {
  loadedModules.add(name);
}

markDevModule('DEV-ONLY-DUMMY-DATA:marker');
