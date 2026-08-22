import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { parseScimago, parseScie } from "../lib/csv";
import JournalDataBanner from "../components/JournalDataBanner";

const BATCH = 500;

async function postBatch(kind: "scimago" | "scie", rows: unknown[]) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch("/api/import-journals", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind, rows }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "업로드 실패");
  return json.upserted as number;
}

export default function Journals() {
  const [total, setTotal] = useState<number | null>(null);
  const [scieCount, setScieCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | "scimago" | "scie">(null);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string | null>(null);
  const scimagoRef = useRef<HTMLInputElement>(null);
  const scieRef = useRef<HTMLInputElement>(null);

  const loadCounts = async () => {
    const [{ count: t }, { count: s }] = await Promise.all([
      supabase.from("journal_metrics").select("*", { count: "exact", head: true }),
      supabase.from("journal_metrics").select("*", { count: "exact", head: true }).eq("is_scie", true),
    ]);
    setTotal(t ?? 0);
    setScieCount(s ?? 0);
  };

  useEffect(() => {
    loadCounts();
  }, []);

  const handle = async (kind: "scimago" | "scie", file: File) => {
    setBusy(kind);
    setProgress(0);
    setLog(null);
    try {
      const text = await file.text();
      const rows = kind === "scimago" ? parseScimago(text) : parseScie(text);
      if (rows.length === 0) throw new Error("파싱된 유효 행이 없습니다. CSV 형식을 확인하세요.");
      let done = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        await postBatch(kind, batch);
        done += batch.length;
        setProgress(Math.round((done / rows.length) * 100));
      }
      setLog(`${kind === "scimago" ? "Scimago" : "SCIE"} ${rows.length.toLocaleString()}행 적재 완료`);
      await loadCounts();
    } catch (e: any) {
      setLog(`오류: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <JournalDataBanner />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">저널 데이터 관리</h1>
        <p className="text-sm text-slate-500 mt-1">
          SCI/SCIE 필터와 영향력 지표를 위해 저널 데이터를 적재합니다. 같은 ISSN 은 덮어씁니다.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <StatCard label="적재된 저널(ISSN)" value={total} />
        <StatCard label="SCI/SCIE 표시 저널" value={scieCount} />
      </div>

      {busy && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-sm text-slate-600 mb-2">업로드 중… {progress}%</div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {log && !busy && (
        <div className={`text-sm rounded-lg px-4 py-3 ${log.startsWith("오류") ? "bg-red-50 text-red-700 border border-red-100" : "bg-green-50 text-green-700 border border-green-100"}`}>
          {log}
        </div>
      )}

      <UploadCard
        title="1) Scimago 지표 CSV"
        desc="scimagojr.com → Download data (세미콜론 구분). SJR·분위·H지수·CiteScore·분야를 채웁니다."
        buttonLabel="Scimago CSV 선택"
        disabled={!!busy}
        inputRef={scimagoRef}
        onFile={(f) => handle("scimago", f)}
      />
      <UploadCard
        title="2) Clarivate SCIE 목록 CSV"
        desc="mjl.clarivate.com → Master Journal List 의 SCIE 저널 목록. 해당 ISSN 을 SCI/SCIE 로 표시합니다."
        buttonLabel="SCIE CSV 선택"
        disabled={!!busy}
        inputRef={scieRef}
        onFile={(f) => handle("scie", f)}
      />

      <p className="text-xs text-slate-400">
        브라우저에서 CSV 를 파싱한 뒤 500행씩 서버로 전송합니다. 대용량 파일은 수십 초 걸릴 수 있습니다.
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1">
        {value == null ? "…" : value.toLocaleString()}
      </div>
    </div>
  );
}

function UploadCard({
  title,
  desc,
  buttonLabel,
  disabled,
  inputRef,
  onFile,
}: {
  title: string;
  desc: string;
  buttonLabel: string;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onFile: (f: File) => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500 mt-1 mb-3">{desc}</p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
