<template>
  <el-dialog v-model="dialogVisible" :title="title" width="900px" align-center destroy-on-close>
    <div v-if="currentReportFile" style="height: 600px; display: flex; flex-direction: column;">
      <div class="report-summary-bar">
        <el-statistic
          title="总体得分"
          :value="currentReportFile.qc_summary.score"
          :value-style="{ color: getScoreColor(currentReportFile.qc_summary.score), fontWeight: 'bold' }"
        />
        <el-divider direction="vertical" style="height: 40px;" />
        <el-statistic title="速度异常" :value="currentReportFile.qc_summary.counts.speed" value-style="color: #F56C6C" />
        <el-statistic title="急转弯" :value="currentReportFile.qc_summary.counts.angle" value-style="color: #E6A23C" />
        <el-statistic title="时间断裂" :value="currentReportFile.qc_summary.counts.time" value-style="color: #909399" />
        <el-statistic title="数据缺失" :value="currentReportFile.qc_summary.counts.integrity" value-style="color: #F56C6C" />
      </div>

      <el-table
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

        <el-table-column prop="lat" label="纬度" width="80">
          <template #default="scope">{{ Number(scope.row.lat).toFixed(6) }}</template>
        </el-table-column>
        <el-table-column prop="lon" label="经度" width="80">
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
            <el-tag v-else type="danger" size="small" effect="light">❌ {{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top: 15px; display: flex; justify-content: flex-end;">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100, 200]"
          :total="currentReportFile.qc_details ? currentReportFile.qc_details.length : 0"
          layout="total, sizes, prev, pager, next, jumper"
          background
        />
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
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

const pagedReportData = computed(() => {
  if (!props.currentReportFile || !props.currentReportFile.qc_details) return []
  const start = (props.reportPage - 1) * props.reportPageSize
  const end = start + props.reportPageSize
  return props.currentReportFile.qc_details.slice(start, end)
})

const tableRowClassName = ({ row }) => (row.is_error ? 'warning-row' : '')
</script>
