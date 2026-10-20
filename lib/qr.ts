export type QRPayload = {
  event: string;
  title?: string;
  start?: string;
  end?: string;
};

export function buildQRPayload(payload: QRPayload): string {
  return JSON.stringify({
    v: 1,
    event: payload.event,
  });
}

export function parseQRPayload(rawPayload: string) {
  try {
    const data = JSON.parse(rawPayload);

    if (
      typeof data.event !== 'string' ||
      !data.event.trim() ||
      data.event.length > 128
    ) {
      return {
        ok: false as const,
        message: 'Invalid QR code: event code is missing or malformed.',
      };
    }

    return {
      ok: true as const,
      payload: {
        event: data.event.trim(),
        title: data.title,
        start: data.start,
        end: data.end,
      },
    };
  } catch {
    return {
      ok: false as const,
      message: 'Invalid QR code.',
    };
  }
}
