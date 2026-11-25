import { describe, expect, it } from 'vitest'
import { flowIndex, nextOrderAction, nextOrderStatus, orderProgress, ORDER_FLOW } from './orderFlow'

describe('orderFlow', () => {
  it('完整流转链：待接单 → 已接单 → 制作中 → 完成', () => {
    expect(ORDER_FLOW).toEqual(['pending', 'accepted', 'cooking', 'done'])
    expect(nextOrderStatus('pending')).toBe('accepted')
    expect(nextOrderStatus('accepted')).toBe('cooking')
    expect(nextOrderStatus('cooking')).toBe('done')
    expect(nextOrderStatus('done')).toBeNull()
    expect(nextOrderStatus('cancelled')).toBeNull()
  })

  it('按钮文案与当前状态对应', () => {
    expect(nextOrderAction('pending')).toBe('接单')
    expect(nextOrderAction('accepted')).toBe('开始制作')
    expect(nextOrderAction('cooking')).toBe('完成')
    expect(nextOrderAction('done')).toBeNull()
  })

  it('进度位置与完成度', () => {
    expect(flowIndex('pending')).toBe(0)
    expect(flowIndex('cooking')).toBe(2)
    expect(flowIndex('cancelled')).toBe(-1)
    expect(orderProgress('pending')).toBe(0)
    expect(orderProgress('done')).toBe(100)
    expect(orderProgress('cancelled')).toBe(0)
  })
})
