-- auth.users のメールアドレスをadminだけがアプリ内で参照できるようにする。
-- auth.users は public スキーマに公開されていないため、SECURITY DEFINER関数で
-- 必要な列だけを橋渡しする（呼び出し元がadminでない場合は0件を返す）。

create function public.list_user_emails()
returns table (id uuid, email text)
language sql
security definer
stable
set search_path = public
as $$
  select u.id, u.email::text
  from auth.users u
  where public.current_role() = 'admin';
$$;
