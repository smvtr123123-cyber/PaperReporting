import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase, type ReportConfig } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import ChipInput from "../components/ChipInput";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type Form = Omit<ReportConfig, "id" | "user_id" | "last_run_at" | "created_at">;

const DEFAULT_FORM: Form = {
  name: "",
  keywords: [],
  frequency: "daily",
  run_hour: 9,
  day_of_week: 1,
  day_of_month: 1,
  recipients: [],
  only_scie: true,
  min_quartile: null,
  lookback_days: 30,
  max_results: 15,
  active: true,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ConfigEditor() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const { session } = useAuth();
  const [form, setForm] = useState<Form>(DEFAULT_FORM);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    supabase
      .from("report_configs")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setError("설정을 불러오지 못했습니다.");
        else {
          const { id: _i, user_id: _u, last_run_at: _l, created_at: _c, ...rest } = data as ReportConfig;
          setForm(rest);
        }
        setLoading(false);
      });
  }, [id, isNew]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setError(null);
    if (!form.name.trim()) return setError("리포팅 이름을 입력하세요.");
    if (form.keywords.length === 0) return setError("키워드를 1개 이상 등록하세요.");
    if (form.recipients.length === 0) return setError("수신 이메일을 1개 이상 등록하세요.");
    const badEmail = form.recipients.find((e) => !EMAIL_RE.test(e));
    if (badEmail) return setError(`이메일 형식이 올바르지 않습니다: ${badEmail}`);

    setSaving(true);
    const payload = {
      ...form,
      day_of_week: form.frequency === "weekly" ? form.day_of_week : null,
      day_of_month: form.frequency === "monthly" ? form.day_of_month : null,
    };
    let res;
    if (isNew) {
      res = await supabase.from("report_configs").insert({ ...payload, user_id: session!.user.id });
    } else {
      res = await supabase.from("report_configs").update(payload).eq("id", id);
    }
    setSaving(false);
    if (res.error) setError(res.error.message);
    else nav("/");
  };

  if (loading) return <div className="text-slate-400 text-center py-10">불러오는 중…</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">
        {isNew ? "새 리포팅 설정" : "리포팅 설정 편집"}
      </h1>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
        {/* 이름 */}
        <Field label="리포팅 이름" hint="예: 유기태양전지 주간 리포트">
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="input"
            placeholder="리포팅 이름"
          />
        </Field>

        {/* 키워드 */}
        <Field label="키워드 (해시태그)" hint="Enter 로 추가. 예: perovskite, solar cell, tandem">
          <ChipInput
            values={form.keywords}
            onChange={(v) => set("keywords", v)}
            prefix="#"
            placeholder="키워드 입력 후 Enter"
          />
        </Field>

        {/* 주기 & 시간 */}
        <Field label="리포팅 주기 & 시간" hint="한국 시간(KST) 기준 정각에 발송됩니다.">
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={form.frequency}
              onChange={(e) => set("frequency", e.target.value as Form["frequency"])}
              className="input w-auto"
            >
              <option value="daily">매일</option>
              <option value="weekly">매주</option>
              <option value="monthly">매월</option>
            </select>

            {form.frequency === "weekly" && (
              <select
                value={form.day_of_week ?? 1}
                onChange={(e) => set("day_of_week", Number(e.target.value))}
                className="input w-auto"
              >
                {DOW.map((d, i) => (
                  <option key={i} value={i}>{d}요일</option>
                ))}
              </select>
            )}

            {form.frequency === "monthly" && (
              <select
                value={form.day_of_month ?? 1}
                onChange={(e) => set("day_of_month", Number(e.target.value))}
                className="input w-auto"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}일</option>
                ))}
              </select>
            )}

            <select
              value={form.run_hour}
              onChange={(e) => set("run_hour", Number(e.target.value))}
              className="input w-auto"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h < 12 ? "오전" : "오후"} {((h + 11) % 12) + 1}시 ({String(h).padStart(2, "0")}:00)
                </option>
              ))}
            </select>
          </div>
        </Field>

        {/* 수신 이메일 */}
        <Field label="수신 이메일" hint="Enter 로 추가. 여러 명 등록 가능.">
          <ChipInput
            values={form.recipients}
            onChange={(v) => set("recipients", v)}
            placeholder="email@example.com 입력 후 Enter"
          />
        </Field>

        {/* 발췌 옵션 */}
        <Field label="발췌 조건">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.only_scie}
                onChange={(e) => set("only_scie", e.target.checked)}
                className="rounded"
              />
              SCI/SCIE 등재 저널 논문만 포함
            </label>
            <div className="flex flex-wrap gap-4 items-center text-sm">
              <label className="flex items-center gap-2">
                최소 등급(Scimago)
                <select
                  value={form.min_quartile ?? ""}
                  onChange={(e) => set("min_quartile", (e.target.value || null) as Form["min_quartile"])}
                  className="input w-auto"
                >
                  <option value="">제한 없음</option>
                  <option value="Q1">Q1 이상</option>
                  <option value="Q2">Q2 이상</option>
                  <option value="Q3">Q3 이상</option>
                  <option value="Q4">Q4 이상</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                최근
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.lookback_days}
                  onChange={(e) => set("lookback_days", Number(e.target.value))}
                  className="input w-20"
                />
                일 이내
              </label>
              <label className="flex items-center gap-2">
                최대
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={form.max_results}
                  onChange={(e) => set("max_results", Number(e.target.value))}
                  className="input w-20"
                />
                건
              </label>
            </div>
          </div>
        </Field>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex gap-2 pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
          <button
            onClick={() => nav("/")}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-lg"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-semibold text-slate-800 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-2">{hint}</p>}
      {children}
    </div>
  );
}
