import { useState, type KeyboardEvent } from "react";

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  prefix?: string; // 칩 앞에 붙일 접두사 (예: "#")
}

// Enter / 쉼표로 항목을 추가하는 칩(태그) 입력 컴포넌트
export default function ChipInput({ values, onChange, placeholder, prefix }: Props) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const v = raw.trim().replace(/^#/, "");
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };

  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      remove(values[values.length - 1]);
    }
  };

  return (
    <div className="w-full border border-slate-300 rounded-lg px-2 py-2 flex flex-wrap gap-1.5 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 bg-white">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 text-sm px-2 py-1 rounded-md"
        >
          {prefix}
          {v}
          <button
            type="button"
            onClick={() => remove(v)}
            className="text-brand-400 hover:text-brand-700 leading-none"
            aria-label="삭제"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft && add(draft)}
        placeholder={values.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[140px] outline-none text-sm px-1 py-1 bg-transparent"
      />
    </div>
  );
}
