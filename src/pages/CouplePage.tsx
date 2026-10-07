import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import {
  appendCoupleEvent,
  broadcastCoupleMessage,
  createCoupleWish,
  fetchCoupleQuiz,
  listCoupleEvents,
  listCoupleMessages,
  listCoupleWishes,
  listMealsRange,
  resetCoupleQuiz,
  saveCoupleQuizChoice,
  type CoupleEventRow,
  type CoupleQuizRow,
} from '../lib/db'
import { todayStr } from '../lib/date'
import { useRealtime } from '../lib/realtime'
import { SLOT_LABEL, type Meal, type MealSlot } from '../lib/types'
import { useFriends } from '../store/friends'
import { useSession } from '../store/session'

type Wish = { id: string; text: string; owner: string }
type DrawnWish = Wish & { drawer: string }
type ChatItem = { id: string; sender_id: string; receiver_id: string; content: string; created_at: string }
type QuestionKind = '轻松版' | '走心版' | '自定义'
type Question = { id: string; title: string; a: string; b: string; kind: QuestionKind }
type QuizView = {
  question: Question | null
  myChoice: 'A' | 'B' | null
  peerChoice: 'A' | 'B' | null
  revealed: boolean
}

const LOVE_MESSAGES = [
  '今天也想把所有温柔都留给你。',
  '遇见你之后，普通的一天也值得期待。',
  '我喜欢的不是今天的天气，是今天也有你。',
  '你不用一直发光，做自己就已经很耀眼了。',
  '想和你分享三餐，也想分享每一个小小的好消息。',
  '今天的心动没有截止日期，明天也会继续。',
  '有你在，回家的路都变得短了一点。',
  '谢谢你把平凡日子过成了我们的小故事。',
  '我想把今天的第一句想念和最后一句晚安都给你。',
  '不管今天顺不顺利，记得有人一直站在你这边。',
  '你出现以后，我开始期待每一个明天。',
  '和你在一起，连安静也变成一种陪伴。',
  '今天也要好好吃饭，因为我还想陪你很久很久。',
  '你是我忙碌生活里最柔软的暂停键。',
  '如果快乐有形状，那一定是和你并肩走路的样子。',
  '我不擅长说很多情话，但我一直把你放在心上。',
  '愿今天的小幸运，最后都绕一圈落到你身上。',
  '和你聊天这件事，永远不会被我排进待办事项。',
  '你让我的生活多了一个值得反复打开的页面。',
  '今天的风很轻，刚好适合把想念送给你。',
  '我想和你一起收集很多个平淡又闪亮的日子。',
  '喜欢你这件事，我每天都比昨天更确定。',
  '你不需要完美，我喜欢的是完整而真实的你。',
  '无论今天发生什么，晚上都来我这里充充电。',
]

const BUILT_IN_QUESTIONS: Question[] = [
  { id: 'easy-1', title: '周末约会', a: '宅家躺平', b: '出门逛逛', kind: '轻松版' },
  { id: 'easy-2', title: '理想晚餐', a: '火锅大餐', b: '在家煮面', kind: '轻松版' },
  { id: 'easy-3', title: '一起看剧', a: '喜剧笑到停不下', b: '悬疑一起猜结局', kind: '轻松版' },
  { id: 'easy-4', title: '突然放假', a: '睡到自然醒', b: '马上出发旅行', kind: '轻松版' },
  { id: 'easy-5', title: '下午茶时间', a: '奶茶配甜点', b: '咖啡配咸点', kind: '轻松版' },
  { id: 'easy-6', title: '散步路线', a: '热闹的街区', b: '安静的公园', kind: '轻松版' },
  { id: 'easy-7', title: '一起玩游戏', a: '合作闯关', b: '轻松对战', kind: '轻松版' },
  { id: 'easy-8', title: '收到礼物', a: '实用小物', b: '手写小卡片', kind: '轻松版' },
  { id: 'heart-1', title: '未来生活', a: '一起旅行很多次', b: '一起布置一个家', kind: '走心版' },
  { id: 'heart-2', title: '难过的时候', a: '想先要一个拥抱', b: '想先听我慢慢说', kind: '走心版' },
  { id: 'heart-3', title: '被记住的瞬间', a: '第一次见面的细节', b: '某次被照顾的时刻', kind: '走心版' },
  { id: 'heart-4', title: '表达喜欢', a: '把爱说出来', b: '用行动默默证明', kind: '走心版' },
  { id: 'heart-5', title: '理想陪伴', a: '每天分享小事', b: '需要时一直在场', kind: '走心版' },
  { id: 'heart-6', title: '一起变好', a: '互相鼓励挑战', b: '接纳彼此节奏', kind: '走心版' },
  { id: 'heart-7', title: '关于安全感', a: '及时报备行程', b: '给彼此充分信任', kind: '走心版' },
  { id: 'heart-8', title: '想一起完成', a: '去看一场日出', b: '记录一本共同相册', kind: '走心版' },
]

const REQUIRED_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

const key = (suffix: string, a: string | null, b: string | null) => {
  const [first, second] = (a || 'none') < (b || 'none') ? [a, b] : [b, a]
  return `couple-${suffix}-${first}-${second}`
}

const orderedPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a])

const dayNumber = () => Math.floor(Date.now() / 86_400_000)

function readCache<T>(cacheKey: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(cacheKey) ?? '') as T
  } catch {
    return fallback
  }
}

/** 三餐打卡进度条（情话解锁用） */
function MealCheck({ label, list }: { label: string; list: Meal[] }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="flex gap-1">
        {REQUIRED_SLOTS.map((slot) => {
          const ok = list.some((m) => m.slot === slot)
          return (
            <span
              key={slot}
              className={`rounded-full border px-2 py-0.5 ${
                ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                  : 'border-slate-200 bg-slate-50 text-slate-400'
              }`}
            >
              {SLOT_LABEL[slot]} {ok ? '✓' : '…'}
            </span>
          )
        })}
      </span>
    </div>
  )
}

export default function CouplePage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { memberId, memberName } = useSession()
  const { friends } = useFriends()
  const selectedFriend = friends.find((f) => f.memberId !== '__admin__')
  const friendId = selectedFriend?.memberId ?? null
  const friendName = selectedFriend?.shownName ?? '好友'
  const myId = memberId || '__me__'
  const ready = Boolean(memberId && friendId)

  const channelKey = useMemo(
    () => (memberId && friendId ? key('sync', memberId, friendId) : 'couple-offline'),
    [memberId, friendId]
  )

  /* ------------------------------ 心愿池 ------------------------------ */
  const [wishText, setWishText] = useState('')
  const [drawn, setDrawn] = useState<DrawnWish | null>(null)
  const [wishesList, setWishesList] = useState<Wish[]>(() =>
    memberId && friendId ? readCache<Wish[]>(key('wishes', memberId, friendId), []) : []
  )
  const drawnIdRef = useRef<string | null>(null)

  /** 抽签推送弹框：对方抽中心愿时弹一次，关闭后（本地记录）不再弹 */
  const [drawModal, setDrawModal] = useState<{ eventId: string; wish: DrawnWish } | null>(null)
  const closedDrawRef = useRef<{ k: string; ids: Set<string> } | null>(null)

  const closedDrawIds = useCallback(() => {
    const k = memberId && friendId ? key('draw-closed', memberId, friendId) : 'couple-draw-closed-none'
    if (!closedDrawRef.current || closedDrawRef.current.k !== k) {
      closedDrawRef.current = { k, ids: new Set(readCache<string[]>(k, [])) }
    }
    return closedDrawRef.current.ids
  }, [memberId, friendId])

  const closeDrawModal = useCallback(
    (eventId: string) => {
      const ids = closedDrawIds()
      ids.add(eventId)
      if (memberId && friendId) {
        try {
          localStorage.setItem(key('draw-closed', memberId, friendId), JSON.stringify([...ids].slice(-20)))
        } catch {
          // 存储失败不影响本次关闭
        }
      }
      setDrawModal(null)
    },
    [memberId, friendId, closedDrawIds]
  )

  /* ------------------------------ 留言板 ------------------------------ */
  const [messageText, setMessageText] = useState('')
  const [messages, setMessages] = useState<ChatItem[]>(() =>
    myId && friendId ? readCache<ChatItem[]>(key('chat', myId, friendId), []) : []
  )

  /* ------------------------------ 同步抉择 ------------------------------ */
  const [questionKind, setQuestionKind] = useState<QuestionKind>('轻松版')
  const [quiz, setQuiz] = useState<QuizView>({ question: null, myChoice: null, peerChoice: null, revealed: false })
  const [customTitle, setCustomTitle] = useState('')
  const [customA, setCustomA] = useState('')
  const [customB, setCustomB] = useState('')
  const [customQuestions, setCustomQuestions] = useState<Question[]>(() =>
    myId && friendId ? readCache<Question[]>(key('questions', myId, friendId), []) : []
  )
  const revealedRef = useRef(false)
  const quizLoadedRef = useRef(false)

  /* ------------------------------ 三餐解锁 ------------------------------ */
  const [myMeals, setMyMeals] = useState<Meal[]>([])
  const [peerMeals, setPeerMeals] = useState<Meal[]>([])

  const chatBottomRef = useRef<HTMLDivElement | null>(null)

  const questionPool = questionKind === '自定义' ? customQuestions : BUILT_IN_QUESTIONS.filter((q) => q.kind === questionKind)
  const loveMessage = LOVE_MESSAGES[dayNumber() % LOVE_MESSAGES.length]
  const mealDone = (list: Meal[]) => REQUIRED_SLOTS.filter((s) => list.some((m) => m.slot === s)).length
  const loveUnlocked = Boolean(friendId) && mealDone(myMeals) === 3 && mealDone(peerMeals) === 3

  /* ------------------------------ 数据合并工具 ------------------------------ */

  const mergeMessages = useCallback((incoming: ChatItem[], cacheKey: string) => {
    setMessages((prev) => {
      const next = [...prev]
      let changed = false
      for (const m of incoming) {
        if (m?.id && !next.some((x) => x.id === m.id)) {
          next.push(m)
          changed = true
        }
      }
      if (!changed) return prev
      next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      try {
        localStorage.setItem(cacheKey, JSON.stringify(next))
      } catch {
        // 存储失败不影响展示
      }
      return next
    })
  }, [])

  const mergeWishes = useCallback((incoming: Wish[], cacheKey: string) => {
    setWishesList((prev) => {
      const next = [...prev]
      let changed = false
      for (const w of incoming) {
        if (w?.id && !next.some((x) => x.id === w.id)) {
          next.push(w)
          changed = true
        }
      }
      if (!changed) return prev
      try {
        localStorage.setItem(cacheKey, JSON.stringify(next))
      } catch {
        // 存储失败不影响展示
      }
      return next
    })
  }, [])

  /* ------------------------------ 远端加载 ------------------------------ */

  const reloadWishes = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      const remote = await listCoupleWishes(memberId, friendId)
      mergeWishes(
        remote.map((w) => ({ id: w.id, text: w.text, owner: w.owner_name })),
        key('wishes', memberId, friendId)
      )
    } catch (error) {
      console.warn('加载心愿失败', error)
    }
  }, [memberId, friendId, mergeWishes])

  const reloadMessages = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      const remote = await listCoupleMessages(memberId, friendId)
      mergeMessages(remote, key('chat', memberId, friendId))
    } catch (error) {
      console.warn('加载留言失败', error)
    }
  }, [memberId, friendId, mergeMessages])

  const reloadMeals = useCallback(async () => {
    const day = todayStr()
    try {
      const [mine, theirs] = await Promise.all([
        memberId ? listMealsRange([day], memberId) : Promise.resolve([] as Meal[]),
        friendId ? listMealsRange([day], friendId) : Promise.resolve([] as Meal[]),
      ])
      setMyMeals(mine)
      setPeerMeals(theirs)
    } catch (error) {
      console.warn('加载打卡失败', error)
    }
  }, [memberId, friendId])

  /** 应用远端同步抉择会话：双方永远基于同一行数据作答 */
  const applyQuizRow = useCallback(
    (row: CoupleQuizRow | null) => {
      if (!row) return
      if (memberId && friendId) {
        const [a, b] = orderedPair(memberId, friendId)
        if (row.member_a !== a || row.member_b !== b) return
      }
      const q = (row.question ?? null) as Question | null
      if (!q) return
      if (q.kind === '自定义') {
        // 对方出的自定义题也进本地题库，之后谁都能换到这道题
        setCustomQuestions((prev) => (prev.some((x) => x.id === q.id) ? prev : [...prev, q]))
      }
      setQuestionKind(q.kind)
      const mine = row.member_a === memberId ? row.choice_a : row.choice_b
      const theirs = row.member_a === memberId ? row.choice_b : row.choice_a
      const nowRevealed = row.status === 'revealed'
      setQuiz({ question: q, myChoice: mine, peerChoice: theirs, revealed: nowRevealed })
      if (!quizLoadedRef.current) {
        quizLoadedRef.current = true
      } else if (nowRevealed && !revealedRef.current) {
        toast.show('双方都选好啦，默契揭晓 🎉')
      }
      revealedRef.current = nowRevealed
    },
    [memberId, friendId, toast]
  )

  const reloadQuiz = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      applyQuizRow(await fetchCoupleQuiz(memberId, friendId))
    } catch (error) {
      console.warn('加载同步抉择失败', error)
    }
  }, [memberId, friendId, applyQuizRow])

  /** 回放互动事件：恢复最近一次抽签结果；离线错过的给对方补弹一次 */
  const reloadEvents = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      const rows = await listCoupleEvents(memberId, friendId, 30)
      const lastDrawRow = [...rows].reverse().find((r) => r.type === 'wish_draw')
      const d = lastDrawRow?.payload as unknown as DrawnWish | undefined
      if (!lastDrawRow || !d?.id) return
      if (d.id !== drawnIdRef.current) {
        drawnIdRef.current = d.id
        setDrawn({ id: d.id, text: d.text, owner: d.owner, drawer: d.drawer ?? '' })
      }
      // 打开网站在线时能看到（补弹一次）；关闭过的事件不再弹
      if (lastDrawRow.sender_id !== memberId && !closedDrawIds().has(lastDrawRow.id)) {
        setDrawModal({
          eventId: lastDrawRow.id,
          wish: { id: d.id, text: d.text, owner: d.owner, drawer: d.drawer ?? '' },
        })
      }
    } catch (error) {
      console.warn('加载互动动态失败', error)
    }
  }, [memberId, friendId, closedDrawIds])

  /* ------------------------------ 实时互通 ------------------------------ */

  const onEventRow = useCallback(
    (row: CoupleEventRow) => {
      if (!row || row.type !== 'wish_draw') return
      const d = row.payload as unknown as DrawnWish
      if (!d?.id) return
      if (d.id !== drawnIdRef.current) {
        drawnIdRef.current = d.id
        setDrawn({ id: d.id, text: d.text, owner: d.owner, drawer: d.drawer ?? '' })
      }
      // 实时推送给另一方：动画弹框提示；关闭过的事件不再弹
      if (row.sender_id !== memberId && !closedDrawIds().has(row.id)) {
        setDrawModal({ eventId: row.id, wish: { id: d.id, text: d.text, owner: d.owner, drawer: d.drawer ?? '' } })
      }
    },
    [memberId, closedDrawIds]
  )

  useRealtime(
    channelKey,
    [
      { table: 'couple_wishes', on: () => void reloadWishes() },
      { table: 'couple_events', event: 'INSERT', on: (p) => onEventRow(p.new as CoupleEventRow) },
      { table: 'couple_quiz', on: (p) => applyQuizRow(p.new as CoupleQuizRow) },
      {
        table: 'couple_messages',
        event: 'INSERT',
        on: (p) => {
          const m = p.new as ChatItem
          const pair = new Set([myId, friendId])
          if (pair.has(m.sender_id) && pair.has(m.receiver_id)) mergeMessages([m], key('chat', myId, friendId))
        },
      },
      { table: 'meals', on: () => void reloadMeals() },
    ],
    {
      enabled: ready,
      onPoll: () => {
        void reloadWishes()
        void reloadMessages()
        void reloadQuiz()
        void reloadEvents()
        void reloadMeals()
      },
    }
  )

  // 首次进入：拉取双方共享的全部互动数据
  useEffect(() => {
    if (!ready) return
    void reloadWishes()
    void reloadMessages()
    void reloadQuiz()
    void reloadEvents()
    void reloadMeals()
  }, [ready, reloadWishes, reloadMessages, reloadQuiz, reloadEvents, reloadMeals])

  // 自定义题库本地持久化（按互动对象隔离）
  useEffect(() => {
    if (!myId || !friendId) return
    try {
      localStorage.setItem(key('questions', myId, friendId), JSON.stringify(customQuestions))
    } catch {
      // 存储失败不影响使用
    }
  }, [customQuestions, myId, friendId])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ------------------------------ 互动操作 ------------------------------ */

  const pickQuestion = (kind: QuestionKind = questionKind) => {
    // 一方已作答、另一方还没答完时，题目被锁定，不允许换题/切换分类
    if (quiz.question && !quiz.revealed) return
    const pool = kind === '自定义' ? customQuestions : BUILT_IN_QUESTIONS.filter((q) => q.kind === kind)
    if (!pool.length) {
      return toast.show(kind === '自定义' ? '还没有自定义题目，先添加一道吧～' : '该分类暂无题目', 'err')
    }
    const nextQ = pool[Math.floor(Math.random() * pool.length)]
    revealedRef.current = false
    setQuestionKind(kind)
    setQuiz({ question: nextQ, myChoice: null, peerChoice: null, revealed: false })
    if (memberId && friendId) {
      // 出题写入共享会话：对方实时收到同一道题
      void resetCoupleQuiz(memberId, friendId, nextQ).catch((error: Error) => toast.show(error.message, 'err'))
    }
  }

  const addCustomQuestion = () => {
    const title = customTitle.trim()
    const a = customA.trim()
    const b = customB.trim()
    if (!title || !a || !b) return toast.show('题目和两个选项都要填写哦', 'err')
    const item: Question = { id: `custom-${Date.now()}`, title, a, b, kind: '自定义' }
    setCustomQuestions((prev) => [...prev, item])
    setCustomTitle('')
    setCustomA('')
    setCustomB('')
    toast.show('自定义题目已加入专属题库')
  }

  const addWish = async () => {
    const text = wishText.trim()
    if (!text) return toast.show('先写下一个想让对方完成的小心愿～', 'err')
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    try {
      const saved = await createCoupleWish({
        ownerId: memberId,
        userA: memberId,
        userB: friendId,
        text,
        ownerName: memberName || '我',
      })
      mergeWishes([{ id: saved.id, text: saved.text, owner: saved.owner_name }], key('wishes', memberId, friendId))
      setWishText('')
      toast.show('心愿已放进你们的专属池')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    }
  }

  const drawWish = () => {
    if (!wishesList.length) return toast.show('心愿池还是空的，先和 TA 一起添加吧～', 'err')
    const target = wishesList[Math.floor(Math.random() * wishesList.length)]
    const result: DrawnWish = { ...target, drawer: memberName || '我' }
    drawnIdRef.current = target.id
    setDrawn(result)
    if (memberId && friendId) {
      // 抽签结果落库：对方上线/刷新后看到的还是同一次抽签
      void appendCoupleEvent(memberId, friendId, memberId, 'wish_draw', result as unknown as Record<string, unknown>).catch(
        (error: Error) => toast.show(error.message, 'err')
      )
    }
  }

  const submitChoice = (val: 'A' | 'B') => {
    if (!quiz.question || quiz.revealed || quiz.myChoice === val) return
    setQuiz((prev) => ({ ...prev, myChoice: val }))
    if (memberId && friendId) {
      void saveCoupleQuizChoice(memberId, friendId, memberId, val)
        .then(() => fetchCoupleQuiz(memberId, friendId))
        .then((row) => applyQuizRow(row))
        .catch((error: Error) => toast.show(error.message, 'err'))
    }
  }

  const sendMessage = async () => {
    const text = messageText.trim()
    if (!text) return
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    try {
      const msg = await broadcastCoupleMessage(memberId, friendId, text)
      mergeMessages([msg], key('chat', memberId, friendId))
      setMessageText('')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    }
  }

  const clearMessages = () => {
    setMessages([])
    localStorage.removeItem(key('chat', myId, friendId))
    toast.show('已清空本地聊天记录')
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-rose-400 to-orange-300 p-5 text-white shadow-card">
        <div className="text-xs opacity-80">FRIENDSHIP PLAYGROUND</div>
        <h2 className="mt-1 text-xl font-bold">和 {friendName} 的互动空间</h2>
        <p className="mt-1 text-xs opacity-90">把一日三餐、心愿和小默契，变成每天都想打开的惊喜。</p>
      </div>

      {/* 今日专属情话：双方三餐打卡完毕才解锁，两边看到同一句 */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">💌今日专属情话</h3>
            <p className="text-[11px] text-slate-400">🔐完成今日三餐打卡，情话同时解锁</p>
          </div>
          <span
            className={`chip ${
              loveUnlocked
                ? 'border-amber-200 bg-amber-50 text-amber-600'
                : 'border-slate-200 bg-slate-50 text-slate-400'
            }`}
          >
            {loveUnlocked ? '🔓' : '🔒'}
          </span>
        </div>
        {loveUnlocked ? (
          <div className="animate-pop-in rounded-2xl bg-gradient-to-r from-rose-50 to-orange-50 p-5 text-center text-base leading-relaxed text-rose-700">
            “{loveMessage}”
          </div>
        ) : (
          <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
            <MealCheck label="我" list={myMeals} />
            {friendId ? (
              <MealCheck label={`${friendName}`} list={peerMeals} />
            ) : (
              <p className="text-center text-[11px] text-slate-400">先添加好友，才能一起解锁情话哦</p>
            )}
            <button className="btn-soft w-full" onClick={() => navigate('/meals')}>
              去完成我的三餐打卡
            </button>
          </div>
        )}
      </section>

      {/* 秘密心愿池：好友双方共享，抽签结果双方同步 */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">🎁秘密心愿抽签</h3>
            <p className="text-[11px] text-slate-400">专属心愿池，抽到谁的心愿谁来完成</p>
          </div>
          <span className="chip border-brand-200 bg-brand-50 text-brand-600">{wishesList.length} 个❤</span>
        </div>
        {drawn && (
          <div className="animate-pop-in rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center">
            <div className="text-xs text-brand-500">
              「{drawn.drawer}」抽中了「{drawn.owner}」的心愿
            </div>
            <div className="mt-1 text-lg font-semibold text-brand-700">“{drawn.text}”</div>
          </div>
        )}
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="比如：给我捏肩"
            value={wishText}
            onChange={(e) => setWishText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addWish()}
          />
          <button className="btn-soft px-4" onClick={() => void addWish()}>
            放入心愿池
          </button>
        </div>
        <button className="btn-primary w-full" onClick={drawWish}>
          开始抽签
        </button>
      </section>

      {/* 甜蜜留言板：入库持久化，双方实时可见 */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">💬甜蜜聊天留言板</h3>
            <p className="text-[11px] text-slate-400">仅你们双方可见，留言实时同步</p>
          </div>
          <button className="text-xs text-brand-600" onClick={clearMessages}>
            清空
          </button>
        </div>
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
          {messages.length === 0 && (
            <div className="py-5 text-center text-xs text-slate-400">发一句“今天也要开心”吧</div>
          )}
          {messages.map((m) => {
            const isMine = m.sender_id === myId
            const name = isMine ? '我' : friendName
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <span className="px-1 text-[10px] text-slate-400">{name}</span>
                <span
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    isMine ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 shadow-sm'
                  }`}
                >
                  {m.content}
                </span>
              </div>
            )
          })}
          <div ref={chatBottomRef} />
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="如：想你啦 🥰"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void sendMessage()}
          />
          <button className="btn-primary px-4" onClick={() => void sendMessage()}>
            发送
          </button>
        </div>
      </section>

      {/* 同步抉择：共享会话保证双方同题，双方作答后动画揭晓 */}
      <section className="card space-y-3">
        <div>
          <h3 className="font-semibold">💞同步抉择</h3>
          <p className="text-[11px] text-slate-400">题目与选择双方实时同步，一起在线玩更配哦</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['轻松版', '走心版', '自定义'] as QuestionKind[]).map((kind) => (
            <button
              key={kind}
              className={`rounded-xl border px-2 py-2 text-xs ${
                questionKind === kind ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-slate-200'
              } ${quiz.question && !quiz.revealed ? 'cursor-not-allowed opacity-40' : ''}`}
              disabled={Boolean(quiz.question) && !quiz.revealed}
              onClick={() => pickQuestion(kind)}
            >
              {kind}
            </button>
          ))}
        </div>
        {quiz.question ? (
          <>
            <div className="rounded-2xl bg-orange-50 p-3">
              <span className="chip border-orange-200 bg-white text-orange-600">{quiz.question.kind}</span>
              <h4 className="mt-2 font-semibold">{quiz.question.title}</h4>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['A', 'B'] as const).map((opt) => (
                <button
                  key={opt}
                  className={`rounded-2xl border p-3 text-sm ${
                    quiz.myChoice === opt ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-slate-200'
                  }`}
                  onClick={() => submitChoice(opt)}
                >
                  {opt} · {opt === 'A' ? quiz.question!.a : quiz.question!.b}
                </button>
              ))}
            </div>

            {quiz.revealed && quiz.myChoice && quiz.peerChoice ? (
              <div
                key={`reveal-${quiz.question.id}`}
                className="animate-pop-in space-y-1 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center"
              >
                <div className="animate-heart text-2xl">🎉</div>
                <div className="text-sm font-semibold text-emerald-700">
                  我选了 {quiz.myChoice} · {quiz.myChoice === 'A' ? quiz.question.a : quiz.question.b}
                </div>
                <div className="text-sm text-emerald-600">
                  {friendName} 选了 {quiz.peerChoice} · {quiz.peerChoice === 'A' ? quiz.question.a : quiz.question.b}
                </div>
                <div className="text-xs text-emerald-500">
                  {quiz.myChoice === quiz.peerChoice ? '默契满分 💖' : '互补也是浪漫 ✨'}
                </div>
              </div>
            ) : quiz.myChoice ? (
              <p className="text-center text-xs text-brand-600">
                你已选定，等 {friendName} 提交后同时揭晓 ⏳
              </p>
            ) : null}

            <button
              className="btn-ghost w-full disabled:cursor-not-allowed disabled:opacity-40"
              disabled={Boolean(quiz.question) && !quiz.revealed}
              onClick={() => pickQuestion()}
            >
              {quiz.question && !quiz.revealed ? '等待对方作答，暂不能换题' : '换一道题'}
            </button>
          </>
        ) : (
          <button className="btn-primary w-full" onClick={() => pickQuestion()}>
            开始{questionKind}
          </button>
        )}
        {questionKind === '自定义' && (
          <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
            <input
              className="input"
              placeholder="题目，比如：下次一起去哪里？"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input"
                placeholder="选项 A"
                value={customA}
                onChange={(e) => setCustomA(e.target.value)}
              />
              <input
                className="input"
                placeholder="选项 B"
                value={customB}
                onChange={(e) => setCustomB(e.target.value)}
              />
            </div>
            <button className="btn-soft w-full" onClick={addCustomQuestion}>
              加入自定义题库
            </button>
            <p className="text-center text-[11px] text-slate-400">已有 {questionPool.length} 道自定义题</p>
          </div>
        )}
      </section>

      <p className="px-1 text-center text-[11px] leading-relaxed text-slate-400">
        小提示：实时同步，记得一起上线玩。
      </p>

      {/* 抽签推送弹框：对方抽中心愿时弹一次，关闭后不再弹 */}
      {drawModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
          onClick={() => closeDrawModal(drawModal.eventId)}
        >
          <div
            className="w-full max-w-xs animate-slide-up rounded-t-3xl bg-white p-6 text-center shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="animate-heart text-4xl">🎁</div>
            <div className="mt-2 text-xs text-brand-500">
              「{drawModal.wish.drawer}」抽中了「{drawModal.wish.owner}」的心愿
            </div>
            <div className="mt-3 rounded-2xl bg-brand-50 p-4 text-lg font-semibold leading-relaxed text-brand-700">
              “{drawModal.wish.text}”
            </div>
            <p className="mt-2 text-[11px] text-slate-400">关闭后这条抽签就不再弹窗提醒啦</p>
            <button className="btn-primary mt-4 w-full" onClick={() => closeDrawModal(drawModal.eventId)}>
              知道啦
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
