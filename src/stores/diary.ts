import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  Diary, DiaryState, PipelineStep, ArchivedDiary, ArchiveReason, 
  RepairRecord, User, GalleryHall, GallerySection, GalleryCategory,
  Exhibit, DiarySchedule, CollaborationInvitation, CollaborationStatus,
  Collaborator, CollaborationEditRecord, DiaryCollaboration, EditType
} from '@/types'
import { 
  DiaryState as DS, ArchiveReason as AR, 
  GalleryCategory as GC, TIME_PERIOD_NAMES, TimePeriod,
  CollaborationStatus as CS, EditType as ET
} from '@/types'
import { storage } from '@/utils/storage'
import { generateId } from '@/utils/id'
import { pluginLoader } from '@/engine/PluginLoader'
import { globalTimeline } from '@/engine/Timeline'
import { StateMachine } from '@/engine/StateMachine'
import { useUserStore } from './user'

let _userStore: any = null

const getUserStore = () => {
  if (!_userStore) {
    _userStore = useUserStore()
  }
  return _userStore
}

export const useDiaryStore = defineStore('diary', () => {
  const diaries = ref<Diary[]>([])
  const archivedDiaries = ref<ArchivedDiary[]>([])
  const stateMachines = ref<Map<string, StateMachine>>(new Map())
  const collaborationInvitations = ref<CollaborationInvitation[]>([])

  const currentUserDiaries = computed(() => {
    const userStore = getUserStore()
    const userId = userStore.currentUserId || userStore.visitingUserId
    return diaries.value.filter(d => d.ownerId === userId)
  })

  const currentUserArchivedDiaries = computed(() => {
    const userStore = getUserStore()
    const userId = userStore.currentUserId || userStore.visitingUserId
    return archivedDiaries.value.filter(ad => ad.diary.ownerId === userId)
  })

  const collaborativeDiaries = computed(() => {
    const userStore = getUserStore()
    const userId = userStore.currentUserId
    if (!userId) return []
    return diaries.value.filter(d => 
      d.collaboration.isCollaborative && 
      d.collaboration.collaborators.some(c => c.userId === userId)
    )
  })

  const pendingInvitations = computed(() => {
    const userStore = getUserStore()
    const userId = userStore.currentUserId
    if (!userId) return []
    const now = globalTimeline.getTime()
    return collaborationInvitations.value.filter(inv => 
      inv.inviteeId === userId && 
      inv.status === CS.PENDING &&
      inv.expiresAt > now
    )
  })

  const sentInvitations = computed(() => {
    const userStore = getUserStore()
    const userId = userStore.currentUserId
    if (!userId) return []
    return collaborationInvitations.value.filter(inv => inv.inviterId === userId)
  })

  const allInvitations = computed(() => {
    const userStore = getUserStore()
    const userId = userStore.currentUserId
    if (!userId) return []
    return collaborationInvitations.value.filter(inv => 
      inv.inviterId === userId || inv.inviteeId === userId
    )
  })

  function createDefaultCollaboration(): DiaryCollaboration {
    return {
      isCollaborative: false,
      collaborators: [],
      invitations: [],
      editHistory: [],
      lastEditAt: null,
      lastEditorId: null
    }
  }

  function init() {
    diaries.value = storage.getDiaries()
    archivedDiaries.value = storage.getArchivedDiaries()
    collaborationInvitations.value = storage.getCollaborationInvitations()
    
    diaries.value = diaries.value.map(d => ({
      ...d,
      collaboration: d.collaboration || createDefaultCollaboration()
    }))
    
    const userStore = getUserStore()
    if (userStore.currentUserId && diaries.value.length === 0 && archivedDiaries.value.length === 0) {
      setTimeout(() => createSampleDiaries(), 100)
    }
    
    checkAndExpireInvitations()
  }

  function checkAndExpireInvitations() {
    const now = globalTimeline.getTime()
    let changed = false
    
    collaborationInvitations.value = collaborationInvitations.value.map(inv => {
      if (inv.status === CS.PENDING && inv.expiresAt <= now) {
        changed = true
        return { ...inv, status: CS.EXPIRED }
      }
      return inv
    })
    
    if (changed) {
      storage.saveCollaborationInvitations(collaborationInvitations.value)
    }
  }

  function archiveDiary(diaryId: string, reason: ArchiveReason): void {
    const diary = getDiaryById(diaryId)
    if (!diary) return

    const existingArchive = archivedDiaries.value.find(ad => ad.diary.id === diaryId)
    if (existingArchive) return

    const now = globalTimeline.getTime()
    const archivedDiary: ArchivedDiary = {
      id: generateId(),
      diary: { ...diary },
      archiveReason: reason,
      archivedAt: now,
      lastRepairAt: null,
      repairCount: 0,
      repairRecords: []
    }

    diaries.value = diaries.value.filter(d => d.id !== diaryId)
    archivedDiaries.value.push(archivedDiary)

    storage.saveDiaries(diaries.value)
    storage.saveArchivedDiaries(archivedDiaries.value)
  }

  function restoreDiary(archivedId: string): Diary | null {
    const archivedIndex = archivedDiaries.value.findIndex(ad => ad.id === archivedId)
    if (archivedIndex === -1) return null

    const archived = archivedDiaries.value[archivedIndex]
    const restoredDiary = { ...archived.diary }

    if (restoredDiary.state === DS.DEAD) {
      restoredDiary.state = DS.DYING
      restoredDiary.frozen = false
    }

    diaries.value.push(restoredDiary)
    archivedDiaries.value.splice(archivedIndex, 1)

    storage.saveDiaries(diaries.value)
    storage.saveArchivedDiaries(archivedDiaries.value)

    return restoredDiary
  }

  function addRepairRecord(archivedId: string, record: Omit<RepairRecord, 'timestamp'>): void {
    const archived = archivedDiaries.value.find(ad => ad.id === archivedId)
    if (!archived) return

    const now = globalTimeline.getTime()
    const fullRecord: RepairRecord = {
      ...record,
      timestamp: now
    }

    archived.repairRecords.push(fullRecord)
    archived.repairCount++
    archived.lastRepairAt = now

    storage.saveArchivedDiaries(archivedDiaries.value)
  }

  function getArchivedById(archivedId: string): ArchivedDiary | undefined {
    return archivedDiaries.value.find(ad => ad.id === archivedId)
  }

  function getArchivedDiariesByUser(userId: string): ArchivedDiary[] {
    return archivedDiaries.value.filter(ad => ad.diary.ownerId === userId)
  }

  function searchArchivedDiaries(
    filters: {
      ownerId?: string
      diaryType?: string
      archiveReason?: ArchiveReason
      archivedBefore?: number
      archivedAfter?: number
      repairedBefore?: number
      repairedAfter?: number
      keyword?: string
    } = {}
  ): ArchivedDiary[] {
    let results = [...archivedDiaries.value]

    if (filters.ownerId) {
      results = results.filter(ad => ad.diary.ownerId === filters.ownerId)
    }

    if (filters.diaryType) {
      results = results.filter(ad => ad.diary.type === filters.diaryType)
    }

    if (filters.archiveReason) {
      results = results.filter(ad => ad.archiveReason === filters.archiveReason)
    }

    if (filters.archivedBefore !== undefined) {
      results = results.filter(ad => ad.archivedAt <= filters.archivedBefore!)
    }

    if (filters.archivedAfter !== undefined) {
      results = results.filter(ad => ad.archivedAt >= filters.archivedAfter!)
    }

    if (filters.repairedBefore !== undefined) {
      results = results.filter(ad => ad.lastRepairAt !== null && ad.lastRepairAt <= filters.repairedBefore!)
    }

    if (filters.repairedAfter !== undefined) {
      results = results.filter(ad => ad.lastRepairAt !== null && ad.lastRepairAt >= filters.repairedAfter!)
    }

    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase()
      results = results.filter(ad =>
        ad.diary.title.toLowerCase().includes(keyword) ||
        ad.diary.content.text.toLowerCase().includes(keyword)
      )
    }

    return results.sort((a, b) => b.archivedAt - a.archivedAt)
  }

  async function createSampleDiaries() {
    const userStore = getUserStore()
    await pluginLoader.loadAll()
    
    if (userStore.users.length === 0) return
    
    const methods = pluginLoader.getDecayMethods()
    
    const sampleContentsByUser: Record<string, Array<{
      title: string
      type: string
      text: string
      pipeline: string[]
      createdAtOffset: number
    }>> = {
      '故障收藏家': [
        {
          title: '第一封情书',
          type: 'loveLetter',
          text: '亲爱的你，今天是我们相识的第100天。阳光洒在窗台上，像你微笑时的弧度。我想把这一刻永远保存下来，虽然我知道，时间会带走一切。但至少，在这数字的世界里，我们的故事曾经鲜活过。',
          pipeline: ['blur', 'wave'],
          createdAtOffset: 50
        },
        {
          title: '噩梦记录',
          type: 'nightmare',
          text: '昨晚又做了那个梦。无尽的走廊，闪烁的灯光，墙上的文字在我靠近时变成乱码。我跑啊跑，却始终找不到出口。醒来时，枕头已经湿透。我为什么要记录这些？也许记录本身就是一种解脱。',
          pipeline: ['garble', 'chroma', 'pixelate'],
          createdAtOffset: 150
        },
        {
          title: '普通的一天',
          type: 'base',
          text: '今天天气很好。早上喝了一杯咖啡，看了几页书。下午去公园散步，看到一只猫在晒太阳。没有什么特别的事情发生，但这样平静的日子，也许就是幸福吧。',
          pipeline: ['blur', 'chroma'],
          createdAtOffset: 30
        }
      ],
      '时间旅人': [
        {
          title: '时间旅行日志 #001',
          type: 'base',
          text: '我是时间旅人，在时间轴上漫步。今天我访问了2025年的春天，那里的樱花开得很美。我试图记录下这一刻，但我知道，这些文字最终也会在时间的长河中腐烂。',
          pipeline: ['wave', 'garble'],
          createdAtOffset: 200
        },
        {
          title: '写给未来的信',
          type: 'loveLetter',
          text: '致未来的我：当你读到这封信时，它可能已经面目全非。但请记住，写这封信时的心情是真挚的。时间会改变一切，但有些东西值得被铭记。',
          pipeline: ['blur', 'chroma'],
          createdAtOffset: 100
        },
        {
          title: '量子梦境',
          type: 'nightmare',
          text: '在量子的世界里，一切可能性同时存在。我梦见自己同时出现在过去和未来，所有的记忆交织在一起，变成了无法辨认的乱码。这就是数字存在的本质吗？',
          pipeline: ['pixelate', 'garble', 'wave'],
          createdAtOffset: 800
        }
      ]
    }
    
    userStore.users.forEach((user: User) => {
      const userSamples = sampleContentsByUser[user.name] || sampleContentsByUser['故障收藏家']
      
      userSamples.forEach(content => {
        const diaryType = pluginLoader.getDiaryType(content.type)
        if (!diaryType) return
        
        const pipeline: PipelineStep[] = content.pipeline.map((methodId, index) => {
          const method = methods.get(methodId)
          if (!method) return null
          
          const params: Record<string, number> = {}
          Object.entries(method.params).forEach(([key, def]) => {
            params[key] = def.default
          })
          
          return {
            methodId,
            enabled: true,
            params,
            order: index
          }
        }).filter(Boolean) as PipelineStep[]
        
        const sm = new StateMachine()
        sm.addTransitions(diaryType.transitions)
        stateMachines.value.set(content.type, sm)
        
        const now = globalTimeline.getTime()
        const diary: Diary = {
          id: generateId(),
          ownerId: user.id,
          type: content.type,
          title: content.title,
          content: { text: content.text },
          state: DS.FRESH,
          frozen: false,
          createdAt: now - content.createdAtOffset,
          stateTimestamps: {
            [DS.SCHEDULED]: 0,
            [DS.FRESH]: now,
            [DS.ROTTING]: 0,
            [DS.ROTTED]: 0,
            [DS.DYING]: 0,
            [DS.DEAD]: 0
          },
          pipeline,
          isPublic: true,
          schedule: {
            publishAt: null,
            decayStartAt: null,
            autoArchiveAt: null
          },
          decayStartTime: null,
          collaboration: createDefaultCollaboration()
        }
        
        diaries.value.push(diary)
      })
    })
    
    storage.saveDiaries(diaries.value)
  }

  function createDiary(
    ownerId: string,
    type: string,
    title: string,
    text: string,
    pipeline: PipelineStep[] = [],
    schedule: Partial<DiarySchedule> = {}
  ): Diary {
    const now = globalTimeline.getTime()
    
    const fullSchedule: DiarySchedule = {
      publishAt: schedule.publishAt ?? null,
      decayStartAt: schedule.decayStartAt ?? null,
      autoArchiveAt: schedule.autoArchiveAt ?? null
    }
    
    const initialState = fullSchedule.publishAt && fullSchedule.publishAt > now
      ? DS.SCHEDULED
      : DS.FRESH
    
    const diary: Diary = {
      id: generateId(),
      ownerId,
      type,
      title,
      content: { text },
      state: initialState,
      frozen: false,
      createdAt: now,
      stateTimestamps: {
        [DS.SCHEDULED]: initialState === DS.SCHEDULED ? now : 0,
        [DS.FRESH]: initialState === DS.FRESH ? now : 0,
        [DS.ROTTING]: 0,
        [DS.ROTTED]: 0,
        [DS.DYING]: 0,
        [DS.DEAD]: 0
      },
      pipeline,
      isPublic: true,
      schedule: fullSchedule,
      decayStartTime: fullSchedule.decayStartAt,
      collaboration: createDefaultCollaboration()
    }
    
    diaries.value.push(diary)
    storage.saveDiaries(diaries.value)
    
    return diary
  }

  function updateDiary(diaryId: string, updates: Partial<Diary>): void {
    const index = diaries.value.findIndex(d => d.id === diaryId)
    if (index !== -1) {
      diaries.value[index] = { ...diaries.value[index], ...updates }
      storage.saveDiaries(diaries.value)
    }
  }

  function deleteDiary(diaryId: string): void {
    archiveDiary(diaryId, AR.DELETED)
  }

  function getDiaryById(diaryId: string): Diary | undefined {
    return diaries.value.find(d => d.id === diaryId)
  }

  function toggleFreeze(diaryId: string): void {
    const diary = getDiaryById(diaryId)
    if (diary) {
      updateDiary(diaryId, { frozen: !diary.frozen })
    }
  }

  function checkAndTransition(diaryId: string): void {
    const diary = getDiaryById(diaryId)
    if (!diary || diary.frozen || diary.state === DS.DEAD) return
    
    const now = globalTimeline.getTime()
    
    if (diary.state === DS.SCHEDULED) {
      if (diary.schedule.publishAt && diary.schedule.publishAt <= now) {
        const updatedDiary = {
          ...diary,
          state: DS.FRESH,
          stateTimestamps: {
            ...diary.stateTimestamps,
            [DS.FRESH]: now
          }
        }
        updateDiary(diaryId, updatedDiary)
        return
      }
      return
    }
    
    if (diary.schedule.autoArchiveAt && diary.schedule.autoArchiveAt <= now) {
      archiveDiary(diaryId, AR.SCHEDULED_ARCHIVE)
      return
    }
    
    const diaryType = pluginLoader.getDiaryType(diary.type)
    if (!diaryType) return
    
    let sm = stateMachines.value.get(diary.type)
    if (!sm) {
      sm = new StateMachine()
      sm.addTransitions(diaryType.transitions)
      stateMachines.value.set(diary.type, sm)
    }
    
    const effectiveDecayStart = diary.decayStartTime ?? diary.createdAt
    const elapsed = globalTimeline.getElapsedSince(effectiveDecayStart)
    const adjustedElapsed = elapsed * diaryType.decayRate
    
    if (sm.canTransition(diary, adjustedElapsed)) {
      const currentTime = globalTimeline.getTime()
      const newDiary = sm.transition(diary, adjustedElapsed, currentTime)
      
      if (newDiary.state === DS.DEAD) {
        if (diaryType.deathEffect) {
          diaryType.deathEffect(newDiary)
        }
        updateDiary(diaryId, newDiary)
        setTimeout(() => archiveDiary(diaryId, AR.DEAD), 100)
      } else {
        updateDiary(diaryId, newDiary)
      }
    }
  }

  function rewindState(diaryId: string): void {
    const diary = getDiaryById(diaryId)
    if (!diary) return
    
    const diaryType = pluginLoader.getDiaryType(diary.type)
    if (!diaryType) return
    
    let sm = stateMachines.value.get(diary.type)
    if (!sm) {
      sm = new StateMachine()
      sm.addTransitions(diaryType.transitions)
      stateMachines.value.set(diary.type, sm)
    }
    
    const currentTime = globalTimeline.getTime()
    const newDiary = sm.rewindState(diary, currentTime)
    updateDiary(diaryId, newDiary)
  }

  function getDecayLevel(diary: Diary): number {
    const diaryType = pluginLoader.getDiaryType(diary.type)
    if (!diaryType) return 0
    
    if (diary.state === DS.SCHEDULED) return 0
    
    let sm = stateMachines.value.get(diary.type)
    if (!sm) {
      sm = new StateMachine()
      sm.addTransitions(diaryType.transitions)
      stateMachines.value.set(diary.type, sm)
    }
    
    const effectiveDecayStart = diary.decayStartTime ?? diary.createdAt
    const elapsed = globalTimeline.getElapsedSince(effectiveDecayStart)
    return sm.getDecayLevel(diary, elapsed, diaryType.decayRate)
  }

  function getDiariesByUser(userId: string): Diary[] {
    return diaries.value.filter(d => d.ownerId === userId)
  }

  const publicDiaries = computed(() => {
    const now = globalTimeline.getTime()
    return diaries.value.filter(d => {
      if (!d.isPublic || d.state === DS.DEAD) return false
      if (d.state === DS.SCHEDULED) return false
      if (d.schedule.publishAt && d.schedule.publishAt > now) return false
      return true
    })
  })

  function getExhibits(diaries: Diary[]): Exhibit[] {
    const userStore = getUserStore()
    return diaries.map(diary => {
      const author = userStore.getUserById(diary.ownerId)
      return {
        diary,
        authorName: author?.name || '匿名作者',
        authorId: diary.ownerId
      }
    })
  }

  function getTimePeriodFilter(period: TimePeriod): (diary: Diary) => boolean {
    const now = globalTimeline.getTime()
    const thresholds: Record<TimePeriod, number> = {
      [TimePeriod.TODAY]: 100,
      [TimePeriod.WEEK]: 700,
      [TimePeriod.MONTH]: 3000,
      [TimePeriod.SEASON]: 9000,
      [TimePeriod.YEAR]: 36500,
      [TimePeriod.ALL]: Infinity
    }
    const threshold = thresholds[period]
    return (diary: Diary) => {
      const elapsed = now - diary.createdAt
      return elapsed >= 0 && elapsed < threshold
    }
  }

  function buildThemeHall(): GalleryHall {
    const sections: GallerySection[] = [
      {
        id: 'love-letters',
        name: '情书廊',
        description: '那些在数字世界中慢慢腐烂的爱意，每一个像素都承载着无法言说的深情。',
        icon: '💌',
        category: GC.THEME,
        filter: (d: Diary) => d.type === 'loveLetter'
      },
      {
        id: 'nightmares',
        name: '梦魇厅',
        description: '记录那些令人不安的梦境，在像素破碎处窥视潜意识的深渊。',
        icon: '🌑',
        category: GC.THEME,
        filter: (d: Diary) => d.type === 'nightmare'
      },
      {
        id: 'everyday',
        name: '日常馆',
        description: '平凡日子里的点滴记录，时间让这些普通的瞬间也变得珍贵而模糊。',
        icon: '📅',
        category: GC.THEME,
        filter: (d: Diary) => d.type === 'base'
      }
    ]

    return {
      id: 'theme-hall',
      name: '主题展厅',
      description: '按日记的情感主题划分，每一个角落都弥漫着不同的情绪色彩。',
      icon: '🎨',
      sections
    }
  }

  function buildStyleHall(): GalleryHall {
    const sections: GallerySection[] = [
      {
        id: 'blur-gallery',
        name: '朦胧之境',
        description: '使用「糊掉」效果的日记，在模糊中寻找记忆的轮廓，如同隔着毛玻璃看过去。',
        icon: '🌫️',
        category: GC.STYLE,
        filter: (d: Diary) => d.pipeline.some(p => p.methodId === 'blur' && p.enabled)
      },
      {
        id: 'wave-gallery',
        name: '涟漪水域',
        description: '使用「波浪扭」效果的日记，文字在时间的水面上荡漾，形成美丽的波纹。',
        icon: '🌊',
        category: GC.STYLE,
        filter: (d: Diary) => d.pipeline.some(p => p.methodId === 'wave' && p.enabled)
      },
      {
        id: 'garble-gallery',
        name: '乱码谜宫',
        description: '使用「乱码」效果的日记，信息在腐化中变得不可读，却产生了独特的数字诗意。',
        icon: '🔀',
        category: GC.STYLE,
        filter: (d: Diary) => d.pipeline.some(p => p.methodId === 'garble' && p.enabled)
      },
      {
        id: 'chroma-gallery',
        name: '色散空间',
        description: '使用「色散」效果的日记，色彩在边缘处分裂，如同数字世界的棱镜折射。',
        icon: '🌈',
        category: GC.STYLE,
        filter: (d: Diary) => d.pipeline.some(p => p.methodId === 'chroma' && p.enabled)
      },
      {
        id: 'pixelate-gallery',
        name: '像素遗迹',
        description: '使用「像素化」效果的日记，在低分辨率中找回早期互联网的怀旧美学。',
        icon: '🧱',
        category: GC.STYLE,
        filter: (d: Diary) => d.pipeline.some(p => p.methodId === 'pixelate' && p.enabled)
      },
      {
        id: 'mixed-gallery',
        name: '复合实验场',
        description: '融合多种失真效果的日记，展示数字腐朽的无限可能性。',
        icon: '🔬',
        category: GC.STYLE,
        filter: (d: Diary) => d.pipeline.filter(p => p.enabled).length >= 3
      }
    ]

    return {
      id: 'style-hall',
      name: '风格展厅',
      description: '按失真风格划分的展区，每一种腐化方式都是一门独特的数字艺术。',
      icon: '✨',
      sections
    }
  }

  function buildTimeHall(): GalleryHall {
    const periods: TimePeriod[] = [
      TimePeriod.TODAY,
      TimePeriod.WEEK,
      TimePeriod.MONTH,
      TimePeriod.SEASON,
      TimePeriod.YEAR,
      TimePeriod.ALL
    ]

    const periodDescriptions: Record<TimePeriod, string> = {
      [TimePeriod.TODAY]: '新鲜出炉的日记，还带着数字温度。此刻的真实，尚未被时间侵蚀。',
      [TimePeriod.WEEK]: '这一周的精选，开始显现出微妙的腐朽痕迹。',
      [TimePeriod.MONTH]: '一个月的沉淀，日记已染上时间的质感。',
      [TimePeriod.SEASON]: '季节更替中的记录，见证了时光的流转。',
      [TimePeriod.YEAR]: '经过一年时间洗礼的珍藏，大部分已面目全非，却更显珍贵。',
      [TimePeriod.ALL]: '所有时光的集合，从新鲜到腐朽的完整生命周期。'
    }

    const periodIcons: Record<TimePeriod, string> = {
      [TimePeriod.TODAY]: '🌅',
      [TimePeriod.WEEK]: '🌤️',
      [TimePeriod.MONTH]: '🌙',
      [TimePeriod.SEASON]: '🍂',
      [TimePeriod.YEAR]: '⌛',
      [TimePeriod.ALL]: '🌀'
    }

    const sections: GallerySection[] = periods.map(period => ({
      id: `time-${period}`,
      name: TIME_PERIOD_NAMES[period],
      description: periodDescriptions[period],
      icon: periodIcons[period],
      category: GC.TIME,
      filter: getTimePeriodFilter(period)
    }))

    return {
      id: 'time-hall',
      name: '时间展厅',
      description: '沿时间轴展开的展区，见证数字存在从鲜活到腐朽的完整旅程。',
      icon: '⏰',
      sections
    }
  }

  function getGalleryHalls(): GalleryHall[] {
    return [
      buildThemeHall(),
      buildStyleHall(),
      buildTimeHall()
    ]
  }

  function getExhibitsBySection(section: GallerySection): Exhibit[] {
    const filtered = publicDiaries.value.filter(section.filter)
    return getExhibits(filtered).sort((a, b) => b.diary.createdAt - a.diary.createdAt)
  }

  function updateDiarySchedule(diaryId: string, schedule: Partial<DiarySchedule>): void {
    const diary = getDiaryById(diaryId)
    if (!diary) return

    const now = globalTimeline.getTime()
    const newSchedule = {
      ...diary.schedule,
      ...schedule
    }

    let newState = diary.state
    const newStateTimestamps = { ...diary.stateTimestamps }

    if (newSchedule.publishAt && newSchedule.publishAt > now) {
      if (diary.state !== DS.SCHEDULED) {
        newState = DS.SCHEDULED
        newStateTimestamps[DS.SCHEDULED] = now
      }
    } else if (diary.state === DS.SCHEDULED) {
      newState = DS.FRESH
      newStateTimestamps[DS.FRESH] = now
    }

    updateDiary(diaryId, {
      schedule: newSchedule,
      decayStartTime: newSchedule.decayStartAt ?? null,
      state: newState,
      stateTimestamps: newStateTimestamps
    })
  }

  function isDiaryVisibleToUser(diary: Diary, userId: string | null): boolean {
    const now = globalTimeline.getTime()
    
    if (diary.ownerId === userId) return true
    if (diary.state === DS.SCHEDULED) return false
    if (!diary.isPublic) return false
    if (diary.schedule.publishAt && diary.schedule.publishAt > now) return false
    
    return true
  }

  function getDiaryScheduleStatus(diary: Diary): {
    isScheduled: boolean
    isPublished: boolean
    isDecaying: boolean
    willArchive: boolean
    timeToPublish: number
    timeToDecay: number
    timeToArchive: number
  } {
    const now = globalTimeline.getTime()
    
    return {
      isScheduled: diary.state === DS.SCHEDULED,
      isPublished: diary.schedule.publishAt ? diary.schedule.publishAt <= now : true,
      isDecaying: diary.decayStartTime ? diary.decayStartTime <= now : true,
      willArchive: diary.schedule.autoArchiveAt !== null,
      timeToPublish: diary.schedule.publishAt ? Math.max(0, diary.schedule.publishAt - now) : 0,
      timeToDecay: diary.decayStartTime ? Math.max(0, diary.decayStartTime - now) : 0,
      timeToArchive: diary.schedule.autoArchiveAt ? Math.max(0, diary.schedule.autoArchiveAt - now) : 0
    }
  }

  function inviteCollaborator(
    diaryId: string,
    inviteeId: string,
    message: string = '',
    expiresIn: number = 1000
  ): CollaborationInvitation | null {
    const diary = getDiaryById(diaryId)
    const userStore = getUserStore()
    const inviterId = userStore.currentUserId
    
    if (!diary || !inviterId) return null
    if (diary.ownerId !== inviterId) return null
    
    const inviter = userStore.getUserById(inviterId)
    const invitee = userStore.getUserById(inviteeId)
    if (!inviter || !invitee) return null
    
    if (diary.collaboration.collaborators.some(c => c.userId === inviteeId)) {
      return null
    }
    
    const existingPending = collaborationInvitations.value.find(inv => 
      inv.diaryId === diaryId && 
      inv.inviteeId === inviteeId && 
      inv.status === CS.PENDING
    )
    if (existingPending) return null
    
    const now = globalTimeline.getTime()
    const invitation: CollaborationInvitation = {
      id: generateId(),
      diaryId,
      diaryTitle: diary.title,
      inviterId,
      inviterName: inviter.name,
      inviteeId,
      inviteeName: invitee.name,
      status: CS.PENDING,
      message,
      createdAt: now,
      expiresAt: now + expiresIn,
      respondedAt: null
    }
    
    collaborationInvitations.value.push(invitation)
    storage.saveCollaborationInvitations(collaborationInvitations.value)
    
    return invitation
  }

  function acceptInvitation(invitationId: string): boolean {
    const userStore = getUserStore()
    const userId = userStore.currentUserId
    if (!userId) return false
    
    const invitationIndex = collaborationInvitations.value.findIndex(
      inv => inv.id === invitationId && inv.inviteeId === userId && inv.status === CS.PENDING
    )
    if (invitationIndex === -1) return false
    
    const invitation = collaborationInvitations.value[invitationIndex]
    const diary = getDiaryById(invitation.diaryId)
    if (!diary) return false
    
    const now = globalTimeline.getTime()
    collaborationInvitations.value[invitationIndex] = {
      ...invitation,
      status: CS.ACCEPTED,
      respondedAt: now
    }
    
    const newCollaborator: Collaborator = {
      userId,
      userName: userStore.getUserById(userId)?.name || '未知用户',
      joinedAt: now,
      canEdit: true,
      editCount: 0
    }
    
    const updatedDiary: Diary = {
      ...diary,
      collaboration: {
        ...diary.collaboration,
        isCollaborative: true,
        collaborators: [...diary.collaboration.collaborators, newCollaborator]
      }
    }
    
    updateDiary(diary.id, updatedDiary)
    storage.saveCollaborationInvitations(collaborationInvitations.value)
    
    return true
  }

  function declineInvitation(invitationId: string): boolean {
    const userStore = getUserStore()
    const userId = userStore.currentUserId
    if (!userId) return false
    
    const invitationIndex = collaborationInvitations.value.findIndex(
      inv => inv.id === invitationId && inv.inviteeId === userId && inv.status === CS.PENDING
    )
    if (invitationIndex === -1) return false
    
    const now = globalTimeline.getTime()
    collaborationInvitations.value[invitationIndex] = {
      ...collaborationInvitations.value[invitationIndex],
      status: CS.DECLINED,
      respondedAt: now
    }
    
    storage.saveCollaborationInvitations(collaborationInvitations.value)
    return true
  }

  function cancelInvitation(invitationId: string): boolean {
    const userStore = getUserStore()
    const userId = userStore.currentUserId
    if (!userId) return false
    
    const invitationIndex = collaborationInvitations.value.findIndex(
      inv => inv.id === invitationId && inv.inviterId === userId && inv.status === CS.PENDING
    )
    if (invitationIndex === -1) return false
    
    collaborationInvitations.value.splice(invitationIndex, 1)
    storage.saveCollaborationInvitations(collaborationInvitations.value)
    return true
  }

  function removeCollaborator(diaryId: string, collaboratorId: string): boolean {
    const diary = getDiaryById(diaryId)
    const userStore = getUserStore()
    const userId = userStore.currentUserId
    
    if (!diary || !userId) return false
    if (diary.ownerId !== userId) return false
    
    const collaboratorIndex = diary.collaboration.collaborators.findIndex(
      c => c.userId === collaboratorId
    )
    if (collaboratorIndex === -1) return false
    
    const newCollaborators = diary.collaboration.collaborators.filter(
      c => c.userId !== collaboratorId
    )
    
    const updatedDiary: Diary = {
      ...diary,
      collaboration: {
        ...diary.collaboration,
        collaborators: newCollaborators,
        isCollaborative: newCollaborators.length > 0
      }
    }
    
    updateDiary(diary.id, updatedDiary)
    return true
  }

  function updateCollaborativeContent(
    diaryId: string,
    newText: string,
    editType: EditType = ET.UPDATE
  ): boolean {
    const diary = getDiaryById(diaryId)
    const userStore = getUserStore()
    const userId = userStore.currentUserId
    
    if (!diary || !userId) return false
    
    const canEdit = diary.ownerId === userId || 
      diary.collaboration.collaborators.some(c => c.userId === userId && c.canEdit)
    
    if (!canEdit) return false
    
    const previousText = diary.content.text
    if (previousText === newText) return false
    
    let diffStart = 0
    let diffLength = newText.length
    
    for (let i = 0; i < Math.min(previousText.length, newText.length); i++) {
      if (previousText[i] !== newText[i]) {
        diffStart = i
        break
      }
    }
    
    const now = globalTimeline.getTime()
    const editorName = userStore.getUserById(userId)?.name || '未知用户'
    
    const editRecord: CollaborationEditRecord = {
      id: generateId(),
      diaryId,
      editorId: userId,
      editorName,
      editType,
      previousContent: previousText,
      newContent: newText,
      timestamp: now,
      diffStart,
      diffLength
    }
    
    const updatedCollaborators = diary.collaboration.collaborators.map(c => {
      if (c.userId === userId) {
        return { ...c, editCount: c.editCount + 1 }
      }
      return c
    })
    
    const updatedDiary: Diary = {
      ...diary,
      content: { ...diary.content, text: newText },
      collaboration: {
        ...diary.collaboration,
        collaborators: updatedCollaborators,
        editHistory: [...diary.collaboration.editHistory, editRecord],
        lastEditAt: now,
        lastEditorId: userId
      }
    }
    
    updateDiary(diary.id, updatedDiary)
    return true
  }

  function isCollaborator(diaryId: string, userId: string): boolean {
    const diary = getDiaryById(diaryId)
    if (!diary) return false
    return diary.ownerId === userId || 
      diary.collaboration.collaborators.some(c => c.userId === userId)
  }

  function canEditDiary(diaryId: string, userId: string): boolean {
    const diary = getDiaryById(diaryId)
    if (!diary) return false
    if (diary.ownerId === userId) return true
    const collaborator = diary.collaboration.collaborators.find(c => c.userId === userId)
    return collaborator?.canEdit || false
  }

  function getCollaborationInvitationsByDiary(diaryId: string): CollaborationInvitation[] {
    return collaborationInvitations.value.filter(inv => inv.diaryId === diaryId)
  }

  function getInvitationById(invitationId: string): CollaborationInvitation | undefined {
    return collaborationInvitations.value.find(inv => inv.id === invitationId)
  }

  return {
    diaries,
    archivedDiaries,
    collaborationInvitations,
    currentUserDiaries,
    currentUserArchivedDiaries,
    collaborativeDiaries,
    publicDiaries,
    pendingInvitations,
    sentInvitations,
    allInvitations,
    init,
    createDiary,
    updateDiary,
    deleteDiary,
    getDiaryById,
    toggleFreeze,
    checkAndTransition,
    rewindState,
    getDecayLevel,
    getDiariesByUser,
    archiveDiary,
    restoreDiary,
    addRepairRecord,
    getArchivedById,
    getArchivedDiariesByUser,
    searchArchivedDiaries,
    getGalleryHalls,
    getExhibitsBySection,
    getExhibits,
    updateDiarySchedule,
    isDiaryVisibleToUser,
    getDiaryScheduleStatus,
    inviteCollaborator,
    acceptInvitation,
    declineInvitation,
    cancelInvitation,
    removeCollaborator,
    updateCollaborativeContent,
    isCollaborator,
    canEditDiary,
    getCollaborationInvitationsByDiary,
    getInvitationById,
    checkAndExpireInvitations
  }
})
