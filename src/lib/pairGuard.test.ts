import { describe, expect, it } from 'vitest'
import { belongsToPair, orderedPair } from './pairGuard'

const PAIR = ['a-user', 'b-user'] as const

describe('情侣对归属判定', () => {
  it('orderedPair 固定按字典序排列', () => {
    expect(orderedPair('b-user', 'a-user')).toEqual(['a-user', 'b-user'])
  })

  it('本对的行放行，别对的行拦截', () => {
    expect(belongsToPair({ new: { member_a: 'a-user', member_b: 'b-user', state: {} } }, PAIR)).toBe(true)
    expect(belongsToPair({ new: { member_a: 'x-user', member_b: 'y-user', state: {} } }, PAIR)).toBe(false)
  })

  it('传入顺序反了也能正确匹配', () => {
    expect(belongsToPair({ new: { member_a: 'a-user', member_b: 'b-user' } }, ['b-user', 'a-user'])).toBe(true)
  })

  it('半匹配（只有一方相同）必须拦截', () => {
    expect(belongsToPair({ new: { member_a: 'a-user', member_b: 'y-user' } }, PAIR)).toBe(false)
  })

  it('没有 member_a/member_b 的行放行（全局题库 / meals / 通知表）', () => {
    expect(belongsToPair({ new: { id: '1', content: '粥' } }, PAIR)).toBe(true)
    expect(belongsToPair({ new: {} }, PAIR)).toBe(true)
    expect(belongsToPair({}, PAIR)).toBe(true)
  })

  it('DELETE 事件 new 为空时改看 old，仍能拦住别对', () => {
    expect(belongsToPair({ new: {}, old: { member_a: 'x-user', member_b: 'y-user' } }, PAIR)).toBe(false)
    expect(belongsToPair({ new: {}, old: { member_a: 'a-user', member_b: 'b-user' } }, PAIR)).toBe(true)
  })

  it('DELETE 完全拿不到行信息时放行（最多多刷一次，不污染数据）', () => {
    expect(belongsToPair({ new: {}, old: { id: '1' } }, PAIR)).toBe(true)
  })
})
