export interface MasterCategory {
  id: string;
  label: string;
  icon: string;
}

export const MASTER_CATEGORIES = [
  { id: "all", label: "All", icon: "LayoutGrid" },
  { id: "ai", label: "AI & Productivity", icon: "Brain" },
  { id: "design", label: "Design & Creative", icon: "Palette" },
  { id: "video", label: "Video & Editing", icon: "Video" },
  { id: "dev", label: "Development", icon: "Code" },
  { id: "entertainment", label: "Entertainment", icon: "Tv" },
  { id: "business", label: "Business", icon: "Briefcase" },
] as const;
