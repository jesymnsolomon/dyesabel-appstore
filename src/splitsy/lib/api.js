import { hasCloud } from './supabase'
import { cloudApi } from './api.cloud'
import { demoApi } from './api.demo'

/** Cloud (Supabase) when keys are set in .env, otherwise on-device Demo mode. */
export const api = hasCloud ? cloudApi : demoApi
