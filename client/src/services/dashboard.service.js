import api from '../api/api'

export async function getDashboardStats() {
  const { data } = await api.get('/dashboard/stats')
  return data.data
}

export async function getRecentActivity() {
  const { data } = await api.get('/dashboard/activity')
  return data.data
}
