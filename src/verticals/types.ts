/** Navigation contributed by a vertical module to the app shell. */
export interface VerticalNavItem {
  /** next-intl key under `nav.<vertical>.` */
  labelKey: string;
  href: string;
  icon: "listings-eignir" | "listings-bilar" | "contacts" | "offers" | "reports";
  /** Rendered disabled with a "coming soon" badge until its milestone lands. */
  comingSoon?: boolean;
  /** Only shown to tenant ADMINs (filtered in the (app) layout). */
  adminOnly?: boolean;
}
