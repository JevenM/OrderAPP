import type { OrderStatus } from './types'

/**
 * 订单流转：待接单 → 已接单 → 制作中 → 已完成。
 * 已取消是旁路终态，不参与推进。
 */
export const ORDER_FLOW: OrderStatus[] = ['pending', 'accepted', 'cooking', 'done']

/** 每一步在进度条上的短标签（详情面板与接单卡共用） */
export const ORDER_FLOW_LABEL: Record<string, string> = {
  pending: '待接单',
  accepted: '已接单',
  cooking: '制作中',
  done: '已完成',
  cancelled: '已取消',
}

/** 当前状态在流转里的位置：pending=0 … done=3；cancelled 返回 -1 */
export function flowIndex(status: OrderStatus): number {
  const i = ORDER_FLOW.indexOf(status)
  return i
}

/** 下一步状态；已到终态或已取消返回 null */
export function nextOrderStatus(status: OrderStatus): OrderStatus | null {
  const i = flowIndex(status)
  if (i < 0 || i >= ORDER_FLOW.length - 1) return null
  return ORDER_FLOW[i + 1]
}

/** 下一步按钮上写什么 */
export function nextOrderAction(status: OrderStatus): string | null {
  switch (status) {
    case 'pending':
      return '接单'
    case 'accepted':
      return '开始制作'
    case 'cooking':
      return '完成'
    default:
      return null
  }
}

/** 进度条完成度：cancelled 视为未开始 */
export function orderProgress(status: OrderStatus): number {
  const i = flowIndex(status)
  if (i < 0) return 0
  return (i / (ORDER_FLOW.length - 1)) * 100
}
