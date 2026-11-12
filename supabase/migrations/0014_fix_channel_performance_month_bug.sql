-- バグ修正: channel_performance_by_store の combos CTE が、来店月(pm.month)と
-- 集客費登録月(sm.month)をそれぞれ (store_id, channel_id) だけで別々にLEFT JOINし
-- coalesce(pm.month, sm.month) で月を決めていたため、同じ店舗×媒体で来店月と
-- 集客費登録月が異なる場合、coalesceが常に pm.month を優先してしまい、
-- 集客費だけ登録された月（来店が無い月）が丸ごと欠落していた。
-- 例: ある店舗×媒体で6月・7月に来店があり、8月に集客費だけ登録した場合、
-- 8月の集客費行が生成されず、エリア・全社シート/本部ダッシュボードの
-- 集客費合計・CPAが実際の登録額より少なく表示されていた。
--
-- 修正: 来店月と集客費登録月を UNION でまとめてから重複排除する（店舗×媒体×月の
-- 組み合わせごとに1行）ことで、月の取り違えが起きないようにする。

drop view public.channel_performance_company;
drop view public.channel_performance_by_area;
drop view public.channel_performance_by_store;

create view public.channel_performance_by_store
with (security_invoker = true) as
with combos as (
  select distinct store_id, channel_id, month
  from (
    select store_id, channel_id, date_trunc('month', visit_date)::date as month
    from public.patients
    union
    select store_id, channel_id, period as month
    from public.channel_spends
  ) activity
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
  s.area_id,
  combos.channel_id,
  c.name as channel_name,
  combos.month,
  coalesce(pa.patient_count, 0) as patient_count,
  coalesce(pa.second_visit_count, 0) as second_visit_count,
  coalesce(pa.contracted_count, 0) as contracted_count,
  coalesce(sp.amount, 0) as spend_amount
from combos
join public.stores s on s.id = combos.store_id
join public.channels c on c.id = combos.channel_id
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
