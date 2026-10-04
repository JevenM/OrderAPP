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

export type ProbeResult = {
  ok: boolean
  /** 一句话结论，直接给用户看 */
  detail: string
}

/**
 * 连通性自检：登录失败时用来把「连不上」说清楚。
 * 直接打 REST 根地址（不需要任何表权限），比看原有的报错信息准确得多。
 */
export async function probeSupabase(timeoutMs = 8000): Promise<ProbeResult> {
  if (!configured) {
    return {
      ok: false,
      detail:
        '没有读到 Supabase 配置：本地要建 .env（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）并重启 npm run dev；' +
        '部署站点则要在仓库 Settings → Secrets 里配上同名变量后重新构建，Vite 的环境变量只在构建那一刻注入。',
    }
  }

  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: ctrl.signal,
    })
    if (res.ok) return { ok: true, detail: `Supabase 正常（HTTP ${res.status}）` }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, detail: `Supabase 拒绝了这个 key（HTTP ${res.status}）：anon / publishable key 填错或已失效，去 Supabase → Settings → API 重新复制` }
    }
    if (res.status === 404) {
      return { ok: false, detail: `Supabase 找不到这个地址（HTTP 404）：项目多半被暂停或删除了，去 Supabase 控制台 Restore / 换一个新项目的 URL` }
    }
    return { ok: false, detail: `Supabase 返回 HTTP ${res.status}，检查 VITE_SUPABASE_URL 是否正确` }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, detail: `等了 ${Math.round(timeoutMs / 1000)} 秒还没响应：网络被限速 / 被拦截，换网络或关掉代理试试` }
    }
    return {
      ok: false,
      detail: navigator.onLine
        ? `请求根本没发出去（浏览器报 Failed to fetch）：常见于① VPN/代理拦截 ② HTTPS 页面请求了 http 地址 ③ 浏览器插件拦截`
        : '当前设备处于离线状态，先连上网络再试',
    }
  } finally {
    window.clearTimeout(timer)
  }
}
