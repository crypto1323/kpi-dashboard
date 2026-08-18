-- 動作確認用のサンプルマスタデータ（任意）。
-- 0001_init.sql の実行後、SQL Editor で実行するとログイン後の画面確認がしやすくなる。
-- 本番導入時は不要（実データは管理画面から登録する）。

insert into public.areas (name) values
  ('関東エリア'),
  ('関西エリア');

insert into public.channels (name, category, sort_order) values
  ('ホットペッパー', 'Web広告', 10),
  ('EPARK', 'Web広告', 20),
  ('チラシ', 'オフライン', 30),
  ('SNS広告', 'Web広告', 40),
  ('紹介', 'クチコミ', 50);

insert into public.stores (area_id, code, name, opened_at)
select id, 'KT-001', '渋谷店', '2020-04-01' from public.areas where name = '関東エリア'
union all
select id, 'KT-002', '新宿店', '2021-06-01' from public.areas where name = '関東エリア'
union all
select id, 'KS-001', '梅田店', '2020-09-01' from public.areas where name = '関西エリア';
