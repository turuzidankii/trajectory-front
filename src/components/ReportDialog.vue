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

      <div class="content-switch">
        <el-radio-group v-model="contentView" size="small">
          <el-radio-button label="charts">图表分析</el-radio-button>
          <el-radio-button label="table">明细表格</el-radio-button>
        </el-radio-group>
      </div>

      <template v-if="contentView === 'charts'">
        <div v-if="currentDetails.length" class="charts-panel">
          <div class="chart-card">
            <div class="chart-title">异常占比</div>
            <div class="chart-wrap"><Pie :data="statusPieData" :options="pieOptions" /></div>
          </div>

          <div class="chart-card">
            <div class="chart-title">异常类型分布</div>
            <div class="chart-wrap"><Bar :data="anomalyTypeBarData" :options="barOptions" /></div>
          </div>

          <div class="chart-card">
            <div class="chart-title">速度区间分布</div>
            <div class="chart-wrap"><Bar :data="speedBucketBarData" :options="barOptions" /></div>
          </div>

          <div class="chart-card">
            <div class="chart-title">转角区间分布</div>
            <div class="chart-wrap"><Bar :data="angleBucketBarData" :options="barOptions" /></div>
          </div>

          <div class="chart-card chart-card-wide">
            <div class="chart-title">各时段异常趋势</div>
            <div class="chart-wrap"><Line :data="hourTrendLineData" :options="lineOptions" /></div>
          </div>

          <div class="chart-card chart-card-wide">
            <div class="chart-title">异常高发路段 TOP 8</div>
            <div class="chart-wrap"><Bar :data="roadTopBarData" :options="barHorizontalOptions" /></div>
          </div>
        </div>
        <el-empty v-else description="暂无质量检测结果" style="flex: 1; margin-top: 20px;" />
      </template>

      <template v-else>
        <el-table
          v-if="pagedReportData.length"
          :data="pagedReportData"
          style="width: 100%; flex: 1; margin-top: 15px;"
          height="100%"
          border
          stripe
          size="small"
          :row-class-name="tableRowClassName"
          @row-dblclick="handleRowDblClick"
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
              <span>
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
      </template>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip
} from 'chart.js'
import { Bar, Line, Pie } from 'vue-chartjs'
import { getScoreColor } from '../utils/score'

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement
)

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  currentReportFile: { type: Object, default: null },
  reportPage: { type: Number, default: 1 },
  reportPageSize: { type: Number, default: 50 }
})

const emit = defineEmits(['update:modelValue', 'update:reportPage', 'update:reportPageSize', 'row-dblclick'])

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const viewMode = ref('raw')
const contentView = ref('charts')

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

const normalCount = computed(() => currentDetails.value.filter((item) => !item?.is_error).length)

const errorCount = computed(() => Math.max(currentDetails.value.length - normalCount.value, 0))

const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const errorTypeCounts = computed(() => ({
  speed: Number(currentSummary.value?.counts?.speed ?? 0),
  angle: Number(currentSummary.value?.counts?.angle ?? 0),
  time: Number(currentSummary.value?.counts?.time ?? 0),
  integrity: Number(currentSummary.value?.counts?.integrity ?? 0)
}))

const speedBuckets = computed(() => {
  const buckets = [0, 0, 0, 0, 0]
  currentDetails.value.forEach((item) => {
    const speed = toNumber(item?.speed)
    if (speed < 5) buckets[0] += 1
    else if (speed < 10) buckets[1] += 1
    else if (speed < 20) buckets[2] += 1
    else if (speed <= 33.3) buckets[3] += 1
    else buckets[4] += 1
  })
  return buckets
})

const angleBuckets = computed(() => {
  const buckets = [0, 0, 0, 0]
  currentDetails.value.forEach((item) => {
    const angle = Math.abs(toNumber(item?.angle_diff))
    if (angle < 15) buckets[0] += 1
    else if (angle < 30) buckets[1] += 1
    else if (angle < 60) buckets[2] += 1
    else buckets[3] += 1
  })
  return buckets
})

const hourlyErrorTrend = computed(() => {
  const buckets = Array.from({ length: 24 }, () => 0)
  currentDetails.value.forEach((item) => {
    if (!item?.is_error) return
    const date = new Date(item?.timestamp)
    if (Number.isNaN(date.getTime())) return
    buckets[date.getHours()] += 1
  })
  return buckets
})

const roadTopErrors = computed(() => {
  const roadMap = new Map()
  currentDetails.value.forEach((item) => {
    if (!item?.is_error) return
    const roadName = item?.road || '未知路段'
    roadMap.set(roadName, (roadMap.get(roadName) || 0) + 1)
  })
  return Array.from(roadMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
})

const chartPalette = ['#3A86FF', '#FF7B00', '#FF006E', '#8338EC', '#06D6A0', '#118AB2', '#9C6644', '#2A9D8F']

const statusPieData = computed(() => ({
  labels: ['正常', '异常'],
  datasets: [
    {
      data: [normalCount.value, errorCount.value],
      backgroundColor: ['#4CAF50', '#F44336']
    }
  ]
}))

const anomalyTypeBarData = computed(() => ({
  labels: ['速度异常', '急转弯', '时间断裂', '数据缺失'],
  datasets: [
    {
      label: '数量',
      data: [
        errorTypeCounts.value.speed,
        errorTypeCounts.value.angle,
        errorTypeCounts.value.time,
        errorTypeCounts.value.integrity
      ],
      backgroundColor: ['#EF476F', '#F4A261', '#8D99AE', '#E63946']
    }
  ]
}))

const speedBucketBarData = computed(() => ({
  labels: ['< 5', '5-10', '10-20', '20-33.3', '> 33.3'],
  datasets: [
    {
      label: '点位数',
      data: speedBuckets.value,
      backgroundColor: chartPalette
    }
  ]
}))

const angleBucketBarData = computed(() => ({
  labels: ['< 15°', '15°-30°', '30°-60°', '> 60°'],
  datasets: [
    {
      label: '点位数',
      data: angleBuckets.value,
      backgroundColor: ['#00A896', '#02C39A', '#F0C808', '#E4572E']
    }
  ]
}))

const hourTrendLineData = computed(() => ({
  labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
  datasets: [
    {
      label: '每小时异常数',
      data: hourlyErrorTrend.value,
      borderColor: '#FF006E',
      backgroundColor: 'rgba(255, 0, 110, 0.18)',
      fill: true,
      tension: 0.35,
      pointRadius: 2
    }
  ]
}))

const roadTopBarData = computed(() => ({
  labels: roadTopErrors.value.map((item) => item[0]),
  datasets: [
    {
      label: '异常数',
      data: roadTopErrors.value.map((item) => item[1]),
      backgroundColor: chartPalette
    }
  ]
}))

const pieOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' }
  }
}

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false }
  },
  scales: {
    y: { beginAtZero: true }
  }
}

const barHorizontalOptions = {
  ...barOptions,
  indexAxis: 'y'
}

const lineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' }
  },
  scales: {
    y: { beginAtZero: true }
  }
}

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

const handleRowDblClick = (row) => {
  emit('row-dblclick', row)
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

.report-summary-bar {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.content-switch {
  margin-bottom: 12px;
}

.charts-panel {
  flex: 1;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding-right: 4px;
}

.chart-card {
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  min-height: 240px;
}

.chart-card-wide {
  grid-column: span 2;
}

.chart-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.chart-wrap {
  position: relative;
  height: 190px;
}

@media (max-width: 900px) {
  .report-summary-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .charts-panel {
    grid-template-columns: 1fr;
  }

  .chart-card-wide {
    grid-column: auto;
  }
}

.mode-tip {
  font-size: 12px;
  color: #909399;
}
</style>
