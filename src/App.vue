<template>
  <div class="common-layout">
    <el-container>
      <TrajectorySidebar
        :road-status="roadStatus"
        :node-count="nodeCount"
        :file-list="fileList"
        :selected-file-ids="selectedFileIds"
        :config="config"
        :loading="loading"
        @file-change="handleFileChange"
        @toggle-selection="handleToggleSelection"
        @clear-selection="clearSelection"
        @delete-file="deleteFile"
        @show-report="showReport"
        @start-batch-processing="startBatchProcessing"
      />

      <el-main style="padding:0; position:relative;">
        <MapView ref="mapRef" />

        <div v-if="timelineVisible" class="timeline-panel">
          <div class="timeline-header">
            <div class="timeline-title">时间轴</div>
            <el-tag size="small" type="success" effect="light">{{ timelineFile.name }}</el-tag>
          </div>

          <div class="timeline-controls">
            <el-button
              size="small"
              type="primary"
              :icon="isTimelinePlaying ? 'VideoPause' : 'VideoPlay'"
              @click="toggleTimelinePlayback"
              :disabled="timelineMax === 0"
            >
              {{ isTimelinePlaying ? '暂停' : '播放' }}
            </el-button>
            <el-button size="small" icon="RefreshLeft" @click="resetTimeline" :disabled="timelineMax === 0">
              重置
            </el-button>
          </div>

          <el-slider
            v-model="timelineIndex"
            :min="0"
            :max="timelineMax"
            :step="1"
            :show-tooltip="false"
            class="timeline-slider"
          />

          <div class="timeline-time">
            <span>{{ startTimeLabel }}</span>
            <span class="timeline-current">{{ currentTimeLabel }}</span>
            <span>{{ endTimeLabel }}</span>
          </div>
        </div>
      </el-main>
    </el-container>

    <ReportDialog
      v-model="reportDialogVisible"
      :current-report-file="currentReportFile"
      v-model:report-page="reportPage"
      v-model:report-page-size="reportPageSize"
    />

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import TrajectorySidebar from './components/TrajectorySidebar.vue'
import MapView from './components/MapView.vue'
import ReportDialog from './components/ReportDialog.vue'
import { getRoadNetworkStatus, uploadTrajectory, processTrajectory, getRoadsNearby } from './api/trajectory'

// --- 基础状态 ---
const roadStatus = ref(false)
const nodeCount = ref(0)
const loading = ref(false)
const mapRef = ref(null)

const fileList = ref([]) 
const selectedFileIds = ref([]) 

// --- 弹窗与分页状态 ---
const reportDialogVisible = ref(false)
const currentReportFile = ref(null)
const reportPage = ref(1)
const reportPageSize = ref(50)
const statusPollTimer = ref(null)
const statusPollInterval = 5000

// --- 时间轴状态 ---
const timelineIndex = ref(0)
const isTimelinePlaying = ref(false)
const timelinePlayTimer = ref(null)
const timelineStepInterval = 15
const timelineTailLength = 10

// --- 核心配置 ---
const config = ref({
  remove_stop_points: false, 
  stop_radius: 5,            
  stop_duration: 30,         
  
  enable_kalman: true,       
  kalman_R: 0.01,            
  kalman_Q: 500,          
  
  match_algo: 'HMM'
})

// --- 计算属性 ---
const selectedFiles = computed(() => {
  return fileList.value.filter(f => selectedFileIds.value.includes(f.id))
})

const timelineFile = computed(() => {
  return selectedFiles.value.find(f => (f.matchedData || []).length > 0) || null
})

const timelineVisible = computed(() => !!timelineFile.value)

const timelinePoints = computed(() => timelineFile.value?.matchedData || [])

const timelineMax = computed(() => Math.max(0, timelinePoints.value.length - 1))

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

const timelineTimes = computed(() =>
  timelinePoints.value.map((p, i) => normalizeTimestamp(p.timestamp, i))
)

const currentTimeLabel = computed(() => {
  if (!timelineVisible.value || timelineTimes.value.length === 0) return '-'
  return formatTimestamp(timelineTimes.value[timelineIndex.value])
})

const startTimeLabel = computed(() => {
  if (!timelineVisible.value || timelineTimes.value.length === 0) return '-'
  return formatTimestamp(timelineTimes.value[0])
})

const endTimeLabel = computed(() => {
  if (!timelineVisible.value || timelineTimes.value.length === 0) return '-'
  return formatTimestamp(timelineTimes.value[timelineTimes.value.length - 1])
})

// --- 初始化 ---
onMounted(async () => {
  checkBackendStatus()
})

onUnmounted(() => {
  if (statusPollTimer.value) {
    clearTimeout(statusPollTimer.value)
    statusPollTimer.value = null
  }
  stopTimelinePlayback()
})

const checkBackendStatus = async () => {
  try {
    const res = await getRoadNetworkStatus()
    if (res.data.loaded) {
      roadStatus.value = true
      nodeCount.value = res.data.nodes
      if (statusPollTimer.value) {
        clearTimeout(statusPollTimer.value)
        statusPollTimer.value = null
      }
      return
    }
    scheduleStatusRetry()
  } catch (e) {
    ElMessage.error('无法连接后端服务')
    console.error(e)
    scheduleStatusRetry()
  }
}

const scheduleStatusRetry = () => {
  if (statusPollTimer.value) return
  statusPollTimer.value = setTimeout(async () => {
    statusPollTimer.value = null
    await checkBackendStatus()
  }, statusPollInterval)
}

// --- 文件上传处理 (修改点：接收质检数据) ---
const handleFileChange = async (file) => {
  const formData = new FormData()
  formData.append('file', file.raw)
  try {
    const res = await uploadTrajectory(formData)
    if (res.data.status === 'success') {
      const data = res.data.data
      const newFileId = Date.now() + Math.random()
      
      const newFile = {
        id: newFileId,
        name: file.name,
        rawData: data,
        processedData: [],
        matchedData: [],
        count: res.data.count,
        time: new Date().toLocaleTimeString(),
        // 🔥 核心：存储后端返回的质检结果
        qc_summary: res.data.qc_summary || { score: 0, counts: {} },
        qc_details: res.data.qc_details || []
      }
      
      fileList.value.push(newFile)
      
      // 默认选中并绘制
      drawTrajectory(newFileId, data, 'raw', 'red')
      toggleSelection(newFileId, true) 
      
      ElMessage.success(`已添加: ${file.name} (质量得分: ${newFile.qc_summary.score})`)
    }
  } catch (e) {
    ElMessage.error('解析或质检失败，请检查文件格式')
    console.error(e)
  }
}

// --- 报告查看逻辑 (新增) ---
const showReport = (file) => {
    currentReportFile.value = file
    reportPage.value = 1 // 重置到第一页
    reportDialogVisible.value = true
}

// --- 文件选择与操作 ---
const toggleSelection = (id, forceSelect = false) => {
  const index = selectedFileIds.value.indexOf(id)
  if (forceSelect) {
    if (index === -1) selectedFileIds.value.push(id)
  } else if (index === -1) {
    selectedFileIds.value.push(id)
  } else {
    selectedFileIds.value.splice(index, 1)
  }
  refreshMapAndView()
}

const handleToggleSelection = ({ id, forceSelect }) => {
  toggleSelection(id, forceSelect)
}

const clearSelection = () => {
  selectedFileIds.value = []
  refreshMapAndView()
}

const deleteFile = (id) => {
  mapRef.value?.clearFileLayers(id)
  mapRef.value?.clearTimelineLayers(id)
  fileList.value = fileList.value.filter(f => f.id !== id)
  if (selectedFileIds.value.includes(id)) {
    selectedFileIds.value = selectedFileIds.value.filter(sid => sid !== id)
    refreshMapAndView()
  }
  
  // 如果删除的是当前正在查看报告的文件，关闭弹窗
  if (currentReportFile.value && currentReportFile.value.id === id) {
      reportDialogVisible.value = false
      currentReportFile.value = null
  }
  
  ElMessage.success('轨迹已删除')
}

// --- 批量处理逻辑 ---
const startBatchProcessing = async () => {
  const targets = selectedFiles.value
  if (targets.length === 0) return
  
  loading.value = true
  let successCount = 0
  
  try {
    for (const file of targets) {
      clearSubLayers(file.id, ['processed', 'matched'])
      
      const res = await processTrajectory({
        trajectory: file.rawData,
        config: config.value
      })
      
      file.processedData = res.data.trajectory_processed
      file.matchedData = res.data.trajectory_matched
      // 注意：这里可以选择是否用处理后的报告更新 qc_summary，目前逻辑是保留原始数据的质检报告
      
      drawTrajectory(file.id, file.processedData, 'processed', 'blue')
      drawTrajectory(file.id, file.matchedData, 'matched', 'green')
      successCount++
    }
    ElMessage.success(`批量处理完成，共 ${successCount} 条`)
  } catch (e) {
    ElMessage.error('处理过程中断')
    console.error(e)
  } finally {
    loading.value = false
  }
}

// --- 地图绘图与交互 ---
const refreshMapAndView = async () => {
  mapRef.value?.clearRoadLayers()
  mapRef.value?.clearAllFileLayers()
  const targets = selectedFiles.value
  if (targets.length === 0) return

  let allPoints = []
  const roadRequests = targets.map(file => {
    if (file.rawData.length > 0) {
      allPoints = allPoints.concat(file.rawData)
      return fetchRoadsForPoints(file.rawData)
    }
    return Promise.resolve([])
  })
  
  const results = await Promise.all(roadRequests)
  const allSegments = results.flat()
  
  const uniqueSegments = []
  const seen = new Set()
  allSegments.forEach(seg => {
    const key = JSON.stringify(seg)
    if (!seen.has(key)) {
      seen.add(key)
      uniqueSegments.push(seg)
    }
  })

  if (uniqueSegments.length > 0) {
    mapRef.value?.drawRoadSegments(uniqueSegments)
  }

  if (allPoints.length > 0) {
    mapRef.value?.fitToPoints(allPoints)
  }

  targets.forEach((file) => {
    if (file.rawData?.length) {
      drawTrajectory(file.id, file.rawData, 'raw', 'red')
    }
    if (file.processedData?.length) {
      drawTrajectory(file.id, file.processedData, 'processed', 'blue')
    }
    if (file.matchedData?.length) {
      drawTrajectory(file.id, file.matchedData, 'matched', 'green')
    }
  })
}

const fetchRoadsForPoints = async (points) => {
  if (!points.length) return []
  const lats = points.map(p => p.lat)
  const lons = points.map(p => p.lon)
  try {
    const res = await getRoadsNearby({
      min_lat: Math.min(...lats),
      min_lon: Math.min(...lons),
      max_lat: Math.max(...lats),
      max_lon: Math.max(...lons)
    })
    if (res.data.status === 'success') return res.data.data
  } catch (e) { console.error(e) }
  return []
}

const drawTrajectory = (fileId, points, type, color) => {
  if (!mapRef.value || points.length === 0) return
  mapRef.value.drawTrajectory(fileId, points, type, color)
}

const clearSubLayers = (fileId, types) => {
  mapRef.value?.clearSubLayers(fileId, types)
}

// --- 时间轴交互 ---
const updateTimelineOnMap = () => {
  if (!timelineFile.value || !mapRef.value) return
  mapRef.value.drawMatchedTimeline(
    timelineFile.value.id,
    timelineFile.value.matchedData,
    timelineIndex.value,
    { tailLength: timelineTailLength, activeColor: '#00C853' }
  )
}

const startTimelinePlayback = () => {
  if (!timelineVisible.value || timelineMax.value === 0) return
  if (isTimelinePlaying.value) return
  if (timelineIndex.value >= timelineMax.value) {
    timelineIndex.value = 0
  }
  isTimelinePlaying.value = true
  timelinePlayTimer.value = setInterval(() => {
    if (timelineIndex.value >= timelineMax.value) {
      stopTimelinePlayback()
    } else {
      timelineIndex.value += 1
    }
  }, timelineStepInterval)
}

const stopTimelinePlayback = () => {
  if (timelinePlayTimer.value) {
    clearInterval(timelinePlayTimer.value)
    timelinePlayTimer.value = null
  }
  isTimelinePlaying.value = false
}

const toggleTimelinePlayback = () => {
  if (isTimelinePlaying.value) {
    stopTimelinePlayback()
  } else {
    startTimelinePlayback()
  }
}

const resetTimeline = () => {
  stopTimelinePlayback()
  timelineIndex.value = 0
}

watch(timelineIndex, () => {
  updateTimelineOnMap()
})

watch(
  () => timelineFile.value?.id,
  (newId, oldId) => {
    stopTimelinePlayback()
    timelineIndex.value = 0
    if (oldId != null) {
      mapRef.value?.clearTimelineLayers(oldId)
    }
    if (newId != null) {
      updateTimelineOnMap()
    }
  }
)

watch(timelinePoints, () => {
  if (timelineIndex.value > timelineMax.value) {
    timelineIndex.value = timelineMax.value
  }
  if (timelineVisible.value) {
    updateTimelineOnMap()
  }
})
</script>

<style>
/* 基础布局 */
body { margin: 0; padding: 0; }
.common-layout, .el-container, .map-container { height: 100vh; width: 100%; }

.sidebar {
  padding: 20px; 
  border-right: 1px solid #eee; 
  background: #fcfcfc; 
  display: flex; 
  flex-direction: column;
}
.title { margin-top: 0; margin-bottom: 20px; color: #333; }

/* 文件列表区 */
.file-list-container {
  flex: 1; 
  overflow-y: auto; 
  margin-bottom: 15px; 
  border: 1px solid #e4e7ed; 
  border-radius: 4px; 
  background: white;
}

.file-item {
  display: flex; 
  align-items: center; 
  padding: 10px 12px; 
  border-bottom: 1px solid #f0f0f0; 
  cursor: pointer; 
  transition: all 0.2s;
}
.file-item:hover { background-color: #f5f7fa; }
.file-item.active { background-color: #e6f7ff; }

.file-info { flex: 1; margin-left: 5px; overflow: hidden; }

.file-name {
  font-weight: bold; font-size: 14px; color: #333;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.file-meta { font-size: 12px; color: #999; margin-top: 2px; }

/* 按钮组 */
.action-buttons {
    display: flex;
    align-items: center;
    margin-left: 10px;
}

.empty-tip {
  text-align: center; color: #999; margin-top: 40px; font-size: 14px;
}

.mini-label { font-size: 12px; color: #666; margin-bottom: 2px; }

/* 质量报告相关 */
.report-summary-bar {
    display: flex; 
    justify-content: space-around; 
    align-items: center; 
    padding: 15px 0; 
    background: #fcfcfc; 
    border-bottom: 1px solid #eee;
    border-radius: 4px 4px 0 0;
}

/* 表格异常行高亮 */
.warning-row {
    background-color: #fff0f0 !important; /* 淡红色背景 */
}

/* 文本颜色 */
.text-danger { color: #F56C6C; font-weight: bold; }
.text-warning { color: #E6A23C; font-weight: bold; }

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