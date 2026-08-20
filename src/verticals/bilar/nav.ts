import type { VerticalNavItem } from "@/verticals/types";

/** Handsal Bílar navigation (scaffold — unlocks in M6). */
export const bilarNav: VerticalNavItem[] = [
  { labelKey: "listings", href: "/listings", icon: "listings-bilar", comingSoon: true },
  { labelKey: "contacts", href: "/contacts", icon: "contacts" },
  { labelKey: "offers", href: "/offers", icon: "offers", comingSoon: true },
  { labelKey: "reports", href: "/reports", icon: "reports", comingSoon: true },
];
