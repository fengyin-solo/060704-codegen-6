<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDiaryStore } from '@/stores/diary'
import { useUserStore } from '@/stores/user'
import { globalTimeline } from '@/engine/Timeline'
import { COLLABORATION_STATUS_NAMES, COLLABORATION_STATUS_COLORS } from '@/types'
import type { CollaborationInvitation } from '@/types'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const router = useRouter()
const diaryStore = useDiaryStore()
const userStore = useUserStore()

const activeTab = ref<'received' | 'sent'>('received')

const receivedInvitations = computed(() => {
  return diaryStore.allInvitations
    .filter(inv => inv.inviteeId === userStore.currentUserId)
    .sort((a, b) => b.createdAt - a.createdAt)
})

const sentInvitations = computed(() => {
  return diaryStore.allInvitations
    .filter(inv => inv.inviterId === userStore.currentUserId)
    .sort((a, b) => b.createdAt - a.createdAt)
})

const pendingCount = computed(() => {
  return diaryStore.pendingInvitations.length
})

const displayedInvitations = computed(() => {
  return activeTab.value === 'received' ? receivedInvitations.value : sentInvitations.value
})

function getStatusColor(status: string): string {
  return COLLABORATION_STATUS_COLORS[status as keyof typeof COLLABORATION_STATUS_COLORS] || '#666'
}

function getStatusName(status: string): string {
  return COLLABORATION_STATUS_NAMES[status as keyof typeof COLLABORATION_STATUS_NAMES] || status
}

function formatTimeRemaining(expiresAt: number): string {
  const remaining = expiresAt - globalTimeline.getTime()
  if (remaining <= 0) return '已过期'
  if (remaining < 100) return `${remaining} 单位`
  if (remaining < 1000) return `${(remaining / 100).toFixed(1)} 百单位`
  return `${(remaining / 1000).toFixed(1)} 千单位`
}

function handleAccept(invitation: CollaborationInvitation) {
  const success = diaryStore.acceptInvitation(invitation.id)
  if (success) {
    emit('close')
    router.push(`/diary/${invitation.diaryId}`)
  }
}

function handleDecline(invitation: CollaborationInvitation) {
  diaryStore.declineInvitation(invitation.id)
}

function handleCancel(invitation: CollaborationInvitation) {
  diaryStore.cancelInvitation(invitation.id)
}

function goToDiary(diaryId: string) {
  emit('close')
  router.push(`/diary/${diaryId}`)
}

watch(() => props.visible, (visible) => {
  if (visible) {
    diaryStore.checkAndExpireInvitations()
  }
})
</script>

<template>
  <div v-if="visible" class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" @click.self="emit('close')">
    <div class="bg-gray-900 rounded-lg border-2 border-purple-500 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="font-vt323 text-xl text-purple-400 glow-text">
            📨 协作邀请
          </h3>
          <button
            class="text-gray-400 hover:text-white text-xl"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <div class="flex gap-2 mb-6">
          <button
            class="flex-1 btn-pixel text-sm"
            :class="activeTab === 'received' ? 'text-purple-400 border-purple-400' : 'text-gray-400 border-gray-600'"
            @click="activeTab = 'received'"
          >
            📥 收到的邀请
            <span v-if="pendingCount > 0" class="ml-1 px-2 py-0.5 rounded bg-red-500 text-white text-xs">
              {{ pendingCount }}
            </span>
          </button>
          <button
            class="flex-1 btn-pixel text-sm"
            :class="activeTab === 'sent' ? 'text-purple-400 border-purple-400' : 'text-gray-400 border-gray-600'"
            @click="activeTab = 'sent'"
          >
            📤 发出的邀请
          </button>
        </div>

        <div v-if="displayedInvitations.length === 0" class="text-center py-12">
          <div class="text-6xl mb-4">📭</div>
          <p class="text-gray-400 font-vt323">
            {{ activeTab === 'received' ? '暂无收到的邀请' : '暂无发出的邀请' }}
          </p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="invitation in displayedInvitations"
            :key="invitation.id"
            class="p-4 rounded bg-gray-800/50 border border-gray-700"
          >
            <div class="flex items-start justify-between mb-3">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-xl">
                    {{ activeTab === 'received' ? '👤' : '👥' }}
                  </span>
                  <div>
                    <div class="font-vt323">
                      {{ activeTab === 'received' ? invitation.inviterName : invitation.inviteeName }}
                    </div>
                    <div class="text-xs text-gray-500 font-vt323">
                      {{ activeTab === 'received' ? '邀请你协作' : '你邀请TA协作' }}
                    </div>
                  </div>
                </div>
                <div 
                  class="font-vt323 text-lg text-purple-400 mb-2 cursor-pointer hover:underline"
                  @click="goToDiary(invitation.diaryId)"
                >
                  📝 {{ invitation.diaryTitle }}
                </div>
                <div v-if="invitation.message" class="text-sm text-gray-400 font-vt323 mb-2">
                  「{{ invitation.message }}」
                </div>
                <div class="flex items-center gap-3 text-xs font-vt323">
                  <span class="text-gray-500">
                    发送于 {{ Math.floor(invitation.createdAt) }}
                  </span>
                  <span 
                    class="px-2 py-0.5 rounded"
                    :style="{ 
                      backgroundColor: getStatusColor(invitation.status) + '20',
                      color: getStatusColor(invitation.status),
                      borderColor: getStatusColor(invitation.status) + '50'
                    }"
                    style="border-width: 1px;"
                  >
                    {{ getStatusName(invitation.status) }}
                  </span>
                  <span v-if="invitation.status === 'pending'" class="text-orange-400">
                    剩余 {{ formatTimeRemaining(invitation.expiresAt) }}
                  </span>
                  <span v-if="invitation.respondedAt" class="text-gray-500">
                    回复于 {{ Math.floor(invitation.respondedAt) }}
                  </span>
                </div>
              </div>
            </div>

            <div v-if="activeTab === 'received' && invitation.status === 'pending'" class="flex gap-2 justify-end">
              <button
                class="btn-pixel text-gray-400 border-gray-600 text-sm"
                @click="handleDecline(invitation)"
              >
                拒绝
              </button>
              <button
                class="btn-pixel text-green-400 border-green-400 text-sm"
                @click="handleAccept(invitation)"
              >
                ✓ 接受邀请
              </button>
            </div>

            <div v-if="activeTab === 'sent' && invitation.status === 'pending'" class="flex justify-end">
              <button
                class="btn-pixel text-red-400 border-red-400 text-sm"
                @click="handleCancel(invitation)"
              >
                取消邀请
              </button>
            </div>

            <div v-if="activeTab === 'received' && invitation.status === 'accepted'" class="flex justify-end">
              <button
                class="btn-pixel text-purple-400 border-purple-400 text-sm"
                @click="goToDiary(invitation.diaryId)"
              >
                查看日记 →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
