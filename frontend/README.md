# フロントエンド

React・TypeScript（strict）・Vite・Tailwind CSS。今は募集一覧（SCR-005）と募集詳細（SCR-006）の未ログインの表示だけを実装している。**Supabaseには接続していない。**

## ブラウザで見る（Node.js 26系LTSがあるPC）

1. `frontend\start.cmd` をダブルクリックする（最初と、`package-lock.json` が変わったときは、部品の取得に時間がかかる）
2. ブラウザに募集一覧が開く。開かない場合は、黒い画面に出たアドレスを開く
3. 終了するときは、黒い画面で `Ctrl+C` を押す

## 準備（コマンドで行う場合）

```powershell
cd frontend
npm install
```

最初に実行したPCで `package-lock.json` ができるため、コミットする。2回目以降と、もう一方のPCでは `npm ci` を使う。

## コマンド

| コマンド         | 内容                                                                             |
| ---------------- | -------------------------------------------------------------------------------- |
| `npm run dev`    | 開発用の画面を開く                                                               |
| `npm run check`  | 整形・静的解析・型検査・単体テスト・ビルド・ダミーデータの混入確認をまとめて行う |
| `npm run format` | 整形する                                                                         |

## ダミーデータ

- 開発専用のダミーデータは `src/features/events/dev/` だけに置く。架空の内容だけとし、住所・連絡先を入れない
- 画面は `EventRepository` を通してデータを取得する。ダミーは `repository.ts` が開発時にだけ動的に読み込む
- 本番用のビルドでは読み込まれない。`npm run check:dist` で確かめる

Node.jsがないPCでは、ソースの編集だけを行い、上の確認はNode.jsがあるPCで行う（docs/08の9章）。
