<template>
  <el-aside width="400px" class="sidebar">
    <h3 class="title">🚀 轨迹处理平台</h3>

    <div style="margin-bottom: 15px;">
      <el-tag :type="roadStatus ? 'success' : 'danger'" effect="dark" style="width: 100%;">
        <span style="display: inline-flex; align-items: center; gap: 6px;">
          <el-icon><Location /></el-icon>
          <span>{{ roadStatus ? `服务端路网已就绪 (节点:${nodeCount})` : '服务端路网未加载' }}</span>
        </span>
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
          上传轨迹 
        </el-button>
      </template>
    </el-upload>

    <div
      style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; margin-bottom: 5px;"
    >
      <span style="font-weight: bold; color: #666;">轨迹列表 ({{ selectedFileIds.length }} / {{ fileList.length }})</span>
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
            <!-- <el-tag
              v-if="file.qc_summary"
              size="small"
              :type="getScoreType(file.qc_summary.score)"
              style="margin-left: 5px; transform: scale(0.9);"
              effect="plain"
            >
              {{ file.qc_summary.score }}分
            </el-tag> -->
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
      <el-divider content-position="left">数据预处理</el-divider>

      <el-form :model="config" label-width="120px" label-position="top" size="small">
        <el-form-item label="采样点插值">
          <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
            <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
              <el-checkbox
                :model-value="config.interp_enabled && config.interp_mode === 'linear'"
                @change="(val) => onSelectInterpolation('linear', val)"
                style="font-weight: bold;"
              >
                线性插值
              </el-checkbox>
              <div v-if="config.interp_enabled && config.interp_mode === 'linear'" class="algo-desc">当相邻采样点距离超过阈值时，按直线方向插入中间点。</div>
              <div v-if="config.interp_enabled && config.interp_mode === 'linear'" style="margin-top: 5px; padding-left: 20px;">
                <el-tooltip content="当相邻点间距超过该阈值时触发插值。" placement="top" :show-after="400">
                  <div class="mini-label">最大间距阈值(m)</div>
                </el-tooltip>
                <el-input-number
                  v-model="config.interp_max_distance_m"
                  :min="1"
                  size="small"
                  style="width:100%"
                  controls-position="right"
                />
              </div>
            </div>

            <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
              <el-checkbox
                :model-value="config.interp_enabled && config.interp_mode === 'road_network'"
                @change="(val) => onSelectInterpolation('road_network', val)"
                style="font-weight: bold;"
              >
                路网约束插值
              </el-checkbox>
              <div v-if="config.interp_enabled && config.interp_mode === 'road_network'" class="algo-desc">在路网约束下对长间隔采样点进行插值，提升轨迹连贯性。</div>
              <div v-if="config.interp_enabled && config.interp_mode === 'road_network'" style="margin-top: 5px; padding-left: 20px;">
                <el-row :gutter="10">
                  <el-col :span="12">
                    <el-tooltip content="当相邻点间距超过该阈值时触发插值。" placement="top" :show-after="400">
                      <div class="mini-label">最大间距阈值(m)</div>
                    </el-tooltip>
                    <el-input-number
                      v-model="config.interp_max_distance_m"
                      :min="1"
                      size="small"
                      style="width:100%"
                      controls-position="right"
                    />
                  </el-col>
                  <el-col :span="12">
                    <el-tooltip content="每个轨迹点搜索附近候选路段的半径（米）。" placement="top" :show-after="400">
                      <div class="mini-label">候选路段搜索半径(m)</div>
                    </el-tooltip>
                    <el-input-number
                      v-model="config.interp_road_candidate_radius_m"
                      :min="1"
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

        <el-form-item label="停留点聚类算法">
          <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
            <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
              <el-checkbox
                :model-value="config.stop_cluster_algo === 'spatiotemporal'"
                @change="(val) => onSelectStopCluster('spatiotemporal', val)"
                style="font-weight: bold;"
              >
                基于时空阈值
              </el-checkbox>
              <div v-if="config.stop_cluster_algo === 'spatiotemporal'" class="algo-desc">通过空间距离和停留时长阈值识别并聚类停留点序列。</div>
              <div v-if="config.stop_cluster_algo === 'spatiotemporal'" style="margin-top: 5px; padding-left: 20px;">
                <el-row :gutter="10">
                  <el-col :span="12">
                    <el-tooltip content="用于判断聚类的最大空间距离阈值（米）。" placement="top" :show-after="400">
                      <div class="mini-label">距离(m)</div>
                    </el-tooltip>
                    <el-input-number
                      v-model="config.stop_radius"
                      :min="1"
                      size="small"
                      style="width:100%"
                      controls-position="right"
                    />
                  </el-col>
                  <el-col :span="12">
                    <el-tooltip content="用于判断聚类的最小持续时间阈值（秒）。" placement="top" :show-after="400">
                      <div class="mini-label">时间(s)</div>
                    </el-tooltip>
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
              <el-checkbox
                :model-value="config.stop_cluster_algo === 'density'"
                @change="(val) => onSelectStopCluster('density', val)"
                style="font-weight: bold;"
              >
                基于密度
              </el-checkbox>
              <div v-if="config.stop_cluster_algo === 'density'" class="algo-desc">通过邻域密度聚类自动发现停留区域，适合形态不规则的停留场景。</div>
              <div v-if="config.stop_cluster_algo === 'density'" style="margin-top: 5px; padding-left: 20px;">
                <el-row :gutter="10">
                  <el-col :span="12">
                    <el-tooltip content="用于判断聚类的邻域搜索半径（米）。" placement="top" :show-after="400">
                      <div class="mini-label">邻域半径(m)</div>
                    </el-tooltip>
                    <el-input-number
                      v-model="config.stop_eps_m"
                      :min="0.1"
                      :step="0.1"
                      size="small"
                      style="width:100%"
                      controls-position="right"
                    />
                  </el-col>
                  <el-col :span="12">
                    <el-tooltip content="密度聚类形成核心点所需的最小样本数。" placement="top" :show-after="400">
                      <div class="mini-label">最小样本数</div>
                    </el-tooltip>
                    <el-input-number
                      v-model="config.stop_min_samples"
                      :min="1"
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

        <el-form-item label="滤波算法">
          <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
            <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
              <el-checkbox
                :model-value="config.denoise_algo === 'median'"
                @change="(val) => onSelectDenoise('median', val)"
                style="font-weight: bold;"
              >
                中值滤波
              </el-checkbox>
              <div v-if="config.denoise_algo === 'median'" class="algo-desc">通过滑动窗口中间值替换采样点，处理较大偏离的跳点。</div>
              <div v-if="config.denoise_algo === 'median'" style="margin-top: 5px; padding-left: 20px;">
                <el-tooltip content="中值滤波窗口长度，越大越平滑但可能损失细节。" placement="top" :show-after="400">
                  <div class="mini-label">窗口大小</div>
                </el-tooltip>
                <el-input-number
                  v-model="config.median_window"
                  :min="1"
                  size="small"
                  style="width:100%"
                  controls-position="right"
                />
              </div>
            </div>

            <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
              <el-checkbox
                :model-value="config.denoise_algo === 'kalman'"
                @change="(val) => onSelectDenoise('kalman', val)"
                style="font-weight: bold;"
              >
                卡尔曼滤波
              </el-checkbox>
              <div v-if="config.denoise_algo === 'kalman'" class="algo-desc">建立运动模型，基于观测值与预测值估计位置。</div>
              <div v-if="config.denoise_algo === 'kalman'" style="margin-top: 5px; padding-left: 20px;">
                <el-row :gutter="10">
                  <el-col :span="12">
                    <el-tooltip content="卡尔曼滤波测量噪声协方差 R，越大越不信任测量值。" placement="top" :show-after="400">
                      <div class="mini-label">测量噪声协方差R</div>
                    </el-tooltip>
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
                    <el-tooltip content="卡尔曼滤波过程噪声协方差 Q，越大越信任模型变化。" placement="top" :show-after="400">
                      <div class="mini-label">过程噪声协方差Q</div>
                    </el-tooltip>
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

            <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
              <el-checkbox
                :model-value="config.denoise_algo === 'rts'"
                @change="(val) => onSelectDenoise('rts', val)"
                style="font-weight: bold;"
              >
                RTS平滑
              </el-checkbox>
              <div v-if="config.denoise_algo === 'rts'" class="algo-desc">在卡尔曼前向估计基础上逆向修正，基于全量观测序列作出最优估计。</div>
              <div v-if="config.denoise_algo === 'rts'" style="margin-top: 5px; padding-left: 20px;">
                <el-row :gutter="10">
                  <el-col :span="12">
                    <el-tooltip content="RTS 平滑的测量噪声协方差 R，越大越不信任测量值。" placement="top" :show-after="400">
                      <div class="mini-label">测量噪声协方差R</div>
                    </el-tooltip>
                    <el-input-number
                      v-model="config.rts_R"
                      :min="0.01"
                      :step="0.01"
                      size="small"
                      style="width:100%"
                      controls-position="right"
                    />
                  </el-col>
                  <el-col :span="12">
                    <el-tooltip content="RTS 平滑的过程噪声协方差 Q，越大越信任模型变化。" placement="top" :show-after="400">
                      <div class="mini-label">过程噪声协方差Q</div>
                    </el-tooltip>
                    <el-input-number
                      v-model="config.rts_Q"
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

      <el-divider content-position="left">路径匹配</el-divider>

      <el-form :model="config" label-width="120px" label-position="top" size="small">
        <el-form-item label="匹配算法">
          <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
            <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
              <el-checkbox
                :model-value="config.match_algo === 'HMM'"
                @change="(val) => onSelectMatchAlgo('HMM', val)"
                style="font-weight: bold;"
              >
                基于隐马尔可夫模型匹配
              </el-checkbox>
              <div v-if="config.match_algo === 'HMM'" class="algo-desc">基于采样点序列，通过计算发射概率和转移概率，寻找最可能的路段序列。引入 A* 算法补全路径。</div>
              <div v-if="config.match_algo === 'HMM'" style="margin-top: 5px; padding-left: 20px;">
                <el-row :gutter="10">
                  <el-col :span="12">
                    <el-tooltip content="单个采样点允许匹配到路段的最大距离。" placement="top" :show-after="400">
                      <div class="mini-label">最大候选距离（m）</div>
                    </el-tooltip>
                    <el-input-number v-model="config.hmm_max_dist" :min="1" size="small" style="width:100%" />
                  </el-col>
                  <el-col :span="12">
                    <el-tooltip content="对观测的信任程度，越大越不信任观测值。" placement="top" :show-after="400">
                      <div class="mini-label">观测噪声标准差（m）</div>
                    </el-tooltip>
                    <el-input-number v-model="config.hmm_obs_noise" :min="0" size="small" style="width:100%" />
                  </el-col>
                  <el-col :span="12" style="margin-top: 8px;">
                    <el-tooltip content="对非发射状态的信任程度，通常略大于观测噪声标准差。" placement="top" :show-after="400">
                      <div class="mini-label">非发射噪声标准差（m）</div>
                    </el-tooltip>
                    <el-input-number v-model="config.hmm_obs_noise_ne" :min="0" size="small" style="width:100%" />
                  </el-col>
                  <el-col :span="12" style="margin-top: 8px;">
                    <el-tooltip content="每个时刻最多保留多少个候选状态，越大精度越高但计算越慢。" placement="top" :show-after="400">
                      <div class="mini-label">候选路径格网最大宽度</div>
                    </el-tooltip>
                    <el-input-number v-model="config.hmm_max_lattice_width" :min="1" size="small" style="width:100%" />
                  </el-col>
                </el-row>
              </div>
            </div>

            <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
              <el-checkbox
                :model-value="config.match_algo === 'IVMM'"
                @change="(val) => onSelectMatchAlgo('IVMM', val)"
                style="font-weight: bold;"
              >
                交互式投票匹配
              </el-checkbox>
              <div v-if="config.match_algo === 'IVMM'" class="algo-desc">综合距离与方向等多因素投票评分，选择全局一致性更高的匹配路径。</div>
              <div v-if="config.match_algo === 'IVMM'" style="margin-top: 5px; padding-left: 20px;">
                <el-row :gutter="10">
                  <el-col :span="12">
                    <el-tooltip content="单个采样点允许匹配到路段的最大距离。" placement="top" :show-after="400">
                      <div class="mini-label">最大候选距离（m）</div>
                    </el-tooltip>
                    <el-input-number v-model="config.ivmm_search_radius" :min="1" size="small" style="width:100%" />
                  </el-col>
                  <el-col :span="12">
                    <el-tooltip content="IVMM 空间得分权重，范围 0~1。" placement="top" :show-after="400">
                      <div class="mini-label">空间得分权重</div>
                    </el-tooltip>
                    <el-input-number v-model="config.ivmm_w_dist" :min="0" :max="1" :step="0.1" size="small" style="width:100%" @change="onIvmmDistChange" />
                  </el-col>
                  <el-col :span="12" style="margin-top: 8px;">
                    <el-tooltip content="IVMM 方向得分权重，范围 0~1。" placement="top" :show-after="400">
                      <div class="mini-label">方向得分权重</div>
                    </el-tooltip>
                    <el-input-number v-model="config.ivmm_w_heading" :min="0" :max="1" :step="0.1" size="small" style="width:100%" @change="onIvmmHeadingChange" />
                  </el-col>
                  <el-col :span="12" style="margin-top: 8px;">
                    <el-tooltip content="IVMM 转移约束参数权重，范围 0~1。" placement="top" :show-after="400">
                      <div class="mini-label">转移约束权重</div>
                    </el-tooltip>
                    <el-input-number v-model="config.ivmm_w_transition" :min="0" :max="1" :step="0.1" size="small" style="width:100%" />
                  </el-col>
                </el-row>
              </div>
            </div>

            <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
              <el-checkbox
                :model-value="config.match_algo === 'STMM'"
                @change="(val) => onSelectMatchAlgo('STMM', val)"
                style="font-weight: bold;"
              >
                STMM匹配
              </el-checkbox>
              <div v-if="config.match_algo === 'STMM'" class="algo-desc">基于观测距离与转移一致性联合评分进行状态转移匹配。</div>
              <div v-if="config.match_algo === 'STMM'" style="margin-top: 5px; padding-left: 20px;">
                <el-row :gutter="10">
                  <el-col :span="12">
                    <el-tooltip content="单个采样点允许匹配到路段的最大距离。" placement="top" :show-after="400">
                      <div class="mini-label">候选搜索半径（m）</div>
                    </el-tooltip>
                    <el-input-number v-model="config.stmm_search_radius" :min="1" size="small" style="width:100%" />
                  </el-col>
                  <el-col :span="12">
                    <el-tooltip content="STMM 观测距离分权重，范围 0~1。" placement="top" :show-after="400">
                      <div class="mini-label">观测距离分权重</div>
                    </el-tooltip>
                    <el-input-number v-model="config.stmm_w_dist" :min="0" :max="1" :step="0.1" size="small" style="width:100%" />
                  </el-col>
                  <el-col :span="12" style="margin-top: 8px;">
                    <el-tooltip content="STMM 转移一致性权重，范围 0~1。" placement="top" :show-after="400">
                      <div class="mini-label">转移一致性权重</div>
                    </el-tooltip>
                    <el-input-number v-model="config.stmm_w_transition" :min="0" :max="1" :step="0.1" size="small" style="width:100%" />
                  </el-col>
                </el-row>
              </div>
            </div>

            <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
              <el-checkbox
                :model-value="config.match_algo === 'Simple'"
                @change="(val) => onSelectMatchAlgo('Simple', val)"
                style="font-weight: bold;"
              >
                最近邻吸附（测试）
              </el-checkbox>
              <div v-if="config.match_algo === 'Simple'" class="algo-desc">将每个点吸附到最近道路，用于测试和对比。</div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="匹配结果选项">
          <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
            <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
              <el-checkbox v-model="config.enable_mapping" style="font-weight: bold;">
                显示映射关系
              </el-checkbox>
              <div v-if="config.enable_mapping" class="algo-desc">根据 raw_index 用褐色细虚线连接原始点与匹配点，支持一对一与一对多关系展示。</div>
            </div>
          </div>
        </el-form-item>
        <!-- <el-form-item label="路径补全">
          <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
            <div style="border: 1px solid #eee; padding: 10px; border-radius: 4px;">
              <el-checkbox v-model="config.astar_fill" style="font-weight: bold;">
                🧭 A*路径规划
              </el-checkbox>
            </div>
          </div>
        </el-form-item> -->
      </el-form>
    </div>

    <div style="margin-top: 20px;">
      <el-button
        type="success"
        size="large"
        style="width: 100%; font-weight: bold;"
        @click="onStartBatch"
        :loading="loading"
        :disabled="selectedFileIds.length === 0 || (!config.interp_enabled && !config.stop_cluster_algo && !config.denoise_algo && !config.match_algo)"
      >
        <span v-if="selectedFileIds.length > 0">⚡ 批量处理 ({{ selectedFileIds.length }})</span>
        <span v-else>未选中轨迹</span>
      </el-button>
    </div>
  </el-aside>
</template>

<script setup>
const props = defineProps({
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

const onSelectInterpolation = (mode, checked) => {
  if (checked) {
    props.config.interp_enabled = true
    props.config.interp_mode = mode
  } else if (props.config.interp_mode === mode) {
    props.config.interp_enabled = false
    props.config.interp_mode = 'linear'
  }
}

const normalizeWeight = (value) => {
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return 0
  const clamped = Math.min(1, Math.max(0, numeric))
  return Math.round(clamped * 10) / 10
}

const syncIvmmPairFromDist = () => {
  const dist = normalizeWeight(props.config.ivmm_w_dist)
  props.config.ivmm_w_dist = dist
  props.config.ivmm_w_heading = normalizeWeight(1 - dist)
}

const syncIvmmPairFromHeading = () => {
  const heading = normalizeWeight(props.config.ivmm_w_heading)
  props.config.ivmm_w_heading = heading
  props.config.ivmm_w_dist = normalizeWeight(1 - heading)
}

const onIvmmDistChange = (value) => {
  props.config.ivmm_w_dist = value
  syncIvmmPairFromDist()
}

const onIvmmHeadingChange = (value) => {
  props.config.ivmm_w_heading = value
  syncIvmmPairFromHeading()
}

const onSelectStopCluster = (type, checked) => {
  if (checked) {
    // 二选一
    props.config.stop_cluster_algo = type
  } else if (props.config.stop_cluster_algo === type) {
    props.config.stop_cluster_algo = null
  }
}

const onSelectDenoise = (type, checked) => {
  if (checked) {
    // 三选一
    props.config.denoise_algo = type
  } else if (props.config.denoise_algo === type) {
    props.config.denoise_algo = null
  }
}

const onSelectMatchAlgo = (type, checked) => {
  if (checked) {
    // 三选一
    props.config.match_algo = type
    if (type === 'IVMM') {
      syncIvmmPairFromDist()
    }
  } else if (props.config.match_algo === type) {
    props.config.match_algo = null
  }
}
</script>

<style scoped>
.config-panel {
  height: 400px;
  overflow-y: auto;
}

.algo-desc {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
  font-style: italic;
}
</style>
