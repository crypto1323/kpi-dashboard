-- 全ての集計ビューに「対象月」を集計軸として追加する。
-- patients.visit_date / channel_spends.period から month = date_trunc('month', ...) を
-- 導出するだけで、新しいカラムは追加しない（二重管理・ズレを避けるため）。

-- ============================================================
-- 1. 媒体別（店舗／エリア／全社）
-- ============================================================

drop view public.channel_performance_by_area;
drop view public.channel_performance_company;
drop view public.channel_performance_by_store;

create view public.channel_performance_by_store
with (security_invoker = true) as
with combos as (
  select distinct
    s.id as store_id,
    s.area_id,
    c.id as channel_id,
    c.name as channel_name,
    coalesce(pm.month, sm.month) as month
  from public.stores s
  cross join public.channels c
  left join (
    select distinct store_id, channel_id, date_trunc('month', visit_date)::date as month
    from public.patients
  ) pm on pm.store_id = s.id and pm.channel_id = c.id
  left join (
    select distinct store_id, channel_id, period as month
    from public.channel_spends
  ) sm on sm.store_id = s.id and sm.channel_id = c.id
  where pm.month is not null or sm.month is not null
),
patient_agg as (
  select
    store_id,
    channel_id,
    date_trunc('month', visit_date)::date as month,
    count(id) as patient_count,
    count(second_visit_date) as second_visit_count,
    count(*) filter (where contract_status = 'contracted') as contracted_count
  from public.patients
  group by store_id, channel_id, date_trunc('month', visit_date)::date
)
select
  combos.store_id,
  combos.area_id,
  combos.channel_id,
  combos.channel_name,
  combos.month,
  coalesce(pa.patient_count, 0) as patient_count,
  coalesce(pa.second_visit_count, 0) as second_visit_count,
  coalesce(pa.contracted_count, 0) as contracted_count,
  coalesce(sp.amount, 0) as spend_amount
from combos
left join patient_agg pa
  on pa.store_id = combos.store_id and pa.channel_id = combos.channel_id and pa.month = combos.month
left join public.channel_spends sp
  on sp.store_id = combos.store_id and sp.channel_id = combos.channel_id and sp.period = combos.month;

create view public.channel_performance_by_area
with (security_invoker = true) as
select
  area_id, channel_id, channel_name, month,
  sum(patient_count) as patient_count,
  sum(second_visit_count) as second_visit_count,
  sum(contracted_count) as contracted_count,
  sum(spend_amount) as spend_amount
from public.channel_performance_by_store
group by area_id, channel_id, channel_name, month;

create view public.channel_performance_company
with (security_invoker = true) as
select
  channel_id, channel_name, month,
  sum(patient_count) as patient_count,
  sum(second_visit_count) as second_visit_count,
  sum(contracted_count) as contracted_count,
  sum(spend_amount) as spend_amount
from public.channel_performance_by_store
group by channel_id, channel_name, month;

-- ============================================================
-- 2. 性別（店舗／エリア／全社）
-- ============================================================

drop view public.patient_performance_by_gender_area;
drop view public.patient_performance_by_gender_company;
drop view public.patient_performance_by_gender;

create view public.patient_performance_by_gender
with (security_invoker = true) as
select
  store_id, gender, date_trunc('month', visit_date)::date as month,
  count(id) as patient_count,
  count(second_visit_date) as second_visit_count,
  count(*) filter (where contract_status = 'contracted') as contracted_count
from public.patients
group by store_id, gender, date_trunc('month', visit_date)::date;

create view public.patient_performance_by_gender_area
with (security_invoker = true) as
select
  s.area_id, p.gender, date_trunc('month', p.visit_date)::date as month,
  count(p.id) as patient_count,
  count(p.second_visit_date) as second_visit_count,
  count(*) filter (where p.contract_status = 'contracted') as contracted_count
from public.patients p
join public.stores s on s.id = p.store_id
group by s.area_id, p.gender, date_trunc('month', p.visit_date)::date;

create view public.patient_performance_by_gender_company
with (security_invoker = true) as
select
  gender, date_trunc('month', visit_date)::date as month,
  count(id) as patient_count,
  count(second_visit_date) as second_visit_count,
  count(*) filter (where contract_status = 'contracted') as contracted_count
from public.patients
group by gender, date_trunc('month', visit_date)::date;

-- ============================================================
-- 3. 担当者別（店舗／エリア／全社、×流入媒体、×性別）
-- ============================================================

drop view public.patient_performance_by_staff_channel;
drop view public.patient_performance_by_staff_gender;
drop view public.patient_performance_by_staff_area;
drop view public.patient_performance_by_staff_company;
drop view public.patient_performance_by_staff;

create view public.patient_performance_by_staff
with (security_invoker = true) as
select
  store_id, assignee_name as staff_name, date_trunc('month', visit_date)::date as month,
  count(id) as patient_count,
  count(second_visit_date) as second_visit_count,
  count(*) filter (where contract_status = 'contracted') as contracted_count
from public.patients
group by store_id, assignee_name, date_trunc('month', visit_date)::date;

create view public.patient_performance_by_staff_channel
with (security_invoker = true) as
select
  p.store_id, p.assignee_name as staff_name, p.channel_id, c.name as channel_name,
  date_trunc('month', p.visit_date)::date as month,
  count(p.id) as patient_count,
  count(p.second_visit_date) as second_visit_count,
  count(*) filter (where p.contract_status = 'contracted') as contracted_count
from public.patients p
join public.channels c on c.id = p.channel_id
group by p.store_id, p.assignee_name, p.channel_id, c.name, date_trunc('month', p.visit_date)::date;

create view public.patient_performance_by_staff_gender
with (security_invoker = true) as
select
  store_id, assignee_name as staff_name, gender, date_trunc('month', visit_date)::date as month,
  count(id) as patient_count,
  count(second_visit_date) as second_visit_count,
  count(*) filter (where contract_status = 'contracted') as contracted_count
from public.patients
group by store_id, assignee_name, gender, date_trunc('month', visit_date)::date;

create view public.patient_performance_by_staff_area
with (security_invoker = true) as
select
  s.area_id, p.assignee_name as staff_name, date_trunc('month', p.visit_date)::date as month,
  count(p.id) as patient_count,
  count(p.second_visit_date) as second_visit_count,
  count(*) filter (where p.contract_status = 'contracted') as contracted_count
from public.patients p
join public.stores s on s.id = p.store_id
group by s.area_id, p.assignee_name, date_trunc('month', p.visit_date)::date;

create view public.patient_performance_by_staff_company
with (security_invoker = true) as
select
  assignee_name as staff_name, date_trunc('month', visit_date)::date as month,
  count(id) as patient_count,
  count(second_visit_date) as second_visit_count,
  count(*) filter (where contract_status = 'contracted') as contracted_count
from public.patients
group by assignee_name, date_trunc('month', visit_date)::date;
