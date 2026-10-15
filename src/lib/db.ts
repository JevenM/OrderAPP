import { ADMIN_NAME, configured, supabase } from './supabase'
import { getProbeState } from './realtime'
import { deduped, invalidateDedupe } from './net'
import { compressImage } from './image'
import { toDayStr } from './date'
import type {
  Dish,
  DishRequestStatus,
  DishRequest,
  FriendProfile,
  FriendRelation,
  FriendRequestItem,
  FriendSearchResult,
  Friendship,
  Meal,
  MealSlot,
  MealStatus,
  Member,
  OrderStatus,
  OrderWithItems,
  Post,
  PostAuthor,
  PostComment,
  PostLike,
  PostWithMeta,
} from './types'

function fail(e: { message?: string } | null, tag: string): never {
  throw new Error(`${tag}失败：${e?.message ?? '未知错误'}`)
}

/** 给请求加超时，避免网络不通时一直卡在「保存中…」看不到反馈 */
function withTimeout<T>(p: PromiseLike<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${tag}超时：网络似乎不太顺畅，请检查网络后重试`)),
      ms
    )
    Promise.resolve(p).then(
      (v) => {
        window.clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(timer)
        reject(e)
      }
    )
  })
}

/**
 * 网络层错误翻译成人话。
 * supabase-js 在连不上时只会抛 "TypeError: Failed to fetch"，用户完全看不懂，
 * 这里按情况给出能动手排查的提示。
 */
function netHint(tag: string, e: unknown): Error {
  const raw = e instanceof Error ? e.message : String(e ?? '')

  if (!configured) {
    return new Error(
      `${tag}失败：还没有连上 Supabase。本地请复制 .env.example 为 .env，填好 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 后重启 npm run dev；` +
        `部署好的站点要到仓库 Settings → Secrets 里配上同名变量并重新构建（Vite 的环境变量只在构建时注入）。`
    )
  }
  if (!navigator.onLine) return new Error(`${tag}失败：设备当前离线，连上网再试一次`)

  if (/429|too many requests|rate limit|exceeded.*limit|limit.*exceeded/i.test(raw)) {
    return new Error(
      `${tag}失败：请求过于频繁被限流（${raw}）。可能开了多个页面在后台轮询，关闭多余标签页、等一分钟再试；` +
        `若持续出现，去 Supabase 控制台看看项目是否被暂停。`
    )
  }

  if (/failed to fetch|networkerror|load failed|network request failed|ERR_/i.test(raw)) {
    return new Error(
      `${tag}失败：连不上 Supabase（${raw}）。常见原因：① Supabase 项目被暂停/删除，去控制台 Restore；` +
        `② VITE_SUPABASE_URL 填错或少了 https://；③ 部署站点没配环境变量或改完之后没有重新构建；④ VPN / 代理 / 浏览器插件拦截了请求。`
    )
  }
  return e instanceof Error ? e : new Error(`${tag}失败：${raw}`)
}

/* ------------------------------ 菜单 ------------------------------ */

export async function listDishes(): Promise<Dish[]> {
  const { data, error } = await supabase
    .from('dishes')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) fail(error, '加载菜单')
  return (data ?? []) as Dish[]
}

export interface TogetherLocationRow {
  member_id: string
  latitude: number
  longitude: number
  accuracy: number
  updated_at: string
  expires_at: string
}

export async function upsertTogetherLocation(input: Omit<TogetherLocationRow, 'updated_at' | 'expires_at'>): Promise<void> {
  const now = new Date()
  const { error } = await supabase.from('together_locations').upsert({
    ...input,
    updated_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 120_000).toISOString(),
  })
  if (error) fail(error, '同步同在位置')
}

export async function listTogetherLocations(memberIds: string[]): Promise<TogetherLocationRow[]> {
  if (!memberIds.length) return []
  const { data, error } = await supabase.from('together_locations').select('*').in('member_id', memberIds)
  if (error) fail(error, '读取同在位置')
  return (data ?? []) as TogetherLocationRow[]
}

export async function clearTogetherLocation(memberId: string): Promise<void> {
  if (!memberId) return
  const { error } = await supabase.from('together_locations').delete().eq('member_id', memberId)
  if (error) fail(error, '关闭位置共享')
}

export async function saveDish(dish: Partial<Dish> & { name: string }): Promise<void> {
  const price = Number(dish.price ?? 0)
  const payload = {
    name: dish.name.trim(),
    category: dish.category ?? '家常菜',
    emoji: dish.emoji?.trim() || '🍽️',
    description: dish.description ?? '',
    price: Number.isFinite(price) ? price : 0,
    available: dish.available ?? true,
    sort_order: Number.isFinite(dish.sort_order) ? (dish.sort_order ?? 0) : 0,
  }

  // 带上 .select() 才能知道到底改到了几行：RLS 限制时 Supabase 不会报错，只会静悄悄返回 0 行
  if (dish.id) {
    const { data, error } = await withTimeout(
      supabase.from('dishes').update(payload).eq('id', dish.id).select('id'),
      15_000,
      '保存菜品'
    )
    if (error) fail(error, '保存菜品')
    if (!data?.length) throw new Error('保存菜品失败：没有更新到任何数据，检查 Supabase 表权限（RLS）是否开放写入')
    return
  }

  const { data, error } = await withTimeout(
    supabase.from('dishes').insert(payload).select('id'),
    15_000,
    '保存菜品'
  )
  if (error) fail(error, '保存菜品')
  if (!data?.length) throw new Error('保存菜品失败：没有写入任何数据，检查 Supabase 表权限（RLS）是否开放写入')
}

export async function removeDish(id: string): Promise<void> {
  const { error } = await withTimeout(supabase.from('dishes').delete().eq('id', id), 15_000, '删除菜品')
  if (error) fail(error, '删除菜品')
}

/* ---------------------- 新菜申请（她 → 我审核 → 进菜单） ---------------------- */

export async function listDishRequests(status?: DishRequestStatus): Promise<DishRequest[]> {
  let query = supabase.from('dish_requests').select('*')
  if (status) query = query.eq('status', status)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(50)
  if (error) fail(error, '加载新菜申请')
  return (data ?? []) as DishRequest[]
}

/** 她申请一道菜单里没有的菜；同一道菜有待审核申请时不重复推送 */
export async function createDishRequest(name: string, memberId: string | null): Promise<boolean> {
  const clean = name.trim()
  if (!clean) return false

  const { data: dup, error: e0 } = await supabase
    .from('dish_requests')
    .select('id')
    .eq('name', clean)
    .eq('status', 'pending')
    .maybeSingle()
  if (e0) fail(e0, '提交新菜申请')
  if (dup) return false

  const { error } = await supabase.from('dish_requests').insert({ name: clean, member_id: memberId })
  if (error) fail(error, '提交新菜申请')
  return true
}

/** 我审核：通过（收进菜单）/ 婉拒 */
export async function resolveDishRequest(id: string, status: 'approved' | 'rejected'): Promise<void> {
  const { error } = await supabase
    .from('dish_requests')
    .update({ status, handled_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) fail(error, '处理新菜申请')
}

/* ------------------------------ 成员（多个她） ------------------------------ */

/** 生成随机邀请码（去掉了容易看错的 0/o/1/l） */
export function randomCode(len = 6): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < len; i += 1) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/**
 * 成员清单（不含邀请码）。
 * 成员 store、设置 store、在线状态会在同一时刻各读一次，这里做短时去重：
 * 同一波只真正发 1 次请求；写完成员后会主动失效（见 invalidateDedupe）。
 */
export function listMembers(): Promise<Member[]> {
  return deduped('members:list', 8_000, async () => {
    const { data, error } = await withTimeout(
      supabase
        .from('members')
        // 只用得到这几列：不取 code（邀请码属于登录凭据，普通页面用不到），响应体也更小
        .select('id, name, my_name, avatar_url, created_at')
        .order('created_at', { ascending: true }),
      15_000,
      '加载成员'
    )
    if (error) fail(error, '加载成员')
    return (data ?? []) as Member[]
  })
}

/**
 * 管理页专用：带邀请码的成员清单。
 * 单独开一个函数，是为了让「切换视角 / 在线状态」这类高频读取不再把邀请码带到每个请求里。
 */
export async function listMembersWithCodes(): Promise<Member[]> {
  const { data, error } = await withTimeout(
    supabase.from('members').select('*').order('created_at', { ascending: true }),
    15_000,
    '加载成员'
  )
  if (error) fail(error, '加载成员')
  return (data ?? []) as Member[]
}

/** 新增成员：邀请码只在真正用到它时单独查一行，避免登录页之外的请求携带凭据 */
export async function getMemberCode(id: string): Promise<string> {
  const { data, error } = await supabase.from('members').select('code').eq('id', id).maybeSingle()
  if (error) fail(error, '读取邀请码')
  return ((data?.code as string) ?? '').trim()
}

/**
 * 校验邀请码。登录第一步，网络不通时要给得出排查方向（见 netHint），
 * 另外加 15s 超时，避免弱网下一直转圈没有任何反馈。
 */
export type LoginVerifyResult = {
  ok: boolean
  role?: 'me' | 'her'
  member_id?: string
  member_name?: string
  member_avatar?: string
}

/** 服务端口令校验；迁移 0035 未执行时返回 null，让开发环境保留旧流程兜底。 */
export async function verifyLogin(code: string): Promise<LoginVerifyResult | null> {
  const { data, error } = await supabase.rpc('login_verify', { p_input: code.trim() })
  if (error) {
    if (/function .*login_verify|does not exist|404|PGRST202/i.test(error.message ?? '')) return null
    fail(error, '校验登录口令')
  }
  return (data ?? { ok: false }) as LoginVerifyResult
}

export async function findMemberByCode(code: string): Promise<Member | null> {
  try {
    const { data, error } = await withTimeout(
      supabase.from('members').select('*').eq('code', code).maybeSingle(),
      15_000,
      '校验邀请码'
    )
    if (error) fail(error, '校验邀请码')
    return (data as Member | null) ?? null
  } catch (e) {
    throw netHint('校验邀请码', e)
  }
}

export async function findMemberByName(name: string): Promise<Member | null> {
  const { data, error } = await withTimeout(
    supabase.from('members').select('*').eq('name', name.trim()).maybeSingle(),
    15_000,
    '查询成员'
  )
  if (error) fail(error, '查询成员')
  return (data as Member | null) ?? null
}

/** 成员表有任何写入 → 让清单缓存立刻失效，避免「改完看不到变化」 */
function invalidateMembers() {
  invalidateDedupe('members:')
}

export async function createMember(name: string, code: string): Promise<Member> {
  const { data, error } = await supabase.from('members').insert({ name, code }).select().single()
  if (error || !data) fail(error, '新增成员')
  invalidateMembers()
  return data as Member
}

export async function updateMember(
  id: string,
  patch: { name?: string; code?: string; my_name?: string | null; avatar_url?: string | null }
): Promise<void> {
  const { error } = await supabase.from('members').update(patch).eq('id', id)
  if (error) fail(error, '修改成员')
  invalidateMembers()
}

/* ------------------------------ 头像 ------------------------------ */

/** 客户端图片上传大小上限：放宽到 50MB，并由前端高压缩算法自动压至 20KB 左右 */
const MAX_IMAGE_FILE_BYTES = 50 * 1024 * 1024

const AVATAR_BUCKET = 'avatars'
/** 头像压到 60KB：既要比 20KB 的三餐图清楚一些，又不能让免费额度吃紧 */
const AVATAR_TARGET_BYTES = 60 * 1024

/**
 * 上传头像（压缩后存到 avatars bucket，返回公开地址）
 * 没跑 0010_avatars.sql（bucket / 权限没建）时给出明确的 SQL 文件名。
 */
export async function uploadAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('头像上传失败：请选择图片文件')
  if (file.size > MAX_IMAGE_FILE_BYTES) throw new Error('头像上传失败：图片超过 50MB，换一张小一点的吧')

  let upload: File = file
  try {
    const c = await compressImage(file, AVATAR_TARGET_BYTES)
    upload = c.file
  } catch (e) {
    throw new Error(`头像处理失败：${(e as Error).message}`)
  }

  const bucket = supabase.storage.from(AVATAR_BUCKET)
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error } = await withTimeout(
    bucket.upload(path, upload, { cacheControl: '3600', contentType: 'image/jpeg' }),
    20_000,
    '头像上传'
  )

  if (error) {
    const msg = error.message ?? ''
    if (/bucket.*not.*found|not found|does not exist/i.test(msg)) {
      throw new Error(
        `头像上传失败：还没有建立 "${AVATAR_BUCKET}" bucket。执行 supabase/migrations/0010_avatars.sql 会自动建好 bucket 和权限`
      )
    }
    if (/row-level security|policy|permission|unauthorized|403/i.test(msg)) {
      throw new Error(
        `头像上传失败：bucket 有了但没开写入权限。请执行 supabase/migrations/0010_avatars.sql（给 storage.objects 放开 anon 上传）`
      )
    }
    throw new Error(`头像上传失败：${msg}`)
  }

  return bucket.getPublicUrl(path).data.publicUrl
}

/** 给某个成员设置头像（传 null 表示删掉头像，回到默认表情） */
export async function setMemberAvatar(id: string, url: string | null): Promise<void> {
  await updateMember(id, { avatar_url: url })
}

/** 某个成员眼里的「我」叫什么：单独设过就用她的，没设过返回空串（由调用方回落到全局昵称） */
export async function getMemberMyName(memberId: string | null): Promise<string> {
  if (!memberId) return ''
  const { data, error } = await supabase.from('members').select('my_name').eq('id', memberId).maybeSingle()
  if (error || !data) return ''
  return ((data.my_name as string | null) ?? '').trim()
}

export async function removeMember(id: string): Promise<void> {
  const { error } = await supabase.from('members').delete().eq('id', id)
  if (error) fail(error, '删除成员')
  invalidateMembers()
}

/* ------------------------------ 好友 ------------------------------ */

/**
 * 好友可见性总规则（管理员 是唯一例外）：
 * - 管理员 默认和所有账户都是好友：能看到所有人的动态 / 点赞 / 评论，也不用发申请；
 * - 其他账户之间完全隔离：不是好友就什么都看不到，也不能点赞评论；
 * - 加好友靠邀请码：搜到对方 → 发申请 → 对方接受后才算好友。
 * 一对人只存一行（谁发的申请记在 requester_id），备注各存各的，互不可见。
 */

/** 我所有的关系行（含待接受申请） */
export async function listFriendships(memberId: string): Promise<Friendship[]> {
  const { data, error } = await withTimeout(
    supabase
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${memberId},addressee_id.eq.${memberId}`)
      .order('updated_at', { ascending: false }),
    15_000,
    '加载好友'
  )
  if (error) fail(error, '加载好友')
  return (data ?? []) as Friendship[]
}

/** 管理员查看所有成员之间的好友关系。 */
export async function listAllFriendships(): Promise<Friendship[]> {
  const { data, error } = await withTimeout(
    supabase.from('friendships').select('*').order('updated_at', { ascending: false }),
    15_000,
    '加载好友关系'
  )
  if (error) fail(error, '加载好友关系')
  return (data ?? []) as Friendship[]
}

/** 管理员直接把两个成员设为好友；已有申请则直接通过。 */
export async function adminSetFriendship(memberAId: string, memberBId: string): Promise<void> {
  if (memberAId === memberBId) throw new Error('不能把同一个人设置成自己的好友')
  const existing = (await listFriendships(memberAId)).find(
    (f) => f.requester_id === memberBId || f.addressee_id === memberBId
  )
  if (existing?.status === 'accepted') return
  if (existing) {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) fail(error, '设置好友关系')
    return
  }
  const { error } = await supabase.from('friendships').insert({
    requester_id: memberAId,
    addressee_id: memberBId,
    status: 'accepted',
  })
  if (error) fail(error, '设置好友关系')
}

/** 管理员解除两个成员之间的好友关系。 */
export async function adminRemoveFriendship(memberAId: string, memberBId: string): Promise<void> {
  const existing = (await listFriendships(memberAId)).find(
    (f) => f.requester_id === memberBId || f.addressee_id === memberBId
  )
  if (!existing) return
  const { error } = await supabase.from('friendships').delete().eq('id', existing.id)
  if (error) fail(error, '解除好友关系')
}

async function membersById(ids: string[]): Promise<Map<string, Member>> {
  if (!ids.length) return new Map()
  const { data } = await supabase.from('members').select('*').in('id', ids)
  return new Map(((data ?? []) as Member[]).map((m) => [m.id, m]))
}

/** 一行关系里「对方」是谁 */
function otherIdOf(f: Friendship, myId: string): string {
  return f.requester_id === myId ? f.addressee_id : f.requester_id
}

/** 一行关系里「我给对方的备注」 */
function noteOf(f: Friendship, myId: string): string {
  return ((f.requester_id === myId ? f.requester_note : f.addressee_note) ?? '').trim()
}

/** 好友列表（只要 accepted 的） */
export async function listFriends(memberId: string): Promise<FriendProfile[]> {
  const rows = (await listFriendships(memberId)).filter((r) => r.status === 'accepted')
  if (!rows.length) return []

  const byId = await membersById(rows.map((r) => otherIdOf(r, memberId)))
  return rows.map((r) => {
    const id = otherIdOf(r, memberId)
    const m = byId.get(id)
    const name = m?.name ?? '她'
    const note = noteOf(r, memberId)
    return {
      memberId: id,
      name,
      avatarUrl: m?.avatar_url ?? '',
      note,
      shownName: note || name,
      friendshipId: r.id,
      since: r.updated_at,
    }
  })
}

/** 待处理的申请：incoming 别人申请我 / outgoing 我申请的 */
export async function listFriendRequests(
  memberId: string
): Promise<{ incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] }> {
  const rows = (await listFriendships(memberId)).filter((r) => r.status === 'pending')
  if (!rows.length) return { incoming: [], outgoing: [] }

  const byId = await membersById(rows.map((r) => otherIdOf(r, memberId)))
  const toItem = (r: Friendship): FriendRequestItem => {
    const id = otherIdOf(r, memberId)
    const m = byId.get(id)
    return {
      friendshipId: r.id,
      memberId: id,
      name: m?.name ?? '她',
      avatarUrl: m?.avatar_url ?? '',
      createdAt: r.created_at,
    }
  }

  return {
    incoming: rows.filter((r) => r.addressee_id === memberId).map(toItem),
    outgoing: rows.filter((r) => r.requester_id === memberId).map(toItem),
  }
}

/**
 * 按昵称搜人加好友。返回对方资料和「我现在和 TA 是什么关系」；
 * 查无此人返回 null（调用方负责提示「没找到这个昵称」）。
 */
export async function searchFriendByName(
  myId: string,
  searchName: string,
  adminDisplayName?: string
): Promise<FriendSearchResult | null> {
  const normalized = searchName.trim()
  if (!normalized) return null

  // 管理员的名字可以匹配全局昵称、专属昵称或默认配置
  if (
    normalized === ADMIN_NAME ||
    (adminDisplayName && normalized === adminDisplayName)
  ) {
    const base = {
      memberId: '__admin__',
      name: adminDisplayName || ADMIN_NAME,
      avatarUrl: '',
    }
    return { ...base, relation: 'accepted' as FriendRelation, friendshipId: null }
  }

  const target = await findMemberByName(normalized)
  if (!target) return null

  const base = {
    memberId: target.id,
    name: target.name,
    avatarUrl: target.avatar_url ?? '',
  }

  if (target.id === myId) return { ...base, relation: 'self' as FriendRelation, friendshipId: null }

  const f = (await listFriendships(myId)).find((r) => r.requester_id === target.id || r.addressee_id === target.id)
  const relation: FriendRelation = !f
    ? 'none'
    : f.status === 'accepted'
      ? 'accepted'
      : f.addressee_id === myId
        ? 'incoming'
        : 'outgoing'

  return { ...base, relation, friendshipId: f?.id ?? null }
}

/** 发好友申请（重复申请会给出人话提示） */
export async function sendFriendRequest(myId: string, targetId: string): Promise<void> {
  if (myId === targetId) throw new Error('不能添加自己为好友哦～')
  const f = (await listFriendships(myId)).find((r) => r.requester_id === targetId || r.addressee_id === targetId)
  if (f?.status === 'accepted') throw new Error('你们已经是好友啦')
  if (f) {
    throw new Error(
      f.addressee_id === myId ? '对方已经向你发过申请了，在上面点「接受」就好 🤝' : '申请已经发出去了，等对方接受一下吧'
    )
  }
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: myId, addressee_id: targetId, status: 'pending' })
  if (error) fail(error, '发送好友申请')
}

/** 接受申请：变成好友，从此互相可见、可互动 */
export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', friendshipId)
    .select('id')
  if (error) fail(error, '接受好友申请')
}

/** 拒绝申请 / 撤回申请 / 删除好友：都是删掉这一行关系（删了还能重新申请） */
export async function dropFriendship(friendshipId: string): Promise<void> {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId)
  if (error) fail(error, '处理好友关系')
}

/** 给好友写备注：只有自己能看到，显示时优先于对方昵称，对方完全无感 */
export async function setFriendNote(myId: string, friendId: string, note: string): Promise<void> {
  const f = (await listFriendships(myId)).find((r) => r.requester_id === friendId || r.addressee_id === friendId)
  if (!f) throw new Error('你们已经不是好友了，刷新一下再看看')
  const col = f.requester_id === myId ? 'requester_note' : 'addressee_note'
  const { error } = await supabase
    .from('friendships')
    .update({ [col]: note.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', f.id)
  if (error) fail(error, '保存备注')
}

/* --------------------------- 互动空间甜蜜聊天 --------------------------- */

function coupleChannelName(userA: string, userB: string): string {
  const [first, second] = userA < userB ? [userA, userB] : [userB, userA]
  return `couple-chat-${first}-${second}`
}

export type CoupleWish = {
  id: string
  owner_id: string
  member_a: string
  member_b: string
  text: string
  /** 历史遗留字段：心愿池不再区分难度，数据库默认值兜底 */
  level?: '轻松' | '认真' | '挑战'
  owner_name: string
  created_at: string
}

function couplePair(userA: string, userB: string): [string, string] {
  return userA < userB ? [userA, userB] : [userB, userA]
}

/** 心愿列表需要的列（不含 created_at 之外的冗余字段） */
const WISH_COLUMNS = 'id, owner_id, member_a, member_b, text, owner_name, created_at'

export async function listCoupleWishes(userA: string, userB: string): Promise<CoupleWish[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase
    .from('couple_wishes')
    .select(WISH_COLUMNS)
    .eq('member_a', memberA)
    .eq('member_b', memberB)
    .order('created_at', { ascending: true })
    // 心愿池超过 300 条属于极端情况，截断可避免列表越用越慢
    .limit(300)
  if (error) fail(error, '加载心愿')
  return (data ?? []) as CoupleWish[]
}

/** 只取数量：入口卡片显示「N 个心愿」时不必把心愿正文全部下载 */
export async function countCoupleWishes(userA: string, userB: string): Promise<number> {
  if (!userA || !userB || userA === userB) return 0
  const [memberA, memberB] = couplePair(userA, userB)
  const { count, error } = await supabase
    .from('couple_wishes')
    .select('id', { count: 'exact', head: true })
    .eq('member_a', memberA)
    .eq('member_b', memberB)
  if (error) fail(error, '统计心愿')
  return count ?? 0
}

export async function createCoupleWish(input: {
  ownerId: string
  userA: string
  userB: string
  text: string
  ownerName: string
}): Promise<CoupleWish> {
  const [memberA, memberB] = couplePair(input.userA, input.userB)
  const { data, error } = await supabase
    .from('couple_wishes')
    .insert({
      owner_id: input.ownerId,
      member_a: memberA,
      member_b: memberB,
      text: input.text.trim(),
      owner_name: input.ownerName,
    })
    .select()
    .single()
  if (error || !data) fail(error, '保存心愿')
  return data as CoupleWish
}

export async function listAllCoupleWishes(): Promise<CoupleWish[]> {
  const { data, error } = await supabase.from('couple_wishes').select('*').order('created_at', { ascending: false })
  if (error) fail(error, '加载全部秘密心愿')
  return (data ?? []) as CoupleWish[]
}

export async function updateCoupleWish(id: string, text: string): Promise<void> {
  const value = text.trim()
  if (!value) throw new Error('心愿内容不能为空')
  const { error } = await supabase.from('couple_wishes').update({ text: value }).eq('id', id)
  if (error) fail(error, '修改秘密心愿')
}

export type CoupleEventPayload =
  | { type: 'chat'; data: { id: string; sender_id: string; receiver_id: string; content: string; created_at: string } }
  | { type: 'wish_add'; data: { id: string; text: string; level: '轻松' | '认真' | '挑战'; owner: string } }
  | { type: 'wish_draw'; data: { id: string; text: string; level: '轻松' | '认真' | '挑战'; owner: string; drawer: string } }
  | { type: 'choice_submit'; data: { questionId: string; senderId: string; choice: string } }
  | { type: 'question_change'; data: { question: { id: string; title: string; a: string; b: string; kind: '轻松版' | '走心版' | '自定义' } } }

export function subscribeCoupleEvents(
  userA: string,
  userB: string,
  onEvent: (event: CoupleEventPayload) => void
): () => void {
  if (!userA || !userB || userA === userB) return () => {}
  // 实时通道被网络拦截时直接跳过（聊天/愿望的兜底由 REST 轮询负责，不空耗 socket）
  if (getProbeState() === 'broken') return () => {}
  const channelName = coupleChannelName(userA, userB)
  const channel = supabase.channel(channelName)
  channel
    .on('broadcast', { event: 'couple_event' }, (payload) => {
      if (payload.payload) onEvent(payload.payload as CoupleEventPayload)
    })
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export async function broadcastCoupleEvent(
  userA: string,
  userB: string,
  event: CoupleEventPayload
): Promise<void> {
  if (!userA || !userB || userA === userB) return
  // 通道不通时跳过广播（数据本身已落库，对方靠轮询兜底），并避免创建悬空 channel
  if (getProbeState() === 'broken') return
  const channelName = coupleChannelName(userA, userB)
  const channel = supabase.channel(channelName)
  await channel.subscribe()
  await channel.send({
    type: 'broadcast',
    event: 'couple_event',
    payload: event,
  })
  void supabase.removeChannel(channel)
}

export function subscribeCoupleMessages(
  userA: string,
  userB: string,
  onMessage: (msg: { id: string; sender_id: string; receiver_id: string; content: string; created_at: string }) => void
): () => void {
  if (!userA || !userB || userA === userB) return () => {}
  if (getProbeState() === 'broken') return () => {}
  const channelName = coupleChannelName(userA, userB)
  const channel = supabase.channel(channelName)
  channel
    .on('broadcast', { event: 'new_message' }, (payload) => {
      if (payload.payload) onMessage(payload.payload)
    })
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export type CoupleChatMessage = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  created_at: string
}

export async function broadcastCoupleMessage(
  senderId: string,
  receiverId: string,
  content: string
): Promise<CoupleChatMessage> {
  const clean = content.trim()
  if (!clean) throw new Error('消息内容不能为空')

  // 持久化入库（id 由数据库生成 uuid）：对方任何时候进来都能拉到历史留言
  try {
    const { data, error } = await supabase
      .from('couple_messages')
      .insert({ sender_id: senderId, receiver_id: receiverId, content: clean })
      .select()
      .single()
    if (!error && data) return data as CoupleChatMessage
  } catch {
    // 表不存在等情况走下面的降级通道
  }

  // 降级：本地生成消息并走临时广播，至少保证在线双方实时可见
  const fallback: CoupleChatMessage = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `msg-${Date.now()}`,
    sender_id: senderId,
    receiver_id: receiverId,
    content: clean,
    created_at: new Date().toISOString(),
  }
  if (getProbeState() !== 'broken') {
    const channelName = coupleChannelName(senderId, receiverId)
    const channel = supabase.channel(channelName)
    await channel.subscribe()
    await channel.send({ type: 'broadcast', event: 'new_message', payload: fallback })
    void supabase.removeChannel(channel)
  }
  return fallback
}

/**
 * 最近 100 条甜蜜留言。
 * 注意要按时间倒序取「最新」100 条再翻正序：之前是正序 + limit(100)，
 * 留言超过 100 条后就永远只能拿到最早的那 100 条（新留言看不到）。
 */
export interface CoupleMessageRow {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  created_at: string
}

export async function listCoupleMessages(userA: string, userB: string): Promise<CoupleMessageRow[]> {
  if (!userA || !userB || userA === userB) return []
  try {
    const { data, error } = await supabase
      .from('couple_messages')
      .select('id, sender_id, receiver_id, content, created_at')
      .or(`and(sender_id.eq.${userA},receiver_id.eq.${userB}),and(sender_id.eq.${userB},receiver_id.eq.${userA})`)
      .order('created_at', { ascending: false })
      .limit(100)
    if (!error && data) return [...(data as CoupleMessageRow[])].reverse()
  } catch {
    // 降级返回空
  }
  return []
}

/** 留言条数（入口卡片用，不下载留言内容） */
export async function countCoupleMessages(userA: string, userB: string): Promise<number> {
  if (!userA || !userB || userA === userB) return 0
  const { count, error } = await supabase
    .from('couple_messages')
    .select('id', { count: 'exact', head: true })
    .or(`and(sender_id.eq.${userA},receiver_id.eq.${userB}),and(sender_id.eq.${userB},receiver_id.eq.${userA})`)
  if (error) fail(error, '统计留言')
  return count ?? 0
}

/* ------------------------ 互动空间双人同步（心愿 / 抉择） ------------------------ */

export type CoupleQuizQuestion = {
  id: string
  title: string
  a: string
  b: string
  kind: '轻松版' | '走心版' | '深度版' | '自定义'
}

export async function listCoupleQuizBank(seedQuestions: CoupleQuizQuestion[] = []): Promise<CoupleQuizBankRow[]> {
  const { data: state, error: stateError } = await supabase.from('couple_quiz_bank_state').select('seeded_at').eq('id', true).maybeSingle()
  if (stateError) fail(stateError, '读取抉择题库初始化状态')
  if (!state && seedQuestions.length) {
    const { data: existing, error: countError } = await supabase.from('couple_quiz_questions').select('id').limit(1)
    if (countError) fail(countError, '检查抉择题库')
    if (!existing?.length) await importCoupleQuizBank(seedQuestions)
    const { error: seedError } = await supabase.from('couple_quiz_bank_state').upsert({ id: true }, { onConflict: 'id', ignoreDuplicates: true })
    if (seedError) fail(seedError, '初始化抉择题库')
  }
  const { data, error } = await supabase.from('couple_quiz_questions').select('*').order('sort_order').order('created_at')
  if (error) fail(error, '加载抉择题库')
  return (data ?? []).map((row) => ({
    ...row,
    a: row.option_a,
    b: row.option_b,
  })) as CoupleQuizBankRow[]
}

export async function importCoupleQuizBank(questions: CoupleQuizQuestion[]): Promise<void> {
  const rows = questions.map((question, index) => ({
    id: question.id,
    title: question.title.trim(),
    option_a: question.a.trim(),
    option_b: question.b.trim(),
    kind: question.kind,
    sort_order: index,
  }))
  for (let index = 0; index < rows.length; index += 100) {
    const { error } = await supabase.from('couple_quiz_questions').upsert(rows.slice(index, index + 100), { onConflict: 'id', ignoreDuplicates: true })
    if (error) fail(error, '导入现有抉择题库')
  }
}

export async function saveCoupleQuizBankQuestion(question: Pick<CoupleQuizQuestion, 'title' | 'a' | 'b' | 'kind'> & { id?: string; sort_order?: number }): Promise<void> {
  const payload = {
    title: question.title.trim(),
    option_a: question.a.trim(),
    option_b: question.b.trim(),
    kind: question.kind,
    ...(question.sort_order !== undefined ? { sort_order: question.sort_order } : {}),
    updated_at: new Date().toISOString(),
  }
  const query = question.id
    ? supabase.from('couple_quiz_questions').update(payload).eq('id', question.id)
    : supabase.from('couple_quiz_questions').insert(payload)
  const { error } = await query
  if (error) fail(error, question.id ? '更新抉择题目' : '新增抉择题目')
}

export async function setCoupleQuizBankQuestionEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from('couple_quiz_questions').update({ enabled, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) fail(error, '更新题目状态')
}

export async function deleteCoupleQuizBankQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('couple_quiz_questions').delete().eq('id', id)
  if (error) fail(error, '删除抉择题目')
}

export async function listCoupleQuizPairQuestions(userA: string, userB: string): Promise<CoupleQuizPairQuestionRow[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase.from('couple_quiz_pair_questions').select('*').eq('member_a', memberA).eq('member_b', memberB).maybeSingle()
  if (error) fail(error, '加载情侣题目配置')
  return data ? [data as CoupleQuizPairQuestionRow] : []
}

export async function saveCoupleQuizPairQuestions(userA: string, userB: string, questionIds: string[]): Promise<void> {
  if (!userA || !userB || userA === userB) throw new Error('请选择有效的情侣成员')
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase.from('couple_quiz_pair_questions').upsert({
    member_a: memberA,
    member_b: memberB,
    question_ids: [...new Set(questionIds)],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'member_a,member_b' })
  if (error) fail(error, '保存情侣题目配置')
}

/** 每对好友一行的同步抉择会话：换题覆盖、双方提交齐了自动 revealed */
export interface CoupleQuizRow {
  member_a: string
  member_b: string
  question: CoupleQuizQuestion | null
  choice_a: string | null
  choice_b: string | null
  status: 'answering' | 'revealed'
  history_id: string | null
  updated_at: string
}

export interface CoupleQuizBankRow extends CoupleQuizQuestion {
  option_a: string
  option_b: string
  enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CoupleQuizPairQuestionRow {
  member_a: string
  member_b: string
  question_ids: string[]
  updated_at: string
}

export interface CoupleQuizHistoryRow {
  id: string
  member_a: string
  member_b: string
  question_id: string
  question_title: string
  question_kind: string
  option_a: string
  option_b: string
  choice_a: string | null
  choice_b: string | null
  status: 'answering' | 'revealed'
  matched: boolean | null
  started_at: string
  choice_a_at: string | null
  choice_b_at: string | null
  revealed_at: string | null
  created_at: string
}

export type CoupleEventType = 'wish_add' | 'wish_draw' | 'love_unlock' | 'quiz_note'

/** 好友对共享的追加式互动日志：对端离线也不丢，回来后可回放 */
export interface CoupleEventRow {
  id: string
  member_a: string
  member_b: string
  sender_id: string
  type: string
  payload: Record<string, unknown>
  created_at: string
}

/** 回放最近 N 条互动事件（按时间正序返回） */
export async function listCoupleEvents(userA: string, userB: string, limit = 50): Promise<CoupleEventRow[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase
    .from('couple_events')
    .select('*')
    .eq('member_a', memberA)
    .eq('member_b', memberB)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) fail(error, '加载互动动态')
  return ((data ?? []) as CoupleEventRow[]).reverse()
}

/** 追加一条互动事件（心愿新增、抽签结果等），实时推送给对端 */
export async function appendCoupleEvent(
  userA: string,
  userB: string,
  senderId: string,
  type: CoupleEventType,
  payload: Record<string, unknown>
): Promise<void> {
  if (!userA || !userB || userA === userB) return
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase.from('couple_events').insert({
    member_a: memberA,
    member_b: memberB,
    sender_id: senderId,
    type,
    payload,
  })
  if (error) fail(error, '同步互动动态')
}

/** 读取当前同步抉择会话；还没开过题时返回 null */
export async function fetchCoupleQuiz(userA: string, userB: string): Promise<CoupleQuizRow | null> {
  if (!userA || !userB || userA === userB) return null
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase
    .from('couple_quiz')
    .select('*')
    .eq('member_a', memberA)
    .eq('member_b', memberB)
    .maybeSingle()
  if (error) fail(error, '加载同步抉择')
  return (data as CoupleQuizRow | null) ?? null
}

/** 出题 / 换题：创建历史快照，再更新双方共享的当前会话 */
export async function resetCoupleQuiz(userA: string, userB: string, question: CoupleQuizQuestion): Promise<string | null> {
  if (!userA || !userB || userA === userB) return null
  const [memberA, memberB] = couplePair(userA, userB)
  const { data: history, error: historyError } = await supabase
    .from('couple_quiz_history')
    .insert({
      member_a: memberA,
      member_b: memberB,
      question_id: question.id,
      question_title: question.title,
      question_kind: question.kind,
      option_a: question.a,
      option_b: question.b,
    })
    .select('id')
    .single()
  if (historyError) fail(historyError, '保存答题历史')
  const { error } = await supabase
    .from('couple_quiz')
    .upsert(
      {
        member_a: memberA,
        member_b: memberB,
        question,
        choice_a: null,
        choice_b: null,
        status: 'answering',
        history_id: history.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'member_a,member_b' }
    )
  if (error) fail(error, '同步题目')
  return history.id as string
}

/** 提交自己的选择，并同步更新对应历史；双方都选好后状态自动变为 revealed */
export async function saveCoupleQuizChoice(
  userA: string,
  userB: string,
  memberId: string,
  choice: string
): Promise<void> {
  if (!userA || !userB || userA === userB) return
  const [memberA, memberB] = couplePair(userA, userB)
  const col = memberId === memberA ? 'choice_a' : 'choice_b'
  const atCol = col === 'choice_a' ? 'choice_a_at' : 'choice_b_at'
  const current = await fetchCoupleQuiz(userA, userB)
  if (!current?.question) throw new Error('还没有进行中的题目')
  let historyId = current.history_id
  if (!historyId) {
    const { data: history, error: historyError } = await supabase
      .from('couple_quiz_history')
      .insert({
        member_a: memberA,
        member_b: memberB,
        question_id: current.question.id,
        question_title: current.question.title,
        question_kind: current.question.kind,
        option_a: current.question.a,
        option_b: current.question.b,
        choice_a: current.choice_a,
        choice_b: current.choice_b,
        status: current.status,
      })
      .select('id')
      .single()
    if (historyError || !history) fail(historyError ?? new Error('未返回历史记录编号'), '补存答题历史')
    historyId = history.id as string
    const { error: linkError } = await supabase
      .from('couple_quiz')
      .update({ history_id: historyId })
      .eq('member_a', memberA)
      .eq('member_b', memberB)
    if (linkError) fail(linkError, '关联答题历史')
  }
  const existingChoice = col === 'choice_a' ? current.choice_a : current.choice_b
  if (existingChoice) throw new Error('你已经提交过答案，请等待对方回答后揭晓')
  const nextA = col === 'choice_a' ? choice : current.choice_a
  const nextB = col === 'choice_b' ? choice : current.choice_b
  const nextStatus = nextA && nextB ? 'revealed' : 'answering'
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('couple_quiz')
    .update({ [col]: choice, status: nextStatus, updated_at: now })
    .eq('member_a', memberA)
    .eq('member_b', memberB)
  if (error) fail(error, '提交选择')
  if (current.history_id) {
    const { error: historyError } = await supabase
      .from('couple_quiz_history')
      .update({
        [col]: choice,
        [atCol]: now,
        status: nextStatus,
        matched: nextStatus === 'revealed' ? nextA === nextB : null,
        ...(nextStatus === 'revealed' ? { revealed_at: now } : {}),
      })
      .eq('id', current.history_id)
    if (historyError) fail(historyError, '更新答题历史')
  }
  if (nextStatus === 'revealed' && current.status !== 'revealed') {
    const recipient = memberId === memberA ? memberB : memberA
    await notifyCoupleQuizReveal(recipient, historyId, current.question.title)
  }
}

export async function fetchCoupleQuizHistory(id: string): Promise<CoupleQuizHistoryRow | null> {
  if (!id) return null
  const { data, error } = await supabase.from('couple_quiz_history').select('*').eq('id', id).maybeSingle()
  if (error) fail(error, '加载答题历史')
  return (data as CoupleQuizHistoryRow | null) ?? null
}

/**
 * 做过的题目 id 清单（「不再重复出题」与进度条用）。
 * 只取 question_id 一列：以前为了算进度把整条答题记录（含双方答案、题面）全下载，
 * 做了几百题后一次请求就是几百 KB。
 */
export async function listCoupleQuizUsedIds(userA: string, userB: string): Promise<string[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase
    .from('couple_quiz_history')
    .select('question_id')
    .eq('member_a', memberA)
    .eq('member_b', memberB)
    .limit(5000)
  if (error) fail(error, '加载已做题目')
  return [...new Set((data ?? []) as { question_id: string }[])]
    .map((row) => row.question_id)
    .filter(Boolean)
}

/** 答过的真心话题面（入口卡片算进度用，不下发答案内容） */
/** 答题记录条数（入口卡片用，不下载题目与答案） */
export async function countCoupleQuizHistory(userA: string, userB: string): Promise<number> {
  if (!userA || !userB || userA === userB) return 0
  const [memberA, memberB] = couplePair(userA, userB)
  const { count, error } = await supabase
    .from('couple_quiz_history')
    .select('id', { count: 'exact', head: true })
    .eq('member_a', memberA)
    .eq('member_b', memberB)
  if (error) fail(error, '统计同步抉择进度')
  return count ?? 0
}

export async function listCoupleTruthPrompts(userA: string, userB: string): Promise<string[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase
    .from('couple_truth_dare')
    .select('prompt')
    .eq('member_a', memberA)
    .eq('member_b', memberB)
    .limit(500)
  if (error) fail(error, '加载真心话进度')
  return [...new Set(((data ?? []) as { prompt: string }[]).map((row) => row.prompt).filter(Boolean))]
}

export async function listCoupleQuizHistory(userA: string, userB: string, limit = 200): Promise<CoupleQuizHistoryRow[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase.from('couple_quiz_history').select('*')
    .eq('member_a', memberA).eq('member_b', memberB).order('created_at', { ascending: false }).limit(limit)
  if (error) fail(error, '加载答题历史')
  return (data ?? []) as CoupleQuizHistoryRow[]
}

export async function listAllCoupleQuizHistory(limit = 1000): Promise<CoupleQuizHistoryRow[]> {
  const { data, error } = await supabase.from('couple_quiz_history').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) fail(error, '加载全部答题历史')
  return (data ?? []) as CoupleQuizHistoryRow[]
}

/* ------------------------ 真心话大冒险（记录 + 双方共享） ------------------------ */

export type CoupleTruthDareType = 'truth' | 'dare'

export interface CoupleTruthDareRow {
  id: string
  member_a: string
  member_b: string
  sender_id: string
  sender_name: string
  type: CoupleTruthDareType
  prompt: string
  answer: string | null
  answered_at: string | null
  created_at: string
}

/** 真心话答案提交后通知对方（铃铛 + 弹提醒），对方即刻知晓 */
async function notifyCoupleTruthAnswer(recipient: string, prompt: string): Promise<void> {
  try {
    await insertFeedNotices([recipient], {
      sender_name: '',
      type: 'truth',
      post_id: null,
      title: '真心话有新回答',
      body: `「${clip(prompt, 20)}」的答案已提交，去互动空间看看吧`,
    })
  } catch (error) {
    console.warn('写入真心话通知失败', error)
  }
}

/** 一方开启同在检测时通知对方：请求 TA 也打开位置共享（铃铛 + 弹提醒） */
export async function notifyTogetherRequest(recipient: string, senderName: string): Promise<void> {
  if (!recipient) return
  await insertFeedNotices([recipient], {
    sender_name: senderName,
    type: 'together',
    post_id: null,
    title: '💕 同在检测邀请',
    body: '对方请求打开同在检测，到顶栏点击 💕 一起开启吧',
  })
}

/**
 * 扫雷轮到对方时的铃铛提醒（行动方点完格子、轮到对方时落一条）。
 * 通知落库后即使对方离线，回来登录也能在铃铛看到未读。
 */
export async function notifyMinesTurn(recipient: string, senderName: string): Promise<void> {
  if (!recipient) return
  await insertFeedNotices([recipient], {
    sender_name: senderName,
    type: 'mines',
    post_id: null,
    title: '💣 轮到你拆雷了',
    body: `${senderName} 刚点完一格，快去互动空间 → 情侣扫雷吧～`,
  })
}

/** 扫雷新局已生成且先手是对方：落一条铃铛提醒（对方离线也能看到） */
export async function notifyMinesNew(recipient: string, senderName: string): Promise<void> {
  if (!recipient) return
  await insertFeedNotices([recipient], {
    sender_name: senderName,
    type: 'mines',
    post_id: null,
    title: '💣 扫雷新一局开好啦',
    body: `${senderName} 生成了新雷区，先手已定，快去看看吧～`,
  })
}

/** 飞行棋轮到对方掷骰：行动方走完后落一条铃铛提醒（对方离线也能看到） */
export async function notifyBoardTurn(recipient: string, senderName: string): Promise<void> {
  if (!recipient) return
  await insertFeedNotices([recipient], {
    sender_name: senderName,
    type: 'board',
    post_id: null,
    title: '🎲 轮到你掷骰了',
    body: `${senderName} 走完啦，快去互动空间 → 情侣飞行棋吧～`,
  })
}

/** 飞行棋新棋盘已生成且先手是对方：落一条铃铛提醒（对方离线也能看到） */
export async function notifyBoardNew(recipient: string, senderName: string): Promise<void> {
  if (!recipient) return
  await insertFeedNotices([recipient], {
    sender_name: senderName,
    type: 'board',
    post_id: null,
    title: '🎯 飞行棋新棋盘开好啦',
    body: `${senderName} 生成了新棋盘，先手已定，快去看看吧～`,
  })
}

/** 摆方五福棋轮到对方：行动方走完后落一条铃铛提醒（对方离线也能看到） */
export async function notifyWufuTurn(recipient: string, senderName: string): Promise<void> {
  if (!recipient) return
  await insertFeedNotices([recipient], {
    sender_name: senderName,
    type: 'wufu',
    post_id: null,
    title: '♟️ 轮到你下摆方了',
    body: `${senderName} 行动完啦，快去互动空间 → 摆方五福棋吧～`,
  })
}

/** 摆方新棋局已开且先手是对方：落一条铃铛提醒（对方离线也能看到） */
export async function notifyWufuNew(recipient: string, senderName: string): Promise<void> {
  if (!recipient) return
  await insertFeedNotices([recipient], {
    sender_name: senderName,
    type: 'wufu',
    post_id: null,
    title: '♟️ 摆方新棋局开好啦',
    body: `${senderName} 摆好了新棋局，先手已定，快去看看吧～`,
  })
}

/** 留言板新留言：发送方落一条铃铛提醒给对方（对方离线也能看到） */
export async function notifyCoupleChatMessage(recipient: string, senderName: string, content: string): Promise<void> {
  if (!recipient) return
  await insertFeedNotices([recipient], {
    sender_name: senderName,
    type: 'chat',
    post_id: null,
    title: '💬 留言板有新留言',
    body: `${senderName}：${clip(content, 24)}`,
  })
}

/** 催对方完成三餐打卡：自己已打完三餐、对方还没打完时，落一条铃铛提醒 */
export async function notifyCoupleMealNudge(recipient: string, senderName: string): Promise<void> {
  if (!recipient) return
  await insertFeedNotices([recipient], {
    sender_name: senderName,
    type: 'love',
    post_id: null,
    title: '💌 催你打卡啦',
    body: `${senderName} 已完成今日三餐打卡，就差你啦，打卡完就解锁今日情话～`,
  })
}

/** 双方三餐打卡齐、专属情话解锁：给两人的铃铛各落一条提醒，点击直达「今日专属情话」 */
export async function notifyLoveUnlocked(recipients: [string, string], senderName: string): Promise<void> {
  await insertFeedNotices(recipients.filter(Boolean), {
    sender_name: senderName,
    type: 'love-unlocked',
    post_id: null,
    title: '💖 今日专属情话已解锁',
    body: `${senderName} 和你今天的三餐打卡都齐啦，专属情话已经揭晓，快去看看吧～`,
  })
}

/**
 * 记录一次真心话 / 大冒险。
 * 真心话带 answer（必填由调用方保证），默认给对方落一条铃铛通知；
 * 大冒险只记录题目，不发通知（棋盘里抽到的传 notify: false 免打扰）。
 */
export async function createCoupleTruthDare(input: {
  userA: string
  userB: string
  senderId: string
  senderName: string
  type: CoupleTruthDareType
  prompt: string
  answer?: string
  notify?: boolean
}): Promise<CoupleTruthDareRow> {
  const [memberA, memberB] = couplePair(input.userA, input.userB)
  const answer = (input.answer ?? '').trim() || null
  const { data, error } = await supabase
    .from('couple_truth_dare')
    .insert({
      member_a: memberA,
      member_b: memberB,
      sender_id: input.senderId,
      sender_name: input.senderName,
      type: input.type,
      prompt: input.prompt.trim(),
      answer,
      answered_at: answer ? new Date().toISOString() : null,
    })
    .select()
    .single()
  if (error || !data) fail(error, '保存真心话大冒险记录')
  if (input.notify !== false && input.type === 'truth' && answer) {
    const recipient = input.senderId === memberA ? memberB : memberA
    await notifyCoupleTruthAnswer(recipient, input.prompt)
  }
  return data as CoupleTruthDareRow
}

export async function listCoupleTruthDare(userA: string, userB: string, limit = 100): Promise<CoupleTruthDareRow[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase
    .from('couple_truth_dare')
    .select('*')
    .eq('member_a', memberA)
    .eq('member_b', memberB)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) fail(error, '加载真心话大冒险记录')
  return (data ?? []) as CoupleTruthDareRow[]
}

/** 管理员查看所有情侣的真心话大冒险记录 */
export async function listAllCoupleTruthDare(limit = 1000): Promise<CoupleTruthDareRow[]> {
  const { data, error } = await supabase
    .from('couple_truth_dare')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) fail(error, '加载全部真心话大冒险记录')
  return (data ?? []) as CoupleTruthDareRow[]
}

/** 管理员批量删除真心话大冒险记录 */
export async function deleteCoupleTruthDare(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('couple_truth_dare').delete().in('id', ids)
  if (error) fail(error, '删除真心话大冒险记录')
}

/* ------------------------ 情侣联网飞行棋（双方轮流） ------------------------ */

export type CoupleBoardCellKind =
  | 'start'
  | 'end'
  | 'task'
  | 'forward'
  | 'back'
  | 'pause'
  | 'reroll'
  | 'truth'
  | 'dare'
  | 'goal'
  | 'penalty'
  | 'bonus'
  | 'release'

export interface CoupleBoardCell {
  kind: CoupleBoardCellKind
  text: string
  /** forward / back 的格数 */
  value?: number
}

export interface CoupleBoardLogItem {
  at: string
  text: string
}

export interface CoupleBoardState {
  size: number
  stepMin: number
  stepMax: number
  cells: CoupleBoardCell[]
  /** 双方位置：下标 0 = member_a（红棋），1 = member_b（蓝棋） */
  positions: [number, number]
  /** 当前该谁掷骰：0 = member_a，1 = member_b */
  turn: 0 | 1
  /** 各自被暂停的回合数 */
  paused: [number, number]
  /** 双方是否处于惩罚状态（踩到惩罚格后，直到踩到解锁格才解除）；旧棋局可能没有该字段 */
  penalty?: [boolean, boolean]
  dice: number | null
  log: CoupleBoardLogItem[]
  winner: 0 | 1 | null
  /** 踩到真心话格时待作答的题目（答完才清除） */
  pending: { type: 'truth'; prompt: string; player: 0 | 1 } | null
  /** 整局暂停（双方任一人可开启/解除）：暂停时双方可以去做别的，回来接着玩 */
  gamePaused?: boolean
}

export interface CoupleBoardGameRow {
  member_a: string
  member_b: string
  state: CoupleBoardState
  updated_at: string
}

export async function fetchCoupleBoardGame(userA: string, userB: string): Promise<CoupleBoardGameRow | null> {
  if (!userA || !userB || userA === userB) return null
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase
    .from('couple_board_games')
    .select('*')
    .eq('member_a', memberA)
    .eq('member_b', memberB)
    .maybeSingle()
  if (error) fail(error, '加载飞行棋棋局')
  return (data as CoupleBoardGameRow | null) ?? null
}

/** 生成 / 更新共享棋局：双方实时同步，后写覆盖先写（回合校验由调用方负责） */
export async function upsertCoupleBoardGame(userA: string, userB: string, state: CoupleBoardState): Promise<void> {
  if (!userA || !userB || userA === userB) throw new Error('请先添加好友再开始联网飞行棋')
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase
    .from('couple_board_games')
    .upsert(
      { member_a: memberA, member_b: memberB, state, updated_at: new Date().toISOString() },
      { onConflict: 'member_a,member_b' }
    )
  if (error) fail(error, '同步飞行棋棋局')
}

/** 销毁共享棋局（结束本局）：数据库不再保留该局数据，之后可重新设置棋盘 */
export async function deleteCoupleBoardGame(userA: string, userB: string): Promise<void> {
  if (!userA || !userB || userA === userB) return
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase.from('couple_board_games').delete().eq('member_a', memberA).eq('member_b', memberB)
  if (error) fail(error, '结束飞行棋棋局')
}

export interface CoupleBoardGameHistoryRow {
  id: string
  member_a: string
  member_b: string
  state: CoupleBoardState
  winner: 0 | 1
  finished_at: string
}

/** 一局结束时把整份棋局快照（棋盘、过程日志、最终位置、胜负）存进历史 */
export async function createCoupleBoardGameHistory(userA: string, userB: string, state: CoupleBoardState): Promise<void> {
  if (!userA || !userB || userA === userB) throw new Error('棋局归属异常，无法保存对局历史')
  if (state.winner === null) return
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase
    .from('couple_board_game_history')
    .insert({ member_a: memberA, member_b: memberB, state, winner: state.winner })
  if (error) fail(error, '保存飞行棋对局历史')
}

export async function listCoupleBoardGameHistory(
  userA: string,
  userB: string,
  limit = 20
): Promise<CoupleBoardGameHistoryRow[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase
    .from('couple_board_game_history')
    .select('*')
    .eq('member_a', memberA)
    .eq('member_b', memberB)
    .order('finished_at', { ascending: false })
    .limit(limit)
  if (error) fail(error, '加载飞行棋对局历史')
  return (data ?? []) as CoupleBoardGameHistoryRow[]
}

/* ------------------------------ 情侣扫雷 ------------------------------ */

/** 扫雷格子状态：0 未开 1 已开（含踩雷） 2 标记疑似地雷 */
export const MINES_CELL = { closed: 0, opened: 1, flagged: 2 } as const

/** 踩雷触发的互动任务记录 */
export interface CoupleMinesHit {
  player: 0 | 1
  index: number
  task: string
  at: string
}

export interface CoupleMinesState {
  rows: number
  cols: number
  /** 地雷总数（开局设定） */
  mineTotal: number
  /** 地雷所在的格子下标（行 × cols + 列）；首次点开时才生成，保证第一步安全 */
  mines: number[]
  /** 每格状态，见 MINES_CELL */
  cells: number[]
  /** 轮到谁点：0 = member_a（❤️），1 = member_b（💙）；标记不消耗回合 */
  turn: 0 | 1
  log: CoupleBoardLogItem[]
  /** 踩雷记录：谁、哪格、触发的任务 */
  hits: CoupleMinesHit[]
  /** 通关时随机解锁的奖励文案 */
  reward: string | null
  /** 所有非地雷格子全部点开 = 通关 */
  cleared: boolean
}

export interface CoupleMinesRow {
  member_a: string
  member_b: string
  state: CoupleMinesState
  updated_at: string
}

export async function fetchCoupleMines(userA: string, userB: string): Promise<CoupleMinesRow | null> {
  if (!userA || !userB || userA === userB) return null
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase
    .from('couple_mines')
    .select('*')
    .eq('member_a', memberA)
    .eq('member_b', memberB)
    .maybeSingle()
  if (error) fail(error, '加载情侣扫雷棋局')
  return (data as CoupleMinesRow | null) ?? null
}

/** 生成 / 更新共享扫雷：双方实时同步，后写覆盖先写（回合校验由调用方负责） */
export async function upsertCoupleMines(userA: string, userB: string, state: CoupleMinesState): Promise<void> {
  if (!userA || !userB || userA === userB) throw new Error('请先添加好友再开始情侣扫雷')
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase
    .from('couple_mines')
    .upsert(
      { member_a: memberA, member_b: memberB, state, updated_at: new Date().toISOString() },
      { onConflict: 'member_a,member_b' }
    )
  if (error) fail(error, '同步情侣扫雷棋局')
}

/** 销毁共享扫雷（结束本局）：数据库不再保留该局数据 */
export async function deleteCoupleMines(userA: string, userB: string): Promise<void> {
  if (!userA || !userB || userA === userB) return
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase.from('couple_mines').delete().eq('member_a', memberA).eq('member_b', memberB)
  if (error) fail(error, '结束情侣扫雷棋局')
}

export interface CoupleMinesHistoryRow {
  id: string
  member_a: string
  member_b: string
  state: CoupleMinesState
  cleared: boolean
  finished_at: string
}

/** 表还没建好（迁移未执行）时静默跳过，不当成硬错误刷屏 */
function isMissingTable(error: unknown): boolean {
  return /Could not find the table|relation .* does not exist/i.test(
    (error instanceof Error ? error.message : String(error ?? '')) || ''
  )
}

/** 一局通关时把整份棋局快照（棋盘、踩雷任务、奖励、结果）存进历史 */
export async function createCoupleMinesHistory(userA: string, userB: string, state: CoupleMinesState): Promise<void> {
  if (!userA || !userB || userA === userB) return
  if (!state.cleared) return
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase
    .from('couple_mines_history')
    .insert({ member_a: memberA, member_b: memberB, state, cleared: state.cleared })
  if (error && !isMissingTable(error)) fail(error, '保存情侣扫雷对局历史')
}

export async function listCoupleMinesHistory(
  userA: string,
  userB: string,
  limit = 20
): Promise<CoupleMinesHistoryRow[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase
    .from('couple_mines_history')
    .select('*')
    .eq('member_a', memberA)
    .eq('member_b', memberB)
    .order('finished_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingTable(error)) return []
    fail(error, '加载情侣扫雷对局历史')
  }
  return (data ?? []) as CoupleMinesHistoryRow[]
}

/* ------------------------------ 情侣摆方（五福棋） ------------------------------ */

/**
 * 摆方（五福棋 / 五棍棋）棋局状态：
 * 25 个落子点（5×5，行优先），board 取值 0=空 / 1=member_a（❤️）/ 2=member_b（💙）。
 * 三阶段流转：place 摆子（先手 13 子、后手 12 子，落子成项立刻提对方子）→
 * forceRemove 逼子（摆满 25 点但全程没吃子时，后手先移出对方一子）→
 * walk 走子（棋子沿线走一格，再次成项照样提子）。
 * 胜负：一方只剩 2 子，或轮到行动的一方无路可走。
 */
export interface CoupleWufuState {
  board: number[]
  phase: 'place' | 'forceRemove' | 'walk'
  /** 先手方（摆 13 子、开局掷骰决定）：0 = member_a，1 = member_b */
  firstMover: 0 | 1
  /** 当前该谁行动（提子未完成时保持行动方不变） */
  turn: 0 | 1
  /** 已摆子数（摆子阶段 0～25） */
  placed: number
  /** 摆子阶段是否出现过提子（决定摆满后走「逼子」还是直接进入走子） */
  capturedInPlace: boolean
  /** 成项后待提子数：行动方点选对方棋子提走，提完才换人 */
  pendingCaptures: number
  log: { at: string; text: string }[]
  winner: 0 | 1 | null
  /** 整局暂停：暂停时前端停止网络访问（省流量），继续时恢复轮询/实时订阅 */
  paused?: boolean
}

export interface CoupleWufuRow {
  member_a: string
  member_b: string
  state: CoupleWufuState
  updated_at: string
}

export async function fetchCoupleWufu(userA: string, userB: string): Promise<CoupleWufuRow | null> {
  if (!userA || !userB || userA === userB) return null
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase
    .from('couple_wufu')
    .select('*')
    .eq('member_a', memberA)
    .eq('member_b', memberB)
    .maybeSingle()
  if (error) fail(error, '加载摆方棋局')
  return (data as CoupleWufuRow | null) ?? null
}

/** 生成 / 更新共享摆方棋局：双方实时同步，后写覆盖先写（回合校验由调用方负责） */
export async function upsertCoupleWufu(userA: string, userB: string, state: CoupleWufuState): Promise<void> {
  if (!userA || !userB || userA === userB) throw new Error('请先添加好友再开始摆方五福棋')
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase
    .from('couple_wufu')
    .upsert(
      { member_a: memberA, member_b: memberB, state, updated_at: new Date().toISOString() },
      { onConflict: 'member_a,member_b' }
    )
  if (error) fail(error, '同步摆方棋局')
}

/** 销毁共享摆方棋局（结束本局）：数据库不再保留该局数据 */
export async function deleteCoupleWufu(userA: string, userB: string): Promise<void> {
  if (!userA || !userB || userA === userB) return
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase.from('couple_wufu').delete().eq('member_a', memberA).eq('member_b', memberB)
  if (error) fail(error, '结束摆方棋局')
}

/* ------------------------------ 情侣摆方对局历史 ------------------------------ */

export interface CoupleWufuHistoryRow {
  id: string
  member_a: string
  member_b: string
  state: CoupleWufuState
  winner: 0 | 1
  finished_at: string
}

/** 摆方一局结束（正常分出胜负 / 投降认输）时，把整份棋局快照存档，供回看 */
export async function createCoupleWufuHistory(userA: string, userB: string, state: CoupleWufuState): Promise<void> {
  if (!userA || !userB || userA === userB) return
  if (state.winner === null) return
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase
    .from('couple_wufu_history')
    .insert({ member_a: memberA, member_b: memberB, state, winner: state.winner })
  if (error && !isMissingTable(error)) fail(error, '保存摆方对局历史')
}

export async function listCoupleWufuHistory(userA: string, userB: string, limit = 20): Promise<CoupleWufuHistoryRow[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase
    .from('couple_wufu_history')
    .select('*')
    .eq('member_a', memberA)
    .eq('member_b', memberB)
    .order('finished_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingTable(error)) return []
    fail(error, '加载摆方对局历史')
  }
  return (data ?? []) as CoupleWufuHistoryRow[]
}

/** 管理员查看全部摆方对局历史（表未建时静默返回空） */
export async function listAllCoupleWufuHistory(limit = 200): Promise<CoupleWufuHistoryRow[]> {
  const { data, error } = await supabase
    .from('couple_wufu_history')
    .select('*')
    .order('finished_at', { ascending: false })
    .limit(limit)
  if (error && !isMissingTable(error)) fail(error, '加载全部摆方历史')
  return (data ?? []) as CoupleWufuHistoryRow[]
}

/** 管理员批量删除摆方对局历史 */
export async function deleteCoupleWufuHistory(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('couple_wufu_history').delete().in('id', ids)
  if (error && !isMissingTable(error)) fail(error, '删除摆方历史')
}

/* ------------------------------ 情侣五子棋 ------------------------------ */

export interface CoupleGomokuState {
  board: number[]
  turn: 0 | 1
  winner: 0 | 1 | null
  paused?: boolean
  log: { at: string; text: string }[]
}

export interface CoupleGomokuRow {
  member_a: string
  member_b: string
  state: CoupleGomokuState
  updated_at: string
}

export interface CoupleGomokuHistoryRow {
  id: string
  member_a: string
  member_b: string
  state: CoupleGomokuState
  winner: 0 | 1
  finished_at: string
}

export async function fetchCoupleGomoku(userA: string, userB: string): Promise<CoupleGomokuRow | null> {
  if (!userA || !userB || userA === userB) return null
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase.from('couple_gomoku').select('*').eq('member_a', memberA).eq('member_b', memberB).maybeSingle()
  if (error) fail(error, '加载五子棋棋局')
  return (data as CoupleGomokuRow | null) ?? null
}

export async function upsertCoupleGomoku(userA: string, userB: string, state: CoupleGomokuState): Promise<void> {
  if (!userA || !userB || userA === userB) throw new Error('请先添加好友再开始五子棋')
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase.from('couple_gomoku').upsert(
    { member_a: memberA, member_b: memberB, state, updated_at: new Date().toISOString() },
    { onConflict: 'member_a,member_b' }
  )
  if (error) fail(error, '同步五子棋棋局')
}

export async function deleteCoupleGomoku(userA: string, userB: string): Promise<void> {
  if (!userA || !userB || userA === userB) return
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase.from('couple_gomoku').delete().eq('member_a', memberA).eq('member_b', memberB)
  if (error) fail(error, '结束五子棋棋局')
}

export async function createCoupleGomokuHistory(userA: string, userB: string, state: CoupleGomokuState): Promise<void> {
  if (!userA || !userB || userA === userB || state.winner === null) return
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase.from('couple_gomoku_history').insert({ member_a: memberA, member_b: memberB, state, winner: state.winner })
  if (error && !isMissingTable(error)) fail(error, '保存五子棋对局历史')
}

export async function listCoupleGomokuHistory(userA: string, userB: string, limit = 20): Promise<CoupleGomokuHistoryRow[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase.from('couple_gomoku_history').select('*').eq('member_a', memberA).eq('member_b', memberB).order('finished_at', { ascending: false }).limit(limit)
  if (error) {
    if (isMissingTable(error)) return []
    fail(error, '加载五子棋对局历史')
  }
  return (data ?? []) as CoupleGomokuHistoryRow[]
}

export async function listAllCoupleGomokuHistory(limit = 200): Promise<CoupleGomokuHistoryRow[]> {
  const { data, error } = await supabase.from('couple_gomoku_history').select('*').order('finished_at', { ascending: false }).limit(limit)
  if (error && !isMissingTable(error)) fail(error, '加载全部五子棋历史')
  return (data ?? []) as CoupleGomokuHistoryRow[]
}

export async function deleteCoupleGomokuHistory(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('couple_gomoku_history').delete().in('id', ids)
  if (error && !isMissingTable(error)) fail(error, '删除五子棋历史')
}

export async function notifyGomokuTurn(recipient: string, senderName: string): Promise<void> {
  if (!recipient) return
  await insertFeedNotices([recipient], { sender_name: senderName, type: 'gomoku', post_id: null, title: '⚫ 轮到你下五子棋了', body: `${senderName} 落子完毕，快去互动空间 → 五子棋吧～` })
}

export async function notifyGomokuNew(recipient: string, senderName: string): Promise<void> {
  if (!recipient) return
  await insertFeedNotices([recipient], { sender_name: senderName, type: 'gomoku', post_id: null, title: '⚫ 五子棋新棋局开好啦', body: `${senderName} 创建了五子棋棋局，快去互动空间看看吧～` })
}

/* ------------------------------ 情侣骰子比大小 ------------------------------ */

export type DiceBetChoice = 'small' | 'big' | null

export interface CoupleDiceState {
  banker: 0 | 1
  dices: [number, number, number] | null
  bets: [DiceBetChoice, DiceBetChoice]
  chips: [number, number]
  round: number
  rolling: boolean
  lastResult: {
    dices: [number, number, number]
    sum: number
    isTriple: boolean
    outcome: 'small' | 'big' | 'triple'
    winnerDesc: string
  } | null
  log: Array<{ at: string; text: string }>
}

export interface CoupleDiceRow {
  member_a: string
  member_b: string
  state: CoupleDiceState
  updated_at: string
}

export interface CoupleDiceHistoryRow {
  id: string
  member_a: string
  member_b: string
  state: CoupleDiceState
  finished_at: string
}

export async function fetchCoupleDice(userA: string, userB: string): Promise<CoupleDiceRow | null> {
  if (!userA || !userB || userA === userB) return null
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase.from('couple_dice_games').select('*').eq('member_a', memberA).eq('member_b', memberB).maybeSingle()
  if (error) {
    if (isMissingTable(error)) return null
    fail(error, '加载骰子比大小对局')
  }
  return (data as CoupleDiceRow | null) ?? null
}

export async function upsertCoupleDice(userA: string, userB: string, state: CoupleDiceState): Promise<void> {
  if (!userA || !userB || userA === userB) throw new Error('请先添加好友再玩骰子')
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase.from('couple_dice_games').upsert({
    member_a: memberA,
    member_b: memberB,
    state,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'member_a,member_b' })
  if (error) fail(error, '同步骰子对局')
}

export async function deleteCoupleDice(userA: string, userB: string): Promise<void> {
  if (!userA || !userB || userA === userB) return
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase.from('couple_dice_games').delete().eq('member_a', memberA).eq('member_b', memberB)
  if (error) fail(error, '重置骰子对局')
}

export async function createCoupleDiceHistory(userA: string, userB: string, state: CoupleDiceState): Promise<void> {
  if (!userA || !userB || userA === userB) return
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase.from('couple_dice_history').insert({
    member_a: memberA,
    member_b: memberB,
    state,
  })
  if (error && !isMissingTable(error)) fail(error, '保存骰子对局历史')
}

export async function listCoupleDiceHistory(userA: string, userB: string, limit = 20): Promise<CoupleDiceHistoryRow[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase.from('couple_dice_history').select('*').eq('member_a', memberA).eq('member_b', memberB).order('finished_at', { ascending: false }).limit(limit)
  if (error) {
    if (isMissingTable(error)) return []
    fail(error, '加载骰子对局历史')
  }
  return (data ?? []) as CoupleDiceHistoryRow[]
}

export async function listAllCoupleDiceHistory(limit = 200): Promise<CoupleDiceHistoryRow[]> {
  const { data, error } = await supabase.from('couple_dice_history').select('*').order('finished_at', { ascending: false }).limit(limit)
  if (error && !isMissingTable(error)) fail(error, '加载全部骰子对局历史')
  return (data ?? []) as CoupleDiceHistoryRow[]
}

export async function deleteCoupleDiceHistory(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('couple_dice_history').delete().in('id', ids)
  if (error && !isMissingTable(error)) fail(error, '删除骰子历史')
}

export async function notifyDiceRoll(recipient: string, senderName: string): Promise<void> {
  if (!recipient) return
  await insertFeedNotices([recipient], {
    sender_name: senderName,
    type: 'dice',
    post_id: null,
    title: '🎲 骰子比大小开骰啦',
    body: `${senderName} 开骰揭晓了结果，快去互动空间看看筹码输赢吧～`,
  })
}

/* ------------------------------ 情侣重要日倒计时 ------------------------------ */

export interface CoupleCountdownItem {
  id: string
  title: string
  /** 目标日期 YYYY-MM-DD */
  date: string
  emoji?: string
  created_by?: string
}

export interface CoupleCountdownState {
  items: CoupleCountdownItem[]
}

export interface CoupleCountdownRow {
  member_a: string
  member_b: string
  state: CoupleCountdownState
  updated_at: string
}

export async function fetchCoupleCountdown(userA: string, userB: string): Promise<CoupleCountdownRow | null> {
  if (!userA || !userB || userA === userB) return null
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase.from('couple_countdown').select('*').eq('member_a', memberA).eq('member_b', memberB).maybeSingle()
  if (error) {
    if (isMissingTable(error)) return null
    fail(error, '加载重要日倒计时')
  }
  return (data as CoupleCountdownRow | null) ?? null
}

export async function upsertCoupleCountdown(userA: string, userB: string, state: CoupleCountdownState): Promise<void> {
  if (!userA || !userB || userA === userB) throw new Error('请先添加好友再使用倒计时')
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase.from('couple_countdown').upsert({
    member_a: memberA,
    member_b: memberB,
    state,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'member_a,member_b' })
  if (error) fail(error, '同步重要日倒计时')
}

/* ------------------------------ 情侣刮刮乐 ------------------------------ */

export interface CoupleScratchCard {
  id: string
  prize: string
  created_by: string
  created_at: string
  revealed_at: string | null
  revealed_by: string | null
}

/**
 * 刮刮乐状态：每人一张独立的卡（cards 的 key 为抽卡人 member id），
 * 自己只能刮自己的卡，刮开结果双方都可见；log 只记「谁刮的 + 结果」。
 */
export interface CoupleScratchState {
  cards: Record<string, CoupleScratchCard>
  log: Array<{ at: string; text: string }>
}

export interface CoupleScratchRow {
  member_a: string
  member_b: string
  state: CoupleScratchState
  updated_at: string
}

export async function fetchCoupleScratch(userA: string, userB: string): Promise<CoupleScratchRow | null> {
  if (!userA || !userB || userA === userB) return null
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase.from('couple_scratch').select('*').eq('member_a', memberA).eq('member_b', memberB).maybeSingle()
  if (error) {
    if (isMissingTable(error)) return null
    fail(error, '加载刮刮乐')
  }
  return (data as CoupleScratchRow | null) ?? null
}

export async function upsertCoupleScratch(userA: string, userB: string, state: CoupleScratchState): Promise<void> {
  if (!userA || !userB || userA === userB) throw new Error('请先添加好友再玩刮刮乐')
  const [memberA, memberB] = couplePair(userA, userB)
  const { error } = await supabase.from('couple_scratch').upsert({
    member_a: memberA,
    member_b: memberB,
    state,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'member_a,member_b' })
  if (error) fail(error, '同步刮刮乐')
}

/** 对方刮开了一张刮刮乐：落一条铃铛提醒，点击直达刮刮乐模块 */
export async function notifyScratchRevealed(recipient: string, senderName: string, prize: string): Promise<void> {
  if (!recipient) return
  await insertFeedNotices([recipient], {
    sender_name: senderName,
    type: 'scratch',
    post_id: null,
    title: '🎫 刮刮乐被刮开啦',
    body: `${senderName} 刮开了卡片，刮中了「${prize}」，快去看看～`,
  })
}

/* ------------------------------ 情侣西瓜分 ------------------------------ */

export interface CoupleWatermelonScoreRow {
  member_a: string
  member_b: string
  score_a: number
  score_b: number
  updated_at: string
}

export interface CoupleWatermelonLogRow {
  id: string
  member_a: string
  member_b: string
  target_member: string
  delta: number
  reason: string
  sender_id: string
  sender_name: string
  created_at: string
}

export async function fetchCoupleWatermelon(userA: string, userB: string): Promise<CoupleWatermelonScoreRow | null> {
  if (!userA || !userB || userA === userB) return null
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase.from('couple_watermelon_scores').select('*').eq('member_a', memberA).eq('member_b', memberB).maybeSingle()
  if (error) {
    if (isMissingTable(error)) return null
    fail(error, '加载西瓜分')
  }
  return (data as CoupleWatermelonScoreRow | null) ?? null
}

export async function upsertCoupleWatermelon(userA: string, userB: string, patch: { scoreA?: number; scoreB?: number }): Promise<void> {
  if (!userA || !userB || userA === userB) throw new Error('请先添加好友再调整西瓜分')
  const [memberA, memberB] = couplePair(userA, userB)
  const current = await fetchCoupleWatermelon(memberA, memberB)
  const next = {
    member_a: memberA,
    member_b: memberB,
    score_a: patch.scoreA ?? current?.score_a ?? 0,
    score_b: patch.scoreB ?? current?.score_b ?? 0,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('couple_watermelon_scores').upsert(next, { onConflict: 'member_a,member_b' })
  if (error) fail(error, '同步西瓜分')
}

export async function createCoupleWatermelonLog(input: {
  userA: string
  userB: string
  targetMember: string
  delta: number
  reason: string
  senderId: string
  senderName: string
  balanceAfter?: number
}): Promise<CoupleWatermelonLogRow> {
  if (!input.userA || !input.userB || input.userA === input.userB) throw new Error('请先添加好友再调整西瓜分')
  const [memberA, memberB] = couplePair(input.userA, input.userB)
  if (input.targetMember !== memberA && input.targetMember !== memberB) throw new Error('西瓜分只能给当前好友对象调整')
  const delta = Math.max(-100, Math.min(100, Math.trunc(input.delta)))
  if (delta === 0) throw new Error('请选择加分或减分数值')
  const reason = input.reason.trim().slice(0, 80) || (delta > 0 ? '加分' : '减分')
  const { data, error } = await supabase.from('couple_watermelon_logs').insert({
    member_a: memberA,
    member_b: memberB,
    target_member: input.targetMember,
    delta,
    reason,
    sender_id: input.senderId,
    sender_name: input.senderName || '好友',
  }).select('*').single()
  if (error) fail(error, '记录西瓜分')
  return data as CoupleWatermelonLogRow
}

export async function listCoupleWatermelonLogs(userA: string, userB: string, limit = 500): Promise<CoupleWatermelonLogRow[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase.from('couple_watermelon_logs').select('*').eq('member_a', memberA).eq('member_b', memberB).order('created_at', { ascending: false }).limit(limit)
  if (error) {
    if (isMissingTable(error)) return []
    fail(error, '加载西瓜分明细')
  }
  return (data ?? []) as CoupleWatermelonLogRow[]
}

export async function listAllCoupleWatermelonScores(limit = 200): Promise<CoupleWatermelonScoreRow[]> {
  const { data, error } = await supabase.from('couple_watermelon_scores').select('*').order('updated_at', { ascending: false }).limit(limit)
  if (error && !isMissingTable(error)) fail(error, '加载全部西瓜分')
  return (data ?? []) as CoupleWatermelonScoreRow[]
}

export async function listAllCoupleWatermelonLogs(limit = 200): Promise<CoupleWatermelonLogRow[]> {
  const { data, error } = await supabase.from('couple_watermelon_logs').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error && !isMissingTable(error)) fail(error, '加载全部西瓜分明细')
  return (data ?? []) as CoupleWatermelonLogRow[]
}

export async function deleteCoupleWatermelonLogs(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('couple_watermelon_logs').delete().in('id', ids)
  if (error && !isMissingTable(error)) fail(error, '删除西瓜分明细')
}

export async function notifyWatermelonScore(recipient: string, senderName: string, delta: number, reason: string): Promise<void> {
  if (!recipient) return
  const sign = delta > 0 ? `+${delta}` : String(delta)
  await insertFeedNotices([recipient], {
    sender_name: senderName,
    type: 'watermelon',
    post_id: null,
    title: `🍉 你的西瓜分 ${sign}`,
    body: `${senderName} 给你${delta > 0 ? '加' : '减'}了 ${Math.abs(delta)} 分：${reason}`,
  })
}

/* ------------------------------ 订单 ------------------------------ */

export async function createOrder(input: {
  items: { dish_id: string | null; dish_name: string; emoji: string; qty: number }[]
  meal_slot: MealSlot
  hope_time: string
  note: string
  member_id: string | null
}): Promise<string> {
  const { data, error } = await supabase
    .from('orders')
    .insert({
      meal_slot: input.meal_slot,
      hope_time: input.hope_time,
      note: input.note,
      status: 'pending',
      member_id: input.member_id,
    })
    .select('id')
    .single()
  if (error || !data) fail(error, '提交订单')

  const orderId = data.id as string
  if (input.items.length) {
    const { error: e2 } = await supabase
      .from('order_items')
      .insert(input.items.map((it) => ({ ...it, order_id: orderId })))
    if (e2) fail(e2, '写入订单明细')
  }
  return orderId
}

export async function listOrders(limit = 60, memberId?: string | null): Promise<OrderWithItems[]> {
  let query = supabase.from('orders').select('*')
  if (memberId) query = query.eq('member_id', memberId)
  const { data: orders, error } = await query.order('created_at', { ascending: false }).limit(limit)
  if (error) fail(error, '加载订单')

  const list = (orders ?? []) as OrderWithItems[]
  if (!list.length) return []

  const { data: items, error: e2 } = await supabase
    .from('order_items')
    .select('*')
    .in('order_id', list.map((o) => o.id))
  if (e2) fail(e2, '加载订单明细')

  const byOrder = new Map<string, OrderWithItems['items']>()
  for (const it of (items ?? []) as OrderWithItems['items']) {
    const arr = byOrder.get(it.order_id) ?? []
    arr.push(it)
    byOrder.set(it.order_id, arr)
  }
  return list.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }))
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const { error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) fail(error, '更新订单状态')
}

export async function markOrderRead(id: string): Promise<void> {
  await supabase.from('orders').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null)
}

/* ------------------------------ 三餐记录 ------------------------------ */

export async function listMealsRange(days: string[], memberId?: string | null): Promise<Meal[]> {
  if (!days.length) return []
  let query = supabase.from('meals').select('*').in('day', days)
  if (memberId) query = query.eq('member_id', memberId)
  const { data, error } = await query.order('created_at', { ascending: true })
  if (error) fail(error, '加载三餐记录')
  return (data ?? []) as Meal[]
}

export async function upsertMeal(input: {
  day: string
  slot: MealSlot
  status: MealStatus
  content: string
  photo_url: string
  note: string
  member_id: string | null
}): Promise<void> {
  let find = supabase.from('meals').select('id').eq('day', input.day).eq('slot', input.slot)
  if (input.member_id) find = find.eq('member_id', input.member_id)
  const { data: existing } = await find.maybeSingle()

  const payload = {
    day: input.day,
    slot: input.slot,
    status: input.status,
    content: input.content,
    photo_url: input.photo_url,
    note: input.note,
    member_id: input.member_id,
    read_at: null, // 每次更新都算新消息，我这边重新出现红点
  }

  const { error } = existing
    ? await supabase.from('meals').update(payload).eq('id', existing.id)
    : await supabase.from('meals').insert(payload)
  if (error) fail(error, '保存三餐记录')
}

/** 「我」在后台直接修改她的某条就餐记录（按 id 改，不计未读） */
export async function updateMeal(
  id: string,
  patch: Partial<Pick<Meal, 'status' | 'content' | 'note' | 'photo_url'>>
): Promise<void> {
  const { error } = await supabase
    .from('meals')
    .update({ ...patch, read_at: new Date().toISOString() })
    .eq('id', id)
  if (error) fail(error, '修改就餐记录')
}

/** 「我」在后台删除她的某条就餐记录 */
export async function removeMeal(id: string): Promise<void> {
  const { error } = await supabase.from('meals').delete().eq('id', id)
  if (error) fail(error, '删除就餐记录')
}

export async function markMealRead(id: string): Promise<void> {
  await supabase.from('meals').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null)
}

/** 「我」把订单标记为「做好了」后，自动把她这顿同步成一条就餐记录（吃了） */
export async function autoMealFromOrder(order: OrderWithItems): Promise<void> {
  const day = toDayStr(new Date(order.created_at))
  // 若该餐次她已手动记录过，则不覆盖
  let find = supabase.from('meals').select('id').eq('day', day).eq('slot', order.meal_slot)
  if (order.member_id) find = find.eq('member_id', order.member_id)
  const { data: existing } = await find.maybeSingle()
  if (existing) return
  const content = order.items.map((i) => `${i.dish_name}×${i.qty}`).join('、') || order.note || '（她下的单）'
  const { error } = await supabase.from('meals').insert({
    day,
    slot: order.meal_slot,
    status: 'eaten' as MealStatus,
    content,
    photo_url: '',
    note: order.note ?? '',
    member_id: order.member_id ?? null,
    read_at: new Date().toISOString(), // 我这边自己补全，不弹通知/不计未读
  })
  if (error) fail(error, '同步就餐记录')
}

const PHOTO_BUCKET = 'meal-photos'

export type UploadedPhoto = {
  url: string
  /** 实际上传的大小（压缩后） */
  size: number
  /** 原图大小 */
  originalSize: number
}

/** 上传图片：先压缩到 20KB 左右再传，省流量也省 Supabase 存储 */
export async function uploadMealPhoto(file: File): Promise<UploadedPhoto> {
  if (file.size > MAX_IMAGE_FILE_BYTES) throw new Error('上传图片失败：图片超过 50MB，换一张小一点的吧')

  const originalSize = file.size
  let upload: File = file
  let size = originalSize

  try {
    const c = await compressImage(file)
    upload = c.file
    size = c.size
  } catch {
    // 压缩失败（浏览器太老 / 图解码不了）就用原图，别挡着用户上传
    upload = file
    size = originalSize
  }

  const bucket = supabase.storage.from(PHOTO_BUCKET)
  const ext = (upload.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await bucket.upload(path, upload, {
    cacheControl: '3600',
    contentType: upload.type || 'image/jpeg',
  })

  if (error) {
    const msg = error.message ?? ''
    // 分情况给提示，别再一律说「没建 bucket」
    if (/bucket.*not.*found|not found|does not exist/i.test(msg)) {
      throw new Error(
        `上传图片失败：Supabase 里找不到 bucket "${PHOTO_BUCKET}"。Storage → New bucket，名字必须完全一致并勾选 Public`
      )
    }
    if (/row-level security|policy|permission|unauthorized|403/i.test(msg)) {
      throw new Error(
        `上传图片失败：bucket 有了但没开写入权限。请执行 supabase/migrations/0007_meal_photos_policy.sql（给 storage.objects 放开 anon 上传）`
      )
    }
    throw new Error(`上传图片失败：${msg}`)
  }

  return { url: bucket.getPublicUrl(path).data.publicUrl, size, originalSize }
}

/* ------------------------------ 饭圈 ------------------------------ */

/**
 * 可见性规则（核心：账户之间互相隔离，只有好友才互通）：
 * - 动态：我（管理员）看到所有人的；某个她只看「我发的」+「她自己发的」+「她好友发的」，
 *   非好友的动态一条都看不到
 *   （想让她连自己的都看不到，把 includeSelf 传 false）
 * - 点赞 / 评论：**只有我能看到所有人的**；她只能看到「我点的赞 / 我发的评论」+「她自己的」+
 *   「她好友的」，非好友的点赞和评论对她完全不可见
 * - 针对性回复：评论的 reply_to 填了成员 id 时，**只有那个人能看到**（我也能看到），
 *   没被回复到的人连这条评论都收不到
 * - 管理员 默认和所有人都是好友，所以走 isAdmin 分支时不做任何过滤
 */
export async function listPosts(viewer: {
  isAdmin: boolean
  memberId: string | null
  includeSelf?: boolean
  /** 好友的成员 id 列表：不是好友的动态 / 点赞 / 评论一律过滤掉 */
  friendIds?: string[]
}): Promise<PostWithMeta[]> {
  const friendIds = (viewer.friendIds ?? []).filter(Boolean)
  const friendSet = new Set(friendIds)

  let query = supabase.from('posts').select('*')
  if (!viewer.isAdmin) {
    const filters = ['author.eq.me']
    if (viewer.memberId && viewer.includeSelf !== false) filters.push(`member_id.eq.${viewer.memberId}`)
    if (friendIds.length) {
      const memberFriendIds = friendIds.filter((id) => id !== '__admin__')
      if (memberFriendIds.length) filters.push(`member_id.in.(${memberFriendIds.join(',')})`)
    }
    query = query.or(filters.join(','))
  }
  const { data: posts, error } = await query.order('created_at', { ascending: false }).limit(50)
  if (error) fail(error, '加载饭圈')

  const list = (posts ?? []) as Post[]
  if (!list.length) return []

  const ids = list.map((p) => p.id)
  const [likes, comments] = await Promise.all([
    supabase.from('post_likes').select('*').in('post_id', ids),
    supabase
      .from('post_comments')
      .select('*')
      .in('post_id', ids)
      .order('created_at', { ascending: true }),
  ])
  if (likes.error) fail(likes.error, '加载点赞')
  if (comments.error) fail(comments.error, '加载评论')

  /** 这个人是我 / 我（管理员）/ 我的好友吗？不是就一律不可见 */
  const isVisibleActor = (memberId: string | null) =>
    memberId === null || (!!viewer.memberId && memberId === viewer.memberId) || friendSet.has(memberId)

  /**
   * 点赞可见性：我全看到；她只能看到「我点的」+「她自己点的」+「她好友点的」
   * （她自己的必须保留，否则她点完赞连红心都不亮）
   */
  const canSeeLike = (l: PostLike) => viewer.isAdmin || isVisibleActor(l.member_id)

  /** 评论可见性：我全看到；她看到「我的评论」+「她自己的」+「她好友的」（定向回复只给被回复的人） */
  const canSeeComment = (c: PostComment) => {
    if (viewer.isAdmin) return true
    if (!isVisibleActor(c.member_id)) return false // 非好友的评论，连影子都看不到
    if (viewer.memberId && c.member_id === viewer.memberId) return true // 她自己的
    if (c.member_id === null) {
      // 我发的：没指定人 → 公开；指定了人 → 只有那个人能看到
      return c.reply_to === null || (!!viewer.memberId && c.reply_to === viewer.memberId)
    }
    // 好友发的：定向回复只给被回复的那个人看
    return c.reply_to === null || (!!viewer.memberId && c.reply_to === viewer.memberId)
  }

  const likesBy = new Map<string, PostLike[]>()
  for (const l of (likes.data ?? []) as PostLike[]) {
    if (!canSeeLike(l)) continue
    likesBy.set(l.post_id, [...(likesBy.get(l.post_id) ?? []), l])
  }
  const commentsBy = new Map<string, PostComment[]>()
  for (const c of (comments.data ?? []) as PostComment[]) {
    if (!canSeeComment(c)) continue
    commentsBy.set(c.post_id, [...(commentsBy.get(c.post_id) ?? []), c])
  }

  return list.map((p) => ({
    ...p,
    likes: likesBy.get(p.id) ?? [],
    comments: commentsBy.get(p.id) ?? [],
  }))
}

export async function createPost(input: {
  author: PostAuthor
  member_id: string | null
  content: string
  photo_url?: string
  meal_slot?: MealSlot | null
  day?: string | null
}): Promise<void> {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author: input.author,
      member_id: input.member_id,
      content: input.content.trim(),
      photo_url: input.photo_url ?? '',
      meal_slot: input.meal_slot ?? null,
      day: input.day ?? null,
    })
    .select('id')
    .single()
  if (error || !data) fail(error, '发布动态')
  // 等待通知记录落库后再返回，确保发布完成时好友铃铛已可读取通知
  await notifyFeedPost(input.member_id, data.id, input.content.trim())
}

/** 她记录完三餐后自动发一条动态；同一天同一餐次只发一条，重复填写就更新 */
export async function publishMealPost(input: {
  member_id: string | null
  day: string
  slot: MealSlot
  content: string
  photo_url: string
}): Promise<void> {
  let find = supabase.from('posts').select('id').eq('day', input.day).eq('meal_slot', input.slot).eq('author', 'her')
  find = input.member_id ? find.eq('member_id', input.member_id) : find.is('member_id', null)
  const { data: existing } = await find.maybeSingle()

  const payload = { content: input.content, photo_url: input.photo_url }
  if (existing) {
    // 重复提交同一天同一餐：覆盖内容，并把 created_at 刷新到此刻（饭圈动态置顶、时间同步更新）
    const { error } = await supabase
      .from('posts')
      .update({ ...payload, created_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) fail(error, '更新饭圈动态')
    return
  }
  const { data, error } = await supabase.from('posts').insert({
    author: 'her' as PostAuthor,
    member_id: input.member_id,
    day: input.day,
    meal_slot: input.slot,
    ...payload,
  }).select('id').single()
  if (error || !data) fail(error, '发布饭圈动态')
  await notifyFeedPost(input.member_id, data.id, input.content.trim())
}

export async function removePost(id: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', id)
  if (error) fail(error, '删除动态')
}

/**
 * 管理员全量拉取饭圈动态（不做可见性过滤）。
 * @param filter.from / filter.to 日期范围（含当天），按 posts.day 或 created_at 当天匹配；留空即不限
 * @param filter.memberId 只看某个成员；null/undefined = 所有人；'me' 代表管理员自己发的（member_id 为空）
 * @param filter.keyword 按内容关键词过滤
 */
export async function listPostsAdmin(filter: {
  from?: string
  to?: string
  memberId?: string | null
  keyword?: string
  limit?: number
} = {}): Promise<PostWithMeta[]> {
  let query = supabase.from('posts').select('*')
  if (filter.from) query = query.gte('created_at', `${filter.from}T00:00:00`)
  if (filter.to) query = query.lte('created_at', `${filter.to}T23:59:59.999`)
  if (filter.memberId) {
    query = filter.memberId === ME_KEY ? query.is('member_id', null).eq('author', 'me') : query.eq('member_id', filter.memberId)
  }
  const keyword = (filter.keyword ?? '').trim()
  if (keyword) query = query.ilike('content', `%${keyword}%`)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(filter.limit ?? 1000)
  if (error) fail(error, '加载饭圈动态（管理员）')

  const list = (data ?? []) as Post[]
  if (!list.length) return []

  const ids = list.map((p) => p.id)
  const [likes, comments] = await Promise.all([
    supabase.from('post_likes').select('*').in('post_id', ids),
    supabase.from('post_comments').select('*').in('post_id', ids).order('created_at', { ascending: true }),
  ])
  if (likes.error) fail(likes.error, '加载点赞')
  if (comments.error) fail(comments.error, '加载评论')

  const likesBy = new Map<string, PostLike[]>()
  for (const l of (likes.data ?? []) as PostLike[]) likesBy.set(l.post_id, [...(likesBy.get(l.post_id) ?? []), l])
  const commentsBy = new Map<string, PostComment[]>()
  for (const c of (comments.data ?? []) as PostComment[]) commentsBy.set(c.post_id, [...(commentsBy.get(c.post_id) ?? []), c])

  return list.map((p) => ({ ...p, likes: likesBy.get(p.id) ?? [], comments: commentsBy.get(p.id) ?? [] }))
}

/** 管理员批量删除动态（点赞 / 评论随外键 on delete cascade 一并带走） */
export async function deletePosts(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('posts').delete().in('id', ids)
  if (error) fail(error, '批量删除动态')
}

/** 管理员修改某条动态的文字内容 */
export async function updatePostContent(id: string, content: string): Promise<void> {
  const clean = content.trim()
  if (!clean) throw new Error('动态内容不能为空')
  const { error } = await supabase.from('posts').update({ content: clean }).eq('id', id)
  if (error) fail(error, '更新动态内容')
}

/** 点赞 / 取消赞，返回点赞后的状态 */
export async function toggleLike(postId: string, memberId: string | null): Promise<boolean> {
  let find = supabase.from('post_likes').select('id').eq('post_id', postId)
  find = memberId ? find.eq('member_id', memberId) : find.is('member_id', null)
  const { data: mine } = await find.maybeSingle()

  if (mine) {
    const { error } = await supabase.from('post_likes').delete().eq('id', mine.id)
    if (error) fail(error, '取消点赞')
    return false
  }
  const { error } = await supabase.from('post_likes').insert({ post_id: postId, member_id: memberId })
  if (error) fail(error, '点赞')
  // 通知动态主人收到新赞（失败不影响点赞）
  void notifyFeedLike(memberId, postId)
  return true
}

/**
 * 发评论。
 * @param replyTo 针对性回复的成员 id：填了就**只有那个人能看到**（我自己当然也看得到）；
 *                传 null 则是公开评论。
 */
export async function addComment(
  postId: string,
  memberId: string | null,
  content: string,
  replyTo: string | null = null
): Promise<void> {
  const text = content.trim()
  if (!text) return
  const { error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, member_id: memberId, content: text, reply_to: replyTo })
  if (error) fail(error, '发表评论')
  // 通知被回复的人或动态主人（失败不影响评论）
  void notifyFeedComment(memberId, postId, text, replyTo)
}

export async function removeComment(id: string): Promise<void> {
  const { error } = await supabase.from('post_comments').delete().eq('id', id)
  if (error) fail(error, '删除评论')
}

/* ------------------------ 饭圈消息通知（顶栏未读角标） ------------------------ */

export type FeedNoticeType =
  | 'post'
  | 'like'
  | 'comment'
  | 'reply'
  | 'quiz'
  | 'truth'
  | 'together'
  | 'chat'
  | 'board'
  | 'mines'
  | 'wufu'
  | 'gomoku'
  | 'watermelon'
  | 'dice'
  | 'love'
  | 'love-unlocked'
  | 'scratch'

export interface FeedNotificationRow {
  id: string
  /** 接收人：members.id 或 'me'（管理员，与 posts.member_id 空值口径一致） */
  recipient: string
  sender_name: string
  type: FeedNoticeType
  post_id: string | null
  title: string
  body: string
  read_at: string | null
  created_at: string
}

/** 管理员在通知体系里的身份 key（与 posts.member_id 为空对应） */
const ME_KEY = 'me'

/** 操作人昵称：管理员读全局昵称设置，成员读 members.name */
async function resolveActorName(memberId: string | null): Promise<string> {
  if (!memberId) {
    try {
      return await getSetting('admin_name', ADMIN_NAME)
    } catch {
      return ADMIN_NAME
    }
  }
  const { data } = await supabase.from('members').select('name').eq('id', memberId).maybeSingle()
  return data?.name || '好友'
}

/** 判断某成员是否在线：最近 5 分钟内有 last_active_at 更新视为在线 */
async function isRecipientOnline(recipientId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('members')
      .select('last_active_at')
      .eq('id', recipientId)
      .maybeSingle()
    if (!data?.last_active_at) return false
    const ts = new Date(data.last_active_at).getTime()
    return Date.now() - ts < 5 * 60_000
  } catch {
    return false
  }
}

/** 批量落通知：任一条失败都不影响主流程；游戏类通知会自动跳过在线用户（在线时由前端弹窗提示） */
async function insertFeedNotices(
  recipients: string[],
  notice: Omit<FeedNotificationRow, 'id' | 'recipient' | 'read_at' | 'created_at'>
): Promise<void> {
  const unique = [...new Set(recipients.filter(Boolean))]
  if (!unique.length) return
  // 游戏类（board / mines / wufu / gomoku / dice）通知：在线用户跳过写铃铛（前端弹窗已提示）
  const gameTypes: ReadonlySet<string> = new Set(['board', 'mines', 'wufu', 'gomoku', 'watermelon', 'dice'])
  const filtered = gameTypes.has(notice.type)
    ? await Promise.all(
        unique.map(async (id) => {
          const online = await isRecipientOnline(id)
          return online ? null : id
        })
      )
    : unique
  const finalRecipients = filtered.filter((id): id is string => id !== null)
  if (!finalRecipients.length) return
  try {
    const { error } = await supabase
      .from('feed_notifications')
      .insert(finalRecipients.map((recipient) => ({ ...notice, recipient })))
    if (error) {
      console.warn('写入饭圈通知失败', error)
    }
  } catch (error) {
    console.warn('写入饭圈通知失败', error)
  }
}

/** 通知对象：她 → 已接受的好友成员 + 管理员（隐式好友）；管理员 → 所有成员 */
async function feedAudience(actorMemberId: string | null): Promise<string[]> {
  if (!actorMemberId) {
    const { data } = await supabase.from('members').select('id')
    return (data ?? []).map((m: { id: string }) => m.id)
  }
  const { data } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${actorMemberId},addressee_id.eq.${actorMemberId}`)
  const peers = (data ?? []).map((f: { requester_id: string; addressee_id: string }) =>
    f.requester_id === actorMemberId ? f.addressee_id : f.requester_id
  )
  return [...peers, ME_KEY]
}

const clip = (text: string, max = 30) => (text.length > max ? `${text.slice(0, max)}…` : text)

/** 同步抉择双方都作答后，通知未提交答案的一方；通知落库后即使离线也能在铃铛看到 */
async function notifyCoupleQuizReveal(recipient: string, historyId: string, title: string): Promise<void> {
  try {
    const name = await resolveActorName(null)
    await insertFeedNotices([recipient], {
      sender_name: name,
      type: 'quiz',
      post_id: historyId,
      title: '同步抉择已揭晓',
      body: `「${clip(title, 24)}」双方都选好啦，快去看看结果`,
    })
  } catch (error) {
    console.warn('写入同步抉择通知失败', error)
  }
}

/** 发布动态 → 通知我的好友们 */
export async function notifyFeedPost(memberId: string | null, postId: string, content: string): Promise<void> {
  try {
    const [name, audience] = await Promise.all([resolveActorName(memberId), feedAudience(memberId)])
    await insertFeedNotices(audience, {
      sender_name: name,
      type: 'post',
      post_id: postId,
      title: `${name}发了新动态`,
      body: clip(content.trim()) || '分享了美食',
    })
  } catch {
    // 通知失败不影响发帖
  }
}

/** 点赞 → 通知动态主人 */
export async function notifyFeedLike(memberId: string | null, postId: string): Promise<void> {
  try {
    const { data: post } = await supabase.from('posts').select('member_id').eq('id', postId).maybeSingle()
    if (!post) return
    const owner = post.member_id ?? ME_KEY
    if (owner === (memberId ?? ME_KEY)) return // 自己赞自己不发通知
    const name = await resolveActorName(memberId)
    await insertFeedNotices([owner], {
      sender_name: name,
      type: 'like',
      post_id: postId,
      title: `${name}赞了你的动态`,
      body: '你的饭圈动态收到一个新❤️',
    })
  } catch {
    // 通知失败不影响点赞
  }
}

/** 评论 / 定向回复 → 通知被回复的人（定向）或动态主人（公开） */
export async function notifyFeedComment(
  memberId: string | null,
  postId: string,
  content: string,
  replyTo: string | null
): Promise<void> {
  try {
    let recipient: string
    let title: string
    if (replyTo) {
      recipient = replyTo
      title = '回复了你'
    } else {
      const { data: post } = await supabase.from('posts').select('member_id').eq('id', postId).maybeSingle()
      if (!post) return
      recipient = post.member_id ?? ME_KEY
      title = '评论了你的动态'
    }
    if (recipient === (memberId ?? ME_KEY)) return // 自己评论自己不发通知
    const name = await resolveActorName(memberId)
    await insertFeedNotices([recipient], {
      sender_name: name,
      type: replyTo ? 'reply' : 'comment',
      post_id: postId,
      title: `${name}${title}`,
      body: clip(content.trim()),
    })
  } catch {
    // 通知失败不影响评论
  }
}

/** 某个身份（members.id 或 'me'）的消息列表，新的在前 */
export async function listFeedNotifications(identity: string, limit = 5, offset = 0): Promise<FeedNotificationRow[]> {
  if (!identity) return []
  const from = Math.max(0, offset)
  const { data, error } = await supabase
    .from('feed_notifications')
    .select('*')
    .eq('recipient', identity)
    .order('created_at', { ascending: false })
    .range(from, from + Math.max(1, limit) - 1)
  if (error) fail(error, '加载消息通知')
  return (data ?? []) as FeedNotificationRow[]
}

export async function markFeedNotificationRead(identity: string, notificationId: string): Promise<void> {
  if (!identity || !notificationId) return
  const { error } = await supabase
    .from('feed_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient', identity)
    .is('read_at', null)
  if (error) fail(error, '标记消息已读')
}

/** 一键把该成员所有未读铃铛通知全部标记已读（消除铃铛数字角标） */
export async function markFeedNotificationsReadAll(identity: string): Promise<void> {
  if (!identity) return
  const { error } = await supabase
    .from('feed_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient', identity)
    .is('read_at', null)
  if (error) fail(error, '标记全部消息已读')
}

/** 未读消息条数（顶栏角标） */
export async function unreadFeedNotificationsCount(identity: string): Promise<number> {
  if (!identity) return 0
  const { count, error } = await supabase
    .from('feed_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient', identity)
    .is('read_at', null)
  if (error) fail(error, '统计未读消息')
  return count ?? 0
}

/** 打开消息面板后全部标记已读（角标随之消失） */
export async function markFeedNotificationsRead(identity: string): Promise<void> {
  if (!identity) return
  const { error } = await supabase
    .from('feed_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient', identity)
    .is('read_at', null)
  if (error) fail(error, '标记消息已读')
}

/* ------------------------------ 应用设置 ------------------------------ */

/** 读一项设置，没配过就用 fallback（例如「我的昵称」默认「我」） */
export async function getSetting(key: string, fallback = ''): Promise<string> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  if (error || !data) return fallback
  return (data.value as string) || fallback
}

/**
 * 一次取回多个设置项：多个 key 合成 1 次请求，
 * 并在短时间内复用同一结果（各处轮询同一份配置时不再重复打网络）。
 */
export function getSettings(keys: string[]): Promise<Record<string, string>> {
  if (!keys.length) return Promise.resolve({})
  return deduped(`settings:${keys.join(',')}`, 60_000, async () => {
    const { data, error } = await supabase.from('app_settings').select('key, value').in('key', keys)
    if (error) fail(error, '加载设置')
    const map: Record<string, string> = {}
    for (const row of (data ?? []) as { key: string; value: string }[]) map[row.key] = String(row.value ?? '')
    return map
  })
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) fail(error, '保存设置')
  invalidateDedupe('settings:')
}

/* ------------------------------ 模块开关（管理员控制） ------------------------------ */

export interface ModuleFlagRow {
  key: string
  /** null = 全局默认；填成员 id = 该成员的单独配置（优先于全局） */
  member_id: string | null
  enabled: boolean
  updated_at: string
}

/** 读取全部模块开关（表未建时静默返回空数组，前端按「全部开放」回落） */
export function listModuleFlags(): Promise<ModuleFlagRow[]> {
  return deduped('moduleFlags', 8_000, async () => {
    const { data, error } = await supabase.from('app_module_flags').select('key, member_id, enabled, updated_at')
    if (error) {
      if (isMissingTable(error)) return []
      fail(error, '加载模块开关')
    }
    return (data ?? []) as ModuleFlagRow[]
  })
}

/** 写入一个模块开关：memberId 传 null 表示改全局默认（表用偏索引，改走「先更新、没命中再插入」） */
export async function saveModuleFlag(key: string, enabled: boolean, memberId: string | null = null): Promise<void> {
  const stamped = new Date().toISOString()
  const base = () => supabase.from('app_module_flags').update({ enabled, updated_at: stamped }).eq('key', key)
  const target = memberId ? base().eq('member_id', memberId) : base().is('member_id', null)
  const { data: updated, error: updateError } = await target.select('id')
  if (updateError && !isMissingTable(updateError)) fail(updateError, '保存模块开关')
  if ((updated ?? []).length) {
    invalidateDedupe('moduleFlags')
    return
  }
  const { error } = await supabase
    .from('app_module_flags')
    .insert({ key, member_id: memberId, enabled, updated_at: stamped })
  if (error) fail(error, '保存模块开关')
  invalidateDedupe('moduleFlags')
}

/** 删除某个成员的单独配置，让它回落到全局默认 */
export async function deleteModuleFlag(key: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('app_module_flags')
    .delete()
    .eq('key', key)
    .eq('member_id', memberId)
  if (error) fail(error, '恢复模块默认配置')
  invalidateDedupe('moduleFlags')
}

/* ------------------------------ 未读 ------------------------------ */

export async function unreadCounts(): Promise<{ orders: number; meals: number; requests: number }> {
  const [o, m, r] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).is('read_at', null).neq('status', 'cancelled'),
    supabase.from('meals').select('id', { count: 'exact', head: true }).is('read_at', null),
    supabase.from('dish_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  return { orders: o.count ?? 0, meals: m.count ?? 0, requests: r.count ?? 0 }
}

/* ------------------------ 管理员：互动空间数据统一管理 ------------------------ */

/** 全部留言板消息（跨全部情侣对，新的在前） */
export async function listAllCoupleMessages(limit = 1000): Promise<CoupleChatMessage[]> {
  const { data, error } = await supabase
    .from('couple_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) fail(error, '加载全部留言')
  return (data ?? []) as CoupleChatMessage[]
}

/** 管理员修改一条留言内容 */
export async function updateCoupleMessage(id: string, content: string): Promise<void> {
  const clean = content.trim()
  if (!clean) throw new Error('留言内容不能为空')
  const { error } = await supabase.from('couple_messages').update({ content: clean }).eq('id', id)
  if (error) fail(error, '更新留言')
}

/** 管理员批量删除留言 */
export async function deleteCoupleMessages(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('couple_messages').delete().in('id', ids)
  if (error) fail(error, '删除留言')
}

/** 管理员修正一条答题历史：双方答案一起更新，并重算状态与匹配结果 */
export async function updateCoupleQuizHistory(id: string, choiceA: string | null, choiceB: string | null): Promise<void> {
  const a = (choiceA ?? '').trim() || null
  const b = (choiceB ?? '').trim() || null
  const patch: Record<string, unknown> = { choice_a: a, choice_b: b }
  if (a && b) {
    patch.status = 'revealed'
    patch.matched = a === b
    patch.revealed_at = new Date().toISOString()
  } else {
    patch.status = 'answering'
    patch.matched = null
    patch.revealed_at = null
  }
  const { error } = await supabase.from('couple_quiz_history').update(patch).eq('id', id)
  if (error) fail(error, '更新答题历史')
}

/** 管理员批量删除答题历史 */
export async function deleteCoupleQuizHistory(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('couple_quiz_history').delete().in('id', ids)
  if (error) fail(error, '删除答题历史')
}

/** 管理员修改真心话的答案（清空则回到未作答状态） */
export async function updateCoupleTruthDareAnswer(id: string, answer: string): Promise<void> {
  const clean = answer.trim()
  const { error } = await supabase
    .from('couple_truth_dare')
    .update({ answer: clean || null, answered_at: clean ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) fail(error, '更新真心话答案')
}

/** 管理员批量删除秘密心愿 */
export async function deleteCoupleWishes(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('couple_wishes').delete().in('id', ids)
  if (error) fail(error, '删除秘密心愿')
}

/** 管理员查看全部飞行棋对局历史 */
export async function listAllCoupleBoardGameHistory(limit = 200): Promise<CoupleBoardGameHistoryRow[]> {
  const { data, error } = await supabase
    .from('couple_board_game_history')
    .select('*')
    .order('finished_at', { ascending: false })
    .limit(limit)
  if (error) fail(error, '加载全部飞行棋历史')
  return (data ?? []) as CoupleBoardGameHistoryRow[]
}

/** 管理员批量删除飞行棋对局历史 */
export async function deleteCoupleBoardGameHistory(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('couple_board_game_history').delete().in('id', ids)
  if (error) fail(error, '删除飞行棋历史')
}

/** 管理员查看全部扫雷对局历史（表未建时静默返回空） */
export async function listAllCoupleMinesHistory(limit = 200): Promise<CoupleMinesHistoryRow[]> {
  const { data, error } = await supabase
    .from('couple_mines_history')
    .select('*')
    .order('finished_at', { ascending: false })
    .limit(limit)
  if (error && !isMissingTable(error)) fail(error, '加载全部扫雷历史')
  return (data ?? []) as CoupleMinesHistoryRow[]
}

/** 管理员批量删除扫雷对局历史 */
export async function deleteCoupleMinesHistory(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await supabase.from('couple_mines_history').delete().in('id', ids)
  if (error && !isMissingTable(error)) fail(error, '删除扫雷历史')
}
