export const dynamic = "force-dynamic";

import { cache } from "react";
import { notFound } from "next/navigation";
import { getFlashSale, getFlashSales } from "@/lib/storefront";
import FlashCampaignView from "./FlashCampaignView";

// Metadata and the page both need the sale; load it once per request.
const loadSale = cache((slug) => getFlashSale(slug));

export async function generateMetadata({ params }) {
  try {
    const sale = await loadSale(params.slug);
    if (!sale) return { title: "Flash Sale" };
    const image = sale.bannerImage || sale.items[0]?.product.images?.[0];
    const description =
      sale.subtitle ||
      `${sale.stats.count} limited-stock deals${sale.stats.maxDiscount ? `, up to ${sale.stats.maxDiscount}% off` : ""}.`;
    return {
      title: `${sale.title} — Flash Sale`,
      description,
      openGraph: { title: sale.title, description, images: image ? [{ url: image }] : [] },
    };
  } catch {
    return { title: "Flash Sale" };
  }
}

// One campaign's full page: every deal, with sorting and filters. Live sales can
// be bought from; a sale that hasn't started shows its deals as a sneak peek.
// Drafts and ended sales are not served by the ERP, so they are not found here;
// staff preview a sale in the ERP console.
export default async function FlashSaleCampaignPage({ params }) {
  const sale = await loadSale(params.slug);
  if (!sale) notFound();

  let others = [];
  try {
    const { live } = await getFlashSales();
    others = live.filter((s) => s._id !== sale._id);
  } catch {}

  return <FlashCampaignView sale={sale} others={others} preview={false} />;
}
