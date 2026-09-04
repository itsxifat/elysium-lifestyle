import { Interstitial, DemoButton } from "@/components/demo/Interstitial";

export const dynamic = "force-dynamic";

export default function DemoBusyPage({ searchParams }) {
  const retry = Number(searchParams?.retry) || 0;
  const minutes = retry ? Math.max(1, Math.ceil(retry / 60)) : null;

  return (
    <Interstitial
      eyebrow="At capacity"
      title={<>Every sandbox is<br />in use right now.</>}
      actions={
        <>
          <DemoButton href="/api/demo/claim?next=/" primary>Try again</DemoButton>
        </>
      }
    >
      <p>
        {minutes
          ? `One should free up in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`
          : "One should free up shortly."}{" "}
        Sandboxes are returned automatically, so this clears on its own.
      </p>
    </Interstitial>
  );
}
