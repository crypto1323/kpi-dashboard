# 初診患者KPIダッシュボード

52店舗の接骨院グループ向け、流入媒体別の集客・初診・成約実績を店舗／エリア／全社の3階層で可視化するダッシュボード。

## 画面構成

- **店舗シート**（`/dashboard/patients`）— 現場スタッフ・adminの画面。初診患者の登録・編集・削除に加え、その店舗の媒体別／スタッフ別の初診率・成約率をその場で確認できる。
- **エリア・全社シート**（`/dashboard/report`）— エリア長・adminの画面。複数店舗をロールアップした媒体別の集客数・初診率・成約率・集客費（1人あたり）を表示する。
- **マスタ管理**（`/dashboard/master/*`）— admin専用。エリア・店舗・流入媒体のCRUDと、媒体費用（年間契約額、随時編集可）の入力。

## 技術スタック

- Next.js 16（App Router）+ TypeScript + Tailwind CSS
- Supabase（Postgres / Auth / Row Level Security）
- shadcn/ui（Base UI ベース）
- Drizzle（`src/db/schema.ts` は型定義のソース。実行はしない。実際のマイグレーションは `supabase/migrations/*.sql` と `npm run db:migrate`）

## セットアップ

### 1. Supabaseプロジェクトを作成

1. [supabase.com](https://supabase.com) で新規プロジェクトを作成する。
2. Project Settings > API から `Project URL` と `anon public` キーを控える。
3. Project Settings > Database > Connection string から接続文字列（Transaction pooler推奨）を控える。

### 2. 環境変数を設定

```bash
cp .env.local.example .env.local
```

`.env.local` に手順1で控えた3つの値（URL・anon key・DATABASE_URL）を設定する。

### 3. マイグレーションを実行

```bash
npm install
npm run db:migrate
```

`supabase/migrations/*.sql` を古い順に、まだ適用していないものだけ自動実行する（適用履歴は `public._migrations` テーブルで管理）。以後、新しいマイグレーションファイルが追加されたときも同じコマンドで反映できる。

### 4. 起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) にアクセスすると `/login` にリダイレクトされる。

### 5. 最初の管理者ユーザーを作成

現時点ではサインアップ画面がない（ユーザー登録は本部が行う運用のため）。動作確認用に、Supabaseダッシュボードから直接作成する。

1. Authentication > Users > Add user でメールアドレス・パスワードを指定し、**Auto Confirm User** を有効にして作成する。
2. 作成すると `handle_new_user` トリガーにより `public.profiles` に `role = 'staff'` の行が自動生成される。
3. SQL Editor で管理者に昇格させる。

```sql
update public.profiles set role = 'admin' where id = '作成したユーザーのUUID';
```

4. `/login` からログインし、`role`・`store_id`・`area_id` が意図通りか確認する。

## ディレクトリ構成（現状）

```
src/
  app/
    login/                    ログイン画面・Server Actions
    dashboard/
      patients/                店舗シート（現場入力＋その店舗の実績）
      report/                   エリア・全社シート（ロールアップ集計）
      master/
        areas|stores|channels/  マスタCRUD（admin専用）
        spend/                  媒体費用の入力（admin専用）
  components/
    store-switcher.tsx          adminの店舗切り替え
    area-switcher.tsx           adminのエリア切り替え
    confirm-submit-button.tsx   確認ダイアログ付き削除ボタン
  lib/
    supabase/                  client.ts（ブラウザ）/ server.ts（Server Components）/ proxy.ts（セッション更新）
    dal.ts                     ログインユーザーのprofile取得・admin権限ガード
    types.ts                   Supabaseクエリ結果の型（snake_case、DBカラムと一致）
  db/
    schema.ts                  Drizzleスキーマ定義（型のソース。マイグレーションは手書きSQLが正）
  proxy.ts                      Next.js 16のミドルウェア（旧middleware.ts）。未認証アクセスを/loginへリダイレクト
scripts/
  migrate.ts                    supabase/migrations/*.sql を未適用分だけ順番に実行するランナー
supabase/
  migrations/*.sql              スキーマ・RLSポリシー・集計ビューの実体（番号順に適用）
  seed.sql                      動作確認用サンプルデータ（任意）
```

## DBの集計ビュー

- `channel_performance_by_store` / `_by_area` / `_company` — 媒体別の集客数・初診率・成約率・媒体費用・集客費。`security_invoker = true` のため、閲覧者自身のRLS（staffは自店舗、area_managerは自エリア、adminは全件）がそのまま適用される。
- `patient_performance_by_staff` — 店舗内のスタッフ（入力者）別の集客数・初診率・成約率。

## 今後のマイグレーション追加方法

`src/db/schema.ts` を変更したら、`supabase/migrations/` に次の連番で `.sql` ファイルを追加し、`npm run db:migrate` を実行する。
