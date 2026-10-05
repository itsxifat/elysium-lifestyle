export const dynamic = "force-dynamic";

import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { getProduct } from "@/lib/storefront";
import ProductDetailClient from "./ProductDetailClient";

// The product, its sizes with live availability, size chart, related products
// and any flash price, from the brand ERP. Metadata and the page share one read.
const load = cache((slug) => getProduct(slug));

export async function generateMetadata({ params }) {
  try {
    const found = await load(params.slug);
    if (!found?.product) return { title: "Product Not Found" };
    const { product } = found;
    return {
      title: product.seoTitle || product.name,
      description:
        product.seoDescription ||
        product.description?.slice(0, 160) ||
        `Shop ${product.name} at Elysium Lifestyle`,
      openGraph: {
        title: product.seoTitle || product.name,
        // The ERP's public image URL: crawlers (Facebook, WhatsApp) fetch it directly.
        images: product.ogImage ? [{ url: product.ogImage }] : [],
      },
    };
  } catch {
    return { title: "Product" };
  }
}

export default async function ProductPage({ params }) {
  const found = await load(params.slug);
  // A product renamed in the ERP keeps its old address: answer it with a 301.
  if (found?.redirect && found.redirect !== params.slug) permanentRedirect(`/shop/${found.redirect}`);
  if (!found?.product) notFound();

  return <ProductDetailClient product={found.product} related={found.related} categoryPath={found.categoryPath} />;
}
