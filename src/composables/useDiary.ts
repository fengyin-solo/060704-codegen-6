import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useDiaryStore } from '@/stores/diary'
import { useUserStore } from '@/stores/user'
import { useInventoryStore } from '@/stores/inventory'
import { renderPipeline } from '@/engine/RenderPipeline'
import { globalTimeline } from '@/engine/Timeline'
import { pluginLoader } from '@/engine/PluginLoader'
import type { Diary, PipelineStep, DiarySchedule, EditType } from '@/types'
import { STATE_NAMES, STATE_COLORS, DiaryState, EditType as ET } from '@/types'

export function useDiary(diaryId?: string) {
  const diaryStore = useDiaryStore()
  const userStore = useUserStore()
  
  const currentDiary = ref<Diary | null>(null)
  const isRendering = ref(false)
  const renderError = ref<string | null>(null)
  
  const decayLevel = computed(() => {
    if (!currentDiary.value) return 0
    return diaryStore.getDecayLevel(currentDiary.value)
  })
  
  const stateName = computed(() => {
    if (!currentDiary.value) return ''
    return STATE_NAMES[currentDiary.value.state]
  })
  
  const stateColor = computed(() => {
    if (!currentDiary.value) return '#fff'
    return STATE_COLORS[currentDiary.value.state]
  })
  
  const diaryType = computed(() => {
    if (!currentDiary.value) return null
    return pluginLoader.getDiaryType(currentDiary.value.type)
  })
  
  const isOwner = computed(() => {
    if (!currentDiary.value || !userStore.currentUserId) return false
    return currentDiary.value.ownerId === userStore.currentUserId
  })
  
  const isDead = computed(() => {
    return currentDiary.value?.state === 'dead'
  })
  
  const isFrozen = computed(() => {
    return currentDiary.value?.frozen || false
  })
  
  const isScheduled = computed(() => {
    return currentDiary.value?.state === DiaryState.SCHEDULED
  })
  
  const scheduleStatus = computed(() => {
    if (!currentDiary.value) return null
    return diaryStore.getDiaryScheduleStatus(currentDiary.value)
  })

  const isCollaborative = computed(() => {
    return currentDiary.value?.collaboration.isCollaborative || false
  })

  const collaborators = computed(() => {
    return currentDiary.value?.collaboration.collaborators || []
  })

  const canEdit = computed(() => {
    if (!currentDiary.value || !userStore.currentUserId) return false
    return diaryStore.canEditDiary(currentDiary.value.id, userStore.currentUserId)
  })

  const isCollab = computed(() => {
    if (!currentDiary.value || !userStore.currentUserId) return false
    return diaryStore.isCollaborator(currentDiary.value.id, userStore.currentUserId)
  })

  const editHistory = computed(() => {
    return currentDiary.value?.collaboration.editHistory || []
  })

  const lastEditAt = computed(() => {
    return currentDiary.value?.collaboration.lastEditAt
  })

  const lastEditorId = computed(() => {
    return currentDiary.value?.collaboration.lastEditorId
  })

  const pendingInvitationsForDiary = computed(() => {
    if (!currentDiary.value) return []
    return diaryStore.getCollaborationInvitationsByDiary(currentDiary.value.id)
  })

  function loadDiary(id: string) {
    const diary = diaryStore.getDiaryById(id)
    if (diary) {
      currentDiary.value = diary
    } else {
      renderError.value = '日记不存在'
    }
  }

  function renderToCanvas(canvas: HTMLCanvasElement, targetTime?: number) {
    if (!currentDiary.value) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    isRendering.value = true
    renderError.value = null
    
    try {
      const decayRate = diaryType.value?.decayRate || 1
      
      if (currentDiary.value.state === 'dead' && currentDiary.value.tombstone) {
        const tombstone = pluginLoader.getTombstone(currentDiary.value.tombstone)
        if (tombstone) {
          ctx.fillStyle = '#000'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          tombstone.render(ctx, currentDiary.value)
        }
      } else {
        renderPipeline.render(currentDiary.value, ctx, targetTime, decayRate)
      }
    } catch (e) {
      renderError.value = e instanceof Error ? e.message : '渲染失败'
    } finally {
      isRendering.value = false
    }
  }

  function toggleFreeze() {
    if (!currentDiary.value || !isOwner.value) return
    diaryStore.toggleFreeze(currentDiary.value.id)
    loadDiary(currentDiary.value.id)
  }

  function rewindState() {
    if (!currentDiary.value || !isOwner.value) return
    diaryStore.rewindState(currentDiary.value.id)
    loadDiary(currentDiary.value.id)
  }

  function updatePipeline(pipeline: PipelineStep[]) {
    if (!currentDiary.value || !isOwner.value) return
    diaryStore.updateDiary(currentDiary.value.id, { pipeline })
    loadDiary(currentDiary.value.id)
  }

  function reorderPipeline(newOrder: string[]) {
    if (!currentDiary.value || !isOwner.value) return
    const newPipeline = renderPipeline.reorderPipeline(currentDiary.value, newOrder)
    updatePipeline(newPipeline)
  }

  function updateMethodParams(methodId: string, params: Record<string, number>) {
    if (!currentDiary.value || !isOwner.value) return
    const newPipeline = renderPipeline.updateParams(currentDiary.value, methodId, params)
    updatePipeline(newPipeline)
  }

  function toggleMethod(methodId: string) {
    if (!currentDiary.value || !isOwner.value) return
    const newPipeline = renderPipeline.toggleMethod(currentDiary.value, methodId)
    updatePipeline(newPipeline)
  }

  function addMethodToPipeline(methodId: string) {
    if (!currentDiary.value || !isOwner.value) return
    const newPipeline = renderPipeline.addMethodToPipeline(currentDiary.value, methodId)
    updatePipeline(newPipeline)
  }

  function removeMethodFromPipeline(methodId: string) {
    if (!currentDiary.value || !isOwner.value) return
    const newPipeline = renderPipeline.removeMethodFromPipeline(currentDiary.value, methodId)
    updatePipeline(newPipeline)
  }

  function useItem(itemId: string) {
    if (!currentDiary.value || !isOwner.value) return false
    
    const inventoryStore = useInventoryStore()
    const success = inventoryStore.useItem(itemId, currentDiary.value.id)
    if (success) {
      loadDiary(currentDiary.value.id)
    }
    return success
  }

  function checkTransition() {
    if (!currentDiary.value) return
    diaryStore.checkAndTransition(currentDiary.value.id)
    loadDiary(currentDiary.value.id)
  }

  function updateSchedule(schedule: Partial<DiarySchedule>) {
    if (!currentDiary.value || !isOwner.value) return
    diaryStore.updateDiarySchedule(currentDiary.value.id, schedule)
    loadDiary(currentDiary.value.id)
  }

  function inviteCollaborator(inviteeId: string, message: string = '', expiresIn: number = 1000) {
    if (!currentDiary.value || !isOwner.value) return null
    return diaryStore.inviteCollaborator(currentDiary.value.id, inviteeId, message, expiresIn)
  }

  function updateContent(newText: string, editType: EditType = ET.UPDATE) {
    if (!currentDiary.value || !canEdit.value) return false
    const success = diaryStore.updateCollaborativeContent(currentDiary.value.id, newText, editType)
    if (success) {
      loadDiary(currentDiary.value.id)
    }
    return success
  }

  function removeCollaborator(collaboratorId: string) {
    if (!currentDiary.value || !isOwner.value) return false
    return diaryStore.removeCollaborator(currentDiary.value.id, collaboratorId)
  }

  function cancelInvitation(invitationId: string) {
    if (!currentDiary.value || !isOwner.value) return false
    return diaryStore.cancelInvitation(invitationId)
  }

  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    if (diaryId) {
      loadDiary(diaryId)
    }
    
    unsubscribe = globalTimeline.subscribe(() => {
      if (currentDiary.value && !currentDiary.value.frozen) {
        checkTransition()
      }
    })
  })

  onUnmounted(() => {
    if (unsubscribe) {
      unsubscribe()
    }
  })

  watch(() => diaryId, (newId) => {
    if (newId) {
      loadDiary(newId)
    }
  })

  return {
    currentDiary,
    isRendering,
    renderError,
    decayLevel,
    stateName,
    stateColor,
    diaryType,
    isOwner,
    isDead,
    isFrozen,
    isScheduled,
    scheduleStatus,
    isCollaborative,
    collaborators,
    canEdit,
    isCollab,
    editHistory,
    lastEditAt,
    lastEditorId,
    pendingInvitationsForDiary,
    loadDiary,
    renderToCanvas,
    toggleFreeze,
    rewindState,
    updatePipeline,
    reorderPipeline,
    updateMethodParams,
    toggleMethod,
    addMethodToPipeline,
    removeMethodFromPipeline,
    useItem,
    checkTransition,
    updateSchedule,
    inviteCollaborator,
    updateContent,
    removeCollaborator,
    cancelInvitation
  }
}
