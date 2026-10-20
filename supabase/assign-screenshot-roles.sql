-- One-time role assignment for the accounts shown in the Supabase Auth screenshot.
-- Run as the project owner after schema.sql. Review the returned rows.
-- Re-running this script intentionally reapplies these exact role assignments.

begin;

insert into public.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
  case lower(trim(u.email))
    when 'administrator@gmail.com' then 'admin'
    when 'clintcaserial@gmail.com' then 'student'
    when 'teacher@gmail.com' then 'teacher'
  end
from auth.users u
where lower(trim(u.email)) in (
  'administrator@gmail.com',
  'clintcaserial@gmail.com',
  'teacher@gmail.com'
)
on conflict (id) do update
set email = excluded.email,
    role = excluded.role;

do $$
begin
  if not exists (
    select 1 from public.profiles
    where lower(trim(email)) = 'administrator@gmail.com'
      and role = 'admin'
  ) then
    raise exception 'administrator@gmail.com was not found in auth.users; no administrator profile was assigned.';
  end if;
  if not exists (
    select 1 from public.profiles
    where lower(trim(email)) = 'clintcaserial@gmail.com'
      and role = 'student'
  ) then
    raise exception 'clintcaserial@gmail.com was not found in auth.users; no student profile was assigned.';
  end if;
  if not exists (
    select 1 from public.profiles
    where lower(trim(email)) = 'teacher@gmail.com'
      and role = 'teacher'
  ) then
    raise exception 'teacher@gmail.com was not found in auth.users; no teacher profile was assigned.';
  end if;
end;
$$;

select id, email, role
from public.profiles
where lower(trim(email)) in (
  'administrator@gmail.com',
  'clintcaserial@gmail.com',
  'teacher@gmail.com'
)
order by email;

commit;
