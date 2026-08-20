-- 担当者をログインユーザー(created_by)ではなく、自由入力の氏名で記録できるようにする。
-- 1つのログインアカウントを複数スタッフで共用する運用があるため。

alter table public.patients add column assignee_name text not null default '';

drop view public.patient_performance_by_staff;
drop view public.patient_performance_by_staff_channel;
drop view public.patient_performance_by_staff_gender;

create view public.patient_performance_by_staff
with (security_invoker = true) as
select
  store_id,
  assignee_name as staff_name,
  count(id) as patient_count,
  count(second_visit_date) as second_visit_count,
  count(*) filter (where contract_status = 'contracted') as contracted_count
from public.patients
group by store_id, assignee_name;

create view public.patient_performance_by_staff_channel
with (security_invoker = true) as
select
  p.store_id,
  p.assignee_name as staff_name,
  p.channel_id,
  c.name as channel_name,
  count(p.id) as patient_count,
  count(p.second_visit_date) as second_visit_count,
  count(*) filter (where p.contract_status = 'contracted') as contracted_count
from public.patients p
join public.channels c on c.id = p.channel_id
group by p.store_id, p.assignee_name, p.channel_id, c.name;

create view public.patient_performance_by_staff_gender
with (security_invoker = true) as
select
  store_id,
  assignee_name as staff_name,
  gender,
  count(id) as patient_count,
  count(second_visit_date) as second_visit_count,
  count(*) filter (where contract_status = 'contracted') as contracted_count
from public.patients
group by store_id, assignee_name, gender;
