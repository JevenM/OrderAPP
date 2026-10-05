import { useRef, useState } from 'react'
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

/** 个人资料弹层：改头像 + 改昵称 */
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

  // 由调用方用 {open && <ProfileSheet/>} 挂载，每次打开都是新实例，昵称草稿自然是最新的
  if (!open) return null

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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-md animate-slide-up overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-brand-600">{title}</h3>
        {hint && <p className="mt-1 text-xs leading-relaxed text-slate-400">{hint}</p>}

        <div className="mt-5 flex flex-col items-center gap-2">
          <Avatar url={shownAvatar} emoji={fallbackEmoji} size={96} anim={false} />
          {uploading && <p className="text-xs text-slate-400">上传中…</p>}
        </div>

        <div className="mt-4 space-y-2">
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

        <div className="mt-5">
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

        <button className="btn-soft mt-5 w-full text-xs" onClick={onClose}>
          关闭
        </button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
          头像会自动压缩到 {sizeText(60 * 1024)} 以内再上传；昵称改完好友那边刷新就能看到。
        </p>
      </div>
    </div>
  )
}
