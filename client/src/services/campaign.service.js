import api from '../api/api'

export async function getCampaigns() {
  const { data } = await api.get('/campaigns')
  return data.data
}

export async function getCampaign(id) {
  const { data } = await api.get(`/campaigns/${id}`)
  return data.data
}

export async function getCampaignStats(id) {
  const { data } = await api.get(`/campaigns/${id}/stats`)
  return data.data
}

export async function createCampaign(payload) {
  const { data } = await api.post('/campaigns', payload)
  return data.data
}

export async function updateCampaign(id, payload) {
  const { data } = await api.put(`/campaigns/${id}`, payload)
  return data.data
}

export async function removeCampaign(id) {
  const { data } = await api.delete(`/campaigns/${id}`)
  return data.data
}

export async function runCampaignAction(id, action) {
  const { data } = await api.post(`/campaigns/${id}/${action}`)
  return data.data
}

export async function validateRecipients(file, selectedDepartments) {
  const body = new FormData()
  body.append('file', file)
  if (selectedDepartments !== undefined) body.append('selectedDepartments', JSON.stringify(selectedDepartments))
  const { data } = await api.post('/campaigns/recipients/validate', body)
  return data.data
}

export async function uploadRecipients(id, file, onUploadProgress, allowInvalid = false, selectedDepartments) {
  const body = new FormData()
  body.append('allowInvalid', String(allowInvalid))
  body.append('file', file)
  if (selectedDepartments !== undefined) body.append('selectedDepartments', JSON.stringify(selectedDepartments))
  const { data } = await api.post(`/campaigns/${id}/recipients/upload`, body, {
    onUploadProgress: (event) => {
      if (event.total) onUploadProgress(Math.round((event.loaded * 100) / event.total))
    },
  })
  return data.data
}

export async function getCampaignRecipients(id, params) {
  const { data } = await api.get(`/campaigns/${id}/recipients`, { params })
  return data.data
}

export async function getCampaignEventsToken(id) {
  const { data } = await api.post(`/campaigns/${id}/events-token`)
  return data.data.token
}