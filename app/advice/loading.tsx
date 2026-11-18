export default function AdviceLoading() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3" aria-busy="true" aria-live="polite">
      <section className="rounded-[22px] bg-white px-5 pt-6 pb-5">
        <p className="text-[15px] font-medium text-[#4e5968]">오늘 자문</p>
        <p className="mt-2 text-[14px] leading-5 text-[#6b7684]">자문 글을 받고 있습니다.</p>
      </section>
      <section className="flex flex-col items-center gap-3 rounded-[22px] bg-white px-5 py-16">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#d1d6db] border-t-[#3182f6]" />
        <p className="text-[14px] text-[#6b7684]">응답을 기다리는 중</p>
      </section>
    </div>
  );
}
