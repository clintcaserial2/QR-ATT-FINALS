-- Repair missing PostgREST relationships on an existing QR-ATT database.
-- Run this in the Supabase SQL Editor as the project owner.

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

notify pgrst, 'reload schema';
