import { Plus_Jakarta_Sans, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["300", "400", "500", "600"],
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
        className={`${jakarta.variable} ${cormorant.variable} font-sans antialiased bg-brand-cream text-brand-brown`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
