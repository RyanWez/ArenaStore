export interface BrandDefinition {
  id: string;
  name: string;
  aliases: string[];
  bgClass?: string;
  bgStyle?: string;
  textClass?: string;
  viewBox: string;
  svgHtml: string;
}

export const BRAND_DEFINITIONS: Record<string, BrandDefinition> = {
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    aliases: ["chatgpt", "chat gpt", "openai", "gpt-4", "gpt4", "gpt"],
    bgStyle: "background: linear-gradient(135deg, #0A1C16 0%, #10A37F 100%);",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    svgHtml: `<path fill="currentColor" d="M22.28 9.87a5.98 5.98 0 0 0-.52-4.9 6.05 6.05 0 0 0-4.32-2.92 6.02 6.02 0 0 0-4.9.99 6 6 0 0 0-4.22-1.99 6.06 6.06 0 0 0-5.7 4.14 6.05 6.05 0 0 0 .83 6.02 5.98 5.98 0 0 0 .52 4.9 6.05 6.05 0 0 0 4.32 2.92 6.02 6.02 0 0 0 4.9-.99 6 6 0 0 0 4.22 1.99 6.06 6.06 0 0 0 5.7-4.14 6.05 6.05 0 0 0-.83-6.02zm-8.88 10.74a4.57 4.57 0 0 1-2.93-.72l.14-.08 4.88-2.82a.77.77 0 0 0 .39-.67v-6.9l2.08 1.2a.07.07 0 0 1 .04.05v5.71a4.58 4.58 0 0 1-4.6 4.23zm-7.9-3.41a4.56 4.56 0 0 1-.58-3.04l.14.08 4.88 2.82a.76.76 0 0 0 .77 0l5.98-3.45v2.4a.07.07 0 0 1-.03.06l-4.95 2.86a4.59 4.59 0 0 1-6.21-1.73zm-1.68-7.98a4.56 4.56 0 0 1 2.35-2.32v5.79a.77.77 0 0 0 .39.67l5.97 3.45-2.08 1.2a.07.07 0 0 1-.07 0l-4.95-2.86a4.58 4.58 0 0 1-1.61-5.93zm14.77 2.1l-5.98-3.45 2.08-1.2a.07.07 0 0 1 .07 0l4.95 2.86a4.58 4.58 0 0 1 1.61 5.93 4.56 4.56 0 0 1-2.34 2.33v-5.8a.77.77 0 0 0-.39-.67zm1.7-3.83l-.14-.08-4.88-2.82a.76.76 0 0 0-.77 0l-5.98 3.45v-2.4a.07.07 0 0 1 .03-.06l4.95-2.86a4.58 4.58 0 0 1 6.79 4.77zm-10.7 4.73l-2.08-1.2a.07.07 0 0 1-.04-.05v-5.71a4.58 4.58 0 0 1 7.53-3.51l-.14.08-4.88 2.82a.77.77 0 0 0-.39.67v6.9z"/>`,
  },

  capcut: {
    id: "capcut",
    name: "CapCut",
    aliases: ["capcut", "cap cut"],
    bgStyle: "background: #FFFFFF;",
    textClass: "text-black",
    viewBox: "0 0 25 24",
    // Official CapCut Overlapping Ribbon Bowtie
    svgHtml: `<path fill="currentColor" fill-rule="evenodd" d="M24.189 6.442V2.671l-4.535 2.383V4.91c.002-1.505-1.078-2.411-2.638-2.411H2.64C.993 2.5 0 3.407 0 4.91V8.72L6.354 12 0 15.316v3.8C0 20.595 1 21.5 2.64 21.5h14.373c1.56 0 2.639-.907 2.639-2.382v-.197l4.536 2.409v-3.828L13.64 12 24.19 6.443zM9.982 13.873l7.797 4.083H2.157l7.825-4.083zm7.741-7.828l-7.742 4.057-7.825-4.057h15.567z" />`,
  },

  canva: {
    id: "canva",
    name: "Canva",
    aliases: ["canva"],
    bgStyle: "background: linear-gradient(135deg, #00C4CC 0%, #0077B6 50%, #03045E 100%);",
    textClass: "text-white",
    viewBox: "0 0 80 80",
    // Official Canva Cursive Script "C"
    svgHtml: `<path fill="#FFFFFF" d="M57.2691 48.2052C56.939 48.2052 56.6485 48.484 56.3462 49.0928C52.9323 56.0153 47.0358 60.9134 40.2125 60.9134C32.3228 60.9134 27.437 53.7913 27.437 43.9522C27.437 27.2855 36.7232 17.6491 44.8796 17.6491C48.691 17.6491 51.0186 20.0443 51.0186 23.8559C51.0186 28.3796 48.4485 30.7748 48.4485 32.3702C48.4485 33.0864 48.8939 33.5201 49.7773 33.5201C53.3264 33.5201 57.4918 29.4419 57.4918 23.6808C57.4918 18.0947 52.63 13.9888 44.4737 13.9888C30.994 13.9888 19.0142 26.4858 19.0142 43.777C19.0142 57.1614 26.6572 66.0061 38.45 66.0061C50.9668 66.0061 58.2043 53.5526 58.2043 49.5105C58.2043 48.6153 57.7466 48.2052 57.2691 48.2052Z"/>`,
  },

  youtube: {
    id: "youtube",
    name: "YouTube",
    aliases: ["youtube", "yt"],
    bgStyle: "background: #FF0000;",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    svgHtml: `<path fill="#FFFFFF" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>`,
  },

  netflix: {
    id: "netflix",
    name: "Netflix",
    aliases: ["netflix"],
    bgStyle: "background: #000000; border: 1px solid #222222;",
    textClass: "text-[#E50914]",
    viewBox: "0 0 24 24",
    // 3D Ribbon "N" with authentic shadow & gradient paths
    svgHtml: `
      <path fill="#B81D24" d="M4 0h4.5v24H4z"/>
      <path fill="#B81D24" d="M15.5 0H20v24h-4.5z"/>
      <path fill="#E50914" d="M4.5 0h4.3l11.2 24h-4.3z"/>
    `,
  },

  spotify: {
    id: "spotify",
    name: "Spotify",
    aliases: ["spotify"],
    bgStyle: "background: #1DB954;",
    textClass: "text-black",
    viewBox: "0 0 24 24",
    svgHtml: `<path fill="#000000" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.306c-.216.353-.674.464-1.027.248-2.812-1.718-6.353-2.107-10.524-1.154-.403.092-.803-.16-.895-.562-.092-.403.16-.803.562-.895 4.568-1.044 8.487-.601 11.636 1.336.353.216.464.674.248 1.027zm1.467-3.26c-.272.443-.852.584-1.295.312-3.219-1.978-8.127-2.55-11.936-1.393-.497.151-1.026-.135-1.177-.633-.151-.498.135-1.026.633-1.177 4.354-1.321 9.774-.683 13.463 1.596.443.272.584.852.312 1.295zm.126-3.41c-3.86-2.292-10.228-2.503-13.899-1.388-.592.18-1.223-.154-1.403-.746-.18-.592.154-1.223.746-1.403 4.223-1.282 11.253-1.036 15.688 1.596.533.316.707 1.01.391 1.543-.316.533-1.01.707-1.543.391z"/>`,
  },

  adobe: {
    id: "adobe",
    name: "Adobe Creative Cloud",
    aliases: ["adobe", "creative cloud", "photoshop", "illustrator"],
    // Authentic Rainbow Gradient from desktop_storefront.png
    bgStyle: "background: linear-gradient(135deg, #FF0055 0%, #FF5A00 25%, #FFB400 50%, #00C853 75%, #0091FF 100%);",
    textClass: "text-white",
    viewBox: "0 0 8788 6557",
    svgHtml: `<path fill="#FFFFFF" d="M8531 1993.9c-166.2-389.3-398.8-735.8-697.9-1039.7-299.1-299.1-645.6-536.5-1034.9-697.9C6404.2 85.5 5976.9 0 5535.4 0c-474.7 0-930.5 99.7-1357.7 294.3-389.3 180.4-735.8 427.3-1030.2 745.3-128.2-19-261.1-28.5-394-28.5-370.3 0-731.1 71.2-1072.9 218.4-327.6 137.7-621.9 337.1-873.5 593.4-251.6 251.6-451 545.9-588.7 878.3C76 3043.1 0 3403.9 0 3774.2s71.2 731.1 218.4 1072.9c137.7 327.6 337.1 621.9 588.7 878.3 251.6 251.6 545.9 465.2 873.5 602.9 341.8 142.4 702.6 227.9 1072.9 227.9h2777.2c441.5 0 868.8-99.7 1267.5-270.6 389.3-166.2 735.8-408.3 1034.9-707.4 299.1-299.1 536.5-650.4 697.9-1039.7 170.9-403.5 256.4-830.8 256.4-1272.3s-85.5-868.8-256.4-1272.3zM2758.2 5934.2c-1182.1 0-2141.1-968.5-2141.1-2150.6s959-2145.8 2136.3-2145.8c550.7 0 1053.9 204.1 1433.7 545.9l963.7 987.5c90.2 94.9 90.2 246.9-4.7 337.1-94.9 90.2-246.9 90.2-337.1-4.7l-959-987.5c-289.6-256.4-674.1-408.3-1091.9-408.3-916.2 0-1661.6 740.6-1661.6 1656.8S1842 5426.2 2758.2 5426.2l531.7 14.2c175.7 180.4 375 356.1 588.7 493.7H2758.2zm2777.2-28.5c-731.1 0-1391-294.3-1870.5-773.8l-1272.3-1277c-90.2-94.9-90.2-246.9 4.7-337.1 94.9-90.2 246.9-90.2 337.1 4.7L4002 4790.1c394 394 935.2 636.1 1533.4 636.1 1196.3 0 2164.8-968.5 2164.8-2164.8s-968.5-2164.8-2164.8-2164.8c-508 0-978 175.7-1348.3 470-142.4-94.9-294.3-170.9-455.7-237.4 474.7-441.5 1106.1-712.1 1804-712.1 1462.2 0 2644.3 1182.1 2644.3 2644.3S6997.6 5905.7 5535.4 5905.7z"/>`,
  },

  notion: {
    id: "notion",
    name: "Notion",
    aliases: ["notion"],
    bgStyle: "background: #FFFFFF; border: 1px solid #E2E8F0;",
    textClass: "text-black",
    viewBox: "0 0 24 24",
    // Authentic 3D Isometric Cube "N"
    svgHtml: `<path fill="#000000" d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.093-.373L17.76 1.83c-.467-.373-1.12-.746-2.24-.653L2.733 2.11c-.513.047-.653.373-.42.607l2.146 1.491zm1.4 3.033v13.578c0 .746.373 1.026 1.213.98l13.774-.793c.84-.047 1.073-.513 1.073-1.213V6.26c0-.7-.28-.933-.933-.887L6.792 6.168c-.653.047-.933.373-.933 1.073zm13.122.98l.093 11.246c0 .28-.14.373-.373.373l-1.4.093c-.28 0-.467-.14-.56-.373l-5.694-8.865v8.725c0 .327-.233.42-.513.42l-1.54.093c-.28 0-.42-.14-.42-.373V8.834c0-.28.14-.42.373-.42l1.587-.093c.327 0 .467.14.607.373l5.507 8.585V8.554c0-.327.187-.42.467-.42l1.587-.093c.28 0 .28.14.28.18z"/>`,
  },

  midjourney: {
    id: "midjourney",
    name: "Midjourney",
    aliases: ["midjourney", "mid journey"],
    bgStyle: "background: #0B132B; border: 1px solid #1E293B;",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    // Authentic White Sailboat on Navy Blue
    svgHtml: `
      <path fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 2.5v19M12 4.5l8 13.5H4L12 4.5z"/>
      <path fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" d="M2 19c2 1.5 5 1.5 7 0s5-1.5 7 0 4 1 6 0"/>
    `,
  },

  figma: {
    id: "figma",
    name: "Figma",
    aliases: ["figma"],
    bgStyle: "background: #18181B; border: 1px solid #27272A;",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    svgHtml: `
      <path d="M12 12a3 3 0 1 1 6 0 3 3 0 0 1-6 0z" fill="#1ABCFE"/>
      <path d="M6 18a3 3 0 0 1 3-3h3v3a3 3 0 0 1-6 0z" fill="#0ACF83"/>
      <path d="M6 6a3 3 0 0 1 3-3h3v6H9a3 3 0 0 1-3-3z" fill="#F24E1E"/>
      <path d="M12 3h3a3 3 0 0 1 0 6h-3V3z" fill="#FF7262"/>
      <path d="M6 12a3 3 0 0 1 3-3h3v6H9a3 3 0 0 1-3-3z" fill="#A259FF"/>
    `,
  },

  discord: {
    id: "discord",
    name: "Discord",
    aliases: ["discord"],
    bgStyle: "background: #5865F2;",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    svgHtml: `<path fill="#FFFFFF" d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>`,
  },

  microsoft: {
    id: "microsoft",
    name: "Microsoft 365",
    aliases: ["microsoft", "office", "office 365", "m365", "outlook", "word", "excel"],
    bgStyle: "background: #FFFFFF; border: 1px solid #E2E8F0;",
    textClass: "text-black",
    viewBox: "0 0 24 24",
    svgHtml: `
      <path d="M1 1h10v10H1z" fill="#F25022"/>
      <path d="M13 1h10v10H13z" fill="#7FBA00"/>
      <path d="M1 13h10v10H1z" fill="#00A4EF"/>
      <path d="M13 13h10v10H13z" fill="#FFB900"/>
    `,
  },

  gemini: {
    id: "gemini",
    name: "Google Gemini",
    aliases: ["gemini", "google gemini", "bard"],
    bgStyle: "background: linear-gradient(135deg, #1A1F36 0%, #2A1A4E 50%, #17386E 100%);",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    svgHtml: `
      <defs>
        <linearGradient id="geminiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4E8CFF"/>
          <stop offset="50%" stop-color="#9E5CF6"/>
          <stop offset="100%" stop-color="#FF6370"/>
        </linearGradient>
      </defs>
      <path fill="url(#geminiGrad)" d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z"/>
    `,
  },

  duolingo: {
    id: "duolingo",
    name: "Duolingo",
    aliases: ["duolingo"],
    bgStyle: "background: #58CC02;",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    svgHtml: `
      <path fill="#FFFFFF" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm6-4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
      <circle cx="10" cy="14" r="1.5" fill="#58CC02"/>
      <circle cx="16" cy="11" r="0.75" fill="#58CC02"/>
    `,
  },

  telegram: {
    id: "telegram",
    name: "Telegram",
    aliases: ["telegram", "tg"],
    bgStyle: "background: #229ED9;",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    svgHtml: `<path fill="#FFFFFF" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>`,
  },

  claude: {
    id: "claude",
    name: "Claude",
    aliases: ["claude", "anthropic"],
    bgStyle: "background: #D97706;",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    svgHtml: `
      <path fill="#FFFFFF" d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2z"/>
      <circle cx="12" cy="11" r="2.5" fill="#D97706"/>
    `,
  },

  lovable: {
    id: "lovable",
    name: "Lovable",
    aliases: ["lovable"],
    bgStyle: "background: linear-gradient(135deg, #FF3366 0%, #FF6584 100%);",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    svgHtml: `<path fill="#FFFFFF" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>`,
  },

  muse: {
    id: "muse",
    name: "MUSE AI",
    aliases: ["muse", "muse ai"],
    bgStyle: "background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    svgHtml: `
      <path fill="#FFFFFF" d="M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2L12 2z"/>
      <path fill="#A5B4FC" d="M19 2l1 2.5L22.5 5.5l-2.5 1L19 9l-1-2.5L15.5 5.5l2.5-1L19 2zM5 15l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5z"/>
    `,
  },

  vpn: {
    id: "vpn",
    name: "VPN Service",
    aliases: ["vpn", "nordvpn", "expressvpn", "surfshark"],
    bgStyle: "background: #0284C7;",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    svgHtml: `<path fill="#FFFFFF" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.66 0 3 1.34 3 3 0 1.31-.83 2.42-2 2.83V16h-2v-3.17C9.83 12.42 9 11.31 9 10c0-1.66 1.34-3 3-3z"/>`,
  },

  coursera: {
    id: "coursera",
    name: "Coursera",
    aliases: ["coursera"],
    bgStyle: "background: #0056D2;",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    svgHtml: `<path fill="#FFFFFF" d="M12 3.1c-4.9 0-8.9 4-8.9 8.9s4 8.9 8.9 8.9 8.9-4 8.9-8.9c0-1.6-.4-3.1-1.2-4.4l-2.6 1.5c.5.9.8 1.9.8 2.9 0 3.3-2.7 6-6 6s-6-2.7-6-6 2.7-6 6-6c1.1 0 2.2.3 3.1.9l1.6-2.5C15.3 3.5 13.7 3.1 12 3.1z"/>`,
  },

  xbox: {
    id: "xbox",
    name: "Xbox",
    aliases: ["xbox"],
    bgStyle: "background: #107C10;",
    textClass: "text-white",
    viewBox: "0 0 24 24",
    svgHtml: `<path fill="#FFFFFF" d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm-4.7 4.1c1.3-.7 3-1.1 4.7-1.1s3.4.4 4.7 1.1c-1.3 1.8-3.1 4.1-4.7 5.7-1.6-1.6-3.4-3.9-4.7-5.7zM4.1 6.8c1.8 1.4 4.1 3.2 5.8 4.7-2.6 2.5-5.6 4.9-6.9 5.8C2.1 15.6 1.5 13.9 1.5 12c0-2 .9-3.8 2.6-5.2zm15.8 0c1.7 1.4 2.6 3.2 2.6 5.2 0 1.9-.6 3.6-1.5 5.3-1.3-.9-4.3-3.3-6.9-5.8 1.7-1.5 4-3.3 5.8-4.7zm-7.9 7.4c1.8 1.7 4.7 4.2 6.3 5.4-1.8 1.1-4 1.7-6.3 1.7s-4.5-.6-6.3-1.7c1.6-1.2 4.5-3.7 6.3-5.4z"/>`,
  },
};

/**
 * Intelligent Slug & Brand Resolver
 * Strips custom Telegram emojis, packaging phrases, and normalizes brand names.
 */
export function resolveBrandSlug(rawText?: string | null): string {
  if (!rawText) return "generic";

  const lower = rawText
    .toLowerCase()
    .replace(/\{pe:\d+\}/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .trim();

  for (const [key, def] of Object.entries(BRAND_DEFINITIONS)) {
    for (const alias of def.aliases) {
      if (lower.includes(alias)) {
        return key;
      }
    }
  }

  // Fallback: extract the first alphanumeric word
  const match = lower.match(/[a-z0-9]+/);
  return match ? match[0] : "generic";
}

/**
 * Deterministic Hash for Algorithmic Monogram Colors
 * Ensures any unknown brand gets a consistent, high-end bespoke aesthetic.
 */
export function getBrandColorHash(brand: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < brand.length; i++) {
    hash = brand.charCodeAt(i) + ((hash << 5) - hash);
  }

  const palettes = [
    { bg: "linear-gradient(135deg, #1E1B4B 0%, #4338CA 100%)", text: "#FFFFFF" }, // Indigo
    { bg: "linear-gradient(135deg, #14532D 0%, #15803D 100%)", text: "#FFFFFF" }, // Emerald
    { bg: "linear-gradient(135deg, #4C0519 0%, #BE123C 100%)", text: "#FFFFFF" }, // Rose
    { bg: "linear-gradient(135deg, #083344 0%, #0E7490 100%)", text: "#FFFFFF" }, // Cyan
    { bg: "linear-gradient(135deg, #3B0764 0%, #7E22CE 100%)", text: "#FFFFFF" }, // Purple
    { bg: "linear-gradient(135deg, #451A03 0%, #B45309 100%)", text: "#FFFFFF" }, // Amber
    { bg: "linear-gradient(135deg, #0F172A 0%, #334155 100%)", text: "#FFFFFF" }, // Slate
  ];

  const index = Math.abs(hash) % palettes.length;
  return palettes[index] ?? palettes[0]!;
}

export interface ParsedProductTitle {
  brand: string;
  cleanTitle: string;
  durationLabel: string;
}

/**
 * Parses package duration and cleans supplier titles for premium display.
 */
export function parseProductTitleAndTerm(rawName: string): ParsedProductTitle {
  if (!rawName) {
    return { brand: "generic", cleanTitle: "Digital Service", durationLabel: "/ month" };
  }

  // 1. Strip {pe:...} placeholders and standalone unicode emojis
  let clean = rawName
    .replace(/\{pe:\d+\}/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/[📱✨🖤🔒]/g, "")
    .trim();

  // 2. Detect duration patterns
  let durationLabel = "/ month";
  const durationMatch = clean.match(
    /\b(\d+\s*(?:months?|years?|days?|hours?|mo|yr|billion tokens?|tokens?|account|urls?))\b/i
  );

  if (durationMatch && durationMatch[1]) {
    durationLabel = `/ ${durationMatch[1].toLowerCase()}`;
    // Optionally clean redundant duration from main title for concise card look
    // e.g. "CapCut Pro 1 Year" can remain readable or be condensed
  } else if (/1\s*year/i.test(clean)) {
    durationLabel = "/ 1 year";
  } else if (/1\s*month/i.test(clean)) {
    durationLabel = "/ 1 month";
  } else if (/3\s*months/i.test(clean)) {
    durationLabel = "/ 3 months";
  } else if (/12\s*months/i.test(clean)) {
    durationLabel = "/ 12 months";
  } else if (/18\s*months/i.test(clean)) {
    durationLabel = "/ 18 months";
  } else if (/tokens?/i.test(clean)) {
    durationLabel = "/ package";
  } else if (/account/i.test(clean)) {
    durationLabel = "/ account";
  }

  const brand = resolveBrandSlug(clean);

  // Capitalize nicely if all uppercase
  if (clean === clean.toUpperCase() && clean.length > 4) {
    clean = clean
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  return {
    brand,
    cleanTitle: clean,
    durationLabel,
  };
}
