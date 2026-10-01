import api from '../api/api'

export async function signIn(credentials) {
  const { data } = await api.post('/auth/login', credentials)
  return data.data
}

export async function signUp(credentials) {
  const { data } = await api.post('/auth/register', credentials)
  return data.data
}
