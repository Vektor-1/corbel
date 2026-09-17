import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createParticipantSession, MlBackendError, SESSION_COOKIE } from '@/lib/server/mlBackendClient';

export const runtime = 'nodejs';

// Sets up (or refreshes) the demo participant session used by every other
// /api/ml-backend/* route. The backend's researcher key never leaves this
// server — the browser only ever receives an httpOnly session cookie.
export async function POST() {
  if (process.env.NEXT_PUBLIC_FEATURE_ML_BACKEND !== 'true') {
    return NextResponse.json({ error: 'ML backend import is not enabled.' }, { status: 503 });
  }

  try {
    const { token, expiresAt } = await createParticipantSession();
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: new Date(expiresAt),
    });
    return NextResponse.json({ ok: true, expiresAt });
  } catch (error) {
    const status = error instanceof MlBackendError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to start an ML backend session.';
    return NextResponse.json({ error: message }, { status });
  }
}
