import { Manrope } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

// Single clean, premium-neutral sans for the whole site (body + headings).
// Variable font → full weight range available for hierarchy.
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata = {
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
      </body>
    </html>
  );
}
