<template>
  <el-aside width="400px" class="sidebar">
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
      :on-change="onFileChange"
      :show-file-list="false"
      multiple
    >
      <template #trigger>
        <el-button type="primary" style="width: 100%; font-weight: bold;">
          <el-icon style="margin-right: 5px"><Upload /></el-icon>
          上传轨迹 (自动质检)
        </el-button>
      </template>
    </el-upload>

    <div
      style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; margin-bottom: 5px;"
    >
      <span style="font-weight: bold; color: #666;">轨迹列表 ({{ fileList.length }})</span>
      <el-button v-if="selectedFileIds.length > 0" type="text" size="small" @click="onClearSelection">
        取消全选
      </el-button>
    </div>

    <div class="file-list-container">
      <el-empty v-if="fileList.length === 0" description="暂无数据" image-size="60" />

      <div
        v-for="file in fileList"
        :key="file.id"
        class="file-item"
        :class="{ active: selectedFileIds.includes(file.id) }"
        @click="onToggleSelection(file.id)"
      >
        <el-checkbox
          :model-value="selectedFileIds.includes(file.id)"
          @change="() => onToggleSelection(file.id)"
          @click.stop
          style="margin-right: 8px;"
        />

        <div class="file-info">
          <div class="file-name" :title="file.name">{{ file.name }}</div>
          <div class="file-meta">
            {{ file.count }} 点
            <span v-if="file.processedData.length" style="color: green; margin-left: 5px;">(已处理)</span>
            <el-tag
              v-if="file.qc_summary"
              size="small"
              :type="getScoreType(file.qc_summary.score)"
              style="margin-left: 5px; transform: scale(0.9);"
              effect="plain"
            >
              {{ file.qc_summary.score }}分
            </el-tag>
          </div>
        </div>

        <div class="action-buttons">
          <el-tooltip content="查看质量详情" placement="top" :show-after="500">
            <el-button
              type="primary"
              circle
              size="small"
              icon="DataAnalysis"
              plain
              @click.stop="onShowReport(file)"
            />
          </el-tooltip>

          <el-tooltip content="删除轨迹" placement="top" :show-after="500">
            <el-button
              type="danger"
              circle
              size="small"
              icon="Delete"
              plain
              @click.stop="onDeleteFile(file.id)"
              style="margin-left: 5px;"
            />
          </el-tooltip>
        </div>
      </div>
    </div>

    <div v-if="selectedFileIds.length > 0" class="config-panel">
      <el-divider content-position="left">已选 {{ selectedFileIds.length }} 项配置</el-divider>

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
                    <div class="mini-label">距离(m)</div>
                    <el-input-number
                      v-model="config.stop_radius"
                      :min="1"
                      size="small"
                      style="width:100%"
                      controls-position="right"
                    />
                  </el-col>
                  <el-col :span="12">
                    <div class="mini-label">时间(s)</div>
                    <el-input-number
                      v-model="config.stop_duration"
                      :min="0"
                      size="small"
                      style="width:100%"
                      controls-position="right"
                    />
                  </el-col>
                </el-row>
              </div>
            </div>

            <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
              <el-checkbox v-model="config.enable_kalman" style="font-weight: bold;">
                📉 卡尔曼滤波
              </el-checkbox>
              <div v-if="config.enable_kalman" style="margin-top: 5px; padding-left: 20px;">
                <el-row :gutter="10">
                  <el-col :span="12">
                    <div class="mini-label">观测信任R</div>
                    <el-input-number
                      v-model="config.kalman_R"
                      :min="0.01"
                      :step="0.01"
                      size="small"
                      style="width:100%"
                      controls-position="right"
                    />
                  </el-col>
                  <el-col :span="12">
                    <div class="mini-label">过程噪声Q</div>
                    <el-input-number
                      v-model="config.kalman_Q"
                      :min="0.1"
                      size="small"
                      style="width:100%"
                      controls-position="right"
                    />
                  </el-col>
                </el-row>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>

      <el-divider content-position="left">匹配算法</el-divider>
      <el-select v-model="config.match_algo" placeholder="选择算法" style="width: 100%;">
        <el-option label="HMM (隐马尔可夫)" value="HMM" />
        <el-option label="IVMM (交互式投票匹配)" value="IVMM" />
        <el-option label="Simple (最近邻吸附)" value="Simple" />
      </el-select>

      <div style="margin-top: 20px;">
        <el-button
          type="success"
          size="large"
          style="width: 100%; font-weight: bold;"
          @click="onStartBatch"
          :loading="loading"
        >
          ⚡ 批量处理 ({{ selectedFileIds.length }})
        </el-button>
      </div>
    </div>
    <div v-else class="empty-tip">👈 请勾选列表中的轨迹进行处理</div>
  </el-aside>
</template>

<script setup>
import { getScoreType } from '../utils/score'

defineProps({
  roadStatus: { type: Boolean, default: false },
  nodeCount: { type: Number, default: 0 },
  fileList: { type: Array, default: () => [] },
  selectedFileIds: { type: Array, default: () => [] },
  config: { type: Object, required: true },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits([
  'file-change',
  'toggle-selection',
  'clear-selection',
  'delete-file',
  'show-report',
  'start-batch-processing'
])

const onFileChange = (file) => emit('file-change', file)
const onToggleSelection = (id, forceSelect = false) => emit('toggle-selection', { id, forceSelect })
const onClearSelection = () => emit('clear-selection')
const onDeleteFile = (id) => emit('delete-file', id)
const onShowReport = (file) => emit('show-report', file)
const onStartBatch = () => emit('start-batch-processing')
</script>
