export default function Loading() {
  return (
    <div className="min-h-screen pb-24 px-5 pt-16 flex flex-col items-center gap-3">
      <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--text)" }} />
      <p className="text-[12.5px] font-semibold t-secondary">Loading…</p>
    </div>
  );
}