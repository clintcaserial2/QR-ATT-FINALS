import { supabase } from './supabase';

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  venue?: string;
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  description: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string;
  status: 'open' | 'closed' | 'cancelled';
  created_by: string | null;
  created_at: string;
};

export async function createEvent(
  event: Event
): Promise<{ error: string | null; eventCode?: string }> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: userError?.message ?? 'You must be signed in to create an event.' };
  }

  const { data, error } = await supabase.from('events').insert(
    {
      event_code: event.eventId,
      title: event.title,
      description: event.description?.trim() ?? '',
      event_date: event.start.slice(0, 10),
      start_time: new Date(event.start).toISOString(),
      end_time: new Date(event.end).toISOString(),
      venue: event.venue?.trim() || 'TBD',
      status: 'open',
      created_by: user.id,
    }
  ).select('event_code').single();

  if (error?.code === '23505') {
    return {
      error: 'That event code is already in use. Enter a different event code and try again.',
    };
  }

  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: 'Event was saved but its event code could not be confirmed. Refresh events before generating its QR.' };
  }
  return { error: null, eventCode: data.event_code };
}

export async function getEventsByTeacher(
  teacherId: string
): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return [];
  }

  return data as CloudEvent[];
}

export async function getEventByCode(
  code: string
): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('event_code', code)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CloudEvent;
}
