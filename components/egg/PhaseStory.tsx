import { filledWhySections, whyHasDetail, type PhaseWhyNote } from "@/lib/engine/phase-why";
import { PHASE_STORY } from "@/lib/engine/phase-story";
import type { Phase } from "@/lib/engine/types";

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0 text-[#8b95a1] transition-transform group-open:rotate-180"
    >
      <path d="M6 9.5 12 15.5 18 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-left [-webkit-tap-highlight-color:transparent] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-[#8b95a1]">{title}</span>
        <ChevronIcon />
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}

function WhyBody({ note }: { note: PhaseWhyNote }) {
  const sections = filledWhySections(note);
  if (!whyHasDetail(note)) {
    return <p className="text-[15px] leading-6 text-[#333d4b]">{note.lead}</p>;
  }

  return (
    <div>
      {note.when ? <p className="text-[13px] font-semibold text-[#3182f6]">{note.when}</p> : null}
      {note.lead ? <p className={`${note.when ? "mt-1" : ""} text-[15px] leading-6 text-[#333d4b]`}>{note.lead}</p> : null}
      {sections.length > 0 ? (
        <div className="mt-3 grid gap-3">
          {sections.map((section, index) => (
            <section key={`${section.title}-${index}`}>
              {section.title ? <h3 className="text-[13px] font-semibold text-[#8b95a1]">{section.title}</h3> : null}
              {section.body ? <p className={`${section.title ? "mt-1" : ""} text-[15px] leading-6 text-[#333d4b]`}>{section.body}</p> : null}
            </section>
          ))}
        </div>
      ) : null}
      {note.close ? <p className="mt-3 text-[15px] leading-6 text-[#191f28]">{note.close}</p> : null}
    </div>
  );
}

export function PhaseWhy({ note }: { note: PhaseWhyNote }) {
  return (
    <Fold title="왜 이 국면인가요">
      <WhyBody note={note} />
    </Fold>
  );
}

export function PhaseStory({ phase }: { phase: Phase }) {
  const story = PHASE_STORY[phase];

  return (
    <Fold title="그래서 비중은">
      <p className="text-[15px] leading-6 text-[#333d4b]">{story.stance}</p>
    </Fold>
  );
}
