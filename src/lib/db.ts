import { supabase } from './supabase'
import { toDayStr } from './date'
import type { Dish, Meal, MealSlot, MealStatus, Member, OrderStatus, OrderWithItems } from './types'

function fail(e: { message?: string } | null, tag: string): never {
  throw new Error(`${tag}失败：${e?.message ?? '未知错误'}`)
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
  const payload = {
    name: dish.name,
    category: dish.category ?? '家常菜',
    emoji: dish.emoji ?? '🍽️',
    description: dish.description ?? '',
    price: dish.price ?? 0,
    available: dish.available ?? true,
    sort_order: dish.sort_order ?? 0,
  }
  const { error } = dish.id
    ? await supabase.from('dishes').update(payload).eq('id', dish.id)
    : await supabase.from('dishes').insert(payload)
  if (error) fail(error, '保存菜品')
}

export async function removeDish(id: string): Promise<void> {
  const { error } = await supabase.from('dishes').delete().eq('id', id)
  if (error) fail(error, '删除菜品')
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
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) fail(error, '加载成员')
  return (data ?? []) as Member[]
}

export async function findMemberByCode(code: string): Promise<Member | null> {
  const { data, error } = await supabase.from('members').select('*').eq('code', code).maybeSingle()
  if (error) fail(error, '校验邀请码')
  return (data as Member | null) ?? null
}

export async function createMember(name: string, code: string): Promise<Member> {
  const { data, error } = await supabase.from('members').insert({ name, code }).select().single()
  if (error || !data) fail(error, '新增成员')
  return data as Member
}

export async function updateMember(id: string, patch: { name?: string; code?: string }): Promise<void> {
  const { error } = await supabase.from('members').update(patch).eq('id', id)
  if (error) fail(error, '修改成员')
}

export async function removeMember(id: string): Promise<void> {
  const { error } = await supabase.from('members').delete().eq('id', id)
  if (error) fail(error, '删除成员')
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

export async function uploadMealPhoto(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('meal-photos').upload(path, file, { cacheControl: '3600' })
  if (error) throw new Error(`上传图片失败（需先在 Supabase 创建公开 bucket "meal-photos"）：${error.message}`)
  return supabase.storage.from('meal-photos').getPublicUrl(path).data.publicUrl
}

/* ------------------------------ 未读 ------------------------------ */

export async function unreadCounts(): Promise<{ orders: number; meals: number }> {
  const [o, m] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).is('read_at', null).neq('status', 'cancelled'),
    supabase.from('meals').select('id', { count: 'exact', head: true }).is('read_at', null),
  ])
  return { orders: o.count ?? 0, meals: m.count ?? 0 }
}
