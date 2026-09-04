// Demo interstitials sit outside the store's own chrome — a visitor whose
// sandbox has ended should not see a half-working shop behind the message.
export const metadata = { title: "Elysium demo" };

export default function DemoLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-[440px]">{children}</div>
    </div>
  );
}
