export const pricingCopy = {
  eyebrow: "Pricing",
  title: "Pricing that keeps teams",
  titleEmphasis: "shipping",
  subtitle: "Start free, then upgrade for clean exports, priority support, and up to 3 devices.",
  footnote: "Trade in after 18 months to move to a lifetime license.",
};

const PRICING = {
  trialDays: 7,
  monthly: 9,
  lifetime: 149,
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
  },
  {
    name: "Pro",
    price: `$${PRICING.monthly}`,
    priceSuffix: "/ month",
    description: "Clean exports, priority support, and client-ready polish.",
    cta: "Go Pro",
    features: [
      "Unlimited clean exports",
      "No watermark",
      "Priority support",
      "3 devices per account",
      "Trade in to lifetime after 18 months",
      "Cancel anytime",
    ],
    footnote: `Lifetime license is $${PRICING.lifetime} unless you trade in after 18 months.`,
    highlight: true,
  },
  {
    name: "Lifetime",
    price: `$${PRICING.lifetime}`,
    priceSuffix: "once",
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
  },
];
