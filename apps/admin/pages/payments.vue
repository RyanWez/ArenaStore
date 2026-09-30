<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast } from '~/composables/useToast'

const toast = useToast()
const isLoading = ref(true)

onMounted(() => {
  setTimeout(() => {
    isLoading.value = false
  }, 450)
})

interface PaymentItem {
  id: number
  orderId: string
  publicOrderNo: string
  productName: string
  customerName: string
  telegramUsername: string
  paymentMethod: 'KPAY' | 'WAVEPAY' | 'UAB_PAY' | 'AYA_PAY'
  submittedAmountMmk: number
  transactionRef: string
  slipImageUrl: string
  submittedAt: string
  status: 'SUBMITTED' | 'VERIFIED' | 'REJECTED'
}

const isSlipModalOpen = ref(false)
const isRejectModalOpen = ref(false)
const selectedSlip = ref<PaymentItem | null>(null)
const rejectReason = ref('Slip amount does not match order total.')
const isProcessing = ref(false)

const slips = ref<PaymentItem[]>([
  {
    id: 101,
    orderId: 'c1234567-89ab-cdef-0123-456789abcdef',
    publicOrderNo: 'ARN-2026-84920',
    productName: 'Gemini AI 18 MONTH',
    customerName: 'Ryan Wez',
    telegramUsername: '@ryanwez',
    paymentMethod: 'KPAY',
    submittedAmountMmk: 3900,
    transactionRef: '098472918471',
    slipImageUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=80',
    submittedAt: '5 mins ago',
    status: 'SUBMITTED',
  },
  {
    id: 102,
    orderId: 'd9876543-21ba-fedc-3210-987654fedcba',
    publicOrderNo: 'ARN-2026-84921',
    productName: 'Canva Pro 1 Year Private',
    customerName: 'Aung Kyaw',
    telegramUsername: '@aungkyaw_99',
    paymentMethod: 'WAVEPAY',
    submittedAmountMmk: 3200,
    transactionRef: 'WP-84920194',
    slipImageUrl: 'https://images.unsplash.com/photo-1554224154-26032ffc0d07?auto=format&fit=crop&w=800&q=80',
    submittedAt: '25 mins ago',
    status: 'SUBMITTED',
  },
  {
    id: 103,
    orderId: 'e4567890-1234-5678-9012-345678901234',
    publicOrderNo: 'ARN-2026-84919',
    productName: 'Claude $100 API Key',
    customerName: 'Ko Kyaw',
    telegramUsername: '@kyawkyaw_mm',
    paymentMethod: 'KPAY',
    submittedAmountMmk: 16500,
    transactionRef: '098192849182',
    slipImageUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80',
    submittedAt: '1 hour ago',
    status: 'VERIFIED',
  },
])

function openSlipPreview(slip: PaymentItem) {
  selectedSlip.value = slip
  isSlipModalOpen.value = true
}

async function approvePayment(slip: PaymentItem) {
  if (isProcessing.value) return
  isProcessing.value = true

  try {
    // In real backend, calls /api/admin/payments/review
    await new Promise((r) => setTimeout(r, 600))
    slip.status = 'VERIFIED'
    isSlipModalOpen.value = false
    toast.success(
      `Order ${slip.publicOrderNo} approved! Upstream order fulfilled and credentials delivered to ${slip.telegramUsername}.`,
      'Payment Approved'
    )
  } finally {
    isProcessing.value = false
  }
}

function openRejectDialog(slip: PaymentItem) {
  selectedSlip.value = slip
  isRejectModalOpen.value = true
}

function confirmReject() {
  if (!selectedSlip.value) return
  const orderNo = selectedSlip.value.publicOrderNo
  selectedSlip.value.status = 'REJECTED'
  isRejectModalOpen.value = false
  isSlipModalOpen.value = false
  toast.warn(
    `Payment for ${orderNo} rejected. Stock reservation released.`,
    'Payment Rejected'
  )
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Payment Slips & Order Verification
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Review customer KPay & WavePay screenshot receipts. One-click approve triggers automatic upstream delivery.
        </p>
      </div>

      <!-- Quick Counter -->
      <div class="flex items-center gap-2">
        <span class="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
          <i class="pi pi-hourglass"></i>
          <span>2 Pending Verification</span>
        </span>
      </div>
    </div>

    <!-- Slips Table -->
    <div class="rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-sm">
          <thead>
            <tr class="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-950/40">
              <th class="py-3 px-4">Receipt</th>
              <th class="py-3 px-4">Order ID & Item</th>
              <th class="py-3 px-4">Customer</th>
              <th class="py-3 px-4">Method & Ref</th>
              <th class="py-3 px-4">Amount</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
            <!-- Skeleton Loading State -->
            <template v-if="isLoading">
              <tr v-for="n in 3" :key="'slip-skel-' + n">
                <td class="py-3.5 px-4"><Skeleton height="3.5rem" width="3rem" border-radius="8px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="130px" class="mb-1.5" border-radius="6px" /><Skeleton height="0.9rem" width="90px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="100px" class="mb-1.5" border-radius="6px" /><Skeleton height="0.9rem" width="80px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.1rem" width="70px" class="mb-1.5" border-radius="6px" /><Skeleton height="0.9rem" width="110px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.2rem" width="80px" border-radius="6px" /></td>
                <td class="py-3.5 px-4"><Skeleton height="1.3rem" width="65px" border-radius="9999px" /></td>
                <td class="py-3.5 px-4 text-right"><Skeleton height="1.6rem" width="75px" class="ml-auto" border-radius="10px" /></td>
              </tr>
            </template>
            <template v-else>
              <tr
                v-for="slip in slips"
                :key="slip.id"
                class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
              <!-- Thumbnail -->
              <td class="py-3.5 px-4">
                <button
                  type="button"
                  @click="openSlipPreview(slip)"
                  class="relative group w-12 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 block shadow-sm"
                  title="Click to zoom slip image"
                >
                  <img
                    :src="slip.slipImageUrl"
                    alt="Slip preview"
                    class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                    <i class="pi pi-search-plus text-xs"></i>
                  </div>
                </button>
              </td>

              <!-- Order & Item -->
              <td class="py-3.5 px-4">
                <div class="font-mono font-semibold text-xs text-slate-900 dark:text-white">
                  {{ slip.publicOrderNo }}
                </div>
                <div class="text-sm font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                  {{ slip.productName }}
                </div>
                <div class="text-[11px] text-slate-400">
                  {{ slip.submittedAt }}
                </div>
              </td>

              <!-- Customer -->
              <td class="py-3.5 px-4">
                <div class="font-medium text-slate-800 dark:text-slate-200">
                  {{ slip.customerName }}
                </div>
                <div class="text-xs text-indigo-600 dark:text-indigo-400 font-mono">
                  {{ slip.telegramUsername }}
                </div>
              </td>

              <!-- Method & Transaction Ref -->
              <td class="py-3.5 px-4">
                <span
                  class="inline-block px-2 py-0.5 rounded text-[11px] font-bold"
                  :class="slip.paymentMethod === 'KPAY' ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20' : 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/20'"
                >
                  {{ slip.paymentMethod }}
                </span>
                <div class="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                  TX: {{ slip.transactionRef }}
                </div>
              </td>

              <!-- Amount -->
              <td class="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                {{ slip.submittedAmountMmk.toLocaleString() }} Ks
              </td>

              <!-- Status -->
              <td class="py-3.5 px-4">
                <span
                  v-if="slip.status === 'SUBMITTED'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse"
                >
                  <i class="pi pi-clock text-[10px]"></i>
                  <span>Review</span>
                </span>
                <span
                  v-else-if="slip.status === 'VERIFIED'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                >
                  <i class="pi pi-check text-[10px]"></i>
                  <span>Approved</span>
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                >
                  <i class="pi pi-times text-[10px]"></i>
                  <span>Rejected</span>
                </span>
              </td>

              <!-- Action Buttons -->
              <td class="py-3.5 px-4 text-right">
                <div v-if="slip.status === 'SUBMITTED'" class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    @click="approvePayment(slip)"
                    :disabled="isProcessing"
                    class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
                  >
                    <i class="pi pi-check text-[11px]"></i>
                    <span>Approve</span>
                  </button>

                  <button
                    type="button"
                    @click="openRejectDialog(slip)"
                    class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    title="Reject slip"
                  >
                    <i class="pi pi-times text-sm"></i>
                  </button>
                </div>
                <div v-else class="text-xs text-slate-400 italic">
                  Resolved
                </div>
              </td>
            </tr>
          </template>
        </tbody>
        </table>
      </div>
    </div>

    <!-- Zoomable Slip Preview Modal -->
    <Transition name="modal">
      <div
        v-if="isSlipModalOpen && selectedSlip"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        @click.self="isSlipModalOpen = false"
      >
        <div class="modal-card w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 p-5">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 class="font-bold text-base text-slate-900 dark:text-white">
                Slip Verification — {{ selectedSlip.publicOrderNo }}
              </h3>
              <p class="text-xs text-slate-400">
                Customer: {{ selectedSlip.customerName }} ({{ selectedSlip.telegramUsername }}) · {{ selectedSlip.paymentMethod }}
              </p>
            </div>
            <button
              type="button"
              @click="isSlipModalOpen = false"
              class="text-slate-400 hover:text-slate-200"
            >
              <i class="pi pi-times text-lg"></i>
            </button>
          </div>

          <!-- High-res Image Preview Area -->
          <div class="max-h-[60vh] overflow-auto rounded-xl bg-black/40 border border-slate-800 flex items-center justify-center p-2">
            <img
              :src="selectedSlip.slipImageUrl"
              alt="Full Receipt"
              class="max-h-[55vh] object-contain rounded-lg shadow-md"
            />
          </div>

          <!-- Transaction Details Row -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <div>
              <span class="text-slate-400 block">Item:</span>
              <span class="font-medium text-slate-800 dark:text-slate-200">{{ selectedSlip.productName }}</span>
            </div>
            <div>
              <span class="text-slate-400 block">Total Amount:</span>
              <span class="font-bold text-slate-900 dark:text-white">{{ selectedSlip.submittedAmountMmk.toLocaleString() }} Ks</span>
            </div>
            <div>
              <span class="text-slate-400 block">Transaction Ref:</span>
              <span class="font-mono text-slate-800 dark:text-slate-200">{{ selectedSlip.transactionRef }}</span>
            </div>
            <div>
              <span class="text-slate-400 block">Submitted:</span>
              <span class="text-slate-600 dark:text-slate-300">{{ selectedSlip.submittedAt }}</span>
            </div>
          </div>

          <!-- Modal Bottom Actions -->
          <div class="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              v-if="selectedSlip.status === 'SUBMITTED'"
              type="button"
              @click="openRejectDialog(selectedSlip)"
              class="px-4 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Reject Payment
            </button>
            <div v-else></div>

            <div class="flex items-center gap-3">
              <button
                type="button"
                @click="isSlipModalOpen = false"
                class="px-4 py-2 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
              <button
                v-if="selectedSlip.status === 'SUBMITTED'"
                type="button"
                @click="approvePayment(selectedSlip)"
                :disabled="isProcessing"
                class="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
              >
                <i class="pi pi-check"></i>
                <span>Approve & Deliver Now</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Reject Reason Dialog -->
    <Transition name="modal">
      <div
        v-if="isRejectModalOpen && selectedSlip"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        @click.self="isRejectModalOpen = false"
      >
        <div class="modal-card w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
          <h3 class="text-base font-bold text-slate-900 dark:text-white">
            Reject Payment Slip
          </h3>
          <p class="text-xs text-slate-400">
            State the reason why order <span class="font-mono text-white">{{ selectedSlip.publicOrderNo }}</span> was rejected. This reason will be sent to the customer on Telegram.
          </p>

          <textarea
            v-model="rejectReason"
            rows="3"
            class="w-full p-3 rounded-xl text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="e.g. Invalid transaction ID or wrong amount..."
          ></textarea>

          <div class="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              @click="isRejectModalOpen = false"
              class="px-4 py-2 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="confirmReject"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/30"
            >
              Confirm Rejection
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
