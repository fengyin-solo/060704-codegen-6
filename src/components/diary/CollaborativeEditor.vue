<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useUserStore } from '@/stores/user'
import { EditType } from '@/types'
import type { Diary } from '@/types'

interface Props {
  diary: Diary
  canEdit: boolean
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', content: string, editType: EditType): boolean
}>()

const userStore = useUserStore()

const editContent = ref('')
const editMode = ref<'append' | 'replace'>('append')
const hasChanges = ref(false)
const saveSuccess = ref(false)

const currentUser = computed(() => userStore.currentUser)

watch(() => props.visible, (visible) => {
  if (visible && props.diary) {
    editContent.value = props.diary.content.text
    hasChanges.value = false
    saveSuccess.value = false
  }
}, { immediate: true })

watch(editContent, (newVal) => {
  hasChanges.value = newVal !== props.diary.content.text
})

function appendText(text: string) {
  const now = Date.now()
  const timestamp = `\n\n--- [${currentUser.value?.name || '匿名'} 补充于 ${Math.floor(now / 1000)}] ---\n`
  editContent.value = editContent.value + timestamp + text
}

function handleSave() {
  if (!hasChanges.value) return
  
  const editType = editMode.value === 'append' ? EditType.APPEND : EditType.UPDATE
  const success = emit('save', editContent.value, editType)
  
  if (success) {
    saveSuccess.value = true
    setTimeout(() => {
      saveSuccess.value = false
      hasChanges.value = false
    }, 2000)
  }
}

function handleQuickAppend(emotion: string) {
  const quickTexts: Record<string, string> = {
    heart: '我也有同样的感受，谢谢你愿意与我分享这些。',
    memory: '这让我想起了我们一起度过的那段时光...',
    continue: '让我继续这个故事：',
    encourage: '写得真好！期待看到更多。',
    reflect: '读完后我想了很多，我的想法是：'
  }
  
  const text = quickTexts[emotion] || ''
  if (text) {
    appendText(text)
  }
}
</script>

<template>
  <div v-if="visible" class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
    <div class="bg-gray-900 rounded-lg border-2 border-green-500 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <div class="p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="font-vt323 text-xl text-green-400 glow-text">
            ✏️ 协作编辑
          </h3>
          <button
            class="text-gray-400 hover:text-white text-xl"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
        
        <div v-if="!canEdit" class="text-center py-12">
          <div class="text-6xl mb-4">🔒</div>
          <p class="text-gray-400 font-vt323">
            你没有编辑权限
          </p>
        </div>
        
        <template v-else>
          <div class="mb-4 p-4 bg-gray-800/50 rounded border border-gray-700">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="text-green-400 text-2xl">👤</span>
                <div>
                  <div class="font-vt323 text-green-400">
                    {{ currentUser?.name || '匿名用户' }}
                  </div>
                  <div class="text-xs text-gray-500 font-vt323">
                    正在以协作者身份编辑
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    v-model="editMode"
                    value="append"
                    class="accent-green-500"
                  />
                  <span class="text-sm font-vt323 text-gray-400">追加模式</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    v-model="editMode"
                    value="replace"
                    class="accent-green-500"
                  />
                  <span class="text-sm font-vt323 text-gray-400">修改模式</span>
                </label>
              </div>
            </div>
          </div>
          
          <div class="mb-4">
            <label class="block font-vt323 text-gray-400 mb-2 text-sm">
              快速留言
            </label>
            <div class="flex flex-wrap gap-2">
              <button
                class="px-3 py-1 rounded bg-pink-500/20 text-pink-400 border border-pink-500/30 text-sm font-vt323 hover:bg-pink-500/30 transition-colors"
                @click="handleQuickAppend('heart')"
              >
                💕 同感
              </button>
              <button
                class="px-3 py-1 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-sm font-vt323 hover:bg-blue-500/30 transition-colors"
                @click="handleQuickAppend('memory')"
              >
                📝 回忆
              </button>
              <button
                class="px-3 py-1 rounded bg-green-500/20 text-green-400 border border-green-500/30 text-sm font-vt323 hover:bg-green-500/30 transition-colors"
                @click="handleQuickAppend('continue')"
              >
                📖 续写
              </button>
              <button
                class="px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-sm font-vt323 hover:bg-yellow-500/30 transition-colors"
                @click="handleQuickAppend('encourage')"
              >
                👏 鼓励
              </button>
              <button
                class="px-3 py-1 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 text-sm font-vt323 hover:bg-purple-500/30 transition-colors"
                @click="handleQuickAppend('reflect')"
              >
                💭 感想
              </button>
            </div>
          </div>
          
          <div class="mb-4">
            <label class="block font-vt323 text-gray-400 mb-2 text-sm">
              日记内容
            </label>
            <textarea
              v-model="editContent"
              class="w-full h-64 bg-gray-800 border border-gray-600 rounded px-4 py-3 font-vt323 text-white focus:outline-none focus:border-green-500 resize-none"
              placeholder="在这里编辑日记内容..."
            ></textarea>
            <div class="flex justify-between text-xs text-gray-500 font-vt323 mt-1">
              <span>
                {{ editMode === 'append' ? '追加模式：在末尾添加你的内容' : '修改模式：直接修改原文' }}
              </span>
              <span>
                {{ editContent.length }} 字
              </span>
            </div>
          </div>
          
          <div v-if="hasChanges" class="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
            <p class="text-yellow-400 text-sm font-vt323">
              ⚠️ 内容已修改，记得保存！
            </p>
          </div>
          
          <div v-if="saveSuccess" class="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded">
            <p class="text-green-400 text-sm font-vt323">
              ✓ 保存成功！协作记录已更新
            </p>
          </div>
          
          <div class="ascii-divider text-center my-6">
            ----------------------------------------------------------------
          </div>
          
          <div class="flex gap-3 justify-end">
            <button
              class="btn-pixel text-gray-400 border-gray-600"
              @click="emit('close')"
            >
              取消
            </button>
            <button
              class="btn-pixel text-green-400 border-green-400"
              :disabled="!hasChanges"
              @click="handleSave"
            >
              💾 保存修改
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
