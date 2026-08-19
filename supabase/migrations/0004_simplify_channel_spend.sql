-- 媒体費用を「月次入力」から「随時編集できる1件（店舗×媒体）」に簡素化し、
-- 入力・編集・削除を本部（admin）のみに限定する。

alter table public.channel_spends
  drop constraint channel_spends_store_id_channel_id_period_key;
alter table public.channel_spends drop column period;
alter table public.channel_spends
  add constraint channel_spends_store_channel_key unique (store_id, channel_id);

drop policy channel_spends_insert on public.channel_spends;
drop policy channel_spends_update on public.channel_spends;
drop policy channel_spends_delete on public.channel_spends;

create policy channel_spends_insert on public.channel_spends
  for insert with check (public.current_role() = 'admin');
create policy channel_spends_update on public.channel_spends
  for update using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');
create policy channel_spends_delete on public.channel_spends
  for delete using (public.current_role() = 'admin');
