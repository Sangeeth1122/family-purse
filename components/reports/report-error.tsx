import { IconAlertTriangle } from "@tabler/icons-react";

/** Error state for a report that could not be loaded. */
export default function ReportError({ message }: { message?: string }) {
  return (
    <div className="card mx-5 mt-4 p-8 flex flex-col items-center text-center">
      <span className="h-11 w-11 rounded-xl flex items-center justify-center bg-black/5">
        <IconAlertTriangle size={20} stroke={1.8} className="t-red" />
      </span>
      <p className="mt-3 text-[14px] font-bold">Couldn&apos;t load this report</p>
      <p className="mt-1 text-[12.5px] font-semibold t-tertiary">
        {message ?? "Something went wrong. Try again in a moment."}
      </p>
    </div>
  );
}