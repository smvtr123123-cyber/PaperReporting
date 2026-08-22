import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// service_role 키 사용 → RLS 우회. 서버(Netlify Functions)에서만 import 할 것.
let _client: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.");
  }
  // Netlify Functions(Node 20) 런타임에는 전역 WebSocket 이 없어
  // supabase-js 가 realtime 초기화 중 "native WebSocket not found" 로 즉시 throw 한다.
  // 서버 함수는 realtime 을 쓰지 않으므로, transport 를 주입해 native WebSocket
  // 탐색 자체를 건너뛴다(전역 WebSocket 이 있으면 그것을, 없으면 미사용 스텁).
  const WebSocketCtor =
    (globalThis as any).WebSocket ??
    class {
      /* realtime 미사용: 실제로 인스턴스화되지 않는다 */
    };
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocketCtor as any },
  });
  return _client;
}
