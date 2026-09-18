export const dynamic = "force-dynamic";

import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";
import { getPublicFlashSale, getPublicFlashSales } from "@/lib/flashSale";
import { serializeDoc } from "@/lib/utils";
import { cdnAbsoluteUrl } from "@/lib/cdn";
import FlashCampaignView from "./FlashCampaignView";

// Metadata and the page both need the sale; load it once per request.
const loadPublic = cache((slug) => getPublicFlashSale(slug));

export async function generateMetadata({ params }) {
  try {
    const sale = await loadPublic(params.slug);
    if (!sale) return { title: "Flash Sale" };
    const image = cdnAbsoluteUrl(sale.bannerImage || sale.items[0]?.product.images?.[0]);
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

// One campaign's full page: every deal, with sorting and filters. Live sales
// can be bought from; a sale that hasn't started shows its deals as a sneak
// peek; an ended one says so. Staff can open a switched-off draft to check it.
export default async function FlashSaleCampaignPage({ params }) {
  let sale = await loadPublic(params.slug);
  let preview = false;
  if (!sale) {
    const session = await getServerSession(authOptions);
    if (isStaff(session?.user?.role)) {
      sale = await getPublicFlashSale(params.slug, { includeDrafts: true });
      preview = !!sale;
    }
  }
  if (!sale) notFound();

  // Sales from before campaign pages were reachable by id; send those links
  // to the proper address once the sale has one.
  if (sale.slug !== String(params.slug).toLowerCase()) permanentRedirect(`/flash-sale/${sale.slug}`);

  let others = [];
  try {
    others = (await getPublicFlashSales()).filter((s) => s._id !== sale._id);
  } catch {}

  return <FlashCampaignView sale={serializeDoc(sale)} others={serializeDoc(others)} preview={preview} />;
}
