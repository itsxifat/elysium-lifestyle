import { PackageCheck, RefreshCw, CircleAlert, Phone, Mail } from "lucide-react";
import { getSiteInfo } from "@/lib/getSiteInfo";
import { telHref } from "@/lib/siteInfo";
import { landingFontVars } from "@/components/landing/fonts";
import { landingFontFamily } from "@/lib/landing-fonts";

export const metadata = {
  title: "Return & Exchange Policy",
  description: "Elysium Lifestyle's return & exchange policy — check your parcel in front of the delivery rider, and request any exchange within 72 hours of receiving it.",
};

// Re-read settings on each request so contact details stay in sync with admin.
export const dynamic = "force-dynamic";

const LAST_UPDATED = "12 September 2026";

// The Bangla and English versions are both the shop's own wording, not
// translations of each other — the English one is more detailed. When the
// policy changes, update both.
const BN_EXCHANGE_RULES = [
  { n: "১", text: "প্রোডাক্টের কোয়ালিটি ও অবস্থা আগের মতোই থাকতে হবে।" },
  { n: "২", text: "পণ্য পাওয়ার ৩ দিনের মধ্যে অভিযোগ জানাতে হবে।" },
  { n: "৩", text: "প্রোডাক্টের ট্যাগ ও পলিব্যাগ অক্ষত থাকতে হবে।" },
  { n: "৪", text: "এক্সচেঞ্জের জন্য ডেলিভারি চার্জ কাস্টমারকে বহন করতে হবে।" },
];

const EN_RULES = [
  {
    title: "Check Before Accepting",
    body: [
      "Customers are requested to check the product in front of the delivery rider before accepting the parcel.",
      "If you do not like the product or do not wish to keep it, you may return it immediately to the rider.",
      "In this case, the applicable delivery/return charge will be paid by the customer.",
    ],
  },
  {
    title: "Faulty or Wrong Product",
    body: [
      "If the product has a manufacturing fault, damage, or our team sends the wrong product, the company will bear the applicable delivery/exchange charge.",
    ],
  },
  {
    title: "72-Hour Exchange Notice",
    body: [
      "Any exchange request must be informed to us within 72 hours of receiving the product.",
      "Requests made after 72 hours will not be accepted.",
      "The product must remain unused and in its original condition for exchange.",
    ],
  },
  {
    title: "Customer's Mistake",
    body: [
      "If the exchange is required due to a customer-related issue, such as selecting the wrong size, color, design, or other personal preference after accepting the product:",
    ],
    list: [
      "The customer will bear all applicable delivery charges for the exchange.",
      "The product must be returned in its original condition.",
    ],
  },
  {
    title: "Exchange After Delivery Rider Leaves",
    body: [
      "Once the delivery rider has left with an accepted order, refunds will not be provided.",
      "For an eligible exchange, the replacement product will be processed through a new order/exchange order instead of a cash refund. This system helps make the process faster and reduces complications for both the customer and the company.",
    ],
  },
  {
    title: "Product Condition",
    body: ["For any eligible exchange:"],
    list: [
      "Product must be unused and unworn.",
      "Product must not be washed or damaged.",
      "Original tags, packaging, and accessories should be intact.",
      "Any product showing signs of use may be rejected for exchange.",
    ],
  },
];

// Manrope carries no Bengali glyphs, so Bangla copy uses Hind Siliguri — the
// same self-hosted font the landing pages default to — rather than whatever
// Bengali font the visitor's device falls back to.
const BN_FONT = { fontFamily: landingFontFamily("hind_siliguri") };

// Keeps a #bn / #en jump from landing under the fixed navbar (main's top padding).
const SCROLL_OFFSET = "scroll-mt-[116px] lg:scroll-mt-[162px]";

const JUMP_LINK =
  "inline-flex items-center h-8 px-4 border border-brand-tan/30 text-brand-brown text-[13px] hover:border-brand-terracotta hover:text-brand-terracotta transition-colors";

export default async function ReturnsPage() {
  const { phone, email } = await getSiteInfo();
  return (
    <div className={`${landingFontVars} bg-white min-h-screen`}>
      {/* Header */}
      <div className="bg-brand-cream border-b border-brand-tan/15 py-14">
        <div className="container-custom">
          <p className="text-brand-tan text-[10px] uppercase tracking-[3px] mb-3">Policy</p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold text-brand-brown mb-3">Return & Exchange Policy</h1>
          <Bn className="text-brand-brown/70 text-lg mb-3">রিটার্ন ও এক্সচেঞ্জ পলিসি</Bn>
          <p className="text-brand-tan text-sm">Last updated: {LAST_UPDATED}</p>
          <nav aria-label="Policy language" className="flex gap-2 mt-6">
            <a href="#bn" lang="bn" style={BN_FONT} className={JUMP_LINK}>বাংলা</a>
            <a href="#en" className={JUMP_LINK}>English</a>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="container-custom py-14 space-y-14">

        {/* Bangla */}
        <section id="bn" className={SCROLL_OFFSET}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-6 h-px bg-brand-tan" />
            <Bn as="h2" className="text-brand-tan text-sm font-medium leading-normal tracking-normal">বাংলা</Bn>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PolicyCard icon={PackageCheck} titleBn="রিটার্ন পলিসি" titleEn="Return Policy">
              <p>প্রিয় কাস্টমার,</p>
              <p>রাইডারের সামনে পণ্যটি ভালোভাবে দেখে বুঝে গ্রহণ করবেন। পণ্যটি পছন্দ না হলে শুধুমাত্র ডেলিভারি চার্জ প্রদান করে তাৎক্ষণিকভাবে রিটার্ন করে দিতে পারবেন।</p>
            </PolicyCard>

            <PolicyCard icon={RefreshCw} titleBn="এক্সচেঞ্জ পলিসি" titleEn="Exchange Policy">
              <p>এক্সচেঞ্জের ক্ষেত্রে নিম্নলিখিত শর্তগুলো অবশ্যই মেনে চলতে হবে:</p>
              <ol className="space-y-3">
                {BN_EXCHANGE_RULES.map((r) => (
                  <li key={r.n} className="flex items-start gap-3">
                    <span className="w-7 h-7 mt-px bg-brand-terracotta/10 text-brand-terracotta text-[14px] font-semibold flex items-center justify-center flex-shrink-0">
                      {r.n}
                    </span>
                    <span>{r.text}</span>
                  </li>
                ))}
              </ol>
            </PolicyCard>
          </div>
        </section>

        {/* English */}
        <section id="en" className={SCROLL_OFFSET}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-6 h-px bg-brand-tan" />
            <h2 className="text-brand-tan text-[10px] uppercase tracking-[3px] font-medium">English</h2>
          </div>
          <p className="text-brand-brown/75 text-[15px] leading-relaxed max-w-3xl mb-8">
            To ensure a smooth and fair experience for both our customers and delivery partners, please follow the rules below:
          </p>

          <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {EN_RULES.map((rule, i) => (
              <EnglishRule key={rule.title} n={i + 1} {...rule} />
            ))}
          </ol>

          <div className="mt-5 flex gap-4 border border-brand-terracotta/25 bg-brand-terracotta/[0.04] p-7 md:p-9">
            <CircleAlert size={20} strokeWidth={1.5} className="text-brand-terracotta flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-brand-brown text-[15px] mb-2">Important Notice</h3>
              <p className="text-brand-brown/75 text-[14px] leading-relaxed">
                Please check your product carefully in front of the delivery rider before accepting the parcel. Once the parcel is accepted and the rider leaves, our Return & Exchange Policy will apply as stated above.
              </p>
              <p className="text-brand-tan text-[13px] mt-3">Thank you for understanding and cooperating with our policy.</p>
            </div>
          </div>
        </section>

        {/* How to request an exchange */}
        <div className="bg-brand-cream border border-brand-tan/15 p-7 md:p-9 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <Bn as="h2" className="text-xl font-semibold text-brand-brown leading-snug tracking-normal mb-1">এক্সচেঞ্জ করতে চান?</Bn>
            <Bn className="text-brand-brown/70 text-[15px] leading-relaxed">পণ্য পাওয়ার ৩ দিনের মধ্যে আমাদের সাথে যোগাযোগ করুন।</Bn>
            <p className="text-brand-tan text-[13px] mt-1">Need an exchange? Let us know within 72 hours of receiving the product.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
            <a href={telHref(phone)} className="btn-primary inline-flex items-center justify-center gap-2 normal-case tracking-normal">
              <Phone size={15} strokeWidth={1.75} />
              {phone}
            </a>
            <a href={`mailto:${email}`} className="btn-outline inline-flex items-center justify-center gap-2 normal-case tracking-normal break-all">
              <Mail size={15} strokeWidth={1.75} className="flex-shrink-0" />
              {email}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bn({ as: Tag = "p", className, children }) {
  return (
    <Tag lang="bn" className={className} style={BN_FONT}>
      {children}
    </Tag>
  );
}

function PolicyCard({ icon: Icon, titleBn, titleEn, children }) {
  return (
    <div className="bg-white border border-brand-tan/20 p-7 md:p-9">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-11 h-11 bg-brand-terracotta/10 flex items-center justify-center flex-shrink-0">
          <Icon size={20} strokeWidth={1.5} className="text-brand-terracotta" />
        </div>
        <div>
          {/* Base heading styles (tight tracking, 1.15 leading) crowd Bengali vowel signs. */}
          <Bn as="h3" className="text-xl md:text-2xl font-semibold text-brand-brown leading-snug tracking-normal">{titleBn}</Bn>
          <p className="text-brand-tan text-[10px] uppercase tracking-[3px] mt-0.5">{titleEn}</p>
        </div>
      </div>

      <Bn as="div" className="text-brand-brown/80 text-[16px] leading-[1.9] space-y-3">
        {children}
      </Bn>
    </div>
  );
}

function EnglishRule({ n, title, body, list }) {
  return (
    <li className="bg-white border border-brand-tan/20 p-7">
      <div className="w-9 h-9 bg-brand-terracotta/10 flex items-center justify-center mb-5">
        <span className="font-display text-lg font-bold text-brand-terracotta">0{n}</span>
      </div>
      <h3 className="font-semibold text-brand-brown text-[15px] mb-3">{title}</h3>
      <div className="space-y-2.5 text-brand-brown/75 text-[14px] leading-relaxed">
        {body.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {list && (
          <ul className="list-disc pl-5 space-y-1.5 marker:text-brand-terracotta">
            {list.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
