<template>
  <el-dialog v-model="dialogVisible" :title="title" width="900px" align-center destroy-on-close>
    <div v-if="currentReportFile" style="height: 600px; display: flex; flex-direction: column;">
      <div class="report-mode-switch">
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button label="raw">原始质量检测</el-radio-button>
          <el-radio-button label="pre">预处理后质量检测</el-radio-button>
        </el-radio-group>
        <span v-if="viewMode === 'pre' && !hasPreResult" class="mode-tip">未检测到预处理结果，请先进行处理</span>
      </div>

      <div class="report-summary-bar">
        <el-statistic
          title="总体得分"
          :value="currentSummary.score ?? 0"
          :value-style="{ color: getScoreColor(currentSummary.score ?? 0), fontWeight: 'bold' }"
        />
        <el-divider direction="vertical" style="height: 40px;" />
        <el-statistic
          title="总数"
          :value="currentTotalCount"
          value-style="color: #409EFF"
        />
        <el-statistic title="速度异常" :value="currentSummary.counts?.speed ?? 0" value-style="color: #F56C6C" />
        <el-statistic title="急转弯" :value="currentSummary.counts?.angle ?? 0" value-style="color: #E6A23C" />
        <el-statistic title="时间断裂" :value="currentSummary.counts?.time ?? 0" value-style="color: #909399" />
        <el-statistic title="数据缺失" :value="currentSummary.counts?.integrity ?? 0" value-style="color: #F56C6C" />
      </div>

      <el-table
        v-if="pagedReportData.length"
        :data="pagedReportData"
        style="width: 100%; flex: 1; margin-top: 15px;"
        height="100%"
        border
        stripe
        size="small"
        :row-class-name="tableRowClassName"
      >
        <el-table-column prop="id" label="序号" width="50" align="center" />
        <el-table-column prop="road" label="路段" width="100" />
        <el-table-column prop="situation" label="状态" width="50" />
        <el-table-column prop="timestamp" label="时间戳" width="160" />

        <el-table-column prop="lat" label="纬度" width="85">
          <template #default="scope">{{ Number(scope.row.lat).toFixed(6) }}</template>
        </el-table-column>
        <el-table-column prop="lon" label="经度" width="85">
          <template #default="scope">{{ Number(scope.row.lon).toFixed(6) }}</template>
        </el-table-column>

        <el-table-column prop="speed" label="速度 (m/s)" width="80" align="center">
          <template #default="scope">
            <span :class="{ 'text-danger': scope.row.speed > 33.3 }">
              {{ scope.row.speed }}
            </span>
          </template>
        </el-table-column>

        <el-table-column prop="angle_diff" label="转角 (°)" width="60" align="center">
          <template #default="scope">
            <span :class="{ 'text-warning': scope.row.angle_diff > 60 }">
              {{ scope.row.angle_diff }}
            </span>
          </template>
        </el-table-column>

        <el-table-column prop="status" label="检测结果">
          <template #default="scope">
            <el-tag v-if="!scope.row.is_error" type="success" size="small" effect="light">✅ 正常</el-tag>
            <el-tooltip
              v-else
              :content="scope.row.status"
              placement="top"
              :show-after="400"
              :disabled="!statusOverflowMap[scope.row.id]"
            >
              <el-tag
                type="danger"
                size="small"
                effect="light"
                class="status-tag"
                @mouseenter="(e) => setStatusOverflow(scope.row.id, e)"
              >
                ❌ {{ scope.row.status }}
              </el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="暂无质量检测结果" style="flex: 1; margin-top: 20px;" />

      <div style="margin-top: 15px; display: flex; justify-content: flex-end;">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100, 200]"
          :total="currentDetails.length"
          layout="total, sizes, prev, pager, next, jumper"
          background
        />
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { getScoreColor } from '../utils/score'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  currentReportFile: { type: Object, default: null },
  reportPage: { type: Number, default: 1 },
  reportPageSize: { type: Number, default: 50 }
})

const emit = defineEmits(['update:modelValue', 'update:reportPage', 'update:reportPageSize'])

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const viewMode = ref('raw')

const page = computed({
  get: () => props.reportPage,
  set: (val) => emit('update:reportPage', val)
})

const pageSize = computed({
  get: () => props.reportPageSize,
  set: (val) => emit('update:reportPageSize', val)
})

const title = computed(() =>
  props.currentReportFile ? `轨迹质量报告: ${props.currentReportFile.name}` : '质量报告'
)

const hasPreResult = computed(() => {
  if (props.currentReportFile?.skipped_preprocess) return false
  return Boolean(props.currentReportFile?.qc_pre_summary || (props.currentReportFile?.qc_pre_details || []).length)
})

const currentSummary = computed(() => {
  if (viewMode.value === 'pre' && hasPreResult.value) return props.currentReportFile?.qc_pre_summary || {}
  return props.currentReportFile?.qc_summary || {}
})

const currentDetails = computed(() => {
  if (viewMode.value === 'pre' && hasPreResult.value) return props.currentReportFile?.qc_pre_details || []
  return props.currentReportFile?.qc_details || []
})

const currentTotalCount = computed(() => {
  if (viewMode.value === 'pre') return currentDetails.value.length
  return props.currentReportFile?.count ?? currentDetails.value.length
})

const pagedReportData = computed(() => {
  if (!currentDetails.value.length) return []
  const start = (props.reportPage - 1) * props.reportPageSize
  const end = start + props.reportPageSize
  return currentDetails.value.slice(start, end)
})

const tableRowClassName = ({ row }) => (row.is_error ? 'warning-row' : '')

const statusOverflowMap = reactive({})

const setStatusOverflow = (id, event) => {
  const el = event?.currentTarget
  if (!el) return
  statusOverflowMap[id] = el.scrollWidth > el.clientWidth
}
</script>

<style scoped>
.status-tag {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  vertical-align: middle;
}

.report-mode-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0 10px;
}

.mode-tip {
  font-size: 12px;
  color: #909399;
}
</style>
