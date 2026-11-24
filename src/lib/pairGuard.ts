/**
 * 情侣对归属判定（纯函数，不依赖 supabase / 浏览器环境）。
 *
 * 多对情侣共用同一张 couple_* 表，而 Supabase 的 postgres_changes 是按「表」广播的，
 * 客户端会收到所有情侣的行。带 member_a/member_b 的行必须先比对再分发，
 * 否则别对情侣的数据会被直接写进本地 state。
 */
export interface PairRowPayload {
  new?: Record<string, unknown> | null
  old?: Record<string, unknown> | null
}

/** 把两个人排成固定的 (小, 大) 顺序，与数据库 check(member_a < member_b) 一致 */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/**
 * 事件是否属于当前情侣对：
 * - 行里有 member_a/member_b → 严格比对，不匹配就丢弃；
 * - 没有这两个字段（全局题库、meals、feed_notifications 等）→ 放行，
 *   由各 reload 自己的查询条件或回调里的 recipient 校验兜底；
 * - DELETE 事件的 new 常是空对象，改看 old（建了 replica identity full 才有完整行）。
 */
export function belongsToPair(payload: PairRowPayload, pair: readonly [string, string]): boolean {
  const fresh = payload.new
  const old = payload.old
  const row = fresh && 'member_a' in fresh ? fresh : old && 'member_a' in old ? old : null
  if (!row || !('member_b' in row)) return true
  const [a, b] = orderedPair(pair[0], pair[1])
  return row.member_a === a && row.member_b === b
}
