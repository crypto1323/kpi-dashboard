-- 要件1・2: ログインアカウントを作らない「ユーザー名簿」。
-- メールアドレス・表示名・閲覧権限レベル（全タブ / 店舗シートのみ）・所属店舗/エリアを
-- 記録するだけの台帳で、パスワードもauth.usersとの紐付けも持たない。
create type public.staff_access_level as enum ('all', 'store_only');

create table public.staff_directory (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  access_level public.staff_access_level not null default 'store_only',
  store_id uuid references public.stores(id) on delete set null,
  area_id uuid references public.areas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_directory_store_id_idx on public.staff_directory(store_id);

create trigger staff_directory_set_updated_at before update on public.staff_directory
  for each row execute function public.set_updated_at();

alter table public.staff_directory enable row level security;

create policy staff_directory_select on public.staff_directory
  for select using (public.current_role() = 'admin');
create policy staff_directory_write on public.staff_directory
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- 要件3: 店舗ごとの閲覧用パスワード（未設定なら従来どおり無条件で閲覧可）。
alter table public.stores add column access_password text;
