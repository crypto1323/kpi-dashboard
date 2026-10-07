-- 月間KPIダッシュボード用のテーブル作成
-- Supabase の「SQL Editor」にこの内容をすべて貼り付けて「Run」を押してください（1回だけでOK）。

-- 目標・設定を保存するテーブル（key = 'targets' / 'config'）
create table if not exists app_store (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 月間報告書から取り出した数値を保存するテーブル（院・月ごとに1行）
create table if not exists kpi_reports (
  id           text primary key,          -- 「院名|2026-08」
  clinic       text not null,             -- 対象院
  month        text not null,             -- 対象月（2026-08）
  period_start date not null,             -- 対象期間の開始日
  period_end   date not null,             -- 対象期間の終了日
  file_name    text,                      -- 元のファイル名（参考）
  data_values  jsonb not null,            -- 窓口売上・患者数・初診率などの数値
  breakdown    jsonb not null,            -- 施術分類ごとの人数・売上
  uploaded_at  timestamptz not null default now()
);

create index if not exists kpi_reports_period_end_idx on kpi_reports (period_end);

-- 安全のため、行レベルセキュリティ（RLS）を有効にします。
-- ポリシーを作らないので、公開用のキー（anon / publishable）からは読み書きできません。
-- ダッシュボードはサーバー側で「secret キー（service_role）」を使って接続します。
alter table app_store   enable row level security;
alter table kpi_reports enable row level security;
