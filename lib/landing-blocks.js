// Catalog of landing-page BLOCK types.
//
// Pure data (no imports) so the admin editor, the public renderer and the API
// validator all agree on which block types exist and what `data` each carries.
// Adding a block = an entry here + a renderer case in components/landing/blocks.js
// + an editor case in components/admin/landing/BlockEditor.js. No DB migration:
// LandingPage.blocks[].data is a Mixed bag.
//
// `fields` drives the generic editor form. Supported field kinds:
//   text · textarea · number · image · color · select · toggle · datetime
//   list  → a repeatable group of sub-fields (`item`)

export const LANDING_BLOCKS = {
  hero: {
    label: "Hero",
    icon: "Image",
    desc: "Full-width banner with headline and call-to-action.",
    defaults: {
      image: "",
      mobileImage: "",
      eyebrow: "",
      title: "Your headline goes here",
      subtitle: "Say why they should buy, in one line.",
      ctaText: "Order now",
      align: "center",
      overlay: 40,
      height: "large",
    },
    fields: [
      { key: "image", kind: "image", label: "Background image" },
      { key: "mobileImage", kind: "image", label: "Mobile image", hint: "Optional. Falls back to the main image." },
      { key: "eyebrow", kind: "text", label: "Eyebrow", placeholder: "Limited time" },
      { key: "title", kind: "text", label: "Headline" },
      { key: "subtitle", kind: "textarea", label: "Subheadline" },
      { key: "ctaText", kind: "text", label: "Button text", hint: "Scrolls down to the order form. Leave blank to hide." },
      { key: "align", kind: "select", label: "Text alignment", options: ["left", "center", "right"] },
      { key: "height", kind: "select", label: "Height", options: ["small", "medium", "large", "full"] },
      { key: "overlay", kind: "number", label: "Image darkening (%)", min: 0, max: 90 },
    ],
  },

  richtext: {
    label: "Text",
    icon: "AlignLeft",
    desc: "A heading and paragraphs of copy.",
    defaults: { title: "", body: "", align: "left" },
    fields: [
      { key: "title", kind: "text", label: "Heading" },
      { key: "body", kind: "textarea", label: "Body", rows: 6, hint: "Blank lines start a new paragraph." },
      { key: "align", kind: "select", label: "Alignment", options: ["left", "center"] },
    ],
  },

  image: {
    label: "Image",
    icon: "ImagePlus",
    desc: "A single image with an optional caption.",
    defaults: {
      image: "",
      caption: "",
      width: "contained",
      size: "large",
      align: "center",
      aspect: "auto",
      fit: "cover",
      rounded: true,
    },
    fields: [
      { key: "image", kind: "image", label: "Image" },
      { key: "caption", kind: "text", label: "Caption" },
      { key: "width", kind: "select", label: "Width", options: ["contained", "full"] },
      { key: "size", kind: "select", label: "Size", options: ["small", "medium", "large", "full"] },
      { key: "align", kind: "select", label: "Alignment", options: ["left", "center", "right"] },
      { key: "aspect", kind: "select", label: "Shape", options: ["auto", "square", "landscape", "portrait", "wide"] },
      { key: "fit", kind: "select", label: "Fit", options: ["cover", "contain"] },
      { key: "rounded", kind: "toggle", label: "Rounded corners" },
    ],
  },

  cta: {
    label: "Order button",
    icon: "MousePointerClick",
    desc: "A call-to-action button that jumps to the order form. Add as many as you like.",
    defaults: { text: "Order now — cash on delivery", align: "center", size: "large", style: "solid", note: "" },
    fields: [
      { key: "text", kind: "text", label: "Button text" },
      { key: "note", kind: "text", label: "Small note under the button", hint: "Optional, e.g. “No advance payment”." },
      { key: "align", kind: "select", label: "Alignment", options: ["left", "center", "right"] },
      { key: "size", kind: "select", label: "Size", options: ["medium", "large"] },
      { key: "style", kind: "select", label: "Style", options: ["solid", "outline"] },
    ],
  },

  gallery: {
    label: "Gallery",
    icon: "Images",
    desc: "A grid of product or lifestyle photos.",
    defaults: { title: "", columns: 3, images: [] },
    fields: [
      { key: "title", kind: "text", label: "Heading" },
      { key: "columns", kind: "select", label: "Columns", options: ["2", "3", "4"] },
      { key: "images", kind: "list", label: "Images", item: [{ key: "image", kind: "image", label: "Image" }] },
    ],
  },

  features: {
    label: "Features",
    icon: "ListChecks",
    desc: "Selling points as a tick-list or icon grid.",
    defaults: {
      title: "Why you'll love it",
      layout: "grid",
      items: [{ title: "Premium fabric", text: "Soft, breathable and built to last." }],
    },
    fields: [
      { key: "title", kind: "text", label: "Heading" },
      { key: "layout", kind: "select", label: "Layout", options: ["grid", "list"] },
      {
        key: "items",
        kind: "list",
        label: "Points",
        item: [
          { key: "title", kind: "text", label: "Title" },
          { key: "text", kind: "textarea", label: "Description", rows: 2 },
        ],
      },
    ],
  },

  video: {
    label: "Video",
    icon: "Youtube",
    desc: "An embedded YouTube video.",
    defaults: { title: "", url: "", caption: "" },
    fields: [
      { key: "title", kind: "text", label: "Heading" },
      { key: "url", kind: "text", label: "YouTube URL", placeholder: "https://youtube.com/watch?v=…" },
      { key: "caption", kind: "text", label: "Caption" },
    ],
  },

  countdown: {
    label: "Countdown",
    icon: "Timer",
    desc: "Urgency timer counting down to a deadline.",
    defaults: { title: "Offer ends in", endsAt: "", expiredText: "This offer has ended." },
    fields: [
      { key: "title", kind: "text", label: "Heading" },
      { key: "endsAt", kind: "datetime", label: "Ends at" },
      { key: "expiredText", kind: "text", label: "Text after it expires" },
    ],
  },

  testimonials: {
    label: "Testimonials",
    icon: "Quote",
    desc: "Customer reviews with star ratings.",
    defaults: {
      title: "What customers say",
      items: [{ name: "Rahim", text: "Exactly as shown. Fast delivery!", rating: 5, image: "" }],
    },
    fields: [
      { key: "title", kind: "text", label: "Heading" },
      {
        key: "items",
        kind: "list",
        label: "Reviews",
        item: [
          { key: "name", kind: "text", label: "Name" },
          { key: "text", kind: "textarea", label: "Review", rows: 2 },
          { key: "rating", kind: "select", label: "Stars", options: ["5", "4", "3", "2", "1"] },
          { key: "image", kind: "image", label: "Photo" },
        ],
      },
    ],
  },

  trust: {
    label: "Trust badges",
    icon: "ShieldCheck",
    desc: "A strip of reassurance points (delivery, returns, COD).",
    defaults: {
      items: [
        { text: "Cash on delivery" },
        { text: "7-day easy return" },
        { text: "Delivery all over Bangladesh" },
      ],
    },
    fields: [{ key: "items", kind: "list", label: "Badges", item: [{ key: "text", kind: "text", label: "Text" }] }],
  },

  faq: {
    label: "FAQ",
    icon: "HelpCircle",
    desc: "Expandable questions and answers.",
    defaults: {
      title: "Frequently asked questions",
      items: [{ q: "How long does delivery take?", a: "2–3 days inside Dhaka, 3–5 days outside." }],
    },
    fields: [
      { key: "title", kind: "text", label: "Heading" },
      {
        key: "items",
        kind: "list",
        label: "Questions",
        item: [
          { key: "q", kind: "text", label: "Question" },
          { key: "a", kind: "textarea", label: "Answer", rows: 3 },
        ],
      },
    ],
  },

  orderform: {
    label: "Order form",
    icon: "ShoppingCart",
    desc: "Offer picker + delivery details. Where the order is placed.",
    // Copy for the form itself lives on landingPage.form (it's needed
    // server-side when validating an order), so this block carries nothing.
    defaults: {},
    fields: [],
    singleton: true, // exactly one per page, and it can't be removed
  },

  divider: {
    label: "Divider",
    icon: "Minus",
    desc: "Whitespace or a horizontal rule.",
    defaults: { rule: true, size: "medium" },
    fields: [
      { key: "rule", kind: "toggle", label: "Show a line" },
      { key: "size", kind: "select", label: "Spacing", options: ["small", "medium", "large"] },
    ],
  },
};

export const BLOCK_TYPES = Object.keys(LANDING_BLOCKS);

// Block types a page must always contain exactly one of.
export const SINGLETON_BLOCKS = BLOCK_TYPES.filter((t) => LANDING_BLOCKS[t].singleton);

export function blockDefaults(type) {
  return structuredClone(LANDING_BLOCKS[type]?.defaults ?? {});
}

// A brand-new page: something to look at, plus the order form.
export function starterBlocks(makeKey) {
  return [
    { key: makeKey(), type: "hero", enabled: true, data: blockDefaults("hero") },
    { key: makeKey(), type: "features", enabled: true, data: blockDefaults("features") },
    { key: makeKey(), type: "orderform", enabled: true, data: {} },
    { key: makeKey(), type: "faq", enabled: true, data: blockDefaults("faq") },
  ];
}

// Strip unknown block types and fill in missing `data` so a page saved by an
// older/newer client can't inject arbitrary shapes. Guarantees exactly one of
// each singleton block, appending any that went missing.
export function sanitizeBlocks(blocks, makeKey) {
  const clean = [];
  const seenSingletons = new Set();

  for (const b of Array.isArray(blocks) ? blocks : []) {
    const spec = LANDING_BLOCKS[b?.type];
    if (!spec) continue;
    if (spec.singleton) {
      if (seenSingletons.has(b.type)) continue;
      seenSingletons.add(b.type);
    }
    clean.push({
      key: String(b.key || makeKey()),
      type: b.type,
      enabled: b.enabled !== false,
      data: { ...blockDefaults(b.type), ...(b.data && typeof b.data === "object" ? b.data : {}) },
    });
  }

  for (const type of SINGLETON_BLOCKS) {
    if (!seenSingletons.has(type)) {
      clean.push({ key: makeKey(), type, enabled: true, data: blockDefaults(type) });
    }
  }

  return clean;
}

// Pull the YouTube id out of any of the URL shapes people paste.
export function youtubeId(url) {
  const m = String(url || "").match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  );
  return m ? m[1] : "";
}
