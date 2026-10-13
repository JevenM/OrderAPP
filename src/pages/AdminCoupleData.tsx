import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteCoupleBoardGameHistory,
  deleteCoupleMessages,
  deleteCoupleMinesHistory,
  deleteCoupleQuizHistory,
  deleteCoupleTruthDare,
  deleteCoupleWishes,
  deleteCoupleWufuHistory,
  deleteCoupleGomokuHistory,
  listAllCoupleGomokuHistory,
  listAllCoupleBoardGameHistory,
  listAllCoupleMessages,
  listAllCoupleMinesHistory,
  listAllCoupleQuizHistory,
  listAllCoupleTruthDare,
  listAllCoupleWishes,
  listAllCoupleWufuHistory,
  updateCoupleMessage,
  updateCoupleQuizHistory,
  updateCoupleTruthDareAnswer,
  updateCoupleWish,
  type CoupleBoardGameHistoryRow,
  type CoupleChatMessage,
  type CoupleMinesHistoryRow,
  type CoupleQuizHistoryRow,
  type CoupleTruthDareRow,
  type CoupleWish,
  type CoupleWufuHistoryRow,
  type CoupleGomokuHistoryRow,
} from '../lib/db'
import { exportTableCsv, exportTableJson } from '../lib/export'
import { useToast } from '../components/Toast'
import { useMembers } from '../store/members'

/**
 * 管理员 · 互动空间数据统一管理：
 * 六个互动模块（留言板 / 同步抉择 / 真心话大冒险 / 秘密心愿 / 飞行棋 / 扫雷）
 * 一处搞定查看、编辑、导出（CSV/JSON）与批量删除。
 */
const TABS = [
  { key: 'messages', label: '💌 留言板' },
  { key: 'quiz', label: '💞 同步抉择' },
  { key: 'truth', label: '🎲 真心话' },
  { key: 'wishes', label: '🌠 秘密心愿' },
  { key: 'board', label: '🛫 飞行棋' },
  { key: 'mines', label: '💣 扫雷' },
  { key: 'wufu', label: '♟️ 摆方' },
  { key: 'gomoku', label: '⚫ 五子棋' },
] as const

type DataTab = (typeof TABS)[number]['key']

const TAB_DESC: Record<DataTab, string> = {
  messages: '双方互相留言的全部内容，可编辑、删除、导出。',
  quiz: '全部答题历史（题目与双方答案），可修正答案、删除、导出。',
  truth: '真心话 / 大冒险的抽题与作答记录，可修改答案、删除、导出。',
  wishes: '双方写下的秘密心愿，可编辑、删除、导出。',
  board: '飞行棋对局历史快照，仅支持查看、删除、导出。',
  mines: '扫雷对局历史快照，仅支持查看、删除、导出。',
  wufu: '摆方五福棋对局历史快照，仅支持查看、删除、导出。',
  gomoku: '五子棋对局历史快照，仅支持查看、删除、导出。',
}

const fmt = (time: string) => new Date(time).toLocaleString('zh-CN')

export default function AdminCoupleData() {
  const toast = useToast()
  const { members, loading: membersLoading } = useMembers()
  const [tab, setTab] = useState<DataTab>('messages')

  const [messages, setMessages] = useState<CoupleChatMessage[]>([])
  const [quizRows, setQuizRows] = useState<CoupleQuizHistoryRow[]>([])
  const [truthRows, setTruthRows] = useState<CoupleTruthDareRow[]>([])
  const [wishRows, setWishRows] = useState<CoupleWish[]>([])
  const [boardRows, setBoardRows] = useState<CoupleBoardGameHistoryRow[]>([])
  const [minesRows, setMinesRows] = useState<CoupleMinesHistoryRow[]>([])
  const [wufuRows, setWufuRows] = useState<CoupleWufuHistoryRow[]>([])
  const [gomokuRows, setGomokuRows] = useState<CoupleGomokuHistoryRow[]>([])

  const [pair, setPair] = useState('all')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  /** 多选模式 + 选中的记录 id */
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /** 行内编辑：留言内容 / 真心话答案 / 心愿文本 */
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  /** 行内编辑：同步抉择双方答案 */
  const [editChoiceA, setEditChoiceA] = useState('')
  const [editChoiceB, setEditChoiceB] = useState('')
  const [saving, setSaving] = useState(false)

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const nameOf = useCallback((id: string) => (id === 'me' ? '我（管理员）' : memberById.get(id)?.name ?? '未知成员'), [memberById])
  const pairLabel = useCallback((a: string, b: string) => `${nameOf(a)} ↔ ${nameOf(b)}`, [nameOf])
  const messagePairKey = useCallback((row: CoupleChatMessage) => [row.sender_id, row.receiver_id].sort().join('|'), [])

  const reload = useCallback(async () => {
    setLoading(true)
    const [msg, quiz, truth, wish, board, mines, wufu, gomoku] = await Promise.allSettled([
      listAllCoupleMessages(),
      listAllCoupleQuizHistory(),
      listAllCoupleTruthDare(),
      listAllCoupleWishes(),
      listAllCoupleBoardGameHistory(),
      listAllCoupleMinesHistory(),
      listAllCoupleWufuHistory(),
      listAllCoupleGomokuHistory(),
    ])
    const failures: string[] = []
    if (msg.status === 'fulfilled') setMessages(msg.value)
    else failures.push('留言板')
    if (quiz.status === 'fulfilled') setQuizRows(quiz.value)
    else failures.push('同步抉择')
    if (truth.status === 'fulfilled') setTruthRows(truth.value)
    else failures.push('真心话')
    if (wish.status === 'fulfilled') setWishRows(wish.value)
    else failures.push('秘密心愿')
    if (board.status === 'fulfilled') setBoardRows(board.value)
    else failures.push('飞行棋')
    if (mines.status === 'fulfilled') setMinesRows(mines.value)
    else failures.push('扫雷')
    if (wufu.status === 'fulfilled') setWufuRows(wufu.value)
    else failures.push('摆方')
    if (gomoku.status === 'fulfilled') setGomokuRows(gomoku.value)
    else failures.push('五子棋')
    if (failures.length) toast.show(`${failures.join('、')}数据加载失败，可点击刷新重试`, 'err')
    setLoading(false)
  }, [toast])

  useEffect(() => {
    void reload()
  }, [reload])

  /** 当前模块的行数（Tab 角标） */
  const tabCount = useCallback(
    (key: DataTab): number =>
      ({ messages: messages.length, quiz: quizRows.length, truth: truthRows.length, wishes: wishRows.length, board: boardRows.length, mines: minesRows.length, wufu: wufuRows.length, gomoku: gomokuRows.length })[key],
    [messages, quizRows, truthRows, wishRows, boardRows, minesRows, wufuRows, gomokuRows]
  )

  /* ------------------------------ 各模块筛选 ------------------------------ */

  const filteredMessages = useMemo(
    () => messages.filter((row) => pair === 'all' || messagePairKey(row) === pair),
    [messages, pair, messagePairKey]
  )
  const filteredQuiz = useMemo(
    () => quizRows.filter((row) => pair === 'all' || `${row.member_a}|${row.member_b}` === pair),
    [quizRows, pair]
  )
  const filteredTruth = useMemo(
    () => truthRows.filter((row) => pair === 'all' || `${row.member_a}|${row.member_b}` === pair),
    [truthRows, pair]
  )
  const filteredWishes = useMemo(
    () => wishRows.filter((row) => pair === 'all' || `${row.member_a}|${row.member_b}` === pair),
    [wishRows, pair]
  )
  const filteredBoard = useMemo(
    () => boardRows.filter((row) => pair === 'all' || `${row.member_a}|${row.member_b}` === pair),
    [boardRows, pair]
  )
  const filteredMines = useMemo(
    () => minesRows.filter((row) => pair === 'all' || `${row.member_a}|${row.member_b}` === pair),
    [minesRows, pair]
  )
  const filteredWufu = useMemo(
    () => wufuRows.filter((row) => pair === 'all' || `${row.member_a}|${row.member_b}` === pair),
    [wufuRows, pair]
  )
  const filteredGomoku = useMemo(
    () => gomokuRows.filter((row) => pair === 'all' || `${row.member_a}|${row.member_b}` === pair),
    [gomokuRows, pair]
  )

  /** 当前模块筛选后的记录数 / 全部 id（用于全选与删除） */
  const currentFilteredCount =
    ({ messages: filteredMessages.length, quiz: filteredQuiz.length, truth: filteredTruth.length, wishes: filteredWishes.length, board: filteredBoard.length, mines: filteredMines.length, wufu: filteredWufu.length, gomoku: filteredGomoku.length })[tab]
  const currentFilteredIds = useMemo(() => {
    switch (tab) {
      case 'messages': return filteredMessages.map((r) => r.id)
      case 'quiz': return filteredQuiz.map((r) => r.id)
      case 'truth': return filteredTruth.map((r) => r.id)
      case 'wishes': return filteredWishes.map((r) => r.id)
      case 'board': return filteredBoard.map((r) => r.id)
      case 'mines': return filteredMines.map((r) => r.id)
      case 'wufu': return filteredWufu.map((r) => r.id)
      case 'gomoku': return filteredGomoku.map((r) => r.id)
    }
  }, [tab, filteredMessages, filteredQuiz, filteredTruth, filteredWishes, filteredBoard, filteredMines, filteredWufu, filteredGomoku])

  /** 情侣对下拉选项：取当前模块出现过的对（留言板按收发双方归对） */
  const pairOptions = useMemo(() => {
    const map = new Map<string, string>()
    if (tab === 'messages') {
      messages.forEach((row) => {
        const [a, b] = [row.sender_id, row.receiver_id].sort()
        map.set(`${a}|${b}`, pairLabel(a, b))
      })
    } else {
      const rows: Array<{ member_a: string; member_b: string }> =
        tab === 'quiz' ? quizRows : tab === 'truth' ? truthRows : tab === 'wishes' ? wishRows : tab === 'board' ? boardRows : tab === 'mines' ? minesRows : tab === 'wufu' ? wufuRows : gomokuRows
      rows.forEach((row) => map.set(`${row.member_a}|${row.member_b}`, pairLabel(row.member_a, row.member_b)))
    }
    return [...map].map(([key, label]) => ({ key, label }))
  }, [tab, messages, quizRows, truthRows, wishRows, boardRows, minesRows, wufuRows, gomokuRows, pairLabel])

  /* ------------------------------ 通用操作 ------------------------------ */

  const switchTab = (key: DataTab) => {
    setTab(key)
    setPair('all')
    setSelectMode(false)
    setSelected(new Set())
    setEditId(null)
  }

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected((current) => (current.size === currentFilteredIds.length ? new Set() : new Set(currentFilteredIds)))
  }

  const removeSelected = async () => {
    const ids = [...selected]
    if (!ids.length || !window.confirm(`确定删除当前模块选中的 ${ids.length} 条数据吗？删除后无法恢复。`)) return
    setDeleting(true)
    try {
      if (tab === 'messages') await deleteCoupleMessages(ids)
      else if (tab === 'quiz') await deleteCoupleQuizHistory(ids)
      else if (tab === 'truth') await deleteCoupleTruthDare(ids)
      else if (tab === 'wishes') await deleteCoupleWishes(ids)
      else if (tab === 'board') await deleteCoupleBoardGameHistory(ids)
      else if (tab === 'mines') await deleteCoupleMinesHistory(ids)
      else if (tab === 'wufu') await deleteCoupleWufuHistory(ids)
      else await deleteCoupleGomokuHistory(ids)
      toast.show(`已删除 ${ids.length} 条数据`)
      exitSelect()
      await reload()
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setDeleting(false)
    }
  }

  /* ------------------------------ 导出 ------------------------------ */

  const exportCsv = () => {
    const date = new Date().toISOString().slice(0, 10)
    if (tab === 'messages') {
      if (!filteredMessages.length) return toast.show('没有可导出的数据', 'err')
      exportTableCsv(`留言板-${date}.csv`, ['情侣对', '发送人', '接收人', '内容', '时间'], filteredMessages.map((row) => {
        const [a, b] = [row.sender_id, row.receiver_id].sort()
        return [pairLabel(a, b), nameOf(row.sender_id), nameOf(row.receiver_id), row.content, fmt(row.created_at)]
      }))
    } else if (tab === 'quiz') {
      if (!filteredQuiz.length) return toast.show('没有可导出的数据', 'err')
      exportTableCsv(`同步抉择历史-${date}.csv`, ['情侣对', '分类', '题目', '选项 A', '选项 B', 'A 的答案', 'B 的答案', '状态', '是否匹配', '开始时间', '揭晓时间'],
        filteredQuiz.map((row) => [
          pairLabel(row.member_a, row.member_b), row.question_kind, row.question_title, row.option_a, row.option_b,
          row.choice_a ?? '', row.choice_b ?? '', row.status === 'revealed' ? '已揭晓' : '进行中',
          row.matched === true ? '是' : row.matched === false ? '否' : '',
          row.started_at ?? '', row.revealed_at ?? '',
        ]))
    } else if (tab === 'truth') {
      if (!filteredTruth.length) return toast.show('没有可导出的数据', 'err')
      exportTableCsv(`真心话大冒险-${date}.csv`, ['情侣对', '抽题人', '类型', '题目', '答案', '时间'],
        filteredTruth.map((row) => [
          pairLabel(row.member_a, row.member_b), nameOf(row.sender_id), row.type === 'truth' ? '真心话' : '大冒险',
          row.prompt, row.answer ?? '', fmt(row.created_at),
        ]))
    } else if (tab === 'wishes') {
      if (!filteredWishes.length) return toast.show('没有可导出的数据', 'err')
      exportTableCsv(`秘密心愿-${date}.csv`, ['情侣对', '心愿主人', '心愿内容', '创建时间'],
        filteredWishes.map((row) => [pairLabel(row.member_a, row.member_b), row.owner_name, row.text, fmt(row.created_at)]))
    } else if (tab === 'board') {
      if (!filteredBoard.length) return toast.show('没有可导出的数据', 'err')
      exportTableCsv(`飞行棋历史-${date}.csv`, ['情侣对', '胜者', '棋盘格数', '操作步数', '完成时间'],
        filteredBoard.map((row) => [
          pairLabel(row.member_a, row.member_b), nameOf(row.winner === 0 ? row.member_a : row.member_b),
          row.state.size, row.state.log.length, fmt(row.finished_at),
        ]))
    } else if (tab === 'mines') {
      if (!filteredMines.length) return toast.show('没有可导出的数据', 'err')
      exportTableCsv(`扫雷历史-${date}.csv`, ['情侣对', '结果', '行', '列', '雷数', '完成时间'],
        filteredMines.map((row) => [
          pairLabel(row.member_a, row.member_b), row.cleared ? '通关' : '失败', row.state.rows, row.state.cols, row.state.mineTotal, fmt(row.finished_at),
        ]))
    } else if (tab === 'wufu') {
      if (!filteredWufu.length) return toast.show('没有可导出的数据', 'err')
      exportTableCsv(`摆方历史-${date}.csv`, ['情侣对', '结果', '先手', '落子数', '结束时间'], 
        filteredWufu.map((row) => [
          pairLabel(row.member_a, row.member_b),
          row.state.winner === null ? '进行中' : row.state.winner === row.state.firstMover ? `${row.state.log[row.state.log.length - 1]?.text ?? ''}` : '',
          row.state.firstMover === 0 ? nameOf(row.member_a) : nameOf(row.member_b),
          row.state.placed, fmt(row.finished_at),
        ]))
    } else {
      if (!filteredGomoku.length) return toast.show('没有可导出的数据', 'err')
      exportTableCsv(`五子棋历史-${date}.csv`, ['情侣对', '胜者', '落子数', '结束时间'], filteredGomoku.map((row) => [
        pairLabel(row.member_a, row.member_b), nameOf(row.winner === 0 ? row.member_a : row.member_b), row.state.log.length, fmt(row.finished_at),
      ]))
    }
    toast.show('导出成功')
  }

  const exportJson = () => {
    const date = new Date().toISOString().slice(0, 10)
    const data =
      tab === 'messages' ? filteredMessages
        : tab === 'quiz' ? filteredQuiz
          : tab === 'truth' ? filteredTruth
            : tab === 'wishes' ? filteredWishes
              : tab === 'board' ? filteredBoard
                : tab === 'mines' ? filteredMines
                  : tab === 'wufu' ? filteredWufu : filteredGomoku
    if (!data.length) return toast.show('没有可导出的数据', 'err')
    const names: Record<DataTab, string> = { messages: '留言板', quiz: '同步抉择历史', truth: '真心话大冒险', wishes: '秘密心愿', board: '飞行棋历史', mines: '扫雷历史', wufu: '摆方历史', gomoku: '五子棋历史' }
    exportTableJson(`${names[tab]}-${date}.json`, data)
    toast.show('导出成功')
  }

  /* ------------------------------ 编辑保存 ------------------------------ */

  const startEditText = (id: string, text: string) => {
    setEditId(id)
    setEditText(text)
  }

  const saveMessage = async (row: CoupleChatMessage) => {
    setSaving(true)
    try {
      await updateCoupleMessage(row.id, editText)
      setMessages((current) => current.map((r) => (r.id === row.id ? { ...r, content: editText.trim() } : r)))
      setEditId(null)
      toast.show('留言已更新')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  const saveQuiz = async (row: CoupleQuizHistoryRow) => {
    setSaving(true)
    try {
      await updateCoupleQuizHistory(row.id, editChoiceA, editChoiceB)
      const a = editChoiceA.trim() || null
      const b = editChoiceB.trim() || null
      setQuizRows((current) => current.map((r) => (r.id === row.id
        ? { ...r, choice_a: a, choice_b: b, status: a && b ? 'revealed' : 'answering', matched: a && b ? a === b : null }
        : r)))
      setEditId(null)
      toast.show('答题记录已更新')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  const saveTruth = async (row: CoupleTruthDareRow) => {
    setSaving(true)
    try {
      await updateCoupleTruthDareAnswer(row.id, editText)
      setTruthRows((current) => current.map((r) => (r.id === row.id ? { ...r, answer: editText.trim() || null } : r)))
      setEditId(null)
      toast.show('真心话答案已更新')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  const saveWish = async (row: CoupleWish) => {
    setSaving(true)
    try {
      await updateCoupleWish(row.id, editText)
      setWishRows((current) => current.map((r) => (r.id === row.id ? { ...r, text: editText.trim() } : r)))
      setEditId(null)
      toast.show('秘密心愿已更新')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setSaving(false)
    }
  }

  /* ------------------------------ 渲染 ------------------------------ */

  const rowShell = 'flex items-start gap-2 rounded-2xl bg-slate-50 p-3'
  const checkCell = (id: string, checked: boolean) => (
    <label className="flex shrink-0 cursor-pointer items-center pt-1">
      <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={checked} onChange={() => toggleSelect(id)} />
    </label>
  )
  const editButtons = (onSave: () => void) => (
    <div className="flex gap-2">
      <button className="btn-soft flex-1 !py-1 text-xs" onClick={onSave} disabled={saving}>保存</button>
      <button className="btn-ghost flex-1 !py-1 text-xs" onClick={() => setEditId(null)} disabled={saving}>取消</button>
    </div>
  )
  const emptyHint = !loading && currentFilteredCount === 0

  return (
    <div className="space-y-4">
      {/* 顶部说明 + 模块切换 */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">💞 互动数据管理</h2>
            <p className="mt-1 text-xs text-slate-400">{TAB_DESC[tab]}</p>
          </div>
          <span className="chip shrink-0 border-brand-200 bg-brand-50 text-brand-600">管理员</span>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              className={`chip shrink-0 whitespace-nowrap ${tab === item.key ? 'border-brand-300 bg-brand-50 text-brand-600' : 'border-slate-200 bg-white text-slate-500'}`}
              onClick={() => switchTab(item.key)}
            >
              {item.label} {tabCount(item.key)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          <select className="input" value={pair} onChange={(event) => setPair(event.target.value)} disabled={membersLoading}>
            <option value="all">全部情侣对</option>
            {pairOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => void reload()} disabled={loading}>刷新</button>
            <button className="btn-soft flex-1" onClick={exportCsv} disabled={!currentFilteredCount}>📥 CSV</button>
            <button className="btn-soft flex-1" onClick={exportJson} disabled={!currentFilteredCount}>📥 JSON</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectMode ? (
            <>
              <button className="btn-ghost flex-1" onClick={toggleSelectAll} disabled={!currentFilteredCount}>
                {selected.size === currentFilteredIds.length && currentFilteredCount ? '取消全选' : '全选'}
              </button>
              <button className="btn-ghost flex-1 text-rose-600" onClick={() => void removeSelected()} disabled={!selected.size || deleting}>
                {deleting ? '删除中…' : `🗑 删除选中(${selected.size})`}
              </button>
              <button className="btn-ghost flex-1" onClick={exitSelect}>退出管理</button>
            </>
          ) : (
            <button className="btn-ghost flex-1" onClick={() => setSelectMode(true)} disabled={!currentFilteredCount}>
              ✅ 管理（多选删除）
            </button>
          )}
        </div>
      </section>

      {/* 记录列表 */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">记录（{currentFilteredCount} 条）</h3>
          {loading && <span className="text-xs text-slate-400">加载中…</span>}
        </div>
        {emptyHint && <p className="py-6 text-center text-sm text-slate-400">暂无符合条件的数据</p>}

        {/* 💌 留言板 */}
        {tab === 'messages' && filteredMessages.map((row) => {
          const checked = selected.has(row.id)
          const editing = editId === row.id
          return (
            <article key={row.id} className={`${rowShell} ${checked ? 'ring-2 ring-brand-300' : ''}`}>
              {selectMode && checkCell(row.id, checked)}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-700">
                    {nameOf(row.sender_id)} <span className="text-brand-400">→</span> {nameOf(row.receiver_id)}
                  </div>
                  {!selectMode && !editing && (
                    <button className="chip shrink-0 border-slate-200 bg-white text-slate-500" onClick={() => startEditText(row.id, row.content)}>编辑</button>
                  )}
                </div>
                {editing ? (
                  <div className="space-y-2">
                    <textarea className="input min-h-16" value={editText} onChange={(event) => setEditText(event.target.value)} maxLength={500} />
                    {editButtons(() => void saveMessage(row))}
                  </div>
                ) : (
                  <div className="break-words rounded-xl bg-white p-2 text-xs text-slate-700">{row.content}</div>
                )}
                <div className="text-[11px] text-slate-400">{fmt(row.created_at)}</div>
              </div>
            </article>
          )
        })}

        {/* 💞 同步抉择 */}
        {tab === 'quiz' && filteredQuiz.map((row) => {
          const a = nameOf(row.member_a)
          const b = nameOf(row.member_b)
          const checked = selected.has(row.id)
          const editing = editId === row.id
          return (
            <article key={row.id} className={`${rowShell} ${checked ? 'ring-2 ring-brand-300' : ''}`}>
              {selectMode && checkCell(row.id, checked)}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-semibold text-slate-700">{a} <span className="text-brand-400">↔</span> {b}</div>
                    <div className="mt-1 break-words text-xs text-slate-500">{row.question_title}</div>
                  </div>
                  <span className={`chip shrink-0 ${row.status === 'revealed' ? (row.matched ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-brand-200 bg-brand-50 text-brand-600') : 'border-amber-200 bg-amber-50 text-amber-600'}`}>
                    {row.status === 'revealed' ? (row.matched ? '答案一致' : '已揭晓') : '进行中'}
                  </span>
                </div>
                {editing ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                      <input className="input" placeholder={`${a} 的答案（清空=未回答）`} value={editChoiceA} onChange={(event) => setEditChoiceA(event.target.value)} />
                      <input className="input" placeholder={`${b} 的答案（清空=未回答）`} value={editChoiceB} onChange={(event) => setEditChoiceB(event.target.value)} />
                    </div>
                    {editButtons(() => void saveQuiz(row))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-1 text-xs text-slate-600 min-[420px]:grid-cols-2">
                      <div className="break-words rounded-xl bg-white p-2">{a}：{row.choice_a ?? '未回答'}</div>
                      <div className="break-words rounded-xl bg-white p-2">{b}：{row.choice_b ?? '未回答'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-400">{fmt(row.started_at ?? row.created_at)}</div>
                      {!selectMode && (
                        <button
                          className="chip shrink-0 border-slate-200 bg-white text-slate-500"
                          onClick={() => { setEditId(row.id); setEditChoiceA(row.choice_a ?? ''); setEditChoiceB(row.choice_b ?? '') }}
                        >
                          编辑答案
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </article>
          )
        })}

        {/* 🎲 真心话大冒险 */}
        {tab === 'truth' && filteredTruth.map((row) => {
          const checked = selected.has(row.id)
          const editing = editId === row.id
          return (
            <article key={row.id} className={`${rowShell} ${checked ? 'ring-2 ring-brand-300' : ''}`}>
              {selectMode && checkCell(row.id, checked)}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-semibold text-slate-700">
                      {pairLabel(row.member_a, row.member_b)}
                    </div>
                    <div className="mt-1 break-words text-xs text-slate-500">{nameOf(row.sender_id)} 抽到的题目</div>
                  </div>
                  <span className={`chip shrink-0 ${row.type === 'truth' ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-orange-200 bg-orange-50 text-orange-600'}`}>
                    {row.type === 'truth' ? '真心话' : '大冒险'}
                  </span>
                </div>
                <div className="break-words rounded-xl bg-white p-2 text-xs text-slate-700">{row.prompt}</div>
                {editing ? (
                  <div className="space-y-2">
                    <textarea className="input min-h-16" value={editText} onChange={(event) => setEditText(event.target.value)} maxLength={500} placeholder="答案（清空=未作答）" />
                    {editButtons(() => void saveTruth(row))}
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 break-words rounded-xl bg-rose-50 p-2 text-xs text-rose-700">
                      答案：{row.answer ?? '（还没作答）'}
                    </div>
                    {!selectMode && row.type === 'truth' && (
                      <button className="chip shrink-0 border-slate-200 bg-white text-slate-500" onClick={() => startEditText(row.id, row.answer ?? '')}>编辑</button>
                    )}
                  </div>
                )}
                <div className="text-[11px] text-slate-400">{fmt(row.created_at)}</div>
              </div>
            </article>
          )
        })}

        {/* 🌠 秘密心愿 */}
        {tab === 'wishes' && filteredWishes.map((row) => {
          const checked = selected.has(row.id)
          const editing = editId === row.id
          return (
            <article key={row.id} className={`${rowShell} ${checked ? 'ring-2 ring-brand-300' : ''}`}>
              {selectMode && checkCell(row.id, checked)}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-700">
                    {pairLabel(row.member_a, row.member_b)}
                  </div>
                  {!selectMode && !editing && (
                    <button className="chip shrink-0 border-slate-200 bg-white text-slate-500" onClick={() => startEditText(row.id, row.text)}>编辑</button>
                  )}
                </div>
                {editing ? (
                  <div className="space-y-2">
                    <textarea className="input min-h-16" value={editText} onChange={(event) => setEditText(event.target.value)} maxLength={200} />
                    {editButtons(() => void saveWish(row))}
                  </div>
                ) : (
                  <div className="break-words rounded-xl bg-white p-2 text-xs text-slate-700">{row.text}</div>
                )}
                <div className="text-[11px] text-slate-400">{row.owner_name} · {fmt(row.created_at)}</div>
              </div>
            </article>
          )
        })}

        {/* 🛫 飞行棋 */}
        {tab === 'board' && filteredBoard.map((row) => {
          const checked = selected.has(row.id)
          return (
            <article key={row.id} className={`${rowShell} ${checked ? 'ring-2 ring-brand-300' : ''}`}>
              {selectMode && checkCell(row.id, checked)}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-700">
                    {pairLabel(row.member_a, row.member_b)}
                  </div>
                  <span className="chip shrink-0 border-brand-200 bg-brand-50 text-brand-600">🏆 {nameOf(row.winner === 0 ? row.member_a : row.member_b)} 获胜</span>
                </div>
                <div className="text-xs text-slate-500">
                  {row.state.size} 格棋盘 · 共 {row.state.log.length} 步 · 完成于 {fmt(row.finished_at)}
                </div>
              </div>
            </article>
          )
        })}

        {/* 💣 扫雷 */}
        {tab === 'mines' && filteredMines.map((row) => {
          const checked = selected.has(row.id)
          return (
            <article key={row.id} className={`${rowShell} ${checked ? 'ring-2 ring-brand-300' : ''}`}>
              {selectMode && checkCell(row.id, checked)}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-700">
                    {pairLabel(row.member_a, row.member_b)}
                  </div>
                  <span className={`chip shrink-0 ${row.cleared ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-rose-200 bg-rose-50 text-rose-600'}`}>
                    {row.cleared ? '🏆 通关' : '💥 踩雷'}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {row.state.rows}×{row.state.cols} 棋盘 · {row.state.mineTotal} 颗雷 · 完成于 {fmt(row.finished_at)}
                </div>
              </div>
            </article>
          )
        })}

        {/* ♟️ 摆方五福棋 */}
        {tab === 'wufu' && filteredWufu.map((row) => {
          const checked = selected.has(row.id)
          const s = row.state
          const winnerName = s.winner === 0 ? nameOf(row.member_a) : nameOf(row.member_b)
          const surrendered = s.log.some((item) => item.text.includes('🏳️'))
          return (
            <article key={row.id} className={`${rowShell} ${checked ? 'ring-2 ring-brand-300' : ''}`}>
              {selectMode && checkCell(row.id, checked)}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-700">
                    {pairLabel(row.member_a, row.member_b)}
                  </div>
                  <span className={`chip shrink-0 ${surrendered ? 'border-slate-300 bg-slate-50 text-slate-600' : 'border-brand-200 bg-brand-50 text-brand-600'}`}>
                    {surrendered ? `🏳️ ${winnerName} 认输` : `🏆 ${winnerName} 获胜`}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  先手 {nameOf(s.firstMover === 0 ? row.member_a : row.member_b)} · 落子 {s.placed}/25 · 共 {s.log.length} 步 · 完成于 {fmt(row.finished_at)}
                </div>
              </div>
            </article>
          )
        })}

        {tab === 'gomoku' && filteredGomoku.map((row) => {
          const checked = selected.has(row.id)
          const winnerName = nameOf(row.winner === 0 ? row.member_a : row.member_b)
          return (
            <article key={row.id} className={`${rowShell} ${checked ? 'ring-2 ring-brand-300' : ''}`}>
              {selectMode && checkCell(row.id, checked)}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-700">{pairLabel(row.member_a, row.member_b)}</div>
                  <span className="chip shrink-0 border-brand-200 bg-brand-50 text-brand-600">🏆 {winnerName} 获胜</span>
                </div>
                <div className="text-xs text-slate-500">标准 15×15 · 共 {row.state.log.length} 手 · 完成于 {fmt(row.finished_at)}</div>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
