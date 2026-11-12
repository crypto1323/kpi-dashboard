-- マスタ管理（エリア・店舗・流入媒体）の削除機能。物理削除はしない —
-- patients / channel_spends / profiles などが store_id・channel_id・area_id を
-- 参照しているため（on delete restrict）、行を消すと過去データの表示が壊れる。
-- 代わりに is_deleted を立てて一覧から外すだけにする。is_active もあわせて
-- falseにし、既存の「登録フォームの選択肢は is_active のみで絞る」という
-- 実装をそのまま使って、削除済みが選べてしまわないようにする。
alter table public.areas add column is_deleted boolean not null default false;
alter table public.stores add column is_deleted boolean not null default false;
alter table public.channels add column is_deleted boolean not null default false;
