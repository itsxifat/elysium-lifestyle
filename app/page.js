export const dynamic = "force-dynamic";

import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import Category from "@/models/Category";
import Settings from "@/models/Settings";
import { serializeDoc } from "@/lib/utils";
import HeroSlider from "@/components/home/HeroSlider";
import CategoryGrid from "@/components/home/CategoryGrid";
import FeaturedProducts from "@/components/home/FeaturedProducts";
import PromoBanner from "@/components/home/PromoBanner";
import NewArrivals from "@/components/home/NewArrivals";
import Testimonials from "@/components/home/Testimonials";
import NewsletterSection from "@/components/home/NewsletterSection";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CartDrawer from "@/components/layout/CartDrawer";
import WhatsAppButton from "@/components/ui/WhatsAppButton";

async function getHomeData() {
  try {
    await connectDB();
    const [featuredProducts, newArrivals, settings] = await Promise.all([
      Product.find({ isPublished: true, featured: true })
        .populate("category", "name slug gender")
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      Product.find({ isPublished: true, isNewArrival: true })
        .populate("category", "name slug gender")
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      Settings.findOne({}).lean(),
    ]);

    let categories = await Category.find({ isActive: true, isFeatured: true })
      .sort({ sortOrder: 1 })
      .limit(3)
      .lean();
    if (categories.length === 0) {
      categories = await Category.find({ isActive: true })
        .sort({ sortOrder: 1 })
        .limit(3)
        .lean();
    }

    return {
      featuredProducts: serializeDoc(featuredProducts),
      newArrivals: serializeDoc(newArrivals),
      categories: serializeDoc(categories),
      heroSlides: serializeDoc(settings?.heroSlides || []),
      promoBanner: serializeDoc(settings?.promoBanner || null),
      testimonials: serializeDoc(settings?.testimonials || []),
    };
  } catch {
    return { featuredProducts: [], newArrivals: [], categories: [], heroSlides: [], promoBanner: null, testimonials: [] };
  }
}

export default async function HomePage() {
  const { featuredProducts, newArrivals, categories, heroSlides, promoBanner, testimonials } = await getHomeData();

  return (
    <>
      <Navbar />
      <main className="pt-[100px] lg:pt-[146px]">
        <HeroSlider slides={heroSlides} />
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
