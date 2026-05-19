import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';

// Newer @supabase/supabase-js eagerly constructs a RealtimeClient inside
// createClient(), which needs a WebSocket constructor at init time. Node 20
// (what CI runs) ships no native WebSocket, so we hand it `ws` via the
// realtime.transport option. Node 22+ would make this unnecessary.
//
// Service-role client for e2e setup/teardown only — never use in app code.
export function createAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // ws's type isn't exactly WebSocketLikeConstructor but is compatible at runtime.
      realtime: { transport: ws as never },
    },
  );
}
