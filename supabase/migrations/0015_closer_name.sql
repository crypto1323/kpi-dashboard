-- 「担当者（初期対応）」と「成約者（クロージング）」を分離する。
--
-- closer_name は担当者と同じく自由入力の氏名。空文字は「担当者と同じ」を意味し、
-- 集計時は coalesce(nullif(closer_name, ''), assignee_name) を実効的な成約者とする。
-- → 既存データはバックフィル不要で、従来と同じ数値のまま集計される。
--
-- 担当者別ビューの指標の意味:
--   patient_count      … 担当者として初期対応した患者数（集客数）
--   second_visit_count … 上記のうち2回目来院した数（初診率の分子）
--   closing_count      … 成約者としてクロージングを担当した患者数（成約率の分母）
--   contracted_count   … 上記のうち成約した数（成約率の分子）
-- 担当者としての行と成約者としての行を full join するため、成約だけ担当したスタッフは
-- patient_count = 0 の行として現れる。全員の closing_count 合計は患者総数と一致する。

alter table public.patients add column closer_name text not null default '';

drop view public.patient_performance_by_staff_channel;
drop view public.patient_performance_by_staff_gender;
drop view public.patient_performance_by_staff_area;
drop view public.patient_performance_by_staff_company;
drop view public.patient_performance_by_staff;

create view public.patient_performance_by_staff
with (security_invoker = true) as
with base as (
  select
    store_id, assignee_name,
    coalesce(nullif(closer_name, ''), assignee_name) as closer_name,
    date_trunc('month', visit_date)::date as month,
    second_visit_date, contract_status
  from public.patients
),
as_assignee as (
  select store_id, assignee_name as staff_name, month,
    count(*) as patient_count,
    count(second_visit_date) as second_visit_count
  from base
  group by store_id, assignee_name, month
),
as_closer as (
  select store_id, closer_name as staff_name, month,
    count(*) as closing_count,
    count(*) filter (where contract_status = 'contracted') as contracted_count
  from base
  group by store_id, closer_name, month
)
select
  store_id, staff_name, month,
  coalesce(a.patient_count, 0) as patient_count,
  coalesce(a.second_visit_count, 0) as second_visit_count,
  coalesce(c.closing_count, 0) as closing_count,
  coalesce(c.contracted_count, 0) as contracted_count
from as_assignee a
full join as_closer c using (store_id, staff_name, month);

create view public.patient_performance_by_staff_channel
with (security_invoker = true) as
with base as (
  select
    p.store_id, p.assignee_name,
    coalesce(nullif(p.closer_name, ''), p.assignee_name) as closer_name,
    p.channel_id, c.name as channel_name,
    date_trunc('month', p.visit_date)::date as month,
    p.second_visit_date, p.contract_status
  from public.patients p
  join public.channels c on c.id = p.channel_id
),
as_assignee as (
  select store_id, assignee_name as staff_name, channel_id, channel_name, month,
    count(*) as patient_count,
    count(second_visit_date) as second_visit_count
  from base
  group by store_id, assignee_name, channel_id, channel_name, month
),
as_closer as (
  select store_id, closer_name as staff_name, channel_id, channel_name, month,
    count(*) as closing_count,
    count(*) filter (where contract_status = 'contracted') as contracted_count
  from base
  group by store_id, closer_name, channel_id, channel_name, month
)
select
  store_id, staff_name, channel_id, channel_name, month,
  coalesce(a.patient_count, 0) as patient_count,
  coalesce(a.second_visit_count, 0) as second_visit_count,
  coalesce(c.closing_count, 0) as closing_count,
  coalesce(c.contracted_count, 0) as contracted_count
from as_assignee a
full join as_closer c using (store_id, staff_name, channel_id, channel_name, month);

create view public.patient_performance_by_staff_gender
with (security_invoker = true) as
with base as (
  select
    store_id, assignee_name,
    coalesce(nullif(closer_name, ''), assignee_name) as closer_name,
    gender,
    date_trunc('month', visit_date)::date as month,
    second_visit_date, contract_status
  from public.patients
),
as_assignee as (
  select store_id, assignee_name as staff_name, gender, month,
    count(*) as patient_count,
    count(second_visit_date) as second_visit_count
  from base
  group by store_id, assignee_name, gender, month
),
as_closer as (
  select store_id, closer_name as staff_name, gender, month,
    count(*) as closing_count,
    count(*) filter (where contract_status = 'contracted') as contracted_count
  from base
  group by store_id, closer_name, gender, month
)
select
  store_id, staff_name, gender, month,
  coalesce(a.patient_count, 0) as patient_count,
  coalesce(a.second_visit_count, 0) as second_visit_count,
  coalesce(c.closing_count, 0) as closing_count,
  coalesce(c.contracted_count, 0) as contracted_count
from as_assignee a
full join as_closer c using (store_id, staff_name, gender, month);

create view public.patient_performance_by_staff_area
with (security_invoker = true) as
with base as (
  select
    s.area_id, p.assignee_name,
    coalesce(nullif(p.closer_name, ''), p.assignee_name) as closer_name,
    date_trunc('month', p.visit_date)::date as month,
    p.second_visit_date, p.contract_status
  from public.patients p
  join public.stores s on s.id = p.store_id
),
as_assignee as (
  select area_id, assignee_name as staff_name, month,
    count(*) as patient_count,
    count(second_visit_date) as second_visit_count
  from base
  group by area_id, assignee_name, month
),
as_closer as (
  select area_id, closer_name as staff_name, month,
    count(*) as closing_count,
    count(*) filter (where contract_status = 'contracted') as contracted_count
  from base
  group by area_id, closer_name, month
)
select
  area_id, staff_name, month,
  coalesce(a.patient_count, 0) as patient_count,
  coalesce(a.second_visit_count, 0) as second_visit_count,
  coalesce(c.closing_count, 0) as closing_count,
  coalesce(c.contracted_count, 0) as contracted_count
from as_assignee a
full join as_closer c using (area_id, staff_name, month);

create view public.patient_performance_by_staff_company
with (security_invoker = true) as
with base as (
  select
    assignee_name,
    coalesce(nullif(closer_name, ''), assignee_name) as closer_name,
    date_trunc('month', visit_date)::date as month,
    second_visit_date, contract_status
  from public.patients
),
as_assignee as (
  select assignee_name as staff_name, month,
    count(*) as patient_count,
    count(second_visit_date) as second_visit_count
  from base
  group by assignee_name, month
),
as_closer as (
  select closer_name as staff_name, month,
    count(*) as closing_count,
    count(*) filter (where contract_status = 'contracted') as contracted_count
  from base
  group by closer_name, month
)
select
  staff_name, month,
  coalesce(a.patient_count, 0) as patient_count,
  coalesce(a.second_visit_count, 0) as second_visit_count,
  coalesce(c.closing_count, 0) as closing_count,
  coalesce(c.contracted_count, 0) as contracted_count
from as_assignee a
full join as_closer c using (staff_name, month);
