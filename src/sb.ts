import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { REMOTE, SUPABASE_KEY, SUPABASE_URL } from './remote';

/** Cliente completo (login, escrita, storage). Só o editor e o painel o importam: o acervo público usa fetch direto. */
export const sb: SupabaseClient = REMOTE ? createClient(SUPABASE_URL!, SUPABASE_KEY!) : (null as never);
