import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isSupabaseConfigured } from "../lib/supabase";

export default function Login() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setError(error);
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-brand-600 text-white grid place-items-center font-bold text-xl mx-auto mb-3">
            논
          </div>
          <h1 className="text-xl font-bold text-slate-900">논문 리포팅 관리자</h1>
          <p className="text-sm text-slate-500 mt-1">SCI/SCIE 논문 정기 리포팅</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Supabase 환경변수가 설정되지 않았습니다. <code>.env</code>에{" "}
            <code>VITE_SUPABASE_URL</code>·<code>VITE_SUPABASE_ANON_KEY</code>를 추가하세요.
          </div>
        )}

        <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">이메일</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button
            disabled={busy}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition"
          >
            {busy ? "로그인 중…" : "로그인"}
          </button>
          <p className="text-xs text-slate-400 text-center pt-1">
            계정은 관리자가 Supabase에서 생성합니다. 접근이 필요하면 관리자에게 문의하세요.
          </p>
        </form>
      </div>
    </div>
  );
}
