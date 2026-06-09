<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUserStore } from '@/stores/user'
import { useDiaryStore } from '@/stores/diary'
import { globalTimeline } from '@/engine/Timeline'
import { COLLABORATION_STATUS_NAMES, COLLABORATION_STATUS_COLORS } from '@/types'
import type { Diary, Collaborator, CollaborationInvitation } from '@/types'

interface Props {
  diary: Diary
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'invited'): void
}>()

const userStore = useUserStore()
const diaryStore = useDiaryStore()

const selectedUserId = ref<string>('')
const inviteMessage = ref<string>('')
const expiresIn = ref<number>(1000)

const availableUsers = computed(() => {
  const currentUserId = userStore.currentUserId
  const collaboratorIds = props.diary.collaboration.collaborators.map(c => c.userId)
  const pendingInviteeIds = props.diary.collaboration.invitations
    .filter(inv => inv.status === 'pending')
    .map(inv => inv.inviteeId)
  
  return userStore.publicUsers.filter(u => 
    u.id !== currentUserId && 
    !collaboratorIds.includes(u.id) &&
    !pendingInviteeIds.includes(u.id)
  )
})

const collaborators = computed(() => props.diary.collaboration.collaborators)
const invitations = computed(() => props.diary.collaboration.invitations)

function formatTime(offset: number): string {
  if (offset < 100) return `${offset} 单位`
  if (offset < 1000) return `${(offset / 100).toFixed(1)} 百单位`
  return `${(offset / 1000).toFixed(1)} 千单位`
}

function handleInvite() {
  if (!selectedUserId.value) return
  
  const success = diaryStore.inviteCollaborator(
    props.diary.id,
    selectedUserId.value,
    inviteMessage.value,
    expiresIn.value
  )
  
  if (success) {
    selectedUserId.value = ''
    inviteMessage.value = ''
    emit('invited')
  }
}

function handleRemoveCollaborator(collaboratorId: string) {
  diaryStore.removeCollaborator(props.diary.id, collaboratorId)
  emit('invited')
}

function handleCancelInvitation(invitationId: string) {
  diaryStore.cancelInvitation(invitationId)
  emit('invited')
}

function getStatusColor(status: string): string {
  return COLLABORATION_STATUS_COLORS[status as keyof typeof COLLABORATION_STATUS_COLORS] || '#666'
}

function getStatusName(status: string): string {
  return COLLABORATION_STATUS_NAMES[status as keyof typeof COLLABORATION_STATUS_NAMES] || status
}
</script>

<template>
  <div v-if="visible" class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
    <div class="bg-gray-900 rounded-lg border-2 border-purple-500 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="font-vt323 text-xl text-purple-400 glow-text">
            👥 邀请协作者
          </h3>
          <button
            class="text-gray-400 hover:text-white text-xl"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
        
        <p class="text-gray-400 text-sm font-vt323 mb-6">
          邀请其他用户一起补完这篇日记，双方都能看到完整的协作记录。
        </p>
        
        <div class="mb-6">
          <h4 class="font-vt323 text-lg text-diary-fresh mb-3">
            📝 当前协作者 ({{ collaborators.length }})
          </h4>
          
          <div v-if="collaborators.length === 0" class="text-gray-500 text-sm font-vt323 p-4 bg-gray-800/50 rounded">
            还没有协作者，邀请一位吧！
          </div>
          
          <div v-else class="space-y-2">
            <div
              v-for="collaborator in collaborators"
              :key="collaborator.userId"
              class="flex items-center justify-between p-3 rounded bg-gray-800/50 border border-gray-700"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-xl">
                  👤
                </div>
                <div>
                  <div class="font-vt323">{{ collaborator.userName }}</div>
                  <div class="text-xs text-gray-500 font-vt323">
                    加入时间: {{ Math.floor(collaborator.joinedAt) }} · 编辑 {{ collaborator.editCount }} 次
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="px-2 py-1 rounded text-xs font-vt323 bg-green-500/20 text-green-400 border border-green-500/30">
                  {{ collaborator.canEdit ? '✏️ 可编辑' : '👁️ 仅查看' }}
                </span>
                <button
                  class="text-red-400 hover:text-red-300 text-sm font-vt323"
                  @click="handleRemoveCollaborator(collaborator.userId)"
                >
                  移除
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="mb-6">
          <h4 class="font-vt323 text-lg text-orange-400 mb-3">
            📨 邀请记录
          </h4>
          
          <div v-if="invitations.length === 0" class="text-gray-500 text-sm font-vt323 p-4 bg-gray-800/50 rounded">
            暂无邀请记录
          </div>
          
          <div v-else class="space-y-2 max-h-40 overflow-y-auto">
            <div
              v-for="invitation in invitations"
              :key="invitation.id"
              class="flex items-center justify-between p-3 rounded bg-gray-800/50 border border-gray-700"
            >
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-vt323">{{ invitation.inviteeName }}</span>
                  <span 
                    class="px-2 py-0.5 rounded text-xs font-vt323"
                    :style="{ 
                      backgroundColor: getStatusColor(invitation.status) + '20',
                      color: getStatusColor(invitation.status),
                      borderColor: getStatusColor(invitation.status) + '50'
                    }"
                    style="border-width: 1px;"
                  >
                    {{ getStatusName(invitation.status) }}
                  </span>
                </div>
                <div v-if="invitation.message" class="text-xs text-gray-500 font-vt323 mt-1">
                  留言: {{ invitation.message }}
                </div>
                <div class="text-xs text-gray-600 font-vt323 mt-1">
                  发送于 {{ Math.floor(invitation.createdAt) }}
                  <span v-if="invitation.status === 'pending'">
                    · 剩余 {{ Math.max(0, Math.floor(invitation.expiresAt - globalTimeline.getTime())) }} 单位
                  </span>
                  <span v-else-if="invitation.respondedAt">
                    · 回复于 {{ Math.floor(invitation.respondedAt) }}
                  </span>
                </div>
              </div>
              <button
                v-if="invitation.status === 'pending'"
                class="text-gray-400 hover:text-red-400 text-sm font-vt323"
                @click="handleCancelInvitation(invitation.id)"
              >
                取消
              </button>
            </div>
          </div>
        </div>
        
        <div class="ascii-divider text-center my-6">
          ----------------------------------------------------------------
        </div>
        
        <div class="space-y-4">
          <h4 class="font-vt323 text-lg text-blue-400 mb-3">
            ✉️ 发送新邀请
          </h4>
          
          <div>
            <label class="block font-vt323 text-gray-400 mb-2 text-sm">
              选择用户
            </label>
            <select
              v-model="selectedUserId"
              class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 font-vt323 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="">-- 请选择 --</option>
              <option 
                v-for="user in availableUsers" 
                :key="user.id" 
                :value="user.id"
              >
                {{ user.name }}
              </option>
            </select>
            <p v-if="availableUsers.length === 0" class="text-xs text-gray-500 mt-1 font-vt323">
              没有可邀请的用户
            </p>
          </div>
          
          <div>
            <label class="block font-vt323 text-gray-400 mb-2 text-sm">
              邀请留言 (可选)
            </label>
            <textarea
              v-model="inviteMessage"
              placeholder="想对 TA 说些什么..."
              class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 font-vt323 text-white focus:outline-none focus:border-purple-500 resize-none"
              rows="3"
            ></textarea>
          </div>
          
          <div>
            <label class="block font-vt323 text-gray-400 mb-2 text-sm">
              邀请有效期: {{ formatTime(expiresIn) }}
            </label>
            <input
              type="range"
              v-model.number="expiresIn"
              :min="100"
              :max="5000"
              :step="50"
              class="w-full accent-purple-500"
            />
            <div class="flex justify-between text-xs text-gray-500 font-vt323 mt-1">
              <span>100 单位</span>
              <span>5000 单位</span>
            </div>
          </div>
          
          <div class="flex gap-3 justify-end pt-4">
            <button
              class="btn-pixel text-gray-400 border-gray-600"
              @click="emit('close')"
            >
              取消
            </button>
            <button
              class="btn-pixel text-purple-400 border-purple-400"
              :disabled="!selectedUserId"
              @click="handleInvite"
            >
              📨 发送邀请
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
