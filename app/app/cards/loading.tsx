export default function Loading() {
  return (
    <div className="min-h-screen pb-24">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[rgba(0,0,0,0.05)]" />
          <div className="w-16 h-5 rounded bg-[rgba(0,0,0,0.05)]" />
        </div>
        <div className="w-9 h-9 rounded-lg bg-[rgba(0,0,0,0.05)]" />
      </div>

      <div className="card mx-5 p-5">
        <div className="w-28 h-3 rounded bg-[rgba(0,0,0,0.06)]" />
        <div className="w-32 h-7 rounded mt-3 bg-[rgba(0,0,0,0.06)]" />
      </div>

      <div className="section-label">Cards</div>
      <div className="px-5 flex flex-col gap-2.5">
        {[0, 1].map((i) => (
          <div key={i} className="card p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[rgba(0,0,0,0.05)]" />
            <div className="flex-1">
              <div className="w-28 h-4 rounded bg-[rgba(0,0,0,0.06)]" />
              <div className="w-40 h-3 rounded mt-2 bg-[rgba(0,0,0,0.06)]" />
            </div>
            <div className="w-16 h-4 rounded bg-[rgba(0,0,0,0.06)]" />
          </div>
        ))}
      </div>
    </div>
  );
}