export const pricingCopy = {
  eyebrow: "Pricing",
  title: "Pricing that keeps teams",
  titleEmphasis: "shipping",
  subtitle: "Start free, then upgrade for clean exports, priority support, and up to 3 devices.",
  footnote: "After 16 months, trade in your subscription for a free lifetime license.",
};

// TODO: Set to true when ready to launch
const PRODUCT_READY = false;

const PRICING = {
  trialDays: 7,
  // TODO: Uncomment when ready to launch
  // monthly: 9,
  // lifetime: 149,
  monthly: null, // Coming soon
  lifetime: null, // Coming soon
};

export const pricingPlans = [
  {
    name: "Trial",
    price: "Free",
    priceSuffix: `${PRICING.trialDays} days`,
    description: "Full access with a discreet watermark.",
    cta: "Start free trial",
    features: [
      "Full feature access",
      "Email support",
      "Cancel anytime",
      "Watermarked exports",
    ],
    disabled: !PRODUCT_READY,
  },
  {
    name: "Pro",
    price: PRICING.monthly ? `$${PRICING.monthly}` : "Coming Soon",
    priceSuffix: PRICING.monthly ? "/ month" : "",
    description: "Clean exports, priority support, and client-ready polish.",
    cta: "Go Pro",
    features: [
      "Unlimited clean exports",
      "No watermark",
      "Priority support",
      "3 devices per account",
      "Earn a free lifetime license after 16 months",
      "Cancel anytime",
    ],
    footnote: PRICING.lifetime ? `Lifetime license is $${PRICING.lifetime}, or free after 16 months on Pro.` : undefined,
    highlight: true,
    comingSoon: !PRICING.monthly,
  },
  {
    name: "Lifetime",
    price: PRICING.lifetime ? `$${PRICING.lifetime}` : "Coming Soon",
    priceSuffix: PRICING.lifetime ? "once" : "",
    description: "A one-time purchase for long-term teams.",
    cta: "Buy lifetime",
    features: [
      "All Pro features",
      "No watermark",
      "Priority support",
      "3 devices per account",
      "Lifetime updates",
      "Pay once, own forever",
    ],
    comingSoon: !PRICING.lifetime,
  },
];
