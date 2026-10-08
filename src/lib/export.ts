import type { CoupleQuizHistoryRow } from './db'

export type CoupleQuizHistoryExportRow = CoupleQuizHistoryRow & {
  member_a_name: string
  member_b_name: string
}

function download(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}

export function exportCoupleQuizHistoryCsv(rows: CoupleQuizHistoryExportRow[], filename: string): void {
  const headers = ['成员 A', '成员 B', '题目分类', '题目', '选项 A', '选项 B', 'A 的答案', 'B 的答案', '状态', '是否匹配', '开始时间', 'A 提交时间', 'B 提交时间', '揭晓时间']
  const lines = rows.map((row) => [
    row.member_a_name,
    row.member_b_name,
    row.question_kind,
    row.question_title,
    row.option_a,
    row.option_b,
    row.choice_a,
    row.choice_b,
    row.status === 'revealed' ? '已揭晓' : '进行中',
    row.matched === true ? '是' : row.matched === false ? '否' : '',
    row.started_at,
    row.choice_a_at,
    row.choice_b_at,
    row.revealed_at,
  ].map(csvCell).join(','))
  download(`\uFEFF${[headers.map(csvCell).join(','), ...lines].join('\r\n')}`, filename, 'text/csv;charset=utf-8')
}

export function exportCoupleQuizHistoryJson(rows: CoupleQuizHistoryExportRow[], filename: string): void {
  download(JSON.stringify(rows, null, 2), filename, 'application/json;charset=utf-8')
}
