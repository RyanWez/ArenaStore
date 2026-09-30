<script setup lang="ts">
import { ref, computed } from 'vue'
import { useToast } from '~/composables/useToast'

const toast = useToast()

interface CategoryItem {
  id: number
  upstreamCategoryId: number | null
  name: string
  slug: string
  iconEmoji: string
  sortOrder: number
  isActive: boolean
  productCount: number
}

const searchQuery = ref('')
const isEditModalOpen = ref(false)
const selectedCategory = ref<CategoryItem | null>(null)
const isSaving = ref(false)

const editForm = ref({
  id: 0,
  name: '',
  iconEmoji: '📁',
  sortOrder: 0,
  isActive: true,
})

// Categories initial state
const categoriesList = ref<CategoryItem[]>([
  {
    id: 1,
    upstreamCategoryId: 1,
    name: 'AI & Developer Tools',
    slug: 'ai-developer-tools',
    iconEmoji: '🤖',
    sortOrder: 10,
    isActive: true,
    productCount: 12,
  },
  {
    id: 2,
    upstreamCategoryId: 2,
    name: 'Design & Graphics',
    slug: 'design-graphics',
    iconEmoji: '🎨',
    sortOrder: 20,
    isActive: true,
    productCount: 6,
  },
  {
    id: 3,
    upstreamCategoryId: 3,
    name: 'Entertainment & Streaming',
    slug: 'entertainment-streaming',
    iconEmoji: '🎬',
    sortOrder: 30,
    isActive: true,
    productCount: 4,
  },
  {
    id: 4,
    upstreamCategoryId: 4,
    name: 'Productivity & Office',
    slug: 'productivity-office',
    iconEmoji: '⚡',
    sortOrder: 40,
    isActive: true,
    productCount: 8,
  },
  {
    id: 5,
    upstreamCategoryId: 5,
    name: 'VPN & Security',
    slug: 'vpn-security',
    iconEmoji: '🛡️',
    sortOrder: 50,
    isActive: true,
    productCount: 3,
  },
])

const filteredCategories = computed(() => {
  if (!searchQuery.value.trim()) return categoriesList.value
  const q = searchQuery.value.toLowerCase().trim()
  return categoriesList.value.filter(
    (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
  )
})

function openEditModal(cat: CategoryItem) {
  selectedCategory.value = cat
  editForm.value = {
    id: cat.id,
    name: cat.name,
    iconEmoji: cat.iconEmoji,
    sortOrder: cat.sortOrder,
    isActive: cat.isActive,
  }
  isEditModalOpen.value = true
}

function toggleCategoryActive(cat: CategoryItem) {
  cat.isActive = !cat.isActive
  toast.info(`Category "${cat.name}" is now ${cat.isActive ? 'Active' : 'Disabled'}.`, 'Visibility Changed')
}

async function saveCategory() {
  if (!selectedCategory.value) return
  isSaving.value = true
  try {
    // In live system, calls PUT /api/admin/categories/:id
    selectedCategory.value.name = editForm.value.name
    selectedCategory.value.iconEmoji = editForm.value.iconEmoji
    selectedCategory.value.sortOrder = editForm.value.sortOrder
    selectedCategory.value.isActive = editForm.value.isActive

    const catName = selectedCategory.value.name
    isEditModalOpen.value = false
    toast.success(`Category "${catName}" updated successfully!`, 'Category Saved')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <i class="pi pi-tags text-indigo-600 dark:text-indigo-400"></i>
          Product Categories (အမျိုးအစားများ)
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage product categories, organize display sequences, and configure icons for Telegram Bot display
        </p>
      </div>

      <div class="flex items-center gap-3">
        <span class="px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          Total: {{ categoriesList.length }} Categories
        </span>
      </div>
    </div>

    <!-- Search Controls -->
    <div class="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-4">
      <div class="relative w-full max-w-sm">
        <i class="pi pi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search categories by name or slug..."
          class="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
        />
      </div>
    </div>

    <!-- Categories Grid / Table -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/40 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <th class="py-3.5 px-4 sm:px-6">Category</th>
              <th class="py-3.5 px-4">Slug Identifier</th>
              <th class="py-3.5 px-4">Upstream ID</th>
              <th class="py-3.5 px-4">Products</th>
              <th class="py-3.5 px-4">Sort Order</th>
              <th class="py-3.5 px-4">Status</th>
              <th class="py-3.5 px-4 sm:px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
            <tr
              v-for="cat in filteredCategories"
              :key="cat.id"
              class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
            >
              <!-- Name & Emoji -->
              <td class="py-4 px-4 sm:px-6">
                <div class="flex items-center gap-3">
                  <span class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl shadow-inner">
                    {{ cat.iconEmoji }}
                  </span>
                  <div>
                    <span class="font-semibold text-slate-900 dark:text-white block">{{ cat.name }}</span>
                    <span class="text-xs text-slate-400 font-mono">ID: #{{ cat.id }}</span>
                  </div>
                </div>
              </td>

              <!-- Slug -->
              <td class="py-4 px-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                {{ cat.slug }}
              </td>

              <!-- Upstream ID -->
              <td class="py-4 px-4 font-mono text-xs text-indigo-600 dark:text-indigo-400">
                <span v-if="cat.upstreamCategoryId" class="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                  XPro #{{ cat.upstreamCategoryId }}
                </span>
                <span v-else class="text-slate-400">Custom</span>
              </td>

              <!-- Product Count -->
              <td class="py-4 px-4">
                <span class="font-semibold text-slate-800 dark:text-slate-200">{{ cat.productCount }}</span>
                <span class="text-xs text-slate-400 ml-1">items</span>
              </td>

              <!-- Sort Order -->
              <td class="py-4 px-4 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                {{ cat.sortOrder }}
              </td>

              <!-- Status Toggle -->
              <td class="py-4 px-4">
                <button
                  type="button"
                  @click="toggleCategoryActive(cat)"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer"
                  :class="cat.isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="cat.isActive ? 'bg-emerald-500' : 'bg-slate-400'"></span>
                  <span>{{ cat.isActive ? 'Active' : 'Disabled' }}</span>
                </button>
              </td>

              <!-- Action -->
              <td class="py-4 px-4 sm:px-6 text-right">
                <button
                  type="button"
                  @click="openEditModal(cat)"
                  class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors inline-flex items-center gap-1.5"
                >
                  <i class="pi pi-pencil text-[11px]"></i>
                  <span>Edit</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Category Modal -->
    <div
      v-if="isEditModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5">
        <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <i class="pi pi-pencil text-indigo-500"></i>
            Edit Category
          </h3>
          <button
            type="button"
            @click="isEditModalOpen = false"
            class="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200"
          >
            <i class="pi pi-times text-xs"></i>
          </button>
        </div>

        <form @submit.prevent="saveCategory" class="space-y-4">
          <!-- Icon Emoji -->
          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Category Emoji / Icon
            </label>
            <input
              v-model="editForm.iconEmoji"
              type="text"
              maxlength="4"
              class="w-20 px-3 py-2 text-center text-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <!-- Name -->
          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Category Name
            </label>
            <input
              v-model="editForm.name"
              type="text"
              required
              class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <!-- Sort Order -->
          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Sort Sequence (Lower numbers appear first)
            </label>
            <input
              v-model.number="editForm.sortOrder"
              type="number"
              step="5"
              class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
            />
          </div>

          <!-- Active Toggle -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
            <div>
              <span class="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Category Visibility</span>
              <span class="text-[11px] text-slate-400">Enable in customer Telegram Bot</span>
            </div>
            <input
              v-model="editForm.isActive"
              type="checkbox"
              class="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
            />
          </div>

          <!-- Submit Buttons -->
          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              @click="isEditModalOpen = false"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="isSaving"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm disabled:opacity-50"
            >
              {{ isSaving ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
