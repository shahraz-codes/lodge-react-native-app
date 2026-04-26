import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/lib/types';
import { logger } from './logger';

export interface ManagedUser extends Profile {
  email: string | null;
  created_at?: string | null;
}

// Fetch all profiles. The auth.users email is not exposed via the anon API by
// default, so we surface whatever is present on the profile row plus any email
// that the trigger backfilled. The screen falls back to "—" when missing.
export async function fetchUsers(): Promise<ManagedUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, email, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    // The schema may not have an email column. Retry without it so the screen
    // still works with the original schema.
    if (/column .* email/i.test(error.message) || error.code === '42703') {
      const fallback = await supabase.from('profiles').select('*');
      if (fallback.error) throw fallback.error;
      return (fallback.data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name ?? null,
        role: (p.role as UserRole) ?? null,
        email: null,
        created_at: p.created_at ?? null,
      }));
    }
    throw error;
  }
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name ?? null,
    role: (p.role as UserRole) ?? null,
    email: p.email ?? null,
    created_at: p.created_at ?? null,
  }));
}

interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

// Sign up a new staff account. Supabase's signUp signs the new user in by
// default, which would log the owner out. We capture the existing tokens up
// front and restore them right after, so the owner stays signed in.
export async function createUser(input: CreateUserInput): Promise<Profile> {
  const start = Date.now();
  logger.info('users', 'createUser → start', {
    email: input.email,
    role: input.role,
  });

  const { data: existingSessionData } = await supabase.auth.getSession();
  const ownerSession = existingSessionData?.session ?? null;

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        name: input.name.trim(),
        role: input.role,
      },
    },
  });

  if (error) {
    logger.error('users', 'createUser → signUp failed', {
      email: input.email,
      error: error.message,
    });
    throw error;
  }

  const newUserId = data.user?.id;
  if (!newUserId) {
    throw new Error('Account created but no user id was returned.');
  }

  if (ownerSession?.access_token && ownerSession.refresh_token) {
    try {
      await supabase.auth.setSession({
        access_token: ownerSession.access_token,
        refresh_token: ownerSession.refresh_token,
      });
    } catch (e: any) {
      logger.warn('users', 'createUser: restoring owner session failed', {
        error: e?.message ?? String(e),
      });
    }
  }

  // Belt-and-braces: also upsert the profile row in case the trigger isn't
  // installed on this database. With the new "Owners can insert profiles"
  // policy this works for the currently signed-in owner.
  const upsertPayload: Record<string, unknown> = {
    id: newUserId,
    name: input.name.trim(),
    role: input.role,
  };
  const { error: upsertErr } = await supabase
    .from('profiles')
    .upsert(upsertPayload, { onConflict: 'id' });
  if (upsertErr) {
    logger.warn('users', 'createUser: profile upsert failed', {
      userId: newUserId,
      error: upsertErr.message,
    });
  }

  logger.info('users', 'createUser → ok', {
    userId: newUserId,
    durationMs: Date.now() - start,
  });

  return {
    id: newUserId,
    name: input.name.trim(),
    role: input.role,
  };
}

export async function deleteUser(userId: string): Promise<void> {
  logger.info('users', 'deleteUser → start', { userId });
  const { error } = await supabase.from('profiles').delete().eq('id', userId);
  if (error) {
    logger.error('users', 'deleteUser → fail', {
      userId,
      error: error.message,
    });
    throw error;
  }
  logger.info('users', 'deleteUser → ok', { userId });
}
