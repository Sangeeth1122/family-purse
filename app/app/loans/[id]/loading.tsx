export default function Loading() {
  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center justify-between px-5 pt-6 pb-4">
        <div className="w-9 h-9 rounded-lg bg-[rgba(0,0,0,0.05)]" />
        <div className="w-14 h-5 rounded bg-[rgba(0,0,0,0.05)]" />
        <div className="w-9 h-9 rounded-lg bg-[rgba(0,0,0,0.05)]" />
      </div>

      <div className="card mx-5 p-5">
        <div className="w-20 h-5 rounded bg-[rgba(0,0,0,0.05)]" />
        <div className="w-28 h-6 rounded mt-3 bg-[rgba(0,0,0,0.05)]" />
        <div className="w-16 h-4 rounded mt-4 bg-[rgba(0,0,0,0.06)]" />
        <div className="w-40 h-8 rounded mt-2 bg-[rgba(0,0,0,0.06)]" />
        <div className="flex gap-10 mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="w-12 h-3 rounded bg-[rgba(0,0,0,0.06)]" />
          <div className="w-12 h-3 rounded bg-[rgba(0,0,0,0.06)]" />
          <div className="w-12 h-3 rounded bg-[rgba(0,0,0,0.06)]" />
        </div>
      </div>

      <div className="h-12 rounded-xl mt-4 mx-5 bg-[rgba(0,0,0,0.04)]" />

      <div className="section-label">History</div>
      <div className="mx-5 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
            <div className="w-9 h-9 rounded-lg bg-[rgba(0,0,0,0.05)]" />
            <div className="flex-1">
              <div className="w-32 h-4 rounded bg-[rgba(0,0,0,0.06)]" />
              <div className="w-24 h-3 rounded mt-2 bg-[rgba(0,0,0,0.06)]" />
            </div>
            <div className="w-16 h-4 rounded bg-[rgba(0,0,0,0.06)]" />
          </div>
        ))}
      </div>
    </div>
  );
}