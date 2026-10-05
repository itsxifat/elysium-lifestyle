export const dynamic = "force-dynamic";

import { getSite, homeProducts, getCategoryTree, flattenCategories, getFlashSales } from "@/lib/storefront";
import HeroSlider from "@/components/home/HeroSlider";
import CategoryGrid from "@/components/home/CategoryGrid";
import FlashSaleSection from "@/components/home/FlashSaleSection";
import FeaturedProducts from "@/components/home/FeaturedProducts";
import PromoBanner from "@/components/home/PromoBanner";
import NewArrivals from "@/components/home/NewArrivals";
import Testimonials from "@/components/home/Testimonials";
import NewsletterSection from "@/components/home/NewsletterSection";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CartDrawer from "@/components/layout/CartDrawer";
import WhatsAppButton from "@/components/ui/WhatsAppButton";
import TrackingBootstrap from "@/components/tracking/TrackingBootstrap";

async function getHomeData() {
  const [site, products, tree, flash] = await Promise.all([
    getSite(),
    homeProducts().catch(() => ({ featuredProducts: [], newArrivals: [] })),
    getCategoryTree(),
    getFlashSales({ home: true }).catch(() => ({ live: [] })),
  ]);

  // The editorial grid: the categories marked featured on the ERP's Catalog
  // setup, else the first three at the top of the tree.
  const top = flattenCategories(tree).filter((c) => !c.parent);
  const featured = flattenCategories(tree).filter((c) => c.featured);
  const categories = (featured.length ? featured : top).slice(0, 3);

  return {
    featuredProducts: products.featuredProducts,
    newArrivals: products.newArrivals,
    categories,
    heroSlides: site.heroSlides,
    promoBanner: site.promoBanner,
    testimonials: site.testimonials,
    flashSales: flash.live,
  };
}

export default async function HomePage() {
  const { featuredProducts, newArrivals, categories, heroSlides, promoBanner, testimonials, flashSales } = await getHomeData();

  return (
    <>
      <TrackingBootstrap />
      <Navbar />
      <main className="pt-[100px] lg:pt-[146px]">
        <HeroSlider slides={heroSlides} />
        <FlashSaleSection sales={flashSales} />
        <CategoryGrid categories={categories} />
        <FeaturedProducts products={featuredProducts} />
        <PromoBanner promoBanner={promoBanner} />
        <NewArrivals products={newArrivals} />
        <Testimonials testimonials={testimonials} />
        <NewsletterSection />
      </main>
      <Footer />
      <CartDrawer />
      <WhatsAppButton />
    </>
  );
}
