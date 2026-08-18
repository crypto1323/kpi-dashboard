# 初診患者KPIダッシュボード

52店舗の接骨院グループ向け、流入媒体別の集客・初診・成約実績を店舗／エリア／全社の3階層で可視化するダッシュボード。

技術スタック・DB設計・開発フェーズの全体像は提案書を参照。現状はPhase 0（基盤構築）まで完了。

## 技術スタック

- Next.js 16（App Router）+ TypeScript + Tailwind CSS
- Supabase（Postgres / Auth / Row Level Security）
- shadcn/ui（Base UI ベース）
- Drizzle（`src/db/schema.ts` は型定義とマイグレーション生成のソース。実行済みマイグレーションの実体は `supabase/migrations/*.sql`）

## セットアップ

### 1. Supabaseプロジェクトを作成

1. [supabase.com](https://supabase.com) で新規プロジェクトを作成する。
2. Project Settings > API から `Project URL` と `anon public` キーを控える。
3. Project Settings > Database > Connection string から接続文字列（Transaction pooler推奨）を控える。

### 2. マイグレーションを実行

Supabaseダッシュボードの SQL Editor で、以下を**この順番で**実行する。

1. `supabase/migrations/0001_init.sql` — テーブル・RLSポリシー一式
2. `supabase/seed.sql`（任意）— 動作確認用のサンプルエリア・店舗・媒体

### 3. 環境変数を設定

```bash
cp .env.local.example .env.local
```

`.env.local` に手順1で控えた値を設定する。

### 4. 依存関係のインストールと起動

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) にアクセスすると `/login` にリダイレクトされる。

### 5. 最初の管理者ユーザーを作成

現時点ではサインアップ画面がない（ユーザー登録は本部が行う運用のため、Phase 1のマスタ管理画面で対応予定）。動作確認用に、Supabaseダッシュボードから直接作成する。

1. Authentication > Users > Add user でメールアドレス・パスワードを指定し、**Auto Confirm User** を有効にして作成する。
2. 作成すると `handle_new_user` トリガーにより `public.profiles` に `role = 'staff'` の行が自動生成される。
3. SQL Editor で管理者に昇格させる。

```sql
update public.profiles set role = 'admin' where id = '作成したユーザーのUUID';
```

4. `/login` からログインし、`/dashboard` で自分の権限（role）とRLSが機能していることを確認する。

## ディレクトリ構成（現状）

```
src/
  app/
    login/          ログイン画面・Server Actions
    dashboard/       認証必須エリアの土台（Phase 1以降で店舗/エリア/全社ビューを追加）
  lib/
    supabase/        client.ts（ブラウザ）/ server.ts（Server Components）/ proxy.ts（セッション更新）
    dal.ts           ログインユーザーのprofile取得（Data Access Layer）
    types.ts         Supabaseクエリ結果の型（snake_case、DBカラムと一致）
  db/
    schema.ts         Drizzleスキーマ定義（型とマイグレーション生成用）
  proxy.ts             Next.js 16のミドルウェア（旧middleware.ts）。未認証アクセスを/loginへリダイレクト
supabase/
  migrations/0001_init.sql   初期スキーマ + RLSポリシー
  seed.sql                    動作確認用サンプルデータ（任意）
```

## 今後のマイグレーション追加方法

`src/db/schema.ts` を変更した後、`DATABASE_URL` を設定した状態で以下を実行すると差分SQLが `supabase/migrations/` に追加される。RLSポリシーなど手書き部分は生成後に見直すこと。

```bash
npm run db:generate
```

## 開発フェーズ

1. ~~基盤構築（環境構築・認証・DBスキーマ・RLS）~~ ✅ 完了
2. マスタ管理画面（店舗・エリア・媒体のCRUD、admin向け）
3. 現場入力フォーム（初診患者登録、staff向け）
4. 店舗別ダッシュボード
5. エリア別ビュー
6. 全社ビュー
7. 権限強化・CSVエクスポート
8. 本番移行・研修
