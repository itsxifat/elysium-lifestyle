import { Interstitial, DemoButton } from "@/components/demo/Interstitial";

export const dynamic = "force-dynamic";

const REASONS = {
  bad_token: "That demo link has already been used, or it expired before you opened it. They are only valid for a minute.",
  provision: "We could not prepare a sandbox just now. This is on our side, not yours.",
};

export default function DemoUnavailablePage({ searchParams }) {
  const reason = REASONS[searchParams?.reason] || "The demo is not available at the moment.";

  return (
    <Interstitial
      eyebrow="Not available"
      title="Couldn't start the demo."
      actions={<DemoButton href="/api/demo/claim?next=/" primary>Try again</DemoButton>}
    >
      <p>{reason}</p>
    </Interstitial>
  );
}
