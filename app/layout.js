import { Manrope } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import { getSite } from "@/lib/storefront";

// Single clean, premium-neutral sans for the whole site (body + headings).
// Variable font → full weight range available for hierarchy.
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

// Every page reads the brand ERP (menu, contact details, prices, stock), so
// nothing is pre-rendered at build time.
export const dynamic = "force-dynamic";

export const metadata = {
  // Resolves og:image / twitter image URLs. Set NEXT_PUBLIC_SITE_URL per deploy.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://demo.elysium-lifestyle.bd"),
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

export default async function RootLayout({ children }) {
  // The menu, announcement, contact details, shipping rule and payment methods,
  // from the brand ERP (cached for its 30 seconds in lib/erp.js). If the ERP is
  // unreachable the frame still renders with neutral defaults.
  const settings = await getSite();
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} font-sans antialiased bg-brand-cream text-brand-brown`}
      >
        <Providers settings={settings}>{children}</Providers>
      </body>
    </html>
  );
}
