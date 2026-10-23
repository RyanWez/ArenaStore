export interface NavItem {
  label: string;
  myanmarLabel?: string;
  path: string;
  icon?: string;
  badge?: string;
}

export const SITE_CONFIG = {
  name: "ARENA STORE",
  tagline: "Digital Accounts & Instant Licenses",
  description: "ChatGPT Plus, Canva Pro, YouTube Premium, and developer subscriptions delivered instantly via your prepaid MMK wallet.",
  botUsername: process.env.PUBLIC_BOT_USERNAME || "arenastoredev_bot",
  telegramChannel: "https://t.me/arenasellerstore",
  supportContact: "https://t.me/ryanwez",

  // Desktop Header Links
  headerNav: [
    { label: "Storefront", path: "/" },
    { label: "Products", path: "/#catalog" },
    { label: "My Orders", path: "/orders" },
    { label: "Affiliate 3%", path: "/referral", badge: "3%" },
  ] as NavItem[],

  // Mobile Bottom Bar Navigation
  bottomNav: [
    { label: "Home", myanmarLabel: "ပင်မ", path: "/", icon: "Home" },
    { label: "Products", myanmarLabel: "ကုန်ပစ္စည်း", path: "/#catalog", icon: "LayoutGrid" },
    { label: "Orders", myanmarLabel: "အော်ဒါများ", path: "/orders", icon: "Package" },
    { label: "Profile", myanmarLabel: "ပရိုဖိုင်", path: "/profile", icon: "User" },
  ] as NavItem[],
};
