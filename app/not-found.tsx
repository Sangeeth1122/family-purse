import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-[26px] font-black"
        style={{ background: "rgba(0,0,0,0.06)" }}
        aria-hidden="true"
      >
        ?
      </div>
      <h1 className="text-[20px] font-bold mt-5">Page not found</h1>
      <p className="text-[13px] font-semibold t-secondary mt-2 max-w-[280px] leading-relaxed">
        This page doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link href="/" className="btn btn-secondary mt-6">
        Go to Family Purse
      </Link>
    </div>
  );
}