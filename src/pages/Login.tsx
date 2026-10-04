import { useState } from 'react'
import { APP_TITLE, ADMIN_CODE, INVITE_CODE } from '../lib/supabase'
import { useSession } from '../store/session'

export default function Login() {
  const { enter } = useSession()
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')

  const submit = () => {
    if (!enter(code)) setErr('邀请码不对哦，再问问他～')
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-10">
      <div className="text-center">
        <div className="text-5xl">🍱</div>
        <h1 className="mt-3 text-xl font-semibold text-brand-600">{APP_TITLE}</h1>
        <p className="mt-1 text-sm text-slate-500">点菜下单 · 一日三餐记录</p>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-500">邀请码</label>
          <input
            className="input"
            value={code}
            placeholder="输入两个人约定的邀请码"
            onChange={(e) => {
              setCode(e.target.value)
              setErr('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>

        {err && <p className="text-xs text-rose-500">{err}</p>}

        <button className="btn-primary w-full py-2.5" onClick={submit}>
          进 入
        </button>

        {import.meta.env.DEV && (
          <p className="text-center text-[11px] text-slate-400">
            开发模式：邀请码 {INVITE_CODE} ／ 管理口令 {ADMIN_CODE}
          </p>
        )}
      </div>

      <p className="px-2 text-center text-[11px] leading-relaxed text-slate-400">
        手机浏览器打开后，用「添加到主屏幕」即可像 APP 一样使用。
      </p>
    </div>
  )
}
