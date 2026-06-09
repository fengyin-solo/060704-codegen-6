<script setup lang="ts">
import { ref, computed } from 'vue'
import { EDIT_TYPE_NAMES } from '@/types'
import type { CollaborationEditRecord, Diary } from '@/types'

interface Props {
  diary: Diary
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const selectedRecord = ref<CollaborationEditRecord | null>(null)

const editHistory = computed(() => {
  return [...props.diary.collaboration.editHistory].sort((a, b) => b.timestamp - a.timestamp)
})

const collaborators = computed(() => {
  const map = new Map<string, { name: string; count: number }>()
  
  const ownerId = props.diary.ownerId
  map.set(ownerId, { name: '作者', count: 0 })
  
  props.diary.collaboration.collaborators.forEach(c => {
    map.set(c.userId, { name: c.userName, count: c.editCount })
  })
  
  props.diary.collaboration.editHistory.forEach(record => {
    const existing = map.get(record.editorId)
    if (existing) {
      existing.count++
    } else {
      map.set(record.editorId, { name: record.editorName, count: 1 })
    }
  })
  
  return Array.from(map.entries()).map(([userId, data]) => ({
    userId,
    name: data.name,
    count: data.count
  }))
})

function getEditTypeName(type: string): string {
  return EDIT_TYPE_NAMES[type as keyof typeof EDIT_TYPE_NAMES] || type
}

function showDiff(record: CollaborationEditRecord) {
  selectedRecord.value = record
}

function closeDiff() {
  selectedRecord.value = null
}

function getDiffPreview(record: CollaborationEditRecord): string {
  const start = Math.max(0, record.diffStart - 20)
  const end = Math.min(record.newContent.length, record.diffStart + record.diffLength + 20)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < record.newContent.length ? '...' : ''
  return prefix + record.newContent.slice(start, end) + suffix
}
</script>

<template>
  <div v-if="visible" class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
    <div class="bg-gray-900 rounded-lg border-2 border-cyan-500 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="font-vt323 text-xl text-cyan-400 glow-text">
            📜 协作历史记录
          </h3>
          <button
            class="text-gray-400 hover:text-white text-xl"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
        
        <div class="mb-6">
          <h4 class="font-vt323 text-lg text-diary-fresh mb-3">
            👥 贡献者统计
          </h4>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="collaborator in collaborators"
              :key="collaborator.userId"
              class="px-3 py-2 rounded bg-gray-800/50 border border-gray-700"
            >
              <span class="font-vt323">{{ collaborator.name }}</span>
              <span class="text-cyan-400 font-vt323 ml-2">×{{ collaborator.count }}</span>
            </div>
          </div>
        </div>
        
        <div class="ascii-divider text-center my-6">
          ----------------------------------------------------------------
        </div>
        
        <div>
          <h4 class="font-vt323 text-lg text-orange-400 mb-3">
            📝 编辑历史 ({{ editHistory.length }} 条)
          </h4>
          
          <div v-if="editHistory.length === 0" class="text-gray-500 text-sm font-vt323 p-8 bg-gray-800/50 rounded text-center">
            暂无协作编辑记录
          </div>
          
          <div v-else class="space-y-3">
            <div
              v-for="record in editHistory"
              :key="record.id"
              class="p-4 rounded bg-gray-800/50 border border-gray-700 cursor-pointer hover:border-cyan-500/50 transition-colors"
              @click="showDiff(record)"
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-3">
                  <span class="text-2xl">
                    {{ record.editType === 'create' ? '✨' : record.editType === 'append' ? '➕' : '✏️' }}
                  </span>
                  <div>
                    <span class="font-vt323 text-cyan-400">{{ record.editorName }}</span>
                    <span class="text-gray-500 mx-2">·</span>
                    <span 
                      class="px-2 py-0.5 rounded text-xs font-vt323"
                      :class="{
                        'bg-green-500/20 text-green-400': record.editType === 'create',
                        'bg-blue-500/20 text-blue-400': record.editType === 'update',
                        'bg-purple-500/20 text-purple-400': record.editType === 'append'
                      }"
                    >
                      {{ getEditTypeName(record.editType) }}
                    </span>
                  </div>
                </div>
                <span class="text-xs text-gray-500 font-vt323">
                  {{ Math.floor(record.timestamp) }}
                </span>
              </div>
              <div class="text-sm text-gray-400 font-vt323 line-clamp-2">
                {{ getDiffPreview(record) }}
              </div>
              <div class="text-xs text-cyan-500/70 font-vt323 mt-2">
                点击查看完整变更
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div v-if="selectedRecord" class="fixed inset-0 bg-black/90 z-60 flex items-center justify-center p-4" @click="closeDiff">
      <div class="bg-gray-900 rounded-lg border-2 border-cyan-500 w-full max-w-4xl max-h-[80vh] overflow-y-auto" @click.stop>
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h3 class="font-vt323 text-xl text-cyan-400">
              🔍 变更详情
            </h3>
            <button
              class="text-gray-400 hover:text-white text-xl"
              @click="closeDiff"
            >
              ✕
            </button>
          </div>
          
          <div class="mb-4 p-4 bg-gray-800/50 rounded">
            <div class="flex items-center gap-4 text-sm font-vt323">
              <div>
                <span class="text-gray-500">编辑者:</span>
                <span class="text-cyan-400 ml-2">{{ selectedRecord.editorName }}</span>
              </div>
              <div>
                <span class="text-gray-500">类型:</span>
                <span class="text-green-400 ml-2">{{ getEditTypeName(selectedRecord.editType) }}</span>
              </div>
              <div>
                <span class="text-gray-500">时间:</span>
                <span class="text-gray-300 ml-2">{{ Math.floor(selectedRecord.timestamp) }}</span>
              </div>
            </div>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 class="font-vt323 text-red-400 mb-2 text-sm">
                📕 变更前
              </h4>
              <div class="p-4 bg-red-900/20 border border-red-500/30 rounded font-vt323 text-sm whitespace-pre-wrap break-words">
                {{ selectedRecord.previousContent || '(空)' }}
              </div>
            </div>
            <div>
              <h4 class="font-vt323 text-green-400 mb-2 text-sm">
                📗 变更后
              </h4>
              <div class="p-4 bg-green-900/20 border border-green-500/30 rounded font-vt323 text-sm whitespace-pre-wrap break-words">
                {{ selectedRecord.newContent || '(空)' }}
              </div>
            </div>
          </div>
          
          <div class="mt-6 flex justify-end">
            <button
              class="btn-pixel text-cyan-400 border-cyan-400"
              @click="closeDiff"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
