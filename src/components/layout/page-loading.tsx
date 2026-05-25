export function PageLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="relative size-10">
        <div className="absolute inset-0 rounded-full border-2 border-[#e5e5e5]" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#000000] animate-spin" />
      </div>
      <div className="flex gap-1">
        <span className="size-1.5 rounded-full bg-[#a3a3a3] animate-bounce [animation-delay:0ms]" />
        <span className="size-1.5 rounded-full bg-[#a3a3a3] animate-bounce [animation-delay:150ms]" />
        <span className="size-1.5 rounded-full bg-[#a3a3a3] animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}
