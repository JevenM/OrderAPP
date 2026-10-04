export function toDayStr(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(): string {
  return toDayStr(new Date())
}

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + delta)
  return toDayStr(date)
}

export function lastDays(n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(shiftDay(todayStr(), -i))
  return out
}

export function weekdayCn(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(y, m - 1, d).getDay()]
}

export function prettyDay(day: string): string {
  if (day === todayStr()) return '今天'
  if (day === shiftDay(todayStr(), -1)) return '昨天'
  return day.slice(5).replace('-', '月') + '日'
}

export function timeCn(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
}
