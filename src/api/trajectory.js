import request from '../utils/request'

export const getRoadNetworkStatus = () => request.get('/road_network/status')

export const uploadTrajectory = (formData) =>
  request.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })

export const processTrajectory = (payload) => request.post('/process', payload)

export const getRoadsNearby = (params) =>
  request.get('/road_network/nearby', { params })
