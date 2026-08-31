export default function Loading() {
  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <div className="w-9 h-9 rounded-lg bg-[rgba(0,0,0,0.05)]" />
        <div className="w-9 h-9 rounded-lg bg-[rgba(0,0,0,0.05)]" />
      </div>

      <div className="card mx-5 mt-3 p-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[rgba(0,0,0,0.05)]" />
          <div className="w-32 h-4 rounded bg-[rgba(0,0,0,0.06)]" />
        </div>
        <div className="w-24 h-3 rounded mt-3 bg-[rgba(0,0,0,0.06)]" />
        <div className="w-16 h-3 rounded mt-4 bg-[rgba(0,0,0,0.06)]" />
        <div className="w-24 h-8 rounded mt-1 bg-[rgba(0,0,0,0.06)]" />
        <div className="h-[7px] rounded-full mt-3 bg-[rgba(0,0,0,0.06)]" />
        <div className="flex gap-6 mt-5 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="w-14 h-4 rounded bg-[rgba(0,0,0,0.06)]" />
          <div className="w-14 h-4 rounded bg-[rgba(0,0,0,0.06)]" />
          <div className="w-14 h-4 rounded bg-[rgba(0,0,0,0.06)]" />
        </div>
      </div>

      <div className="section-label">People</div>
      <div className="mx-5 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-9 h-9 rounded-full bg-[rgba(0,0,0,0.05)]" />
          <div className="flex-1">
            <div className="w-40 h-3 rounded bg-[rgba(0,0,0,0.06)]" />
            <div className="w-32 h-3 rounded mt-2 bg-[rgba(0,0,0,0.06)]" />
          </div>
        </div>
      </div>

      <div className="section-label">Transactions</div>
      <div className="mx-5 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="w-2.5 h-2.5 rounded-full bg-[rgba(0,0,0,0.06)]" />
            <div className="flex-1">
              <div className="w-28 h-3.5 rounded bg-[rgba(0,0,0,0.06)]" />
              <div className="w-44 h-3 rounded mt-2 bg-[rgba(0,0,0,0.06)]" />
            </div>
            <div className="w-14 h-4 rounded bg-[rgba(0,0,0,0.06)]" />
          </div>
        ))}
      </div>
    </div>
  );
}