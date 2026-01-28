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
      <div><span style="background:red;width:8px;height:8px;border-radius:50%;display:inline-block;vertical-align:middle"></span> 原始采样点</div>
      <div><span style="background:blue;width:8px;height:8px;border-radius:50%;display:inline-block;vertical-align:middle"></span> 预处理结果</div>
      <div><span style="background:green;width:20px;height:5px;display:inline-block;vertical-align:middle"></span> 路径匹配</div>
    `
    return div
  }
  legend.addTo(mapInstance.value)
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
      weight: 5,
      opacity: 0.8
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

  layer.addTo(mapInstance.value)
  layerStore.value[fileId][type] = layer

  if (type !== 'raw') {
    mapInstance.value.fitBounds(layer.getBounds())
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
  ['raw', 'processed', 'matched'].forEach((type) => {
    if (layerStore.value[fileId][type]) {
      mapInstance.value.removeLayer(layerStore.value[fileId][type])
    }
  })
  delete layerStore.value[fileId]
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
  clearSubLayers,
  clearFileLayers,
  clearRoadLayers,
  drawRoadSegments,
  fitToPoints
})
</script>
