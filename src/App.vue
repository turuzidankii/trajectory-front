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

        <TimelinePanel
          :files="selectedFiles"
          :step-interval="timelineStepInterval"
          @render="handleTimelineRender"
        />
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import TrajectorySidebar from './components/TrajectorySidebar.vue'
import MapView from './components/MapView.vue'
import TimelinePanel from './components/TimelinePanel.vue'
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
const timelineStepInterval = 15
const timelineTailLength = 10

// --- 核心配置 ---
const config = ref({
  // 停留点聚类算法
  stop_cluster_algo: null, // 'spatiotemporal' | 'density' | null
  stop_radius: 5.0,
  stop_duration: 30.0,
  stop_eps_m: 10.0,
  stop_min_samples: 3,

  // 去噪算法
  denoise_algo: null, // 'median' | 'kalman' | 'rts' | null
  median_window: 3,
  kalman_R: 0.01,
  kalman_Q: 500,
  rts_R: 0.01,
  rts_Q: 500,

  // 路径匹配算法
  match_algo: null, // 'hmm' | 'ivmm' | null
  astar_fill: false,

  // HMM 参数
  hmm_max_dist: 500,
  hmm_obs_noise: 30,
  hmm_obs_noise_ne: 50,
  hmm_max_lattice_width: 5,

  // IVMM 参数
  ivmm_search_radius: 100,
  ivmm_w_dist: 0.6,
  ivmm_w_heading: 0.4
})

// --- 计算属性 ---
const selectedFiles = computed(() => {
  return fileList.value.filter(f => selectedFileIds.value.includes(f.id))
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
        qc_details: res.data.qc_details || [],
        // 预处理后质检结果（批处理后更新）
        qc_pre_summary: null,
        qc_pre_details: [],
        skipped_preprocess: false,
        skipped_match: false
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
      file.qc_pre_summary = res.data.qc_pre_summary || null
      file.qc_pre_details = res.data.qc_pre_details || []
      file.skipped_preprocess = Boolean(res.data.skipped_preprocess)
      file.skipped_match = Boolean(res.data.skipped_match)
      // 注意：这里可以选择是否用处理后的报告更新 qc_summary，目前逻辑是保留原始数据的质检报告
      
      if (!file.skipped_preprocess) {
        drawTrajectory(file.id, file.processedData, 'processed', 'blue')
      }
      if (!file.skipped_match) {
        drawTrajectory(file.id, file.matchedData, 'matched', 'green')
      }
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
    if (file.processedData?.length && !file.skipped_preprocess) {
      drawTrajectory(file.id, file.processedData, 'processed', 'blue')
    }
    if (file.matchedData?.length && !file.skipped_match) {
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

// --- 时间轴渲染 ---
const handleTimelineRender = ({ positions, removedIds }) => {
  if (removedIds && removedIds.length) {
    removedIds.forEach((id) => mapRef.value?.clearTimelineLayers(id))
  }
  if (!positions || positions.length === 0) return
  positions.forEach(({ file, index }) => {
    if (!file || !file.matchedData?.length) return
    mapRef.value?.drawMatchedTimeline(
      file.id,
      file.matchedData,
      index,
      { tailLength: timelineTailLength, activeColor: '#00C853' }
    )
  })
}
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
</style>