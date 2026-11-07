/** Keep monitor navigations dark — no dashboard chrome flash. */
export default function MonitorLoading() {
  return (
    <div
      className="fixed inset-0 bg-[#050508]"
      aria-busy="true"
      aria-label="Monitor lädt"
    >
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-5">
        <div className="sg-skeleton h-4 w-40" />
        <div className="sg-skeleton h-8 w-28 rounded-lg" />
      </div>
      <div className="absolute inset-x-6 top-24 grid grid-cols-4 gap-3">
        <div className="sg-skeleton h-24 rounded-xl" />
        <div className="sg-skeleton h-24 rounded-xl" />
        <div className="sg-skeleton h-24 rounded-xl" />
        <div className="sg-skeleton h-24 rounded-xl" />
      </div>
    </div>
  );
}
