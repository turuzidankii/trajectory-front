<template>
  <div ref="mapEl" class="map-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const mapEl = ref(null)
const mapInstance = ref(null)
const roadLayerGroup = ref(null)
const layerStore = ref({})
const visibility = ref({
  raw: true,
  processed: true,
  matched: true
})

const initMap = () => {
  if (!mapEl.value) return
  mapInstance.value = L.map(mapEl.value).setView([39.9, 116.4], 11)

  L.tileLayer(
    'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    {
      subdomains: ['1', '2', '3', '4'],
      attribution: '© 高德地图',
      minZoom: 1,
      maxZoom: 19
    }
  ).addTo(mapInstance.value)

  roadLayerGroup.value = L.layerGroup().addTo(mapInstance.value)
  addLegend()
}

const addLegend = () => {
  if (!mapInstance.value) return
  const legend = new L.Control({ position: 'bottomright' })
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'info legend')
    div.style.cssText =
      'background: white; padding: 10px; border-radius: 4px; box-shadow: 0 0 10px rgba(0,0,0,0.1); font-size: 12px;'
    div.innerHTML = `
      <div style="font-weight:bold;margin-bottom:5px;border-bottom:1px solid #eee;padding-bottom:3px">图例说明</div>
      <div><span style="background:#003366;width:20px;height:1px;display:inline-block;vertical-align:middle;opacity:0.6"></span> 基础路网</div>
      <div class="legend-item" data-type="raw"><span style="background:red;width:8px;height:8px;border-radius:50%;display:inline-block;vertical-align:middle"></span> 原始采样点</div>
      <div class="legend-item" data-type="processed"><span style="background:blue;width:8px;height:8px;border-radius:50%;display:inline-block;vertical-align:middle"></span> 预处理结果</div>
      <div class="legend-item" data-type="matched"><span style="background:green;width:20px;height:5px;display:inline-block;vertical-align:middle"></span> 路径匹配</div>
    `
    L.DomEvent.disableClickPropagation(div)
    const items = div.querySelectorAll('.legend-item')
    items.forEach((item) => {
      item.classList.toggle('is-hidden', !visibility.value[item.dataset.type])
      item.addEventListener('click', () => {
        const type = item.dataset.type
        const next = !visibility.value[type]
        visibility.value[type] = next
        item.classList.toggle('is-hidden', !next)
        setTrajectoryVisibility(type, next)
      })
    })
    return div
  }
  legend.addTo(mapInstance.value)
}

const setTrajectoryVisibility = (type, visible) => {
  if (!ensureMap()) return
  Object.keys(layerStore.value).forEach((fileId) => {
    const layer = layerStore.value[fileId]?.[type]
    if (!layer) return
    if (visible) {
      if (!mapInstance.value.hasLayer(layer)) {
        layer.addTo(mapInstance.value)
      }
    } else if (mapInstance.value.hasLayer(layer)) {
      mapInstance.value.removeLayer(layer)
    }
  })

  if (type === 'matched') {
    ;['matchedActive', 'matchedMarker'].forEach((subType) => {
      Object.keys(layerStore.value).forEach((fileId) => {
        const layer = layerStore.value[fileId]?.[subType]
        if (!layer) return
        if (visible) {
          if (!mapInstance.value.hasLayer(layer)) {
            layer.addTo(mapInstance.value)
          }
        } else if (mapInstance.value.hasLayer(layer)) {
          mapInstance.value.removeLayer(layer)
        }
      })
    })
  }
}

const ensureMap = () => mapInstance.value

const clearRoadLayers = () => {
  if (roadLayerGroup.value) roadLayerGroup.value.clearLayers()
}

const drawRoadSegments = (segments) => {
  if (!ensureMap() || !segments.length) return
  clearRoadLayers()
  L.polyline(segments, {
    color: '#003366',
    weight: 1.2,
    opacity: 0.5,
    interactive: false
  }).addTo(roadLayerGroup.value)
}

const drawTrajectory = (fileId, points, type, color) => {
  if (!ensureMap() || points.length === 0) return
  if (!layerStore.value[fileId]) layerStore.value[fileId] = {}

  if (layerStore.value[fileId][type]) {
    mapInstance.value.removeLayer(layerStore.value[fileId][type])
  }

  let layer
  if (type === 'matched') {
    const latlngs = points.map((p) => [p.lat, p.lon])
    layer = L.polyline(latlngs, {
      color: color,
      weight: 4,
      opacity: 0.7
    })
  } else {
    layer = L.featureGroup()
    points.forEach((p) => {
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

  if (visibility.value[type] !== false) {
    layer.addTo(mapInstance.value)
  }
  layerStore.value[fileId][type] = layer

  if (type !== 'raw') {
    mapInstance.value.fitBounds(layer.getBounds())
  }
}

const drawMatchedTimeline = (fileId, points, currentIndex, options = {}) => {
  if (!ensureMap() || points.length === 0) return
  if (!visibility.value.matched) return
  if (!layerStore.value[fileId]) layerStore.value[fileId] = {}

  const activeColor = options.activeColor || '#00C853'
  const tailLength = Number.isFinite(options.tailLength) ? options.tailLength : 8

  if (layerStore.value[fileId].matchedActive) {
    mapInstance.value.removeLayer(layerStore.value[fileId].matchedActive)
    delete layerStore.value[fileId].matchedActive
  }
  if (layerStore.value[fileId].matchedMarker) {
    mapInstance.value.removeLayer(layerStore.value[fileId].matchedMarker)
    delete layerStore.value[fileId].matchedMarker
  }

  const safeIndex = Math.min(Math.max(currentIndex, 0), points.length - 1)
  const start = Math.max(0, safeIndex - tailLength)
  const tailPoints = points.slice(start, safeIndex + 1)

  if (tailPoints.length >= 2) {
    const tailLatlngs = tailPoints.map((p) => [p.lat, p.lon])
    layerStore.value[fileId].matchedActive = L.polyline(tailLatlngs, {
      color: activeColor,
      weight: 6,
      opacity: 0.95
    }).addTo(mapInstance.value)
  } else if (tailPoints.length === 1) {
    const [p] = tailPoints
    layerStore.value[fileId].matchedActive = L.circleMarker([p.lat, p.lon], {
      radius: 5,
      fillColor: activeColor,
      color: '#fff',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(mapInstance.value)
  }

  const currentPoint = points[safeIndex]
  if (currentPoint) {
    layerStore.value[fileId].matchedMarker = L.circleMarker(
      [currentPoint.lat, currentPoint.lon],
      {
        radius: 6,
        fillColor: activeColor,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      }
    ).addTo(mapInstance.value)
  }
}

const clearTimelineLayers = (fileId) => {
  if (!layerStore.value[fileId]) return
  if (layerStore.value[fileId].matchedActive) {
    mapInstance.value.removeLayer(layerStore.value[fileId].matchedActive)
    delete layerStore.value[fileId].matchedActive
  }
  if (layerStore.value[fileId].matchedMarker) {
    mapInstance.value.removeLayer(layerStore.value[fileId].matchedMarker)
    delete layerStore.value[fileId].matchedMarker
  }
}

const clearSubLayers = (fileId, types) => {
  if (!layerStore.value[fileId]) return
  types.forEach((type) => {
    if (layerStore.value[fileId][type]) {
      mapInstance.value.removeLayer(layerStore.value[fileId][type])
      delete layerStore.value[fileId][type]
    }
  })
}

const clearFileLayers = (fileId) => {
  if (!layerStore.value[fileId]) return
  ['raw', 'processed', 'matched', 'matchedActive', 'matchedMarker'].forEach((type) => {
    if (layerStore.value[fileId][type]) {
      mapInstance.value.removeLayer(layerStore.value[fileId][type])
    }
  })
  delete layerStore.value[fileId]
}

const clearAllFileLayers = () => {
  Object.keys(layerStore.value).forEach((fileId) => {
    clearFileLayers(fileId)
  })
}

const fitToPoints = (points) => {
  if (!ensureMap() || points.length === 0) return
  const lats = points.map((p) => p.lat)
  const lons = points.map((p) => p.lon)
  mapInstance.value.fitBounds(
    [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)]
    ],
    { padding: [50, 50] }
  )
}

onMounted(() => {
  initMap()
})

onBeforeUnmount(() => {
  if (mapInstance.value) {
    mapInstance.value.remove()
    mapInstance.value = null
  }
})

defineExpose({
  drawTrajectory,
  drawMatchedTimeline,
  clearTimelineLayers,
  clearSubLayers,
  clearFileLayers,
  clearAllFileLayers,
  clearRoadLayers,
  drawRoadSegments,
  fitToPoints
})
</script>

<style>
.legend .legend-item {
  cursor: pointer;
  user-select: none;
  margin-top: 4px;
}

.legend .legend-item.is-hidden {
  opacity: 0.4;
  text-decoration: line-through;
}
</style>
