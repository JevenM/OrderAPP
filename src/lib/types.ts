export type Role = 'her' | 'me'

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type MealStatus = 'eaten' | 'little' | 'skipped'
export type OrderStatus = 'pending' | 'accepted' | 'done' | 'cancelled'
export type DishRequestStatus = 'pending' | 'approved' | 'rejected'
export type PostAuthor = 'me' | 'her'

export interface Post {
  id: string
  author: PostAuthor
  member_id: string | null
  content: string
  photo_url: string
  meal_slot: MealSlot | null
  day: string | null
  created_at: string
}

export interface PostLike {
  id: string
  post_id: string
  member_id: string | null
  created_at: string
}

export interface PostComment {
  id: string
  post_id: string
  member_id: string | null
  content: string
  created_at: string
}

export type PostWithMeta = Post & {
  likes: PostLike[]
  comments: PostComment[]
}

export interface DishRequest {
  id: string
  name: string
  note: string
  status: DishRequestStatus
  member_id: string | null
  created_at: string
  handled_at: string | null
}

export interface Dish {
  id: string
  name: string
  category: string
  emoji: string
  description: string
  price: number
  available: boolean
  sort_order: number
}

export interface OrderItem {
  id: string
  order_id: string
  dish_id: string | null
  dish_name: string
  emoji: string
  qty: number
}

export interface Member {
  id: string
  name: string
  code: string
  created_at: string
}

export interface Order {
  id: string
  status: OrderStatus
  meal_slot: MealSlot
  hope_time: string
  note: string
  created_at: string
  read_at: string | null
  updated_at: string
  member_id: string | null
}

export type OrderWithItems = Order & { items: OrderItem[] }

export interface Meal {
  id: string
  day: string
  slot: MealSlot
  status: MealStatus
  content: string
  photo_url: string
  note: string
  created_at: string
  read_at: string | null
  member_id: string | null
}

export const SLOTS: { key: MealSlot; label: string; emoji: string }[] = [
  { key: 'breakfast', label: '早餐', emoji: '🌅' },
  { key: 'lunch', label: '午餐', emoji: '☀️' },
  { key: 'dinner', label: '晚餐', emoji: '🌙' },
  { key: 'snack', label: '加餐', emoji: '🍰' },
]

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
}

export const MEAL_STATUS: Record<MealStatus, { label: string; emoji: string; cls: string }> = {
  eaten: { label: '吃了', emoji: '✅', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  little: { label: '吃得少', emoji: '🫤', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  skipped: { label: '没吃', emoji: '❌', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
}

export const DISH_REQUEST_STATUS: Record<DishRequestStatus, { label: string; emoji: string; cls: string }> = {
  pending: { label: '待审核', emoji: '⏳', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  approved: { label: '已收录', emoji: '✅', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  rejected: { label: '婉拒了', emoji: '🚫', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: '待接单', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
  accepted: { label: '已接单', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  done: { label: '已完成', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  cancelled: { label: '已取消', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
}
