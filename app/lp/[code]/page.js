export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import LandingPage from "@/models/LandingPage";
import { publicOffers, publicShipping } from "@/lib/landing";
import { isStaff } from "@/lib/permissions";
import { serializeDoc } from "@/lib/utils";
import LandingPageView from "@/components/landing/LandingPageView";

// A landing page lives OUTSIDE the (store) layout on purpose: no navbar, no
// footer, no cart — nothing to click but the order form. That's the whole point
// of an ad funnel.
//
// Unpublished drafts 404 for the public but render for signed-in staff, so an
// admin can share a preview link before the campaign goes live.

async function getPage(code) {
  await connectDB();
  const page = await LandingPage.findOne({ code: String(code || "").toLowerCase() }).lean();
  if (!page) return null;

  if (!page.isActive) {
    const session = await getServerSession(authOptions);
    if (!isStaff(session?.user?.role)) return null;
  }

  const [offers, shipping] = await Promise.all([publicOffers(page), publicShipping(page)]);
  return { page, offers, shipping };
}

export async function generateMetadata({ params }) {
  const { code } = params;
  await connectDB();
  const page = await LandingPage.findOne({ code: String(code).toLowerCase() }, "name seoTitle seoDescription ogImage isActive").lean();
  if (!page) return { title: "Not found" };

  const title = page.seoTitle || page.name;
  return {
    title,
    description: page.seoDescription || undefined,
    // Ad landing pages should never compete with the catalog in search results.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: page.seoDescription || undefined,
      images: page.ogImage ? [page.ogImage] : undefined,
    },
  };
}

export default async function PublicLandingPage({ params }) {
  const { code } = params;
  const data = await getPage(code);
  if (!data) notFound();

  const { page, offers, shipping } = data;

  // Campaign view counter. Fire-and-forget: never let it delay or fail the page.
  LandingPage.updateOne({ _id: page._id }, { $inc: { views: 1 } }).catch(() => {});

  return (
    <>
      {!page.isActive && (
        <div className="bg-amber-500 text-white text-center text-[12px] font-semibold py-2 px-4">
          Draft preview — this page is not published. Only staff can see it.
        </div>
      )}
      <LandingPageView page={serializeDoc(page)} offers={serializeDoc(offers)} shipping={shipping} />
    </>
  );
}
