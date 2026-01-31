<template>
  <div v-if="visible" class="timeline-panel">
    <div class="timeline-header">
      <div class="timeline-title">时间轴</div>
      <el-tag size="small" type="success" effect="light">已选 {{ matchedFiles.length }} 条</el-tag>
    </div>

    <div class="timeline-controls">
      <el-button
        size="small"
        type="primary"
        :icon="isPlaying ? 'VideoPause' : 'VideoPlay'"
        @click="togglePlayback"
        :disabled="maxIndex === 0"
      >
        {{ isPlaying ? '暂停' : '播放' }}
      </el-button>
      <el-button size="small" icon="RefreshLeft" @click="resetTimeline" :disabled="maxIndex === 0">
        重置
      </el-button>
    </div>

    <el-slider
      v-model="timelineIndex"
      :min="0"
      :max="maxIndex"
      :step="1"
      :show-tooltip="false"
      class="timeline-slider"
    />

    <div class="timeline-time">
      <span>{{ startLabel }}</span>
      <span class="timeline-current">{{ currentLabel }}</span>
      <span>{{ endLabel }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'

const props = defineProps({
  files: { type: Array, default: () => [] },
  stepInterval: { type: Number, default: 15 }
})

const emit = defineEmits(['render'])

const timelineIndex = ref(0)
const isPlaying = ref(false)
const playTimer = ref(null)

const matchedFiles = computed(() =>
  props.files.filter((f) => (f.matchedData || []).length > 0)
)

const visible = computed(() => matchedFiles.value.length > 0)

const normalizeTimestamp = (timestamp, fallbackIndex) => {
  if (timestamp == null) return fallbackIndex
  if (typeof timestamp === 'number') {
    return timestamp < 1e12 ? timestamp * 1000 : timestamp
  }
  const parsed = Date.parse(timestamp)
  if (!Number.isNaN(parsed)) return parsed
  return fallbackIndex
}

const formatTimestamp = (value) => {
  if (value == null) return '-'
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleString()
  }
  return String(value)
}

const globalTimes = computed(() => {
  const times = []
  matchedFiles.value.forEach((file) => {
    file.matchedData.forEach((p, i) => {
      times.push(normalizeTimestamp(p.timestamp, i))
    })
  })
  const unique = Array.from(new Set(times))
  unique.sort((a, b) => a - b)
  return unique
})

const maxIndex = computed(() => Math.max(0, globalTimes.value.length - 1))

const currentLabel = computed(() => {
  if (!visible.value || globalTimes.value.length === 0) return '-'
  return formatTimestamp(globalTimes.value[timelineIndex.value])
})

const startLabel = computed(() => {
  if (!visible.value || globalTimes.value.length === 0) return '-'
  return formatTimestamp(globalTimes.value[0])
})

const endLabel = computed(() => {
  if (!visible.value || globalTimes.value.length === 0) return '-'
  return formatTimestamp(globalTimes.value[globalTimes.value.length - 1])
})

const findIndexByTime = (times, target) => {
  if (!times.length) return 0
  if (target <= times[0]) return 0
  if (target >= times[times.length - 1]) return times.length - 1
  let left = 0
  let right = times.length - 1
  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    if (times[mid] === target) return mid
    if (times[mid] < target) left = mid + 1
    else right = mid - 1
  }
  return Math.max(0, left - 1)
}

const buildMatchedTimes = (file) =>
  file.matchedData.map((p, i) => normalizeTimestamp(p.timestamp, i))

const emitRender = (removedIds = []) => {
  if (!visible.value) {
    emit('render', { positions: [], removedIds })
    return
  }
  const targetTime = globalTimes.value[timelineIndex.value]
  const positions = matchedFiles.value.map((file) => {
    const times = buildMatchedTimes(file)
    const index = findIndexByTime(times, targetTime)
    return { file, index }
  })
  emit('render', { positions, removedIds })
}

const startPlayback = () => {
  if (!visible.value || maxIndex.value === 0) return
  if (isPlaying.value) return
  if (timelineIndex.value >= maxIndex.value) {
    timelineIndex.value = 0
  }
  isPlaying.value = true
  playTimer.value = setInterval(() => {
    if (timelineIndex.value >= maxIndex.value) {
      stopPlayback()
    } else {
      timelineIndex.value += 1
    }
  }, props.stepInterval)
}

const stopPlayback = () => {
  if (playTimer.value) {
    clearInterval(playTimer.value)
    playTimer.value = null
  }
  isPlaying.value = false
}

const togglePlayback = () => {
  if (isPlaying.value) stopPlayback()
  else startPlayback()
}

const resetTimeline = () => {
  stopPlayback()
  timelineIndex.value = 0
}

watch(timelineIndex, () => {
  emitRender()
})

watch(globalTimes, () => {
  if (timelineIndex.value > maxIndex.value) {
    timelineIndex.value = maxIndex.value
  }
  emitRender()
})

watch(
  () => matchedFiles.value.map((f) => f.id),
  (newIds, oldIds) => {
    stopPlayback()
    timelineIndex.value = 0
    const oldSet = new Set(oldIds || [])
    const newSet = new Set(newIds || [])
    const removedIds = []
    oldSet.forEach((id) => {
      if (!newSet.has(id)) removedIds.push(id)
    })
    emitRender(removedIds)
  }
)

onUnmounted(() => {
  stopPlayback()
})
</script>

<style scoped>
/* 时间轴面板 */
.timeline-panel {
  position: absolute;
  right: 16px;
  top: 16px;
  width: 320px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  padding: 12px 14px;
  z-index: 500;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.timeline-title {
  font-weight: bold;
  color: #333;
}

.timeline-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.timeline-slider {
  margin: 8px 0 6px;
}

.timeline-time {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #666;
  gap: 8px;
}

.timeline-current {
  color: #00C853;
  font-weight: bold;
}
</style>
