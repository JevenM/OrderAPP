import { useRef, useState } from 'react'
import Avatar from './Avatar'
import { setMemberAvatar, uploadAvatar } from '../lib/db'
import { sizeText } from '../lib/image'
import { useToast } from './Toast'

type Props = {
  open: boolean
  title: string
  hint?: string
  fallbackEmoji?: string
  /** 当前头像 */
  url: string | null
  /**
   * 保存：mode='member' 写 members.avatar_url，mode='setting' 交给调用方（比如写进 app_settings）
   */
  onSave: (url: string | null) => Promise<void>
  onClose: () => void
}

/** 头像编辑弹层：从相册选图 → 自动压缩 → 上传 → 保存 */
export default function AvatarSheet({ open, title, hint, fallbackEmoji = '👧', url, onSave, onClose }: Props) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  /** 本地预览用的 objectURL，用完要手动释放 */
  const objectUrlRef = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  if (!open) return null

  const pick = async (file: File) => {
    setBusy(true)
    try {
      const next = await uploadAvatar(file)
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
      setPreview(next)
      await onSave(next)
      toast.show('头像已更新 ✨')
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await onSave(null)
      setPreview(null)
      toast.show('已恢复默认头像')
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const shown = preview ?? url

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md animate-slide-up rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-brand-600">{title}</h3>
        {hint && <p className="mt-1 text-xs leading-relaxed text-slate-400">{hint}</p>}

        <div className="mt-5 flex flex-col items-center gap-3">
          <Avatar url={shown} emoji={fallbackEmoji} size={96} anim={false} />
          {busy && <p className="text-xs text-slate-400">上传中…</p>}
        </div>

        <div className="mt-5 space-y-2">
          <label className={`btn-primary w-full ${busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
            {busy ? '处理中…' : '从相册选一张'}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
                  objectUrlRef.current = URL.createObjectURL(f)
                  setPreview(objectUrlRef.current)
                  void pick(f)
                }
              }}
            />
          </label>
          {shown && (
            <button className="btn-ghost w-full text-xs" disabled={busy} onClick={remove}>
              移除头像，用默认表情
            </button>
          )}
          <button className="btn-soft w-full text-xs" onClick={onClose}>
            关闭
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
          图片会自动压缩到 {sizeText(60 * 1024)} 以内再上传，省流量也省空间。
        </p>
      </div>
    </div>
  )
}

/** 成员头像保存（供成员页调用） */
export async function saveMemberAvatar(memberId: string, url: string | null): Promise<void> {
  await setMemberAvatar(memberId, url)
}
