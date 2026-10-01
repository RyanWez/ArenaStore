import { useAuth } from '~/composables/useAuth'

export default defineNuxtRouteMiddleware(async (to) => {
  const { token, user, fetchUser } = useAuth()

  const isLoginPage = to.path === '/login'

  // If user has a token but user profile isn't in memory yet, fetch it
  if (token.value && !user.value) {
    await fetchUser()
  }

  // If visiting /login while already authenticated, redirect to dashboard
  if (isLoginPage) {
    if (token.value && user.value) {
      return navigateTo('/')
    }
    return
  }

  // For all other pages, require authentication
  if (!token.value || !user.value) {
    return navigateTo('/login')
  }
})
