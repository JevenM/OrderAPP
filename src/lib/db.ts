import { ADMIN_CODE, ADMIN_NAME, configured, supabase } from './supabase'
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

export async function listMembers(): Promise<Member[]> {
  const { data, error } = await withTimeout(
    supabase.from('members').select('*').order('created_at', { ascending: true }),
    15_000,
    '加载成员'
  )
  if (error) fail(error, '加载成员')
  return (data ?? []) as Member[]
}

/**
 * 校验邀请码。登录第一步，网络不通时要给得出排查方向（见 netHint），
 * 另外加 15s 超时，避免弱网下一直转圈没有任何反馈。
 */
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

export async function createMember(name: string, code: string): Promise<Member> {
  const { data, error } = await supabase.from('members').insert({ name, code }).select().single()
  if (error || !data) fail(error, '新增成员')
  return data as Member
}

export async function updateMember(
  id: string,
  patch: { name?: string; code?: string; my_name?: string | null; avatar_url?: string | null }
): Promise<void> {
  const { error } = await supabase.from('members').update(patch).eq('id', id)
  if (error) fail(error, '修改成员')
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
}

/* ------------------------------ 好友 ------------------------------ */

/**
 * 好友可见性总规则（adminMao 是唯一例外）：
 * - adminMao 默认和所有账户都是好友：能看到所有人的动态 / 点赞 / 评论，也不用发申请；
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
    normalized === ADMIN_CODE ||
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

export async function listCoupleWishes(userA: string, userB: string): Promise<CoupleWish[]> {
  if (!userA || !userB || userA === userB) return []
  const [memberA, memberB] = couplePair(userA, userB)
  const { data, error } = await supabase
    .from('couple_wishes')
    .select('*')
    .eq('member_a', memberA)
    .eq('member_b', memberB)
    .order('created_at', { ascending: true })
  if (error) fail(error, '加载心愿')
  return (data ?? []) as CoupleWish[]
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
  const channelName = coupleChannelName(userA, userB)
  const channel = supabase.channel(channelName)
  await channel.subscribe()
  await channel.send({
    type: 'broadcast',
    event: 'couple_event',
    payload: event,
  })
}

export function subscribeCoupleMessages(
  userA: string,
  userB: string,
  onMessage: (msg: { id: string; sender_id: string; receiver_id: string; content: string; created_at: string }) => void
): () => void {
  if (!userA || !userB || userA === userB) return () => {}
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
  const channelName = coupleChannelName(senderId, receiverId)
  const channel = supabase.channel(channelName)
  await channel.subscribe()
  await channel.send({ type: 'broadcast', event: 'new_message', payload: fallback })
  return fallback
}

export async function listCoupleMessages(
  userA: string,
  userB: string
): Promise<{ id: string; sender_id: string; receiver_id: string; content: string; created_at: string }[]> {
  if (!userA || !userB || userA === userB) return []
  try {
    const { data, error } = await supabase
      .from('couple_messages')
      .select('*')
      .or(`and(sender_id.eq.${userA},receiver_id.eq.${userB}),and(sender_id.eq.${userB},receiver_id.eq.${userA})`)
      .order('created_at', { ascending: true })
      .limit(100)
    if (!error && data) return data
  } catch {
    // 降级返回空
  }
  return []
}

/* ------------------------ 互动空间双人同步（心愿 / 抉择） ------------------------ */

export type CoupleQuizQuestion = {
  id: string
  title: string
  a: string
  b: string
  kind: '轻松版' | '走心版' | '自定义'
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
 * - 动态：我（adminMao）看到所有人的；某个她只看「我发的」+「她自己发的」+「她好友发的」，
 *   非好友的动态一条都看不到
 *   （想让她连自己的都看不到，把 includeSelf 传 false）
 * - 点赞 / 评论：**只有我能看到所有人的**；她只能看到「我点的赞 / 我发的评论」+「她自己的」+
 *   「她好友的」，非好友的点赞和评论对她完全不可见
 * - 针对性回复：评论的 reply_to 填了成员 id 时，**只有那个人能看到**（我也能看到），
 *   没被回复到的人连这条评论都收不到
 * - adminMao 默认和所有人都是好友，所以走 isAdmin 分支时不做任何过滤
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

  /** 这个人是我 / 我（adminMao）/ 我的好友吗？不是就一律不可见 */
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

export type FeedNoticeType = 'post' | 'like' | 'comment' | 'reply' | 'quiz'

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

/** 批量落通知：任一条失败都不影响主流程 */
async function insertFeedNotices(
  recipients: string[],
  notice: Omit<FeedNotificationRow, 'id' | 'recipient' | 'read_at' | 'created_at'>
): Promise<void> {
  const unique = [...new Set(recipients.filter(Boolean))]
  if (!unique.length) return
  try {
    const { error } = await supabase
      .from('feed_notifications')
      .insert(unique.map((recipient) => ({ ...notice, recipient })))
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

export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) fail(error, '保存设置')
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
