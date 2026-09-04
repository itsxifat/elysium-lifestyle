import { Interstitial, DemoButton } from "@/components/demo/Interstitial";

export const dynamic = "force-dynamic";

// The promise the demo makes, kept. Say plainly that the work is gone — a
// visitor who thinks it might come back will go looking for it.
export default function DemoExpiredPage() {
  return (
    <Interstitial
      eyebrow="Demo ended"
      title={<>Your thirty<br />minutes are up.</>}
      actions={
        <>
          <DemoButton href="/api/demo/claim?next=/" primary>Start a fresh demo</DemoButton>
          <DemoButton href="https://enfinito.com">About Elysium</DemoButton>
        </>
      }
    >
      <p>
        That sandbox has been destroyed, along with everything in it. Nothing you
        entered was kept, and nothing left this machine.
      </p>
      <p>A new one starts clean, with the same catalogue and the same sign-in details.</p>
    </Interstitial>
  );
}
