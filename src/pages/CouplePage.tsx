import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import {
  broadcastCoupleEvent,
  broadcastCoupleMessage,
  createCoupleWish,
  listCoupleMessages,
  listCoupleWishes,
  subscribeCoupleEvents,
  subscribeCoupleMessages,
} from '../lib/db'
import { useFriends } from '../store/friends'
import { useSession } from '../store/session'

type Wish = { id: string; text: string; level: '轻松' | '认真' | '挑战'; owner: string }
type ChatItem = { id: string; sender_id: string; receiver_id: string; content: string; created_at: string }
type QuestionKind = '轻松版' | '走心版' | '自定义'
type Question = { id: string; title: string; a: string; b: string; kind: QuestionKind }

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

const key = (suffix: string, a: string | null, b: string | null) => {
  const [first, second] = (a || 'none') < (b || 'none') ? [a, b] : [b, a]
  return `couple-${suffix}-${first}-${second}`
}

const dayNumber = () => Math.floor(Date.now() / 86_400_000)

export default function CouplePage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { memberId, memberName } = useSession()
  const { friends } = useFriends()
  const selectedFriend = friends.find((f) => f.memberId !== '__admin__')
  const friendId = selectedFriend?.memberId ?? null
  const friendName = selectedFriend?.shownName ?? '好友'
  const myId = memberId || '__me__'

  const [wishText, setWishText] = useState('')
  const [wishLevel, setWishLevel] = useState<Wish['level']>('轻松')
  const [drawn, setDrawn] = useState<Wish | null>(null)
  const [wishesList, setWishesList] = useState<Wish[]>([])

  const [messageText, setMessageText] = useState('')
  const [messages, setMessages] = useState<ChatItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key('chat', myId, friendId)) ?? '[]') as ChatItem[]
    } catch {
      return []
    }
  })

  const [questionKind, setQuestionKind] = useState<QuestionKind>('轻松版')
  const [question, setQuestion] = useState<Question | null>(null)
  const [myChoice, setMyChoice] = useState<string | null>(null)
  const [peerChoice, setPeerChoice] = useState<string | null>(null)
  const [customTitle, setCustomTitle] = useState('')
  const [customA, setCustomA] = useState('')
  const [customB, setCustomB] = useState('')
  const [customQuestions, setCustomQuestions] = useState<Question[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key('questions', myId, friendId)) ?? '[]') as Question[]
    } catch {
      return []
    }
  })

  const chatBottomRef = useRef<HTMLDivElement | null>(null)

  const wishes = useMemo(() => wishesList, [wishesList])

  const questionPool =
    questionKind === '自定义'
      ? customQuestions
      : BUILT_IN_QUESTIONS.filter((q) => q.kind === questionKind)
  const loveMessage = LOVE_MESSAGES[dayNumber() % LOVE_MESSAGES.length]

  // 好友确定后从 Supabase 恢复心愿，刷新页面也不会丢失
  useEffect(() => {
    if (!memberId || !friendId) {
      setWishesList([])
      return
    }

    let cancelled = false
    void listCoupleWishes(memberId, friendId)
      .then((remote) => {
        if (!cancelled) {
          const next = remote.map((item) => ({
            id: item.id,
            text: item.text,
            level: item.level,
            owner: item.owner_name,
          }))
          setWishesList(next)
          localStorage.setItem(key('wishes', memberId, friendId), JSON.stringify(next))
        }
      })
      .catch((error: Error) => {
        if (!cancelled) toast.show(error.message, 'err')
      })

    return () => {
      cancelled = true
    }
  }, [memberId, friendId, toast])

  // 初始化加载聊天记录并订阅广播与远端更新
  useEffect(() => {
    if (!myId || !friendId) return

    let cancelled = false
    void listCoupleMessages(myId, friendId).then((remote) => {
      if (cancelled || !remote?.length) return
      setMessages((prev) => {
        const merged = [...prev]
        for (const item of remote) {
          if (!merged.some((m) => m.id === item.id)) merged.push(item)
        }
        merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        localStorage.setItem(key('chat', myId, friendId), JSON.stringify(merged))
        return merged
      })
    })

    const unsubMsg = subscribeCoupleMessages(myId, friendId, (newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev
        const next = [...prev, newMsg]
        localStorage.setItem(key('chat', myId, friendId), JSON.stringify(next))
        return next
      })
    })

    const unsubEvent = subscribeCoupleEvents(myId, friendId, (evt) => {
      if (evt.type === 'wish_add') {
        void listCoupleWishes(myId, friendId).then((remote) => {
          const next = remote.map((item) => ({
            id: item.id,
            text: item.text,
            level: item.level,
            owner: item.owner_name,
          }))
          setWishesList(next)
          localStorage.setItem(key('wishes', myId, friendId), JSON.stringify(next))
        })
        toast.show(`「${evt.data.owner}」放进了一个小心愿`)
      } else if (evt.type === 'wish_draw') {
        setDrawn(evt.data)
        toast.show(`「${evt.data.drawer}」完成了一次抽签`)
      } else if (evt.type === 'question_change') {
        setQuestion(evt.data.question)
        setQuestionKind(evt.data.question.kind)
        setMyChoice(null)
        setPeerChoice(null)
      } else if (evt.type === 'choice_submit') {
        if (question && evt.data.questionId === question.id && evt.data.senderId !== myId) {
          setPeerChoice(evt.data.choice)
          toast.show('对方已完成选择，同步揭晓中')
        }
      }
    })

    return () => {
      cancelled = true
      unsubMsg()
      unsubEvent()
    }
  }, [myId, friendId, question, toast])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const pickQuestion = (kind: QuestionKind = questionKind) => {
    const pool = kind === '自定义' ? customQuestions : BUILT_IN_QUESTIONS.filter((q) => q.kind === kind)
    if (!pool.length) return toast.show('还没有自定义题目，先添加一道吧～', 'err')
    const nextQ = pool[Math.floor(Math.random() * pool.length)]
    setQuestionKind(kind)
    setQuestion(nextQ)
    setMyChoice(null)
    setPeerChoice(null)
    if (friendId) {
      void broadcastCoupleEvent(myId, friendId, {
        type: 'question_change',
        data: { question: nextQ },
      })
    }
  }

  const addCustomQuestion = () => {
    const title = customTitle.trim()
    const a = customA.trim()
    const b = customB.trim()
    if (!title || !a || !b) return toast.show('题目和两个选项都要填写哦', 'err')
    const item: Question = { id: `custom-${Date.now()}`, title, a, b, kind: '自定义' }
    const next = [...customQuestions, item]
    setCustomQuestions(next)
    localStorage.setItem(key('questions', myId, friendId), JSON.stringify(next))
    setCustomTitle('')
    setCustomA('')
    setCustomB('')
    setQuestion(item)
    setMyChoice(null)
    setPeerChoice(null)
    toast.show('自定义题目已加入专属题库')
    if (friendId) {
      void broadcastCoupleEvent(myId, friendId, {
        type: 'question_change',
        data: { question: item },
      })
    }
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
        level: wishLevel,
        ownerName: memberName || '我',
      })
      const item: Wish = {
        id: saved.id,
        text: saved.text,
        level: saved.level,
        owner: saved.owner_name,
      }
      const next = [...wishesList, item]
      setWishesList(next)
      localStorage.setItem(key('wishes', memberId, friendId), JSON.stringify(next))
      setWishText('')
      toast.show('心愿已放进秘密池')
      void broadcastCoupleEvent(memberId, friendId, {
        type: 'wish_add',
        data: item,
      })
    } catch (error) {
      toast.show((error as Error).message, 'err')
    }
  }

  const drawWish = () => {
    if (!wishesList.length) return toast.show('心愿池还是空的，先添加一个吧～', 'err')
    const target = wishesList[Math.floor(Math.random() * wishesList.length)]
    setDrawn(target)
    if (friendId) {
      void broadcastCoupleEvent(myId, friendId, {
        type: 'wish_draw',
        data: { ...target, drawer: memberName || '我' },
      })
    }
  }

  const submitChoice = (val: string) => {
    if (!question) return
    setMyChoice(val)
    if (friendId) {
      void broadcastCoupleEvent(myId, friendId, {
        type: 'choice_submit',
        data: { questionId: question.id, senderId: myId, choice: val },
      })
    }
    toast.show('已悄悄提交，等对方也选好后揭晓')
  }

  const sendMessage = async () => {
    const text = messageText.trim()
    if (!text) return
    if (!friendId) return toast.show('暂未检测到专属好友对象', 'err')

    try {
      const msg = await broadcastCoupleMessage(myId, friendId, text)
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        const next = [...prev, msg]
        localStorage.setItem(key('chat', myId, friendId), JSON.stringify(next))
        return next
      })
      setMessageText('')
    } catch (e) {
      toast.show((e as Error).message, 'err')
    }
  }

  const clearMessages = () => {
    setMessages([])
    localStorage.removeItem(key('chat', myId, friendId))
    toast.show('已清空本地聊天记录')
  }

  const bothChosen = myChoice != null && peerChoice != null

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-rose-400 to-orange-300 p-5 text-white shadow-card">
        <div className="text-xs opacity-80">FRIENDSHIP PLAYGROUND</div>
        <h2 className="mt-1 text-xl font-bold">和 {friendName} 的互动空间</h2>
        <p className="mt-1 text-xs opacity-90">把一日三餐、心愿和小默契，变成每天都想打开的惊喜。</p>
      </div>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">💌 今日专属情话</h3>
            <p className="text-[11px] text-slate-400">每天一条，只属于今天的小惊喜</p>
          </div>
          <span className="chip border-amber-200 bg-amber-50 text-amber-600">今日限定</span>
        </div>
        <div className="rounded-2xl bg-gradient-to-r from-rose-50 to-orange-50 p-5 text-center text-base leading-relaxed text-rose-700">
          “{loveMessage}”
        </div>
        <button className="btn-soft w-full" onClick={() => navigate('/meals')}>
          去完成我的三餐打卡
        </button>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">🎁 秘密心愿抽签</h3>
            <p className="text-[11px] text-slate-400">随时添加，抽到谁的心愿谁来完成</p>
          </div>
          <span className="chip border-brand-200 bg-brand-50 text-brand-600">{wishes.length} 个心愿</span>
        </div>
        {drawn && (
          <div className="animate-pop-in rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center">
            <div className="text-xs text-brand-500">
              抽到「{drawn.owner}」的心愿 · {drawn.level}
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
          />
          <select
            className="rounded-xl border border-slate-200 px-2 text-xs"
            value={wishLevel}
            onChange={(e) => setWishLevel(e.target.value as Wish['level'])}
          >
            <option>轻松</option>
            <option>认真</option>
            <option>挑战</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-soft flex-1" onClick={addWish}>
            放入心愿池
          </button>
          <button className="btn-primary flex-1" onClick={drawWish}>
            开始抽签
          </button>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">💬 甜蜜聊天留言板</h3>
            <p className="text-[11px] text-slate-400">双方实时同步，支持文字与表情</p>
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
            return (
              <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
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
            placeholder="输入文字或表情，如：想你啦 🥰"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void sendMessage()}
          />
          <button className="btn-primary px-4" onClick={() => void sendMessage()}>
            发送
          </button>
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <h3 className="font-semibold">💞 同步抉择</h3>
          <p className="text-[11px] text-slate-400">各自悄悄选择，等双方提交后同时揭晓</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['轻松版', '走心版', '自定义'] as QuestionKind[]).map((kind) => (
            <button
              key={kind}
              className={`rounded-xl border px-2 py-2 text-xs ${
                questionKind === kind ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-slate-200'
              }`}
              onClick={() => pickQuestion(kind)}
            >
              {kind}
            </button>
          ))}
        </div>
        {question ? (
          <>
            <div className="rounded-2xl bg-orange-50 p-3">
              <span className="chip border-orange-200 bg-white text-orange-600">{question.kind}</span>
              <h4 className="mt-2 font-semibold">{question.title}</h4>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`rounded-2xl border p-3 text-sm ${
                  myChoice === 'A' ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-slate-200'
                }`}
                onClick={() => submitChoice('A')}
              >
                A · {question.a}
              </button>
              <button
                className={`rounded-2xl border p-3 text-sm ${
                  myChoice === 'B' ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-slate-200'
                }`}
                onClick={() => submitChoice('B')}
              >
                B · {question.b}
              </button>
            </div>

            {bothChosen ? (
              <div className="animate-pop-in rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center text-xs text-emerald-700">
                🎉 揭晓时刻！我选了 {myChoice}，{friendName} 选了 {peerChoice}
                {myChoice === peerChoice ? '（默契满分 💖）' : '（互补也是浪漫 ✨）'}
              </div>
            ) : myChoice ? (
              <p className="text-center text-xs text-brand-600">
                你已选定，等待 {friendName} 提交选择后自动揭晓 ⏳
              </p>
            ) : null}

            <button className="btn-ghost w-full" onClick={() => pickQuestion()}>
              换一道题
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
        小提示：互动空间双方都进入，就能一起玩。
      </p>
    </div>
  )
}
