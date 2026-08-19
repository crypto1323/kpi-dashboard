-- 初診患者テーブルに患者名を追加する。
-- 既存行は空文字で埋め、以降はアプリのフォームで必須入力にする。

alter table public.patients add column patient_name text not null default '';
