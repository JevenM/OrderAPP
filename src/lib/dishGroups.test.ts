import { describe, expect, it } from 'vitest'
import { bucketByGroup, dishGroupOf } from './dishGroups'

describe('dishGroupOf', () => {
  it('登记过的菜系直接命中', () => {
    expect(dishGroupOf('家常菜')).toBe('meal')
    expect(dishGroupOf('汤羹')).toBe('meal')
    expect(dishGroupOf('主食')).toBe('staple')
    expect(dishGroupOf('小吃')).toBe('staple')
    expect(dishGroupOf('奶茶')).toBe('sweet')
    expect(dishGroupOf('甜品')).toBe('sweet')
  })

  it('没登记过的按关键词兜底', () => {
    expect(dishGroupOf('牛肉面')).toBe('staple')
    expect(dishGroupOf('水果拼盘')).toBe('sweet')
    expect(dishGroupOf('私房小炒')).toBe('meal')
  })

  it('空值与未知菜系落到正餐', () => {
    expect(dishGroupOf('')).toBe('meal')
    expect(dishGroupOf('神秘料理')).toBe('meal')
  })
})

describe('bucketByGroup', () => {
  it('按大类归拢并保持三类顺序', () => {
    const buckets = bucketByGroup<string>([
      ['奶茶', ['a']],
      ['家常菜', ['b', 'c']],
      ['主食', ['d']],
    ])
    expect(buckets.map((b) => b.key)).toEqual(['meal', 'staple', 'sweet'])
    expect(buckets[0].categories.map(([c]) => c)).toEqual(['家常菜'])
    expect(buckets[0].count).toBe(2)
    expect(buckets[1].count).toBe(1)
    expect(buckets[2].count).toBe(1)
  })

  it('没有菜的类别计数为 0', () => {
    const buckets = bucketByGroup<string>([['家常菜', ['b']]])
    expect(buckets.find((b) => b.key === 'sweet')?.count).toBe(0)
    expect(buckets.find((b) => b.key === 'sweet')?.categories).toEqual([])
  })
})
