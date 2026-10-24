<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    brand?: string;
    name?: string;
    size?: "sm" | "md" | "lg" | "xl";
    glow?: boolean;
  }>(),
  {
    size: "md",
    glow: false,
  }
);

const normalizedBrand = computed(() => {
  if (props.brand) return props.brand.toLowerCase();
  const n = (props.name || "").toLowerCase();
  if (n.includes("chat gpt") || n.includes("chatgpt") || n.includes("openai")) return "chatgpt";
  if (n.includes("capcut")) return "capcut";
  if (n.includes("canva")) return "canva";
  if (n.includes("youtube")) return "youtube";
  if (n.includes("netflix")) return "netflix";
  if (n.includes("spotify")) return "spotify";
  if (n.includes("adobe")) return "adobe";
  if (n.includes("notion")) return "notion";
  if (n.includes("midjourney")) return "midjourney";
  if (n.includes("figma")) return "figma";
  if (n.includes("discord")) return "discord";
  if (n.includes("office") || n.includes("microsoft")) return "microsoft";
  if (n.includes("telegram")) return "telegram";
  return "generic";
});

const sizeClasses = computed(() => {
  switch (props.size) {
    case "sm":
      return "h-8 w-8 rounded-lg text-xs p-1";
    case "lg":
      return "h-14 w-14 rounded-2xl text-xl p-2.5";
    case "xl":
      return "h-16 w-16 sm:h-20 sm:w-20 rounded-2xl text-2xl p-3";
    case "md":
    default:
      return "h-11 w-11 sm:h-12 sm:w-12 rounded-xl text-base p-2";
  }
});
</script>

<template>
  <div
    class="relative flex items-center justify-center shrink-0 select-none transition-transform duration-200 overflow-hidden shadow-md"
    :class="[
      sizeClasses,
      normalizedBrand === 'chatgpt' && 'bg-[#10A37F] text-white',
      normalizedBrand === 'capcut' && 'bg-white text-black',
      normalizedBrand === 'canva' && 'bg-[#00C4CC] text-white',
      normalizedBrand === 'youtube' && 'bg-[#FF0000] text-white',
      normalizedBrand === 'netflix' && 'bg-[#000000] text-[#E50914] border border-[#222]',
      normalizedBrand === 'spotify' && 'bg-[#1DB954] text-black',
      normalizedBrand === 'adobe' && 'bg-[#FA0F00] text-white',
      normalizedBrand === 'notion' && 'bg-white text-black',
      normalizedBrand === 'midjourney' && 'bg-[#0B1426] text-white border border-[#1E293B]',
      normalizedBrand === 'figma' && 'bg-[#1E1E1E] text-white border border-[#333]',
      normalizedBrand === 'discord' && 'bg-[#5865F2] text-white',
      normalizedBrand === 'microsoft' && 'bg-white text-black',
      normalizedBrand === 'telegram' && 'bg-[#229ED9] text-white',
      normalizedBrand === 'generic' && 'bg-arena-elevated border border-arena-border text-white',
      glow && 'ring-2 ring-arena-orange shadow-[0_0_24px_rgba(255,90,31,0.3)]',
    ]"
  >
    <!-- 1. ChatGPT -->
    <svg v-if="normalizedBrand === 'chatgpt'" class="h-full w-full" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.28 9.87a5.98 5.98 0 0 0-.52-4.9 6.05 6.05 0 0 0-4.32-2.92 6.02 6.02 0 0 0-4.9.99 6 6 0 0 0-4.22-1.99 6.06 6.06 0 0 0-5.7 4.14 6.05 6.05 0 0 0 .83 6.02 5.98 5.98 0 0 0 .52 4.9 6.05 6.05 0 0 0 4.32 2.92 6.02 6.02 0 0 0 4.9-.99 6 6 0 0 0 4.22 1.99 6.06 6.06 0 0 0 5.7-4.14 6.05 6.05 0 0 0-.83-6.02zm-8.88 10.74a4.57 4.57 0 0 1-2.93-.72l.14-.08 4.88-2.82a.77.77 0 0 0 .39-.67v-6.9l2.08 1.2a.07.07 0 0 1 .04.05v5.71a4.58 4.58 0 0 1-4.6 4.23zm-7.9-3.41a4.56 4.56 0 0 1-.58-3.04l.14.08 4.88 2.82a.76.76 0 0 0 .77 0l5.98-3.45v2.4a.07.07 0 0 1-.03.06l-4.95 2.86a4.59 4.59 0 0 1-6.21-1.73zm-1.68-7.98a4.56 4.56 0 0 1 2.35-2.32v5.79a.77.77 0 0 0 .39.67l5.97 3.45-2.08 1.2a.07.07 0 0 1-.07 0l-4.95-2.86a4.58 4.58 0 0 1-1.61-5.93zm14.77 2.1l-5.98-3.45 2.08-1.2a.07.07 0 0 1 .07 0l4.95 2.86a4.58 4.58 0 0 1 1.61 5.93 4.56 4.56 0 0 1-2.34 2.33v-5.8a.77.77 0 0 0-.39-.67zm1.7-3.83l-.14-.08-4.88-2.82a.76.76 0 0 0-.77 0l-5.98 3.45v-2.4a.07.07 0 0 1 .03-.06l4.95-2.86a4.58 4.58 0 0 1 6.79 4.77zm-10.7 4.73l-2.08-1.2a.07.07 0 0 1-.04-.05v-5.71a4.58 4.58 0 0 1 7.53-3.51l-.14.08-4.88 2.82a.77.77 0 0 0-.39.67v6.9z"/>
    </svg>

    <!-- 2. CapCut -->
    <svg v-else-if="normalizedBrand === 'capcut'" class="h-full w-full" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.5 7.5L12 12l7.5 4.5V19l-9.5-5.7L4.5 16.5V13.8L9.8 12 4.5 10.2V7.5l5.5 3.2L19.5 5v2.5z"/>
    </svg>

    <!-- 3. Canva -->
    <svg v-else-if="normalizedBrand === 'canva'" class="h-full w-full" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.2 14.8c-2.4 0-4.1-1.8-4.1-4.8 0-3.3 2.1-5.1 4.7-5.1 1.8 0 3.1.8 3.7 2.1l-1.8 1.1c-.4-.8-1-1.2-1.9-1.2-1.6 0-2.6 1.4-2.6 3.1 0 1.9.9 3 2.3 3 .9 0 1.6-.4 2.1-1.1l1.8 1.1c-.8 1.2-2.3 1.8-4.2 1.8z"/>
    </svg>

    <!-- 4. YouTube -->
    <svg v-else-if="normalizedBrand === 'youtube'" class="h-full w-full" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>

    <!-- 5. Netflix -->
    <svg v-else-if="normalizedBrand === 'netflix'" class="h-full w-full" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.398 0v24c1.17-.492 2.336-1.01 3.5-1.554V0H5.398zm9.704 0v18.068c1.166-.543 2.332-1.062 3.5-1.554V0h-3.5z"/>
      <path d="M5.398 0h3.5v22.446l9.704-18.068h-3.5L5.398 22.446V0z"/>
    </svg>

    <!-- 6. Spotify -->
    <svg v-else-if="normalizedBrand === 'spotify'" class="h-full w-full" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.306c-.216.353-.674.464-1.027.248-2.812-1.718-6.353-2.107-10.524-1.154-.403.092-.803-.16-.895-.562-.092-.403.16-.803.562-.895 4.568-1.044 8.487-.601 11.636 1.336.353.216.464.674.248 1.027zm1.467-3.26c-.272.443-.852.584-1.295.312-3.219-1.978-8.127-2.55-11.936-1.393-.497.151-1.026-.135-1.177-.633-.151-.498.135-1.026.633-1.177 4.354-1.321 9.774-.683 13.463 1.596.443.272.584.852.312 1.295zm.126-3.41c-3.86-2.292-10.228-2.503-13.899-1.388-.592.18-1.223-.154-1.403-.746-.18-.592.154-1.223.746-1.403 4.223-1.282 11.253-1.036 15.688 1.596.533.316.707 1.01.391 1.543-.316.533-1.01.707-1.543.391z"/>
    </svg>

    <!-- 7. Adobe CC -->
    <svg v-else-if="normalizedBrand === 'adobe'" class="h-full w-full" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.96 22H24V2h-5.22L13.96 22zM0 2v20h5.22L0 2zm8.56 12.18l2.6-6.84 2.89 7.62H10.3l-.78 2.06H7.13l3.6-9.52h2.52l4.13 10.92h-2.4l-.84-2.24H8.56z"/>
    </svg>

    <!-- 8. Notion -->
    <svg v-else-if="normalizedBrand === 'notion'" class="h-full w-full" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.093-.373L17.76 1.83c-.467-.373-1.12-.746-2.24-.653L2.733 2.11c-.513.047-.653.373-.42.607l2.146 1.491zm1.4 3.033v13.578c0 .746.373 1.026 1.213.98l13.774-.793c.84-.047 1.073-.513 1.073-1.213V6.26c0-.7-.28-.933-.933-.887L6.792 6.168c-.653.047-.933.373-.933 1.073zm13.122.98l.093 11.246c0 .28-.14.373-.373.373l-1.4.093c-.28 0-.467-.14-.56-.373l-5.694-8.865v8.725c0 .327-.233.42-.513.42l-1.54.093c-.28 0-.42-.14-.42-.373V8.834c0-.28.14-.42.373-.42l1.587-.093c.327 0 .467.14.607.373l5.507 8.585V8.554c0-.327.187-.42.467-.42l1.587-.093c.28 0 .28.14.28.18z"/>
    </svg>

    <!-- 9. Midjourney -->
    <svg v-else-if="normalizedBrand === 'midjourney'" class="h-full w-full" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.5 2.5v19l8-4.5-8-14.5zm-1 5L3 17l7.5 4.5v-14z"/>
    </svg>

    <!-- 10. Figma -->
    <svg v-else-if="normalizedBrand === 'figma'" class="h-full w-full" viewBox="0 0 24 24">
      <path d="M12 12a3 3 0 1 1 6 0 3 3 0 0 1-6 0z" fill="#1ABCFE"/>
      <path d="M6 18a3 3 0 0 1 3-3h3v3a3 3 0 0 1-6 0z" fill="#0ACF83"/>
      <path d="M6 6a3 3 0 0 1 3-3h3v6H9a3 3 0 0 1-3-3z" fill="#F24E1E"/>
      <path d="M12 3h3a3 3 0 0 1 0 6h-3V3z" fill="#FF7262"/>
      <path d="M6 12a3 3 0 0 1 3-3h3v6H9a3 3 0 0 1-3-3z" fill="#A259FF"/>
    </svg>

    <!-- 11. Discord -->
    <svg v-else-if="normalizedBrand === 'discord'" class="h-full w-full" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>

    <!-- 12. Microsoft -->
    <svg v-else-if="normalizedBrand === 'microsoft'" class="h-full w-full" viewBox="0 0 24 24">
      <path d="M1 1h10v10H1z" fill="#F25022"/>
      <path d="M13 1h10v10H13z" fill="#7FBA00"/>
      <path d="M1 13h10v10H1z" fill="#00A4EF"/>
      <path d="M13 13h10v10H13z" fill="#FFB900"/>
    </svg>

    <!-- 13. Telegram -->
    <svg v-else-if="normalizedBrand === 'telegram'" class="h-full w-full" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
    </svg>

    <!-- Generic Fallback -->
    <div v-else class="font-extrabold uppercase tracking-tight flex items-center justify-center">
      <span>{{ name?.charAt(0) || "A" }}</span>
    </div>
  </div>
</template>
