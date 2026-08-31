import type { ComponentType } from "react";

type IconType = ComponentType<{ size?: number; stroke?: number }>;

export function PhasePlaceholder({
  icon: Icon,
  title,
  phase,
  lines,
}: {
  icon: IconType;
  title: string;
  phase: string;
  lines: string[];
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[rgba(0,0,0,0.06)] flex items-center justify-center mb-5">
        <Icon size={26} />
      </div>
      <h1 className="text-[17px] font-bold">{title}</h1>
      <span className="badge neutral mt-2 mb-3">{phase}</span>
      <p className="text-[12.5px] font-semibold t-secondary leading-relaxed">
        {lines.map((l, i) => (
          <span key={i}>
            {l}
            {i < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    </div>
  );
}