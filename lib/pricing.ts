export const pricingCopy = {
  eyebrow: "Simple pricing, no surprises",
  title: "Pricing that",
  strike: "cuts",
  titleAfter: "time",
  titleEmphasis: "and pays for itself",
  subtitle: "Start with a free trial. Your subscription payments count toward a lifetime license.",
  footnote: "Reach $149 in payments, and the current major version is yours forever.",
};

// TODO: Set to true when ready to launch
export const PRODUCT_READY = false;

export const PRICING = {
  trialDays: 5,
  monthly: 13,        // $13/mo billed monthly
  annual: 8,          // $8/mo billed annually ($96/year)
  lifetime: 149,      // $149 per major release
};

export const pricingPlans = [
  {
    name: "Trial",
    price: "Free",
    priceSuffix: `${PRICING.trialDays} days`,
    description: "Full access for a limited time.",
    cta: "Start free trial",
    features: [
      "Full feature access",
      "Email support",
      "Cancel anytime",
    ],
    // Philosophy callout - integrated into card
    callout: {
      short: "No credit card needed",
      expanded: "Most tools rush you to pay. We'd rather you feel the difference first.",
    },
    limitations: [],
    disabled: !PRODUCT_READY,
  },
  {
    name: "Pro",
    price: PRODUCT_READY ? `$${PRICING.annual}` : "Coming Soon",
    priceSuffix: PRODUCT_READY ? "/ mo, billed annually" : "",
    description: "Clean exports, priority support, and studio-grade polish.",
    cta: "Go Pro",
    features: [
      "Unlimited clean exports",
      "No watermark exports",
      "Priority support",
      "3 devices per account",
      "Payments count toward lifetime license",
      "Cancel anytime",
    ],
    footnote: PRODUCT_READY ? `Or $${PRICING.monthly}/mo billed monthly` : undefined,
    // Philosophy callout - integrated into card
    callout: {
      short: "Pay toward ownership",
      expanded: `Your subscription payments accumulate toward a lifetime license. Once you've paid $${PRICING.lifetime}, the current major version is yours forever.`,
    },
    limitations: [],
    highlight: true,
    comingSoon: !PRODUCT_READY,
  },
  {
    name: "Lifetime",
    price: PRODUCT_READY ? `$${PRICING.lifetime}` : "Coming Soon",
    priceSuffix: PRODUCT_READY ? "once" : "",
    description: "Own the current major version outright.",
    cta: "Buy lifetime",
    features: [
      "All Pro features",
      "No watermark exports",
      "Priority support",
      "3 devices per account",
      "All updates within this major version",
      "One payment, yours to keep",
    ],
    // Philosophy callout - integrated into card
    callout: {
      short: "Own your tools",
      expanded: "One major version, one payment. Every update from v1.0 to v1.x is included. Future major releases (v2, v3...) are separate.",
    },
    limitations: [],
    comingSoon: !PRODUCT_READY,
  },
];

// Condensed philosophy for an optional expandable section
export const pricingPhilosophy = {
  tagline: "Your payments build toward ownership.",
  summary: PRODUCT_READY
    ? `Subscribe and your payments count toward a lifetime license. Reach $${PRICING.lifetime}, and it's yours.`
    : "Subscribe and your payments count toward a lifetime license. Keep paying, and it becomes yours.",
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
