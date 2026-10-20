-- QR-ATT schema for Supabase. Run in the SQL Editor as the project owner.
-- Back up an existing project before applying schema changes.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  role text not null default 'student'
    check (role in ('student', 'teacher', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  title text not null,
  description text not null default '',
  event_date date not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  venue text not null default 'TBD',
  status text not null default 'open'
    check (status in ('open', 'closed', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_end_after_start check (end_time > start_time)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  attendance_date date not null default current_date,
  attendance_time timestamptz not null default now(),
  status text not null default 'present'
    check (status in ('present', 'excused', 'absent')),
  created_at timestamptz not null default now(),
  constraint attendance_one_per_student_event unique (student_id, event_id)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Add the current schema's columns to pre-existing tables before indexes,
-- policies, and RPCs refer to them.
alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();
alter table public.events
  add column if not exists description text,
  add column if not exists event_date date,
  add column if not exists venue text,
  add column if not exists status text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz;
alter table public.attendance
  add column if not exists attendance_date date,
  add column if not exists attendance_time timestamptz,
  add column if not exists status text,
  add column if not exists created_at timestamptz not null default now();

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', constraint_row.conname);
  end loop;

  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.events drop constraint %I', constraint_row.conname);
  end loop;

  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.attendance drop constraint %I', constraint_row.conname);
  end loop;
end;
$$;

update public.events
set description = coalesce(description, ''),
    venue = coalesce(nullif(venue, ''), 'TBD'),
    status = case
      when lower(coalesce(status, '')) in ('closed', 'ended', 'completed') then 'closed'
      when lower(coalesce(status, '')) in ('cancelled', 'canceled') then 'cancelled'
      else 'open'
    end,
    updated_at = coalesce(updated_at, created_at, now())
where description is null
   or venue is null
   or venue = ''
   or status is null
   or lower(status) not in ('open', 'closed', 'cancelled')
   or updated_at is null;

update public.events e
set event_date = case
  when (to_jsonb(e) ->> 'start_time') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    then ((to_jsonb(e) ->> 'start_time')::timestamptz)::date
  else coalesce(e.event_date, e.created_at::date, current_date)
end
where event_date is null;

update public.attendance a
set attendance_time = case
      when (to_jsonb(a) ->> 'scanned_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        then (to_jsonb(a) ->> 'scanned_at')::timestamptz
      else coalesce(a.created_at, now())
    end,
    attendance_date = coalesce(
      attendance_date,
      case
        when (to_jsonb(a) ->> 'scanned_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          then ((to_jsonb(a) ->> 'scanned_at')::timestamptz)::date
        else coalesce(a.created_at::date, current_date)
      end
    ),
    status = case
      when lower(coalesce(status, '')) in ('excused', 'absent') then lower(status)
      else 'present'
    end
where attendance_time is null
   or attendance_date is null
   or status is null
   or lower(status) not in ('present', 'excused', 'absent');

alter table public.events
  alter column description set default '',
  alter column description set not null,
  alter column event_date set default current_date,
  alter column event_date set not null,
  alter column venue set default 'TBD',
  alter column venue set not null,
  alter column status set default 'open',
  alter column status set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;
alter table public.attendance
  alter column attendance_date set default current_date,
  alter column attendance_date set not null,
  alter column attendance_time set default now(),
  alter column attendance_time set not null,
  alter column status set default 'present',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute source_column
      on source_column.attrelid = c.conrelid
     and source_column.attnum = c.conkey[1]
    where c.conrelid = 'public.attendance'::regclass
      and c.confrelid = 'public.profiles'::regclass
      and c.contype = 'f'
      and cardinality(c.conkey) = 1
      and source_column.attname = 'student_id'
  ) then
    alter table public.attendance
      add constraint attendance_student_profile_fkey
      foreign key (student_id) references public.profiles(id)
      on delete cascade not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute source_column
      on source_column.attrelid = c.conrelid
     and source_column.attnum = c.conkey[1]
    where c.conrelid = 'public.attendance'::regclass
      and c.confrelid = 'public.events'::regclass
      and c.contype = 'f'
      and cardinality(c.conkey) = 1
      and source_column.attname = 'event_id'
  ) then
    alter table public.attendance
      add constraint attendance_event_reference_fkey
      foreign key (event_id) references public.events(id)
      on delete cascade not valid;
  end if;
end;
$$;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', constraint_row.conname);
  end loop;
  alter table public.profiles
    add constraint profiles_role_valid check (role in ('student', 'teacher', 'admin'));

  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.events drop constraint %I', constraint_row.conname);
  end loop;
  alter table public.events
    add constraint events_status_valid check (status in ('open', 'closed', 'cancelled'));

  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.attendance drop constraint %I', constraint_row.conname);
  end loop;
  alter table public.attendance
    add constraint attendance_status_valid check (status in ('present', 'excused', 'absent'));

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.attendance'::regclass and attname = 'student_id'),
        (select attnum from pg_attribute
         where attrelid = 'public.attendance'::regclass and attname = 'event_id')
      ]::smallint[]
  ) then
    if exists (
      select 1
      from public.attendance
      group by student_id, event_id
      having count(*) > 1
    ) then
      raise exception 'Duplicate attendance rows exist for the same student and event. Remove/reconcile duplicates, then rerun schema.sql.';
    end if;
    alter table public.attendance
      add constraint attendance_one_per_student_event unique (student_id, event_id);
  end if;
end;
$$;

create index if not exists events_created_by_idx on public.events(created_by);
create index if not exists events_date_status_idx on public.events(event_date, status);
create index if not exists attendance_student_time_idx
  on public.attendance(student_id, attendance_time desc);
create index if not exists attendance_event_time_idx
  on public.attendance(event_id, attendance_time desc);
create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    'student'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;
alter table public.audit_log enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'events', 'attendance', 'audit_log')
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end;
$$;

drop policy if exists profiles_select_permitted on public.profiles;
create policy profiles_select_permitted on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.current_profile_role() = 'admin'
  or (
    public.current_profile_role() = 'teacher'
    and exists (
      select 1
      from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id and e.created_by = auth.uid()
    )
  )
);

drop policy if exists profiles_update_self_name on public.profiles;
create policy profiles_update_self_name on public.profiles
for update to authenticated
using (id = auth.uid() or public.current_profile_role() = 'admin')
with check (id = auth.uid() or public.current_profile_role() = 'admin');

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

drop policy if exists events_select_authenticated on public.events;
create policy events_select_authenticated on public.events
for select to authenticated
using (true);
revoke all on public.events from anon, authenticated;
grant select, insert, update, delete on public.events to authenticated;

drop policy if exists events_insert_owner_or_admin on public.events;
create policy events_insert_owner_or_admin on public.events
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.current_profile_role() in ('teacher', 'admin')
);

drop policy if exists events_update_owner_or_admin on public.events;
create policy events_update_owner_or_admin on public.events
for update to authenticated
using (created_by = auth.uid() or public.current_profile_role() = 'admin')
with check (
  (created_by = auth.uid() and public.current_profile_role() in ('teacher', 'admin'))
  or public.current_profile_role() = 'admin'
);

drop policy if exists events_delete_owner_or_admin on public.events;
create policy events_delete_owner_or_admin on public.events
for delete to authenticated
using (created_by = auth.uid() or public.current_profile_role() = 'admin');

drop policy if exists attendance_select_authorized on public.attendance;
create policy attendance_select_authorized on public.attendance
for select to authenticated
using (
  student_id = auth.uid()
  or public.current_profile_role() = 'admin'
  or exists (
    select 1 from public.events e
    where e.id = attendance.event_id and e.created_by = auth.uid()
      and public.current_profile_role() = 'teacher'
  )
);

revoke all on public.attendance from anon, authenticated;
grant select on public.attendance to authenticated;

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
for select to authenticated
using (public.current_profile_role() = 'admin');
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create or replace function public.record_attendance(p_event_code text)
returns table (attendance_id uuid, event_title text, recorded_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_attendance_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if public.current_profile_role() <> 'student' then
    raise exception 'Only students can record attendance' using errcode = '42501';
  end if;

  select e.* into v_event
  from public.events e
  where e.event_code = trim(p_event_code);

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if v_event.status <> 'open' then
    raise exception 'Event is closed' using errcode = 'P0001';
  end if;

  insert into public.attendance (student_id, event_id, attendance_date, attendance_time)
  values (auth.uid(), v_event.id, current_date, now())
  returning id into v_attendance_id;

  return query select v_attendance_id, v_event.title, now();
end;
$$;

revoke all on function public.record_attendance(text) from public, anon;
grant execute on function public.record_attendance(text) to authenticated;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_role text;
begin
  if auth.uid() is null or public.current_profile_role() <> 'admin' then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_role not in ('student', 'teacher', 'admin') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;

  select role into v_old_role from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if v_old_role = 'admin' and p_role <> 'admin' then
    perform pg_advisory_xact_lock(719314021);
    if (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'Cannot remove the last administrator' using errcode = '23514';
    end if;
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (
    auth.uid(),
    'role_changed',
    'profiles',
    p_user_id::text,
    jsonb_build_object('old_role', v_old_role, 'new_role', p_role)
  );
end;
$$;

revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

create or replace function public.admin_correct_attendance(
  p_attendance_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
begin
  if auth.uid() is null or public.current_profile_role() <> 'admin' then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_status not in ('present', 'excused', 'absent') then
    raise exception 'Invalid attendance status' using errcode = '22023';
  end if;

  select status into v_old_status
  from public.attendance
  where id = p_attendance_id
  for update;
  if not found then
    raise exception 'Attendance record not found' using errcode = 'P0002';
  end if;

  update public.attendance set status = p_status where id = p_attendance_id;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (
    auth.uid(),
    'attendance_corrected',
    'attendance',
    p_attendance_id::text,
    jsonb_build_object('old_status', v_old_status, 'new_status', p_status)
  );
end;
$$;

create or replace function public.admin_delete_attendance(p_attendance_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_record public.attendance%rowtype;
begin
  if auth.uid() is null or public.current_profile_role() <> 'admin' then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into v_old_record
  from public.attendance
  where id = p_attendance_id
  for update;
  if not found then
    raise exception 'Attendance record not found' using errcode = 'P0002';
  end if;

  delete from public.attendance where id = p_attendance_id;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (
    auth.uid(),
    'attendance_deleted',
    'attendance',
    p_attendance_id::text,
    jsonb_build_object(
      'student_id', v_old_record.student_id,
      'event_id', v_old_record.event_id,
      'status', v_old_record.status,
      'attendance_time', v_old_record.attendance_time
    )
  );
end;
$$;

revoke all on function public.admin_correct_attendance(uuid, text) from public, anon;
revoke all on function public.admin_delete_attendance(uuid) from public, anon;
grant execute on function public.admin_correct_attendance(uuid, text) to authenticated;
grant execute on function public.admin_delete_attendance(uuid) to authenticated;

notify pgrst, 'reload schema';
