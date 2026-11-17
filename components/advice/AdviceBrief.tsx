import type { AdviceBrief as AdviceBriefView } from "@/lib/server/advice";

const SECTIONS: { key: "phase" | "portfolio" | "actions" | "leave"; title: string }[] = [
  { key: "phase", title: "지금 경제 국면" },
  { key: "portfolio", title: "내 포트폴리오" },
  { key: "actions", title: "이번 달 행동" },
  { key: "leave", title: "하지 않을 것" },
];

export function AdviceBrief({ brief }: { brief: AdviceBriefView }) {
  return (
    <div className="flex flex-col gap-3">
      {brief.notice ? (
        <p className="rounded-[22px] bg-white px-5 py-4 text-[13px] leading-5 text-[#4e5968]">{brief.notice}</p>
      ) : null}
      {SECTIONS.map((section) => (
        <section key={section.key} className="rounded-[22px] bg-white px-5 py-5">
          <h2 className="text-[17px] font-bold text-[#191f28]">{section.title}</h2>
          <p className="mt-2 text-[15px] leading-6 text-[#4e5968]">{brief[section.key]}</p>
        </section>
      ))}
      <p className="px-1 text-[12px] leading-5 text-[#8b95a1]">
        {brief.source === "spark" ? "NVIDIA Spark가 엔진 숫자를 풀어 쓴 글입니다. " : "앱이 계산한 괴리로 만든 초안입니다. "}
        투자 판단을 돕기 위한 참고이며 수익을 보장하지 않습니다.
      </p>
    </div>
  );
}
