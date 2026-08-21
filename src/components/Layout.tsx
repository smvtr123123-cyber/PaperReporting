import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const { session, signOut } = useAuth();
  const loc = useLocation();

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-600 text-white grid place-items-center font-bold">
                논
              </div>
              <span className="font-bold text-slate-900 hidden sm:inline">논문 리포팅 관리자</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg ${isActive ? "bg-brand-50 text-brand-700 font-semibold" : "text-slate-500 hover:text-slate-800"}`
                }
              >
                리포팅 설정
              </NavLink>
              <NavLink
                to="/journals"
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg ${isActive ? "bg-brand-50 text-brand-700 font-semibold" : "text-slate-500 hover:text-slate-800"}`
                }
              >
                저널 데이터
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-400 hidden sm:inline">{session?.user.email}</span>
            <button
              onClick={signOut}
              className="text-slate-500 hover:text-slate-800 transition"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        {loc.pathname === "/" && (
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-900">리포팅 설정</h1>
            <Link
              to="/configs/new"
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg transition"
            >
              + 새 리포팅
            </Link>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
