export const getScoreColor = (score) => {
  if (score >= 90) return '#67C23A'
  if (score >= 70) return '#E6A23C'
  return '#F56C6C'
}

export const getScoreType = (score) => {
  if (score >= 90) return 'success'
  if (score >= 70) return 'warning'
  return 'danger'
}
