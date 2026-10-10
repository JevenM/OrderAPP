import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createMember, randomCode, removeMember, updateMember } from '../lib/db'
import { useToast } from '../components/Toast'
import Avatar from '../components/Avatar'
import AvatarSheet, { saveMemberAvatar } from '../components/AvatarSheet'
import { useMembers } from '../store/members'
import { useSettings } from '../store/settings'
import type { Member } from '../lib/types'

export default function AdminMembers() {
  const toast = useToast()
  const navigate = useNavigate()
  const { members, reload, loading } = useMembers()
  const { adminName, saveAdminName, adminAvatar, saveAdminAvatar } = useSettings()
  const [avatarFor, setAvatarFor] = useState<string | null>(null)
  const [myName, setMyName] = useState(adminName)
  const [savingMyName, setSavingMyName] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState(randomCode())
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Record<string, { name: string; code: string; myName: string }>>({})

  useEffect(() => {
    setMyName(adminName)
  }, [adminName])

  const saveMyName = async () => {
    const n = myName.trim()
    if (!n) return toast.show('给自己起个昵称吧～', 'err')
    setSavingMyName(true)
    try {
      await saveAdminName(n)
      toast.show('已保存，没单独设置称呼的她看到的就是这个昵称')
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setSavingMyName(false)
    }
  }

  const val = (m: Member) => draft[m.id] ?? { name: m.name, code: m.code, myName: m.my_name ?? '' }
  const dirty = (m: Member) => {
    const d = val(m)
    return d.name !== m.name || d.code !== m.code || d.myName !== (m.my_name ?? '')
  }

  const add = async () => {
    const n = name.trim()
    const c = code.trim()
    if (!n) return toast.show('给她起个昵称吧～', 'err')
    if (members.some((m) => m.name.toLowerCase() === n.toLowerCase())) {
      return toast.show('这个昵称已经有人用了，请换一个', 'err')
    }
    if (!c) return toast.show('邀请码不能为空', 'err')
    if (members.some((m) => m.code === c)) return toast.show('这个邀请码已经有人用了', 'err')
    setBusy(true)
    try {
      await createMember(n, c)
      toast.show('已添加，把邀请码发给她吧 ❤️')
      setName('')
      setCode(randomCode())
      reload()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const save = async (m: Member) => {
    const d = val(m)
    const n = d.name.trim()
    const c = d.code.trim()
    if (!n) return toast.show('昵称不能为空', 'err')
    if (members.some((x) => x.id !== m.id && x.name.toLowerCase() === n.toLowerCase())) {
      return toast.show('这个昵称已经有人用了，请换一个', 'err')
    }
    if (!c) return toast.show('邀请码不能为空', 'err')
    if (members.some((x) => x.id !== m.id && x.code === c)) return toast.show('邀请码重复了', 'err')
    try {
      await updateMember(m.id, { name: n, code: c, my_name: d.myName.trim() || null })
      toast.show('已保存（改名 / 改码 / 称呼立即生效）')
      reload()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }

  const del = async (m: Member) => {
    if (!window.confirm(`删除「${m.name}」？她的邀请码会立即失效（历史订单和记录仍会保留）。`)) return
    try {
      await removeMember(m.id)
      toast.show('已删除')
      reload()
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">👫 好友关系管理</h3>
          <p className="text-[11px] text-slate-400">查看谁和谁是好友，指定任意两人成为专属好友</p>
        </div>
        <button className="btn-soft shrink-0 text-xs" onClick={() => navigate('/admin/friendships')}>
          去管理
        </button>
      </div>

      <div className="card space-y-2">
        <h3 className="text-sm font-semibold">🙋 我的昵称</h3>
        <div className="flex items-center gap-3">
          <Avatar url={adminAvatar} emoji="👨‍🍳" size={56} />
          <button className="btn-soft text-xs" onClick={() => setAvatarFor('me')}>
            换我的头像
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">
          她在饭圈里看到的名字，随时可改；改完她那边刷新就生效。
          <br />
          <span className="text-brand-600">下面每个成员还能各设一个专属称呼，设了就以那个为准。</span>
        </p>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="比如：毛毛 / 大厨"
            value={myName}
            onChange={(e) => setMyName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void saveMyName()
              }
            }}
          />
          <button
            className="btn-primary shrink-0 text-xs"
            disabled={savingMyName || myName.trim() === adminName}
            onClick={saveMyName}
          >
            {savingMyName ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="text-sm font-semibold">➕ 新增一个她</h3>
        <input
          className="input"
          placeholder="昵称（比如：小美）"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <input
            className="input font-mono"
            placeholder="邀请码"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn-soft whitespace-nowrap text-xs" onClick={() => setCode(randomCode())}>
            换一个
          </button>
        </div>
        <button className="btn-primary w-full" disabled={busy} onClick={add}>
          {busy ? '添加中…' : '生成并添加'}
        </button>
        <p className="text-[11px] leading-relaxed text-slate-400">
          邀请码区分大小写，可随时修改；改了之后旧的立即失效。她用这个码登录，就只能看到自己的点菜和就餐记录。
        </p>
      </div>

      {loading && <p className="py-6 text-center text-sm text-slate-400">加载中…</p>}
      {!loading && members.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">还没有成员，先添加一个吧～</p>
      )}

      {members.map((m) => (
        <div key={m.id} className="card space-y-2">
          <div className="flex items-center gap-2">
            <button className="rounded-full transition active:scale-95" title="给她换头像" onClick={() => setAvatarFor(m.id)}>
              <Avatar url={m.avatar_url} emoji="👧" size={44} />
            </button>
            <input
              className="input flex-1"
              value={val(m).name}
              onChange={(e) => setDraft((d) => ({ ...d, [m.id]: { ...val(m), name: e.target.value } }))}
            />
            <button className="btn-soft shrink-0 text-xs" onClick={() => setAvatarFor(m.id)}>
              头像
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="input font-mono text-xs"
              value={val(m).code}
              onChange={(e) => setDraft((d) => ({ ...d, [m.id]: { ...val(m), code: e.target.value } }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">她看到我叫</label>
            <div className="flex items-center gap-2">
              <input
                className="input"
                placeholder={`不填就用「${adminName}」`}
                value={val(m).myName}
                onChange={(e) => setDraft((d) => ({ ...d, [m.id]: { ...val(m), myName: e.target.value } }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void save(m)
                  }
                }}
              />
              {val(m).myName.trim() && (
                <span className="shrink-0 text-[11px] text-brand-600">
                  {val(m).name}: Hi, {val(m).myName.trim()}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button className="text-xs text-slate-400" onClick={() => del(m)}>
              删除
            </button>
            {dirty(m) ? (
              <button className="btn-primary text-xs" onClick={() => save(m)}>
                保存修改
              </button>
            ) : (
              <span className="text-[11px] text-slate-400">未修改</span>
            )}
          </div>
        </div>
      ))}

      {avatarFor === 'me' && (
        <AvatarSheet
          open
          title="我的头像"
          hint="她在饭圈里看到的就是这张，顶部也能看到"
          fallbackEmoji="👨‍🍳"
          url={adminAvatar}
          onSave={saveAdminAvatar}
          onClose={() => setAvatarFor(null)}
        />
      )}
      {avatarFor && avatarFor !== 'me' && (
        <AvatarSheet
          open
          title={`${members.find((m) => m.id === avatarFor)?.name || '她'}的头像`}
          hint="她自己也能在顶部点头像更换；这里帮她改也可以"
          fallbackEmoji="👧"
          url={members.find((m) => m.id === avatarFor)?.avatar_url ?? null}
          onSave={async (url) => {
            await saveMemberAvatar(avatarFor, url)
            reload()
          }}
          onClose={() => setAvatarFor(null)}
        />
      )}

      <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        提示：在顶部点一下头像就能改自己的头像和昵称；这里可以顺手帮每个她设置。
        <br />
        她自己也能改昵称和头像（点头像 → 个人资料），改完你这边刷新就同步。
        <br />
        好友关系在顶部「更多」里的「好友关系管理」中设置：不是好友的账户互相看不到任何动态、点赞和评论。
        <br />
        「她看到我叫」只对这一个人生效：A 看到我叫 maoge、B 看到我叫老干部，互不影响；留空则用上面那个统一昵称。
      </p>
    </div>
  )
}
