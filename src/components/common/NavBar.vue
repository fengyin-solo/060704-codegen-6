<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDiaryStore } from '@/stores/diary'
import CollaborationNotificationPanel from '@/components/diary/CollaborationNotificationPanel.vue'
import type { User } from '@/types'

interface Props {
  isLoggedIn: boolean
  isVisiting: boolean
  currentUser: User | null
  visitingUser: User | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  logout: []
  'stop-visiting': []
}>()

const router = useRouter()
const route = useRoute()
const diaryStore = useDiaryStore()

const showNotificationPanel = ref(false)

const pendingInvitationCount = computed(() => {
  if (!props.isLoggedIn || props.isVisiting) return 0
  return diaryStore.pendingInvitations.length
})

const navItems = computed(() => {
  const items = [
    { path: '/', label: '日记墙', icon: '📒' },
    { path: '/gallery', label: '展陈馆', icon: '🏛️' }
  ]
  
  if (props.isLoggedIn && !props.isVisiting) {
    items.push(
      { path: '/inventory', label: '道具仓库', icon: '🎒' },
      { path: '/archive', label: '旧档案馆', icon: '📜' },
      { path: '/visit', label: '串门', icon: '🚪' },
      { path: '/user', label: '用户中心', icon: '👤' }
    )
  }
  
  return items
})

function isActive(path: string): boolean {
  if (path === '/') {
    return route.path === '/' || route.path.startsWith('/visit/')
  }
  if (path === '/gallery') {
    return route.path === '/gallery'
  }
  return route.path === path
}

function navigate(path: string) {
  router.push(path)
}
</script>

<template>
  <nav class="border-b border-gray-800 bg-diary-bg/95 backdrop-blur-sm sticky top-0 z-40">
    <div class="container mx-auto px-4">
      <div class="flex items-center justify-between h-16">
        <div class="flex items-center gap-2">
          <span class="text-2xl">📓</span>
          <h1 
            class="font-vt323 text-2xl text-diary-fresh glow-text cursor-pointer"
            @click="navigate('/')"
          >
            故障日记
          </h1>
        </div>
        
        <div v-if="isVisiting && visitingUser" class="flex items-center gap-4">
          <div class="text-diary-frozen font-vt323 text-lg">
            正在访问: <span class="glow-text">{{ visitingUser.name }}</span> 的墙
          </div>
          <button 
            class="btn-pixel text-diary-frozen border-diary-frozen"
            @click="emit('stop-visiting')"
          >
            离开
          </button>
        </div>
        
        <div v-else class="flex items-center gap-6">
          <div class="flex items-center gap-2">
            <button
              v-for="item in navItems"
              :key="item.path"
              class="px-3 py-1 font-vt323 text-lg transition-all"
              :class="[
                isActive(item.path) 
                  ? 'text-diary-fresh glow-text' 
                  : 'text-gray-400 hover:text-diary-fresh'
              ]"
              @click="navigate(item.path)"
            >
              <span class="mr-1">{{ item.icon }}</span>
              {{ item.label }}
            </button>
          </div>
          
          <div v-if="isLoggedIn && currentUser" class="flex items-center gap-3">
            <button
              class="relative p-2 rounded hover:bg-gray-800 transition-colors"
              @click="showNotificationPanel = true"
            >
              <span class="text-xl">📨</span>
              <span
                v-if="pendingInvitationCount > 0"
                class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-vt323 animate-pulse"
              >
                {{ pendingInvitationCount > 9 ? '9+' : pendingInvitationCount }}
              </span>
            </button>
            <span class="font-vt323 text-gray-300">
              {{ currentUser.name }}
            </span>
            <button 
              class="btn-pixel text-gray-400 border-gray-600 text-sm"
              @click="emit('logout')"
            >
              登出
            </button>
          </div>
        </div>
      </div>
    </div>
  </nav>
  
  <CollaborationNotificationPanel
    :visible="showNotificationPanel"
    @close="showNotificationPanel = false"
  />
</template>
