import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL ?? '') as string
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '') as string
export const INVITE_CODE = (import.meta.env.VITE_INVITE_CODE ?? '520') as string
export const ADMIN_CODE = (import.meta.env.VITE_ADMIN_CODE ?? 'adminMao') as string
export const APP_TITLE = (import.meta.env.VITE_APP_TITLE ?? '今天吃什么') as string
/** 我的昵称默认值（可在「成员」页里改，存在 app_settings 表） */
export const ADMIN_NAME = (import.meta.env.VITE_ADMIN_NAME ?? '我') as string

export const configured = Boolean(url && anonKey)

export const supabase: SupabaseClient = createClient(
  url || 'http://localhost:54321',
  anonKey || 'public-anon-key',
  { auth: { persistSession: false } }
)
