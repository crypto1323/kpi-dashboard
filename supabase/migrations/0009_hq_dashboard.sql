-- 本部ダッシュボード（/hq-dashboard）向け:
-- 1) 集客費を月次入力（店舗×媒体×月）に戻す
-- 2) エリア別・全社別の「担当者別」「性別別」集計ビューを追加
--    （媒体別は既存の channel_performance_by_area / _company を流用）

-- ============================================================
-- 1. 集客費を月次に戻す
-- ============================================================

alter table public.channel_spends
  add column period date not null default date_trunc('month', now())::date;
alter table public.channel_spends alter column period drop default;

alter table public.channel_spends
  drop constraint channel_spends_store_channel_key;
alter table public.channel_spends
  add constraint channel_spends_store_channel_period_key unique (store_id, channel_id, period);

-- ============================================================
-- 2. 担当者別（エリア／全社）
-- ============================================================

create view public.patient_performance_by_staff_area
with (security_invoker = true) as
select
  s.area_id,
  p.assignee_name as staff_name,
  count(p.id) as patient_count,
  count(p.second_visit_date) as second_visit_count,
  count(*) filter (where p.contract_status = 'contracted') as contracted_count
from public.patients p
join public.stores s on s.id = p.store_id
group by s.area_id, p.assignee_name;

create view public.patient_performance_by_staff_company
with (security_invoker = true) as
select
  p.assignee_name as staff_name,
  count(p.id) as patient_count,
  count(p.second_visit_date) as second_visit_count,
  count(*) filter (where p.contract_status = 'contracted') as contracted_count
from public.patients p
group by p.assignee_name;

-- ============================================================
-- 3. 性別（エリア／全社）
-- ============================================================

create view public.patient_performance_by_gender_area
with (security_invoker = true) as
select
  s.area_id,
  p.gender,
  count(p.id) as patient_count,
  count(p.second_visit_date) as second_visit_count,
  count(*) filter (where p.contract_status = 'contracted') as contracted_count
from public.patients p
join public.stores s on s.id = p.store_id
group by s.area_id, p.gender;

create view public.patient_performance_by_gender_company
with (security_invoker = true) as
select
  p.gender,
  count(p.id) as patient_count,
  count(p.second_visit_date) as second_visit_count,
  count(*) filter (where p.contract_status = 'contracted') as contracted_count
from public.patients p
group by p.gender;
