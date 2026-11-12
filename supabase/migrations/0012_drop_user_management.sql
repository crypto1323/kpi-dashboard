-- 要件1: ユーザー管理（マスタ管理のユーザー）機能の完全廃止。
-- メールアドレスに紐づく権限管理という概念自体をなくすため、名簿テーブルを削除する。
drop table if exists public.staff_directory;
drop type if exists public.staff_access_level;
