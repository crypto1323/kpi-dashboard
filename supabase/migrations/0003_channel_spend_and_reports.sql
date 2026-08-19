-- 媒体費用（店舗×媒体×月）の記録と、店舗別・エリア別・全社別の集計ビュー。
-- 併せて、入力ミス訂正のため patients の削除をスタッフ本人の店舗分にも許可する。

-- ============================================================
-- 1. 媒体費用テーブル
-- ============================================================

create table public.channel_spends (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  channel_id uuid not null references public.channels(id) on delete restrict,
  period date not null,
  amount integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, channel_id, period)
);
create index channel_spends_store_id_idx on public.channel_spends(store_id);
create index channel_spends_channel_id_idx on public.channel_spends(channel_id);

create trigger channel_spends_set_updated_at before update on public.channel_spends
  for each row execute function public.set_updated_at();

alter table public.channel_spends enable row level security;

create policy channel_spends_select on public.channel_spends
  for select using (
    public.current_role() = 'admin'
    or (
      public.current_role() = 'area_manager'
      and store_id in (select id from public.stores where area_id = public.current_area_id())
    )
    or (public.current_role() = 'staff' and store_id = public.current_store_id())
  );
create policy channel_spends_insert on public.channel_spends
  for insert with check (
    public.current_role() = 'admin'
    or (public.current_role() = 'staff' and store_id = public.current_store_id())
  );
create policy channel_spends_update on public.channel_spends
  for update using (
    public.current_role() = 'admin'
    or (public.current_role() = 'staff' and store_id = public.current_store_id())
  )
  with check (
    public.current_role() = 'admin'
    or (public.current_role() = 'staff' and store_id = public.current_store_id())
  );
create policy channel_spends_delete on public.channel_spends
  for delete using (
    public.current_role() = 'admin'
    or (public.current_role() = 'staff' and store_id = public.current_store_id())
  );

-- ============================================================
-- 2. patients の削除を店舗スタッフ本人の店舗分にも許可（入力ミス訂正用）
-- ============================================================

drop policy patients_delete on public.patients;
create policy patients_delete on public.patients
  for delete using (
    public.current_role() = 'admin'
    or (public.current_role() = 'staff' and store_id = public.current_store_id())
  );

-- ============================================================
-- 3. 集計ビュー（店舗別 / エリア別 / 全社別）
--    security_invoker = true にして、閲覧者自身のRLSがそのまま適用されるようにする
--    （staffは自店舗、area_managerは自エリア、adminは全件のみ集計に反映される）。
-- ============================================================

create view public.channel_performance_by_store
with (security_invoker = true) as
select
  s.id as store_id,
  s.area_id,
  c.id as channel_id,
  c.name as channel_name,
  count(p.id) as patient_count,
  count(p.second_visit_date) as second_visit_count,
  count(*) filter (where p.contract_status = 'contracted') as contracted_count,
  coalesce(sp.spend_amount, 0) as spend_amount
from public.stores s
cross join public.channels c
left join public.patients p on p.store_id = s.id and p.channel_id = c.id
left join (
  select store_id, channel_id, sum(amount) as spend_amount
  from public.channel_spends
  group by store_id, channel_id
) sp on sp.store_id = s.id and sp.channel_id = c.id
group by s.id, s.area_id, c.id, c.name, sp.spend_amount;

create view public.channel_performance_by_area
with (security_invoker = true) as
select
  area_id,
  channel_id,
  channel_name,
  sum(patient_count) as patient_count,
  sum(second_visit_count) as second_visit_count,
  sum(contracted_count) as contracted_count,
  sum(spend_amount) as spend_amount
from public.channel_performance_by_store
group by area_id, channel_id, channel_name;

create view public.channel_performance_company
with (security_invoker = true) as
select
  channel_id,
  channel_name,
  sum(patient_count) as patient_count,
  sum(second_visit_count) as second_visit_count,
  sum(contracted_count) as contracted_count,
  sum(spend_amount) as spend_amount
from public.channel_performance_by_store
group by channel_id, channel_name;
