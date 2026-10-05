import { useState } from 'react'
import { APP_TITLE, configured, probeSupabase } from '../lib/supabase'
import { useSession } from '../store/session'

export default function Login() {
  const { enter } = useSession()
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  /** 出错时才做的连通性自检：把「连不上」说清楚 */
  const [probe, setProbe] = useState<string>('')
  const [probing, setProbing] = useState(false)

  const runProbe = async () => {
    setProbing(true)
    setProbe('正在自检…')
    try {
      const r = await probeSupabase()
      setProbe(r.detail)
    } finally {
      setProbing(false)
    }
  }

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setErr('')
    setProbe('')
    try {
      const ok = await enter(code)
      if (!ok) setErr('邀请码不对哦，再问问他～')
    } catch (e) {
      const msg = (e as Error).message || '网络不太好，稍后再试～'
      setErr(msg)
      // 网络类错误顺手跑一次自检，给出更具体的排查方向
      if (/连不上|Failed to fetch|超时|网络|没有读到/.test(msg)) void runProbe()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md animate-page flex-col justify-center gap-4 px-6 py-10">
      <div className="text-center">
        <div className="animate-float text-5xl">🍱</div>
        <h1 className="mt-3 text-xl font-semibold text-brand-600">{APP_TITLE}</h1>
        <p className="mt-1 text-sm text-slate-500">点菜下单 · 一日三餐记录</p>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-500">邀请码</label>
          <input
            className="input"
            value={code}
            placeholder="输入你的邀请码"
            onChange={(e) => {
              setCode(e.target.value)
              setErr('')
              setProbe('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>

        {err && (
          <div className="animate-fade rounded-xl bg-rose-50 p-2.5">
            <p className="whitespace-pre-line text-xs leading-relaxed text-rose-600">{err}</p>
            <div className="mt-2 flex gap-2">
              <button className="btn-ghost px-2 py-1 text-[11px]" disabled={probing || busy} onClick={() => void submit()}>
                重试
              </button>
              <button className="btn-ghost px-2 py-1 text-[11px]" disabled={probing} onClick={() => void runProbe()}>
                {probing ? '自检中…' : '网络自检'}
              </button>
            </div>
          </div>
        )}

        {probe && <p className="animate-fade whitespace-pre-line text-[11px] leading-relaxed text-slate-500">🔍 {probe}</p>}

        <button className="btn-primary w-full py-2.5" disabled={busy} onClick={submit}>
          {busy ? '进入中…' : '进 入'}
        </button>

        {/* {configured && import.meta.env.DEV && (
          <p className="text-center text-[11px] text-slate-400">
            开发模式：邀请码 {INVITE_CODE} ／ 管理口令 {ADMIN_CODE}
          </p>
        )} */}
        {!configured && (
          <p className="whitespace-pre-line rounded-xl bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-700">
            还没连上 Supabase：复制 .env.example 为 .env 并填入 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 后重启 npm run
            dev。
          </p>
        )}
      </div>

      <p className="px-2 text-center text-[11px] leading-relaxed text-slate-400">
        手机浏览器打开后，用「添加到主屏幕」即可像 APP 一样使用。
      </p>
    </div>
  )
}
