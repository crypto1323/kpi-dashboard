-- 初診患者分析・KPI管理ダッシュボード — 初期スキーマ
-- マスタ（areas / stores / channels）とトランザクション（patients）、
-- 権限管理（profiles）を作成し、Row Level Security で店舗・エリア・全社の
-- 閲覧範囲をDB側で強制する。
--
-- 実行方法: Supabaseプロジェクト作成後、SQL Editor に本ファイルの内容を
-- そのまま貼り付けて実行するか、Supabase CLI で `supabase db push` を実行する。

-- ============================================================
-- 1. Enums
-- ============================================================

create type public.profile_role as enum ('staff', 'area_manager', 'admin');
create type public.contract_status as enum ('pending', 'contracted', 'declined');

-- ============================================================
-- 2. マスタテーブル
-- ============================================================

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete restrict,
  code text not null unique,
  name text not null,
  opened_at date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stores_area_id_idx on public.stores(area_id);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 3. 権限テーブル（auth.usersと1:1）
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.profile_role not null default 'staff',
  store_id uuid references public.stores(id) on delete set null,
  area_id uuid references public.areas(id) on delete set null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_store_id_idx on public.profiles(store_id);
create index profiles_area_id_idx on public.profiles(area_id);

-- 新規ユーザー登録時に profiles 行を自動作成する
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email),
    'staff'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 4. 実績テーブル
-- ============================================================

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  channel_id uuid not null references public.channels(id) on delete restrict,
  visit_date date not null,
  second_visit_date date,
  contract_status public.contract_status not null default 'pending',
  contracted_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index patients_store_id_idx on public.patients(store_id);
create index patients_channel_id_idx on public.patients(channel_id);
create index patients_visit_date_idx on public.patients(visit_date);

-- ============================================================
-- 5. updated_at 自動更新
-- ============================================================

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger areas_set_updated_at before update on public.areas
  for each row execute function public.set_updated_at();
create trigger stores_set_updated_at before update on public.stores
  for each row execute function public.set_updated_at();
create trigger channels_set_updated_at before update on public.channels
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger patients_set_updated_at before update on public.patients
  for each row execute function public.set_updated_at();

-- ============================================================
-- 6. RLS 用ヘルパー関数
--    profiles テーブル自身への再帰的なRLS参照を避けるため、
--    SECURITY DEFINER でRLSをバイパスして自分のprofile行を読む。
-- ============================================================

create function public.current_role()
returns public.profile_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.current_store_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select store_id from public.profiles where id = auth.uid();
$$;

create function public.current_area_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select area_id from public.profiles where id = auth.uid();
$$;

-- ============================================================
-- 7. Row Level Security
-- ============================================================

alter table public.areas enable row level security;
alter table public.stores enable row level security;
alter table public.channels enable row level security;
alter table public.profiles enable row level security;
alter table public.patients enable row level security;

-- --- areas: 全ログインユーザーが参照可、編集はadminのみ ---
create policy areas_select on public.areas
  for select using (auth.uid() is not null);
create policy areas_write on public.areas
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- --- channels: 全ログインユーザーが参照可、編集はadminのみ ---
create policy channels_select on public.channels
  for select using (auth.uid() is not null);
create policy channels_write on public.channels
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- --- stores: admin=全件 / area_manager=自エリア / staff=自店舗のみ参照、編集はadminのみ ---
create policy stores_select on public.stores
  for select using (
    public.current_role() = 'admin'
    or (public.current_role() = 'area_manager' and area_id = public.current_area_id())
    or (public.current_role() = 'staff' and id = public.current_store_id())
  );
create policy stores_write on public.stores
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- --- profiles: 本人 or admin が参照、編集はadminのみ ---
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid() or public.current_role() = 'admin'
  );
create policy profiles_write on public.profiles
  for update using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');
create policy profiles_insert on public.profiles
  for insert with check (public.current_role() = 'admin');
create policy profiles_delete on public.profiles
  for delete using (public.current_role() = 'admin');

-- --- patients: admin=全件 / area_manager=自エリア参照のみ / staff=自店舗のみ参照・入力 ---
create policy patients_select on public.patients
  for select using (
    public.current_role() = 'admin'
    or (
      public.current_role() = 'area_manager'
      and store_id in (select id from public.stores where area_id = public.current_area_id())
    )
    or (public.current_role() = 'staff' and store_id = public.current_store_id())
  );
create policy patients_insert on public.patients
  for insert with check (
    public.current_role() = 'admin'
    or (public.current_role() = 'staff' and store_id = public.current_store_id())
  );
create policy patients_update on public.patients
  for update using (
    public.current_role() = 'admin'
    or (public.current_role() = 'staff' and store_id = public.current_store_id())
  )
  with check (
    public.current_role() = 'admin'
    or (public.current_role() = 'staff' and store_id = public.current_store_id())
  );
create policy patients_delete on public.patients
  for delete using (public.current_role() = 'admin');
