export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CartDrawer from "@/components/layout/CartDrawer";
import WhatsAppButton from "@/components/ui/WhatsAppButton";
import TrackingBootstrap from "@/components/tracking/TrackingBootstrap";
import CustomUrlExperience from "@/components/layout/CustomUrlExperience";

export default function StoreLayout({ children }) {
  return (
    <>
      <TrackingBootstrap />
      <Navbar />
      <main className="pt-[100px] lg:pt-[146px] min-h-screen">
        {/* Custom-URL (?cu=) offer banner + pop-up, on any storefront page. */}
        <Suspense fallback={null}>
          <CustomUrlExperience />
        </Suspense>
        {children}
      </main>
      <Footer />
      <CartDrawer />
      <WhatsAppButton />
    </>
  );
}
