export const dynamic = "force-dynamic";

import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CartDrawer from "@/components/layout/CartDrawer";
import WhatsAppButton from "@/components/ui/WhatsAppButton";

export default function StoreLayout({ children }) {
  return (
    <>
      <Navbar />
      <main className="pt-[100px] lg:pt-[146px] min-h-screen">{children}</main>
      <Footer />
      <CartDrawer />
      <WhatsAppButton />
    </>
  );
}
