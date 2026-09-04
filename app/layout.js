import { Manrope } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import { DemoBanner } from "@enfinito/demo-kit/ui";

// Single clean, premium-neutral sans for the whole site (body + headings).
// Variable font → full weight range available for hierarchy.
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata = {
  // Resolves og:image / twitter image URLs. Falls back to the prod origin so it
  // doesn't default to localhost in production (set NEXT_PUBLIC_SITE_URL on the VPS).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://elyle.enfinito.cloud"),
  title: {
    default: "Elysium Lifestyle — Premium Fashion",
    template: "%s | Elysium Lifestyle",
  },
  description:
    "Discover premium fashion for men, women, and kids at Elysium Lifestyle. Shop the latest collections, new arrivals, and exclusive deals.",
  keywords: ["fashion", "clothing", "men", "women", "kids", "Bangladesh", "lifestyle"],
  openGraph: {
    title: "Elysium Lifestyle — Premium Fashion",
    description: "Premium fashion for every lifestyle.",
    siteName: "Elysium Lifestyle",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} font-sans antialiased bg-brand-cream text-brand-brown`}
      >
        <Providers>{children}</Providers>
        {/* Renders nothing outside demo mode. Fixed to the bottom so the
            countdown is always visible — a visitor who does not know their work
            is temporary will be genuinely upset when it disappears. */}
        <DemoBanner />
      </body>
    </html>
  );
}
