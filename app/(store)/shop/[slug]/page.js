export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import "@/models/Category";
import "@/models/SizeChart";
import { serializeDoc, formatPrice, calculateDiscount } from "@/lib/utils";
import { cdnAbsoluteUrl } from "@/lib/cdn";
import ProductDetailClient from "./ProductDetailClient";

async function getProduct(slug) {
  await connectDB();
  const product = await Product.findOne({ slug, isPublished: true })
    .populate("category", "name slug gender")
    .populate("sizeChart", "name columns rows")
    .lean();
  if (!product) return null;

  const related = await Product.find({
    category: product.category?._id,
    _id: { $ne: product._id },
    isPublished: true,
  })
    .limit(4)
    .lean();

  return {
    product: serializeDoc(product),
    related: serializeDoc(related),
  };
}

export async function generateMetadata({ params }) {
  try {
    await connectDB();
    const product = await Product.findOne({ slug: params.slug }).lean();
    if (!product) return { title: "Product Not Found" };
    // og:image is fetched by external crawlers (Facebook, WhatsApp, …) which
    // can't use the same-origin proxy — give them an absolute, never-expiring
    // signed CDN URL instead.
    const ogImage = cdnAbsoluteUrl(product.images?.[0]);
    return {
      title: product.name,
      description: product.description?.slice(0, 160) || `Shop ${product.name} at Elysium Lifestyle`,
      openGraph: {
        title: product.name,
        images: ogImage ? [{ url: ogImage }] : [],
      },
    };
  } catch {
    return { title: "Product" };
  }
}

export default async function ProductPage({ params }) {
  const data = await getProduct(params.slug);
  if (!data) notFound();

  return <ProductDetailClient product={data.product} related={data.related} />;
}
