import { useEffect, useRef, useState } from 'react'
import Avatar from './Avatar'
import { uploadAvatar } from '../lib/db'
import { sizeText } from '../lib/image'
import { useToast } from './Toast'

type Props = {
  open: boolean
  title: string
  /** 当前昵称 */
  name: string
  /** 当前头像 */
  avatarUrl: string
  fallbackEmoji?: string
  hint?: string
  onSaveAvatar: (url: string | null) => Promise<void>
  onSaveName: (name: string) => Promise<void>
  onClose: () => void
}

/**
 * 个人资料左侧抽屉：面板从左侧滑入，主页面（App.tsx 的 .app-shell）右移缩小。
 * 点击被推到右侧的主页面（由 scrim 承接）即复原，符合 iOS 抽屉的直觉。
 */
export default function ProfileSheet({
  open,
  title,
  name,
  avatarUrl,
  fallbackEmoji = '👧',
  hint,
  onSaveAvatar,
  onSaveName,
  onClose,
}: Props) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [shownAvatar, setShownAvatar] = useState(avatarUrl)

  // 常驻挂载才能播滑入/滑出动画：每次打开时把草稿同步成最新值
  useEffect(() => {
    if (!open) return
    setDraftName(name)
    setShownAvatar(avatarUrl)
  }, [open, name, avatarUrl])

  // 抽屉展开时锁住页面滚动，避免「推动主页面」时背景还在滚
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const pick = async (file: File) => {
    setUploading(true)
    try {
      const url = await uploadAvatar(file)
      await onSaveAvatar(url)
      setShownAvatar(url)
      toast.show('头像已更新 ✨')
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removeAvatar = async () => {
    setUploading(true)
    try {
      await onSaveAvatar(null)
      setShownAvatar('')
      toast.show('已恢复默认头像')
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setUploading(false)
    }
  }

  const saveName = async () => {
    const n = draftName.trim()
    if (!n) return toast.show('给自己起个昵称吧～', 'err')
    if (n === name) return
    setSaving(true)
    try {
      await onSaveName(n)
      toast.show('昵称已更新，好友那边立刻生效')
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* 点击主页面（被推开的区域）复原 */}
      <div className={`drawer-scrim ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden />
      <aside className={`drawer ${open ? 'is-open' : ''}`} role="dialog" aria-modal={open} aria-label={title}>
        <div className="flex items-center justify-between border-b border-brand-100 px-4 py-3">
          <h2 className="card-title">{title}</h2>
          <button className="btn-ghost h-8 w-8 rounded-full p-0 text-sm" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          <div className="flex flex-col items-center gap-2">
            <Avatar url={shownAvatar} emoji={fallbackEmoji} size={88} anim={false} />
            <p className="text-sm font-semibold text-slate-700">{draftName || name || '还没有昵称'}</p>
            {uploading && <p className="text-2xs text-slate-400">上传中…</p>}
          </div>

          {hint && <p className="mt-3 text-center text-2xs leading-relaxed text-slate-400">{hint}</p>}

          <div className="mt-5 space-y-2">
            <label className={`btn-primary w-full ${uploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
              {uploading ? '处理中…' : '从相册选一张'}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void pick(f)
                }}
              />
            </label>
            {shownAvatar && (
              <button className="btn-ghost w-full text-xs" disabled={uploading} onClick={removeAvatar}>
                移除头像，用默认表情
              </button>
            )}
          </div>

          <div className="mt-6">
            <label className="mb-1 block text-xs text-slate-500">我的昵称</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="好友看到的名字"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void saveName()
                  }
                }}
              />
              <button className="btn-primary shrink-0 text-xs" disabled={saving || draftName.trim() === name} onClick={saveName}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>

          <p className="mt-4 text-2xs leading-relaxed text-slate-400">
            头像会自动压缩到 {sizeText(60 * 1024)} 以内再上传；昵称改完好友那边刷新就能看到。
          </p>
        </div>

        <div className="border-t border-brand-100 px-4 py-3">
          <button className="btn-soft w-full text-xs" onClick={onClose}>
            关闭
          </button>
        </div>
      </aside>
    </>
  )
}
