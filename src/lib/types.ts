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
  /** 针对性回复：只有这个成员能看到（NULL = 公开评论，所有看得见这条动态的人都能看到） */
  reply_to: string | null
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

/* ------------------------------ 好友 ------------------------------ */

export type FriendshipStatus = 'pending' | 'accepted'

/** 一对人一行关系：谁发的申请记在 requester_id，备注各存各的 */
export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: FriendshipStatus
  requester_note: string | null
  addressee_note: string | null
  created_at: string
  updated_at: string
}

/** 好友（已经 accepted 的） */
export interface FriendProfile {
  memberId: string
  /** 对方自己设的昵称 */
  name: string
  avatarUrl: string
  /** 我给 TA 的备注（空 = 没备注） */
  note: string
  /** 显示名：有备注用备注，否则用昵称 */
  shownName: string
  /** 关系行 id（改备注 / 删好友要用）；adminMao 视图下为空串 */
  friendshipId: string
  since: string
}

/** 待接受的好友申请 */
export interface FriendRequestItem {
  friendshipId: string
  memberId: string
  name: string
  avatarUrl: string
  createdAt: string
}

/** 我和某个人的关系：self 自己 / accepted 好友 / incoming 对方申请我 / outgoing 我申请对方 / none 陌生人 */
export type FriendRelation = 'self' | 'accepted' | 'incoming' | 'outgoing' | 'none'

export interface FriendSearchResult {
  memberId: string
  name: string
  avatarUrl: string
  relation: FriendRelation
  friendshipId: string | null
}

/** 互动空间甜蜜聊天消息 */
export interface CoupleMessage {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  created_at: string
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
  /** 这个成员看到的「我」的昵称；为空表示沿用全局昵称 */
  my_name: string | null
  /** 头像地址（0010_avatars.sql 之后才有；老数据为 null，界面回落到默认表情） */
  avatar_url?: string | null
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
