-- Allow attendance for any open event, regardless of its scheduled start/end time.
-- Run this in the Supabase SQL Editor to update an existing project.

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

notify pgrst, 'reload schema';
