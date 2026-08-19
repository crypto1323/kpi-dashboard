-- スタッフ（入力者）ごとの初診率・成約率を集計するビュー。
-- 1店舗に複数スタッフがいる場合の担当者別実績を出せるようにする。

create view public.patient_performance_by_staff
with (security_invoker = true) as
select
  p.store_id,
  p.created_by,
  coalesce(pr.display_name, '(不明)') as staff_name,
  count(p.id) as patient_count,
  count(p.second_visit_date) as second_visit_count,
  count(*) filter (where p.contract_status = 'contracted') as contracted_count
from public.patients p
left join public.profiles pr on pr.id = p.created_by
group by p.store_id, p.created_by, pr.display_name;
