import type { VerticalNavItem } from "@/verticals/types";

/** Handsal Eignir navigation. Items unlock as milestones M2–M5 land. */
export const eignirNav: VerticalNavItem[] = [
  { labelKey: "listings", href: "/listings", icon: "listings-eignir" },
  { labelKey: "contacts", href: "/contacts", icon: "contacts" },
  { labelKey: "offers", href: "/offers", icon: "offers" },
  { labelKey: "reports", href: "/reports", icon: "reports", comingSoon: true },
];
