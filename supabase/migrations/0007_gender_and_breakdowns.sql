-- 患者に性別を追加し、担当者別×媒体別、担当者別×性別、店舗全体×性別の
-- 集計ビューを追加する。分析タブ（店舗シート）で使用する。

create type public.patient_gender as enum ('male', 'female', 'other');

alter table public.patients
  add column gender public.patient_gender not null default 'other';

-- --- 担当者 × 流入媒体 ---
create view public.patient_performance_by_staff_channel
with (security_invoker = true) as
select
  p.store_id,
  p.created_by,
  coalesce(pr.display_name, '(不明)') as staff_name,
  p.channel_id,
  c.name as channel_name,
  count(p.id) as patient_count,
  count(p.second_visit_date) as second_visit_count,
  count(*) filter (where p.contract_status = 'contracted') as contracted_count
from public.patients p
left join public.profiles pr on pr.id = p.created_by
join public.channels c on c.id = p.channel_id
group by p.store_id, p.created_by, pr.display_name, p.channel_id, c.name;

-- --- 担当者 × 性別 ---
create view public.patient_performance_by_staff_gender
with (security_invoker = true) as
select
  p.store_id,
  p.created_by,
  coalesce(pr.display_name, '(不明)') as staff_name,
  p.gender,
  count(p.id) as patient_count,
  count(p.second_visit_date) as second_visit_count,
  count(*) filter (where p.contract_status = 'contracted') as contracted_count
from public.patients p
left join public.profiles pr on pr.id = p.created_by
group by p.store_id, p.created_by, pr.display_name, p.gender;

-- --- 店舗全体 × 性別 ---
create view public.patient_performance_by_gender
with (security_invoker = true) as
select
  p.store_id,
  p.gender,
  count(p.id) as patient_count,
  count(p.second_visit_date) as second_visit_count,
  count(*) filter (where p.contract_status = 'contracted') as contracted_count
from public.patients p
group by p.store_id, p.gender;
