export default function Loading() {
  return (
    <div className="min-h-screen pb-28">
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <div className="w-9 h-9 rounded-lg bg-[rgba(0,0,0,0.05)]" />
        <div className="w-16 h-5 rounded bg-[rgba(0,0,0,0.05)]" />
      </div>

      <div className="px-5 flex gap-2 mb-4">
        <div className="w-20 h-8 rounded-full bg-[rgba(0,0,0,0.05)]" />
        <div className="w-24 h-8 rounded-full bg-[rgba(0,0,0,0.05)]" />
        <div className="w-24 h-8 rounded-full bg-[rgba(0,0,0,0.05)]" />
      </div>

      <div className="px-5 space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="w-32 h-4 rounded bg-[rgba(0,0,0,0.06)]" />
              <div className="w-14 h-5 rounded-full bg-[rgba(0,0,0,0.05)]" />
            </div>
            <div className="w-40 h-3 rounded mt-2 bg-[rgba(0,0,0,0.06)]" />
            <div className="h-[7px] rounded-full mt-3 bg-[rgba(0,0,0,0.06)]" />
            <div className="w-36 h-3 rounded mt-2 bg-[rgba(0,0,0,0.06)]" />
            <div className="flex items-center gap-2 mt-4">
              <div className="w-6 h-6 rounded-full bg-[rgba(0,0,0,0.05)]" />
              <div className="w-6 h-6 rounded-full bg-[rgba(0,0,0,0.05)]" />
              <div className="w-16 h-3 rounded bg-[rgba(0,0,0,0.06)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}