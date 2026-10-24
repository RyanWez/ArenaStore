export interface NavItem {
  label: string;
  myanmarLabel?: string;
  path: string;
  icon?: string;
  badge?: string;
}

export const SITE_CONFIG = {
  name: "Arena Store",
  tagline: "Pay. Tap. Done.",
  description: "Get premium apps, memberships and digital tools in seconds. Trusted, fast and hassle-free — only at Arena Store.",
  botUsername: process.env.PUBLIC_BOT_USERNAME || "arenastoredev_bot",
  telegramChannel: "https://t.me/arenasellerstore",
  supportContact: "https://t.me/ryanwez",

  // Desktop Header Links - Streamlined, purposeful destinations
  headerNav: [
    { label: "Catalog", path: "/#catalog" },
    { label: "Orders", path: "/orders" },
    { label: "Affiliate 3%", path: "/referral", badge: "3%" },
    { label: "Support", path: "https://t.me/ryanwez" },
  ] as NavItem[],

  // Mobile Bottom Bar Navigation
  bottomNav: [
    { label: "Home", myanmarLabel: "ပင်မ", path: "/", icon: "Home" },
    { label: "Products", myanmarLabel: "ကုန်ပစ္စည်း", path: "/#catalog", icon: "LayoutGrid" },
    { label: "Orders", myanmarLabel: "အော်ဒါများ", path: "/orders", icon: "Package" },
    { label: "Profile", myanmarLabel: "ပရိုဖိုင်", path: "/profile", icon: "User" },
  ] as NavItem[],
};
