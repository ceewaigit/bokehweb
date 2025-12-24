export const pricingCopy = {
  eyebrow: "Simple pricing, no surprises",
  title: "Pricing that",
  strike: "cuts",
  titleAfter: "time",
  titleEmphasis: "and pays for itself",
  subtitle: "Start with a free trial, then upgrade when bokeh is saving you real time.",
  footnote: "After 16 months, trade in your subscription for a lifetime license.",
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
    description: "Full access with a subtle watermark.",
    cta: "Start free trial",
    features: [
      "Full feature access",
      "Email support",
      "Cancel anytime",
      "Watermarked exports",
    ],
    // Philosophy callout - integrated into card
    callout: {
      short: "No credit card needed",
      expanded: "Most tools rush you to pay. We'd rather you feel the difference first.",
    },
    disabled: !PRODUCT_READY,
  },
  {
    name: "Pro",
    price: PRICING.monthly ? `$${PRICING.monthly}` : "Coming Soon",
    priceSuffix: PRICING.monthly ? "/ month" : "",
    description: "Clean exports, priority support, and studio-grade polish.",
    cta: "Go Pro",
    features: [
      "Unlimited clean exports",
      "No watermark",
      "Priority support",
      "3 devices per account",
      "After 16 months, keep the latest version forever",
      "Cancel anytime",
    ],
    footnote: PRICING.lifetime ? `Or grab a license for $${PRICING.lifetime} upfront.` : undefined,
    // Philosophy callout - integrated into card
    callout: {
      short: "Your loyalty pays off",
      expanded: "No nickel-and-diming. Subscribe for 16 months and the latest version is yours. We think that's how it should work.",
    },
    highlight: true,
    comingSoon: !PRICING.monthly,
  },
  {
    name: "Lifetime",
    price: PRICING.lifetime ? `$${PRICING.lifetime}` : "Coming Soon",
    priceSuffix: PRICING.lifetime ? "once" : "",
    description: "A one-time purchase for those who want to own it.",
    cta: "Buy lifetime",
    features: [
      "All Pro features",
      "No watermark",
      "Priority support",
      "3 devices per account",
      "All updates within this major version",
      "One payment, yours to keep",
    ],
    // Philosophy callout - integrated into card
    callout: {
      short: "Own your tools",
      expanded: "We build software with intention. One payment, one major version, and every update in between.",
    },
    comingSoon: !PRICING.lifetime,
  },
];

// Condensed philosophy for an optional expandable section
export const pricingPhilosophy = {
  tagline: "Made for creators who care.",
  summary: "Every choice is intentional. Including the price.",
};

export const enterprisePlan = {
  name: "Enterprise",
  price: "Custom",
  eyebrow: "Buying for a large team?",
  description: "For larger organizations with security and procurement needs.",
  cta: "Contact sales",
  features: [
    "Everything in Lifetime",
    "SSO & Advanced Security",
    "Unlimited version history",
    "Dedicated success manager",
    "Custom contracts & invoicing",
    "Audit logs",
  ],
  comingSoon: true,
};
