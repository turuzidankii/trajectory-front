<template>
  <div class="common-layout">
    <el-container>
      <el-aside width="380px" class="sidebar">
        <h3 class="title">🚀 轨迹处理平台</h3>
        
        <div style="margin-bottom: 15px;">
          <el-tag :type="roadStatus ? 'success' : 'danger'" effect="dark" style="width: 100%;">
            <el-icon><Location /></el-icon> 
            {{ roadStatus ? `服务端路网已就绪 (节点:${nodeCount})` : '服务端路网未加载' }}
          </el-tag>
        </div>

        <el-upload
          class="upload-demo"
          action="#"
          :auto-upload="false"
          :on-change="handleFileChange"
          :show-file-list="false"
          multiple
        >
          <template #trigger>
            <el-button type="primary" style="width: 100%; font-weight: bold;">
              <el-icon style="margin-right: 5px"><Upload /></el-icon> 
              上传轨迹 (支持多选)
            </el-button>
          </template>
        </el-upload>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; margin-bottom: 5px;">
          <span style="font-weight: bold; color: #666;">轨迹列表 ({{ fileList.length }})</span>
          <el-button v-if="selectedFileIds.length > 0" type="text" size="small" @click="clearSelection">取消全选</el-button>
        </div>

        <div class="file-list-container">
          <el-empty v-if="fileList.length === 0" description="暂无数据" image-size="60" />
          
          <div 
            v-for="file in fileList" 
            :key="file.id"
            class="file-item"
            :class="{ active: selectedFileIds.includes(file.id) }"
            @click="toggleSelection(file.id)"
          >
            <el-checkbox 
              :model-value="selectedFileIds.includes(file.id)"
              @change="() => toggleSelection(file.id)"
              @click.stop
              style="margin-right: 10px;"
            />

            <div class="file-info">
              <div class="file-name" :title="file.name">
                {{ file.name }}
              </div>
              <div class="file-meta">
                {{ file.count }} 点 
                <span v-if="file.processedData.length" style="color: green; margin-left: 5px;">(已处理)</span>
              </div>
            </div>
            
            <el-button 
              type="danger" 
              circle 
              size="small" 
              icon="Delete" 
              plain
              @click.stop="deleteFile(file.id)" 
            />
          </div>
        </div>

        <div v-if="selectedFileIds.length > 0" class="config-panel">
          <el-divider content-position="left">
            已选 {{ selectedFileIds.length }} 项配置
          </el-divider>
          
          <el-form :model="config" label-width="120px" size="small">
            <el-form-item label="预处理算法">
              <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
                
                <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
                  <el-checkbox v-model="config.remove_stop_points" style="font-weight: bold;">
                    🛑 停留点聚类
                  </el-checkbox>
                  
                  <div v-if="config.remove_stop_points" style="margin-top: 5px; padding-left: 20px;">
                    <el-row :gutter="10">
                      <el-col :span="12">
                        <div style="font-size:12px;color:#666;margin-bottom:2px">距离阈值 (m)</div>
                        <el-input-number 
                          v-model="config.stop_radius" 
                          :min="1" :max="100" :step="1" 
                          size="small" controls-position="right" 
                          style="width: 100%;"
                        />
                      </el-col>
                      <el-col :span="12">
                        <div style="font-size:12px;color:#666;margin-bottom:2px">时间阈值 (s)</div>
                        <el-input-number 
                          v-model="config.stop_duration" 
                          :min="0" :max="3600" :step="10" 
                          size="small" controls-position="right" 
                          style="width: 100%;"
                        />
                      </el-col>
                    </el-row>
                    <div style="font-size: 12px; color: #999; margin-top: 5px;">
                      超出任一阈值则视为新移动段
                    </div>
                  </div>
                </div>

                <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
                  <el-checkbox v-model="config.enable_kalman" style="font-weight: bold;">
                    📉 卡尔曼滤波
                  </el-checkbox>
                  
                  <div v-if="config.enable_kalman" style="margin-top: 5px; padding-left: 20px;">
                    <el-form-item label="观测信任(R)" label-width="90px" style="margin-bottom: 5px;">
                      <el-input-number 
                        v-model="config.kalman_R" 
                        :min="0.01" :max="100" :step="0.01" 
                        size="small" controls-position="right" 
                        style="width: 100%;"
                      />
                    </el-form-item>
                    <el-form-item label="过程噪声(Q)" label-width="90px" style="margin-bottom: 0;">
                      <el-input-number v-model="config.kalman_Q" :min="0.1" :max="500" :step="10" size="small" controls-position="right" />
                    </el-form-item>
                    <div style="font-size: 12px; color: #999;">R越小越贴合原点，Q越小越平滑</div>
                  </div>
                </div>

              </div>
            </el-form-item>
          </el-form>

          <el-divider content-position="left">路径匹配算法</el-divider>
          <el-select v-model="config.match_algo" placeholder="选择算法" style="width: 100%;">
            <el-option label="HMM (隐马尔可夫)" value="HMM" />
            <el-option label="IVMM (交互式投票匹配)" value="IVMM" />
            <el-option label="Simple (最近邻吸附)" value="Simple" />
          </el-select>

          <div style="margin-top: 20px;">
            <el-button type="success" size="large" style="width: 100%; font-weight: bold;" @click="startBatchProcessing" :loading="loading">
              ⚡ 批量处理 ({{ selectedFileIds.length }})
            </el-button>
          </div>
        </div>
        <div v-else class="empty-tip">
          👈 请勾选列表中的轨迹进行查看或处理
        </div>

        <el-card v-if="lastSelectedFile && lastSelectedFile.report" style="margin-top: 15px; background: #f0f9eb; border: 1px solid #c2e7b0;" shadow="hover">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <b style="font-size: 12px">报告: {{ lastSelectedFile.name }}</b>
            </div>
          </template>
          <div style="font-size: 12px; line-height: 1.6;">
            <div>点数: <b>{{ lastSelectedFile.report.point_count }}</b></div>
          </div>
        </el-card>

      </el-aside>

      <el-main style="padding:0; position:relative;">
        <div id="map"></div>
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ElMessage } from 'element-plus'
import { Delete, Upload, Location } from '@element-plus/icons-vue'

// --- 状态定义 ---
const map = ref(null)
const roadStatus = ref(false)
const nodeCount = ref(0)
const loading = ref(false)

const fileList = ref([]) 
const selectedFileIds = ref([]) 

const layerStore = ref({}) 
const roadLayerGroup = ref(null)

// 🔥🔥🔥 核心修改区：简化配置对象 🔥🔥🔥
const config = ref({
  remove_stop_points: false, 
  stop_radius: 5,            
  stop_duration: 30,         // 新增：时间阈值 (默认30秒)
  
  enable_kalman: true,       
  kalman_R: 0.01,            
  kalman_Q: 500.0,          
  
  match_algo: 'HMM'
})

// 计算属性
const selectedFiles = computed(() => {
  return fileList.value.filter(f => selectedFileIds.value.includes(f.id))
})

const lastSelectedFile = computed(() => {
  if (selectedFiles.value.length === 0) return null
  return selectedFiles.value[selectedFiles.value.length - 1]
})

// --- 初始化 ---
onMounted(async () => {
  initMap()
  checkBackendStatus()
})

const initMap = () => {
  map.value = L.map('map').setView([39.9, 116.4], 11)
  
  // 方案 A：高德极简灰
  const gaodeLayer = L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
    subdomains: ['1', '2', '3', '4'],
    attribution: '© 高德地图',
    minZoom: 1,
    maxZoom: 19
  }).addTo(map.value)
  // gaodeLayer.getContainer().style.filter = 'grayscale(100%) opacity(0.9) brightness(98%)'

  roadLayerGroup.value = L.layerGroup().addTo(map.value)
  addLegend()
}

const checkBackendStatus = async () => {
  try {
    const res = await axios.get('http://localhost:8000/road_network/status')
    if (res.data.loaded) {
      roadStatus.value = true
      nodeCount.value = res.data.nodes
    }
  } catch (e) {
    ElMessage.error('无法连接后端服务')
  }
}

// --- 文件操作 ---
const handleFileChange = async (file) => {
  const formData = new FormData()
  formData.append('file', file.raw)
  try {
    const res = await axios.post('http://localhost:8000/upload', formData)
    if (res.data.status === 'success') {
      const data = res.data.data
      const newFileId = Date.now() + Math.random()
      
      const newFile = {
        id: newFileId,
        name: file.name,
        rawData: data,
        processedData: [],
        matchedData: [],
        report: null,
        count: res.data.count,
        time: new Date().toLocaleTimeString()
      }
      
      fileList.value.push(newFile)
      drawTrajectory(newFileId, data, 'raw', 'red')
      toggleSelection(newFileId, true) 
      ElMessage.success(`已添加: ${file.name}`)
    }
  } catch (e) {
    ElMessage.error('解析失败')
  }
}

const toggleSelection = (id, forceSelect = false) => {
  const index = selectedFileIds.value.indexOf(id)
  if (forceSelect) {
    if (index === -1) selectedFileIds.value.push(id)
  } else {
    if (index !== -1) selectedFileIds.value.splice(index, 1)
    else selectedFileIds.value.push(id)
  }
  refreshMapAndView()
}

const clearSelection = () => {
  selectedFileIds.value = []
  refreshMapAndView()
}

const refreshMapAndView = async () => {
  if (roadLayerGroup.value) roadLayerGroup.value.clearLayers()
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

  if (roadLayerGroup.value && uniqueSegments.length > 0) {
    L.polyline(uniqueSegments, {
      color: '#003366', 
      weight: 1.2,
      opacity: 0.5,
      interactive: false
    }).addTo(roadLayerGroup.value)
  }

  if (allPoints.length > 0) {
    const lats = allPoints.map(p => p.lat)
    const lons = allPoints.map(p => p.lon)
    map.value.fitBounds([
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)]
    ], { padding: [50, 50] })
  }
}

const fetchRoadsForPoints = async (points) => {
  if (!points.length) return []
  const lats = points.map(p => p.lat)
  const lons = points.map(p => p.lon)
  try {
    const res = await axios.get('http://localhost:8000/road_network/nearby', {
      params: { 
        min_lat: Math.min(...lats), 
        min_lon: Math.min(...lons), 
        max_lat: Math.max(...lats), 
        max_lon: Math.max(...lons) 
      }
    })
    if (res.data.status === 'success') return res.data.data
  } catch (e) { console.error(e) }
  return []
}

const deleteFile = (id) => {
  if (layerStore.value[id]) {
    ['raw', 'processed', 'matched'].forEach(type => {
      if (layerStore.value[id][type]) map.value.removeLayer(layerStore.value[id][type])
    })
    delete layerStore.value[id]
  }
  fileList.value = fileList.value.filter(f => f.id !== id)
  if (selectedFileIds.value.includes(id)) {
    selectedFileIds.value = selectedFileIds.value.filter(sid => sid !== id)
    refreshMapAndView()
  }
  ElMessage.success('轨迹已删除')
}

// --- 批量处理 ---
const startBatchProcessing = async () => {
  const targets = selectedFiles.value
  if (targets.length === 0) return
  
  loading.value = true
  let successCount = 0
  
  try {
    for (const file of targets) {
      clearSubLayers(file.id, ['processed', 'matched'])
      
      const res = await axios.post('http://localhost:8000/process', {
        trajectory: file.rawData,
        config: config.value
      })
      
      file.processedData = res.data.trajectory_processed
      file.matchedData = res.data.trajectory_matched
      file.report = res.data.quality_report
      
      drawTrajectory(file.id, file.processedData, 'processed', 'blue')
      drawTrajectory(file.id, file.matchedData, 'matched', 'green')
      successCount++
    }
    ElMessage.success(`批量处理完成，共 ${successCount} 条`)
  } catch (e) {
    ElMessage.error('处理过程中断')
  } finally {
    loading.value = false
  }
}

// --- 绘图 ---
const drawTrajectory = (fileId, points, type, color) => {
  if (!map.value || points.length === 0) return
  if (!layerStore.value[fileId]) layerStore.value[fileId] = {}
  
  if (layerStore.value[fileId][type]) {
    map.value.removeLayer(layerStore.value[fileId][type])
  }
  
  let layer;
  // 🔥 核心修改：Raw/Processed 画点，Matched 画线 🔥
  if (type === 'matched') {
    const latlngs = points.map(p => [p.lat, p.lon])
    layer = L.polyline(latlngs, {
      color: color,
      weight: 5,
      opacity: 0.8
    })
  } else {
    layer = L.featureGroup()
    points.forEach(p => {
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 4,
        fillColor: color,
        color: '#fff',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
      })
      if (p.road) {
        marker.bindPopup(`<b>${p.road}</b><br>状态: ${p.status}`)
      }
      layer.addLayer(marker)
    })
  }
  
  layer.addTo(map.value)
  layerStore.value[fileId][type] = layer
  
  if (type !== 'raw') {
    map.value.fitBounds(layer.getBounds())
  }
}

const clearSubLayers = (fileId, types) => {
  if (!layerStore.value[fileId]) return
  types.forEach(type => {
    if (layerStore.value[fileId][type]) {
      map.value.removeLayer(layerStore.value[fileId][type])
      delete layerStore.value[fileId][type]
    }
  })
}

const addLegend = () => {
  const legend = new L.Control({ position: 'bottomright' })
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'info legend')
    div.style.cssText = 'background: white; padding: 10px; border-radius: 4px; box-shadow: 0 0 10px rgba(0,0,0,0.1); font-size: 12px;'
    div.innerHTML = `
      <div style="font-weight:bold;margin-bottom:5px;border-bottom:1px solid #eee;padding-bottom:3px">图例说明</div>
      <div><span style="background:#003366;width:20px;height:1px;display:inline-block;vertical-align:middle;opacity:0.6"></span> 基础路网</div>
      <div><span style="background:red;width:8px;height:8px;border-radius:50%;display:inline-block;vertical-align:middle"></span> 原始采样点</div>
      <div><span style="background:blue;width:8px;height:8px;border-radius:50%;display:inline-block;vertical-align:middle"></span> 预处理结果</div>
      <div><span style="background:green;width:20px;height:5px;display:inline-block;vertical-align:middle"></span> 路径匹配</div>
    `
    return div
  }
  legend.addTo(map.value)
}
</script>

<style>
body { margin: 0; padding: 0; }
.common-layout, .el-container, #map { height: 100vh; width: 100%; }

.sidebar {
  padding: 20px; 
  border-right: 1px solid #eee; 
  background: #fcfcfc; 
  display: flex; 
  flex-direction: column;
}
.title { margin-top: 0; margin-bottom: 20px; color: #333; }

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

.empty-tip {
  text-align: center; color: #999; margin-top: 40px; font-size: 14px;
}
</style>