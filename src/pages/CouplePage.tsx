import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../components/Toast'
import CoupleModuleGrid from '../components/couple/CoupleModuleGrid'
import {
  appendCoupleEvent,
  broadcastCoupleMessage,
  createCoupleBoardGameHistory,
  createCoupleMinesHistory,
  createCoupleTruthDare,
  createCoupleWufuHistory,
  createCoupleGomokuHistory,
  deleteCoupleGomoku,
  fetchCoupleGomoku,
  listCoupleGomokuHistory,
  upsertCoupleGomoku,
  notifyMinesTurn,
  notifyMinesNew,
  notifyBoardTurn,
  notifyBoardNew,
  notifyWufuTurn,
  notifyWufuNew,
  notifyGomokuTurn,
  notifyGomokuNew,
  notifyWatermelonScore,
  fetchCoupleWedding,
  upsertCoupleWedding,
  type CoupleWeddingRow,
  type CoupleWeddingState,
  createCoupleWatermelonLog,
  fetchCoupleWatermelon,
  listCoupleWatermelonLogs,
  upsertCoupleWatermelon,
  fetchCoupleDice,
  upsertCoupleDice,
  deleteCoupleDice,
  createCoupleDiceHistory,
  listCoupleDiceHistory,
  notifyDiceRoll,
  type CoupleDiceRow,
  type CoupleDiceState,
  type CoupleDiceHistoryRow,
  type DiceBetChoice,
  notifyCoupleChatMessage,
  notifyCoupleMealNudge,
  notifyLoveUnlocked,
  createCoupleWish,
  deleteCoupleBoardGame,
  deleteCoupleMines,
  deleteCoupleWufu,
  fetchCoupleBoardGame,
  fetchCoupleMines,
  fetchCoupleWufu,
  fetchCoupleQuiz,
  fetchCoupleQuizHistory,
  listCoupleBoardGameHistory,
  listCoupleMinesHistory,
  listCoupleWufuHistory,
  listCoupleQuizBank,
  listCoupleQuizPairQuestions,
  listCoupleEvents,
  listCoupleMessages,
  listCoupleQuizHistory,
  listCoupleQuizUsedIds,
  listCoupleTruthDare,
  listCoupleTruthPrompts,
  listCoupleTruthPromptBank,
  addCoupleTruthPrompt,
  // deleteCoupleTruthPrompt,
  listCoupleDarePromptBank,
  addCoupleDarePrompt,
  // deleteCoupleDarePrompt,
  listCoupleWishes,
  countCoupleWishes,
  countCoupleMessages,
  countCoupleQuizHistory,
  listMealsRange,
  MINES_CELL,
  resetCoupleQuiz,
  saveCoupleQuizChoice,
  upsertCoupleBoardGame,
  upsertCoupleMines,
  upsertCoupleWufu,
  type CoupleBoardCell,
  type CoupleBoardCellKind,
  type CoupleBoardGameHistoryRow,
  type CoupleBoardGameRow,
  type CoupleBoardLogItem,
  type CoupleBoardState,
  type CoupleEventRow,
  type CoupleMinesHit,
  type CoupleMinesHistoryRow,
  type CoupleMinesRow,
  type CoupleMinesState,
  type CoupleQuizHistoryRow,
  type CoupleQuizRow,
  type CoupleTruthDareRow,
  type CoupleTruthPromptRow,
  type CoupleDarePromptRow,
  type CoupleWufuHistoryRow,
  type CoupleWufuRow,
  type CoupleWufuState,
  type CoupleGomokuHistoryRow,
  type CoupleGomokuRow,
  type CoupleGomokuState,
  type CoupleWatermelonLogRow,
  type CoupleWatermelonScoreRow,
  fetchCoupleCountdown,
  fetchCoupleScratch,
  upsertCoupleCountdown,
  upsertCoupleScratch,
  notifyScratchRevealed,
  type CoupleCountdownItem,
  type CoupleCountdownRow,
  type CoupleCountdownState,
  type CoupleScratchCard,
  type CoupleScratchRow,
  type CoupleScratchState,
} from '../lib/db'
import { markActive, useIsPeerOnline } from '../lib/presence'
import { todayStr } from '../lib/date'
import { DEEP_COUPLE_QUESTIONS, EXTRA_COUPLE_QUESTIONS, MILESTONE_QUESTIONS, TRUTH_PROMPTS } from '../lib/coupleQuestions'
import { WEDDING_STEPS, WEDDING_TOTAL, weddingItemKey, type WeddingItemKind } from '../lib/weddingSteps'
import { useRealtime } from '../lib/realtime'
import { SLOT_LABEL, type Meal, type MealSlot } from '../lib/types'
import { COUPLE_MODULE_KEYS, type ModuleKey } from '../lib/modules'
import { useFriends } from '../store/friends'
import { useModuleFlags } from '../store/moduleFlags'
import { useSession } from '../store/session'

type Wish = { id: string; text: string; owner: string }
type DrawnWish = Wish & { drawer: string }
type ChatItem = { id: string; sender_id: string; receiver_id: string; content: string; created_at: string }

const HISTORY_PAGE_SIZE = 10
/** 备婚流程还没落库时的空值：保持引用稳定，避免每次渲染都重算派生值 */
const EMPTY_WEDDING_DONE: string[] = []
const EMPTY_WEDDING_CHECKED: Record<string, boolean> = {}
const safeDisplayText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : fallback

function HistoryPager({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))
  if (total <= HISTORY_PAGE_SIZE) return null
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
      <button type="button" className="text-brand-600 disabled:text-slate-300" disabled={page === 0} onClick={() => onChange(page - 1)}>上一页</button>
      <span className="text-slate-400">{Math.min(page + 1, pages)}/{pages} 页 · 共 {total} 条</span>
      <button type="button" className="text-brand-600 disabled:text-slate-300" disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>下一页</button>
    </div>
  )
}

/**
 * 对局动态 / 详情日志：原来靠 max-h + overflow-y-auto 内部滚动，
 * 苹果设备上容易划不动，统一改成不滚动、超出一页就分页翻。
 * 只渲染列表本身，外层容器和字号由调用方决定。
 */
function LogList({
  items,
  page,
  onPage,
  empty = '暂无动态',
}: {
  items: string[]
  page: number
  onPage: (page: number) => void
  empty?: string
}) {
  const pages = Math.max(1, Math.ceil(items.length / HISTORY_PAGE_SIZE))
  // 日志会被裁剪/重置，页码可能越界，这里统一收敛到有效范围
  const safePage = Math.min(Math.max(page, 0), pages - 1)
  return (
    <div className="space-y-1">
      {items.length === 0 ? (
        <p className="py-1 text-slate-400">{empty}</p>
      ) : (
        items
          .slice(safePage * HISTORY_PAGE_SIZE, (safePage + 1) * HISTORY_PAGE_SIZE)
          .map((text, index) => (
            <p key={`${safePage}-${index}`} className="break-words">{text}</p>
          ))
      )}
      {items.length > HISTORY_PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
          <button type="button" className="text-brand-600 disabled:text-slate-300" disabled={safePage === 0} onClick={() => onPage(safePage - 1)}>上一页</button>
          <span className="text-slate-400">{safePage + 1}/{pages} 页 · 共 {items.length} 条</span>
          <button type="button" className="text-brand-600 disabled:text-slate-300" disabled={safePage >= pages - 1} onClick={() => onPage(safePage + 1)}>下一页</button>
        </div>
      )}
    </div>
  )
}

/** 备婚流程：某一步里可勾选的待办清单（要做的事 / 要准备的东西） */
function WeddingCheckList({
  title,
  items,
  stepId,
  kind,
  checked,
  onToggle,
  disabled,
}: {
  title: string
  items: string[]
  stepId: string
  kind: WeddingItemKind
  checked: Record<string, boolean>
  onToggle: (key: string) => void
  disabled?: boolean
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-[11px] font-semibold text-slate-600">{title}</div>
      <div className="mt-1 space-y-1">
        {items.map((item, index) => {
          const key = weddingItemKey(stepId, kind, index)
          const on = Boolean(checked[key])
          return (
            <label key={key} className="flex cursor-pointer items-start gap-2 text-[11px] text-slate-600">
              <input className="mt-0.5" type="checkbox" checked={on} disabled={disabled} onChange={() => onToggle(key)} />
              <span className={`min-w-0 flex-1 break-words ${on ? 'text-slate-400 line-through' : ''}`}>{item}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

export type QuestionKind = '轻松版' | '走心版' | '深度版' | '自定义'
export type Question = { id: string; title: string; a: string; b: string; kind: QuestionKind }
type QuizView = {
  question: Question | null
  myChoice: string | null
  peerChoice: string | null
  revealed: boolean
}

type ChoiceMode = 'preset' | 'custom'

/** 飞行棋格子类型（首尾的起点/终点除外） */
type BoardCellKind = Exclude<CoupleBoardCellKind, 'start' | 'end'>

const BOARD_CELL_META: Record<BoardCellKind, { icon: string; label: string }> = {
  task: { icon: '🎯', label: '任务' },
  forward: { icon: '🚀', label: '前进' },
  back: { icon: '🌀', label: '后退' },
  pause: { icon: '⏸', label: '暂停' },
  reroll: { icon: '🎲', label: '重摇' },
  truth: { icon: '💬', label: '真心话' },
  dare: { icon: '🔥', label: '大冒险' },
  goal: { icon: '🏁', label: '冲线' },
  penalty: { icon: '⛓️', label: '惩罚' },
  bonus: { icon: '🎁', label: '福利' },
  release: { icon: '🔓', label: '解锁' },
}

/** 骰子 1-6 点的面（Unicode 骰子字模，超过 6 点用 🎲 兜底） */
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

/** 情侣飞行棋格子内容池：生成棋盘时随机抽取，每个格子的内容都从这里选 */
const BOARD_CELL_POOL: CoupleBoardCell[] = [
  { kind: 'task', text: '小猫叫3声' },
  { kind: 'task', text: '牵手10秒' },
  { kind: 'task', text: '喂对方吃东西' },
  { kind: 'task', text: '唱几句情歌' },
  { kind: 'task', text: '给对方点一份外卖备注指定内容' },
  { kind: 'task', text: '脸上贴纸条' },
  { kind: 'task', text: '听对方心跳' },
  { kind: 'task', text: '弹对方脑门3下' },
  { kind: 'task', text: '说一句感人的话' },
  { kind: 'task', text: '说出对方3个优点' },
  { kind: 'task', text: '请对方一杯奶茶' },
  { kind: 'task', text: '亲亲对方脑阔' },
  { kind: 'task', text: '帮对方剪指甲' },
  { kind: 'dare', text: '做一个大冒险' },
  { kind: 'task', text: '发出yin叫10秒' },
  { kind: 'truth', text: '回答一个真心话' },
  { kind: 'task', text: '吐舌头10秒' },
  { kind: 'task', text: '小猪叫3声' },
  { kind: 'task', text: '闭眼撅嘴10秒' },
  { kind: 'task', text: '捏捏对方脸' },
  { kind: 'task', text: '亲亲对方脸蛋' },
  { kind: 'task', text: '十指相扣10秒' },
  { kind: 'task', text: '喂对方喝水' },
  { kind: 'task', text: '舔对方锁骨' },
  { kind: 'task', text: '让对方摸指定位置' },
  { kind: 'task', text: '在对方背上写字' },
  { kind: 'task', text: 'kiss3下' },
  { kind: 'task', text: '每句话末尾加喵~' },
  { kind: 'task', text: '用嘴接连线' },
  { kind: 'task', text: '给对方膝枕1分钟' },
  { kind: 'task', text: '舔对方嘴唇' },
  { kind: 'task', text: '禁止摸摸2分钟' },
  { kind: 'task', text: '鼻尖贴近5秒' },
  { kind: 'task', text: '被对方摸摸头' },
  { kind: 'task', text: '深情对视至1人笑' },
  { kind: 'task', text: '撒娇10秒' },
  { kind: 'task', text: '含水10秒' },
  { kind: 'task', text: '沙发咚对方10秒' },
  { kind: 'task', text: '一起恶搞自拍' },
  { kind: 'task', text: '给对方说悄悄话' },
  { kind: 'task', text: '给对方按小腿1分钟' },
  { kind: 'task', text: '对视5秒' },
  { kind: 'task', text: '手牵手10秒' },
  { kind: 'task', text: '拥抱10秒' },
  { kind: 'task', text: '尝试接吻的感觉' },
  { kind: 'task', text: '说说初次见面的感觉' },
  { kind: 'task', text: '对方闭上眼睛给你涂口红' },
  { kind: 'task', text: '一起给对方按摩肩膀' },
  { kind: 'task', text: '背女生转3圈' },
  { kind: 'task', text: '摸对方耳朵2秒' },
  { kind: 'task', text: '摸摸头10秒' },
  { kind: 'task', text: '给对方唱歌' },
  { kind: 'task', text: '一起喝一杯水' },
  { kind: 'task', text: '拍一段表白视频做纪念' },
  { kind: 'task', text: '给对方梳头发' },
  { kind: 'task', text: '给对方按摩捶背1分钟' },
  { kind: 'task', text: '亲吻对方手背10秒' },
  { kind: 'task', text: '拥抱1分钟' },
  { kind: 'task', text: '亲吻一下对方的手' },
  { kind: 'task', text: '被ta挠痒痒10秒' },
  { kind: 'task', text: '从背后抱对方1分钟' },
  { kind: 'task', text: '亲吻对方大腿' },
  { kind: 'task', text: '浪漫表白' },
  { kind: 'task', text: '给对方一个深情的拥抱' },
  { kind: 'task', text: '脱掉对方一件衣服' },
  { kind: 'task', text: '脱掉对方的所有衣服' },
  { kind: 'task', text: '挠痒痒到对方求饶为止（至少10秒）' },
  { kind: 'task', text: '和对方深情接吻30秒' },
  { kind: 'task', text: '亲吻对方大腿内侧10秒' },
  { kind: 'task', text: 'Tuo光衣服后退2格' },
  { kind: 'task', text: '依次亲吻对方的额头、鼻子、嘴唇、脖子' },
  { kind: 'task', text: '和对方湿吻10秒' },
  { kind: 'task', text: '被对方伸手进裤子随意摸10秒' },
  { kind: 'task', text: '伸手进对方裤子随意摸10秒' },
  { kind: 'task', text: '舔对方的耳朵' },
  { kind: 'task', text: '舔对方的脖子' },
  { kind: 'task', text: '舔对方的手指' },
  { kind: 'task', text: '自拍一段接吻照片' },
  { kind: 'task', text: '把酒水或酸奶倒在自己胸上对方舔干净' },
  { kind: 'task', text: '公主抱对方在房内绕一圈' },
  { kind: 'task', text: '喝交杯酒并拍照' },
  { kind: 'task', text: '和对方做Do爱' },
  { kind: 'task', text: 'Tuo光衣服后跳二格' },
  { kind: 'task', text: 'Tuo光衣服后跳三格' },
  { kind: 'task', text: 'Tuo光衣服后跳四格' },
  { kind: 'task', text: '用嘴吸对方手指10秒' },
  { kind: 'task', text: '用嘴吸对方耳朵10秒' },
  { kind: 'task', text: 'Tuo掉对方一件衣服' },
  { kind: 'task', text: 'Tuo掉对方一件内衣' },
  { kind: 'task', text: 'Tuo掉对方的所有内衣裤' },
  { kind: 'task', text: '把酒水倒在自己身上对方舔干净' },
  { kind: 'task', text: 'Tuo掉对方两件衣服' },
  { kind: 'task', text: '亲吻对方额头' },
  { kind: 'task', text: '亲吻对方嘴唇' },
  { kind: 'task', text: '吸吮对方Ru头10秒' },
  { kind: 'task', text: '压住对方亲嘴10秒' },
  { kind: 'task', text: '对方舔你上半身的各个部位超过30秒' },
  { kind: 'task', text: '挑逗对方敏感部位15秒' },
  { kind: 'task', text: '自己趴着对方舔你后背10秒' },
  { kind: 'task', text: '贴贴10秒' },
  { kind: 'task', text: '揉对方Nai子一下' },
  { kind: 'task', text: '想尽办法弄对方Bo起或者流水' },
  { kind: 'task', text: '舔对方的脖子到胸口10秒' },
  { kind: 'task', text: 'Tuo光衣服后退5格' },
  { kind: 'task', text: '跪舔对方30秒' },
  { kind: 'task', text: '舔或轻咬对方耳垂5下' },
  { kind: 'task', text: '依次亲吻对方的额头、鼻子、嘴唇、脖子' },
  { kind: 'task', text: '被对方伸到内衣内抓胸10秒' },
  { kind: 'forward', text: '向前一步', value: 1 },
  { kind: 'forward', text: '继续向前一步', value: 1 },
  { kind: 'forward', text: '前进三格', value: 3 },
  { kind: 'back', text: '后退一格', value: 1 },
  { kind: 'back', text: '后退二格', value: 2 },
  { kind: 'back', text: '后退三格', value: 3 },
  { kind: 'pause', text: '暂停一下' },
  { kind: 'task', text: '舔对方耳朵10秒' },
  { kind: 'pause', text: '暂停一下原地不动换对方摇' },
  { kind: 'reroll', text: '重摇一次' },
  { kind: 'goal', text: '红色棋子进入终点' },
  { kind: 'goal', text: '蓝色棋子进入终点' },
  { kind: 'penalty', text: '【惩罚】给对方按摩小腿直到解除' },
  { kind: 'penalty', text: '【惩罚】被对方随意摸直到惩罚结束' },
  { kind: 'penalty', text: '【惩罚】下次惩罚x2' },
  { kind: 'penalty', text: '【惩罚】伺候对方20秒' },
  { kind: 'bonus', text: '【福利】解除惩罚并摸对方胸部或打屁股一下' },
  { kind: 'bonus', text: '【福利】给对方按摩1分钟' },
  { kind: 'bonus', text: '【福利】躺下享受被对方全身按摩1分钟' },
  { kind: 'bonus', text: '【福利】对方口你下面10秒' },
  { kind: 'release', text: '解除惩罚并前进2格', value: 2 },
]

const choiceLabel = (choice: string | null, question: Question): string => {
  if (!choice) return ''
  if (choice === 'A') return question.a
  if (choice === 'B') return question.b
  return choice
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
  '想把你写进每一页日记里，再念给你听。',
  '世界很大，我的世界很小，小到刚好装下一个你。',
  '今天也偷偷喜欢你了，比昨天多一点的那种。',
  '你打哈欠的样子都可爱，这很不讲道理。',
  '三餐四季，有你就是好日子。',
  '想做你的小太阳，也要做你的棉被和热汤。',
  '你不必急着长大，我可以陪你慢慢来。',
  '心里有个人，连风吹过来都是甜的。',
  '想跟你交换日常，把琐碎都聊成浪漫。',
  '你的名字是我心里最软的那一处。',
  '只要最后是你，晚一点也没关系。',
  '想和你从新鲜感走到归属感。',
  '你在忙什么？我在想你。',
  '温柔有很多种，你是最认真的一种。',
  '想陪你把日子过成诗，再把诗过成日子。',
  '遇见你之后，幸福变成了具体的模样。',
  '我的心很小，只够装下你一个人。',
  '今天的月亮很亮，像极了想起你时的心情。',
  '你是我平淡生活里的英雄梦想。',
  '想牵你的手，从心动到古稀。',
  '你笑起来真好看，像春天的第一场花事。',
  '世界乱糟糟，你是我的标准答案。',
  '我不贪心，只有你，就够了。',
  '想和你分享云朵、晚霞和所有可爱的事。',
  '你的每一条消息，我都想认真回复。',
  '想在你身上浪费所有的好脾气。',
  '慢慢喜欢你，慢慢地靠近，慢慢地把余生都给你。',
  '你是我绕过山河人海，才遇到的人间理想。',
  '想给你起很多昵称，每一个都藏着喜欢。',
  '别人的晚安是客气，我的晚安是想让你梦到我。',
  '我对你啊，是想和你走完这一生的那种喜欢。',
  '你一站出来，就觉得世界亮了一点。',
  '想把喜欢的样子都留给你，把坏脾气都改给你看。',
  '有你之后，我不再羡慕任何人的爱情。',
  '想和你一房两人三餐四季。',
  '今天也是把你放在心尖尖上的一天。',
  '你是我藏在温柔里的打算。',
  '我能想到最浪漫的事，是和你一起慢慢变好。',
  '想把全世界的好都给你，又觉得全世界都不够。',
  '你的存在本身，就是对我的偏爱。',
  '想和你有一个很长很长的未来。',
  '喜欢你，比昨天多一点，比明天少一点。',
  '想做你荫下的树，也做你手里的花。',
  '你负责璀璨，我负责陪你不朽。',
  '从遇见你开始，我的人生就开了挂。',
  '我不擅长告别，所以我打算一直赖着你。',
  '想和你把普通的日子过得闪闪发光。',
  '你眨眨眼，我的心就跟着一颤一颤的。',
  '我的心很大，装得下全世界；我的心又很小，只装得下你。',
  '想和你分享每一个幼稚的念头，包括现在想你的这个。',
  '你是我认定的人，认定就不换了。',
  '想给你很多很多爱，和很多很多顿好吃的。',
  '有你的日子，连堵车都变得可爱了些。',
  '你的怀抱是我唯一想定居的地方。',
  '喜欢你这件事，我打算做一辈子。',
  '想把你宠成小朋友，也把你敬成大人物。',
  '生活偶尔糟糕，但你永远可靠。',
  '想听你说话，说什么都行，说着说着就到老了。',
  '我攒了半生的温柔，都想倒给你。',
  '你是我热烈且平静的爱。',
  '想和你试遍所有第一次，再一起回忆很多次。',
  '今天的心跳，一半给你，一半因为想你给你。',
  '你一来，我的四季就都是春天。',
  '想做你杯里的水、伞外的晴、身边的风。',
  '我见惯了山川湖海，还是最爱你的眉眼。',
  '想和你既能像孩子一样玩闹，也能像大人一样担当。',
  '你的晚安是我听过最贵的摇篮曲。',
  '想陪你走过春夏秋冬，再陪你看细水长流。',
  '别怕，无论多晚，我都等你回家。',
  '你是我写在计划里，也写进命运里的人。',
  '想把「在一起」这件事做到地老天荒。',
  '我对全世界抠门，只想对你大方。',
  '你是我所有温柔的理由和去向。',
  '想在你难过时当纸巾，开心时当扩音器。',
  '世界纷纷扰扰，我只要你平平安安。',
  '想和你把柴米油盐过成情话绵绵。',
  '你的一句「在」，抵得过千军万马。',
  '我的爱不打折，只对你无限量供应。',
  '想在每一个俗气的节日里，认真地喜欢你。',
  '你的偏爱，是我最想赢的奖励。',
  '想陪你把梦想一个个点亮，再一起吹熄生日蜡烛。',
  '遇见你之前我没想过以后，遇见你以后我全是以后。',
  '想做你人生里的常驻嘉宾，永不退场那种。',
  '我不追星，因为你就是我的星星。',
  '想和你一起把日子熬成糖。',
  '你的每一顿饭，我都想在场。',
  '想和你从心动到白头，从新鲜到安分。',
  '你是我疲惫生活里唯一的解药。',
  '想把所有的好运都存起来，只用来遇见你。',
  '我的世界很吵，你说话我永远愿意听。',
  '想在你的故事里，占一整章的篇幅。',
  '你是我藏在计划表之外，却写进未来里的惊喜。',
  '想和你喝很多次下午茶，也喝很多年的白开水。',
  '我不怕岁月长，因为终点站是你。',
  '想让你知道，你被好好爱着，一直都会是。',
  '今天的情话到这里，想你的事明天继续。',
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
  { id: 'easy-9', title: '早餐搭配', a: '豆浆油条', b: '咖啡面包', kind: '轻松版' },
  { id: 'easy-10', title: '出门穿搭', a: '舒适休闲', b: '精心打扮', kind: '轻松版' },
  { id: 'easy-11', title: '手机没电', a: '借充电宝续命', b: '发呆放空一会儿', kind: '轻松版' },
  { id: 'easy-12', title: '周末早起', a: '去吃早茶', b: '睡到中午', kind: '轻松版' },
  { id: 'easy-13', title: '电影口味', a: '动作大片', b: '温情治愈', kind: '轻松版' },
  { id: 'easy-14', title: '天气太热', a: '空调房待着', b: '出去找冷饮', kind: '轻松版' },
  { id: 'easy-15', title: '运动方式', a: '跑步出汗', b: '散步聊天', kind: '轻松版' },
  { id: 'easy-16', title: '唱歌场合', a: 'KTV 当麦霸', b: '在家清唱', kind: '轻松版' },
  { id: 'easy-17', title: '甜咸之争', a: '甜豆腐脑', b: '咸豆腐脑', kind: '轻松版' },
  { id: 'easy-18', title: '旅行打包', a: '提前三天列清单', b: '前一晚现塞行李箱', kind: '轻松版' },
  { id: 'easy-19', title: '拍照风格', a: '自然抓拍', b: '摆拍精致', kind: '轻松版' },
  { id: 'easy-20', title: '零食囤货', a: '薯片可乐', b: '果冻坚果', kind: '轻松版' },
  { id: 'easy-21', title: '消遣方式', a: '刷剧一整天', b: '打游戏一下午', kind: '轻松版' },
  { id: 'easy-22', title: '夜宵诱惑', a: '烧烤配啤酒', b: '泡面加个蛋', kind: '轻松版' },
  { id: 'easy-23', title: '雨天心情', a: '听雨睡觉', b: '踩水出门', kind: '轻松版' },
  { id: 'easy-24', title: '花钱态度', a: '记账精打细算', b: '开心就好该花就花', kind: '轻松版' },
  { id: 'easy-25', title: '想养的小动物', a: '小猫', b: '小狗', kind: '轻松版' },
  { id: 'easy-26', title: '冬天取暖', a: '裹紧小被子', b: '暖手袋不离手', kind: '轻松版' },
  { id: 'easy-27', title: '游乐园必玩', a: '过山车', b: '旋转木马', kind: '轻松版' },
  { id: 'easy-28', title: '逛街节奏', a: '一家家慢慢逛', b: '直奔目标买完就走', kind: '轻松版' },
  { id: 'easy-29', title: '聊天风格', a: '表情包大战', b: '文字走心', kind: '轻松版' },
  { id: 'easy-30', title: '火锅蘸料', a: '麻酱党', b: '油碟党', kind: '轻松版' },
  { id: 'easy-31', title: '睡前习惯', a: '刷手机入睡', b: '看几页书', kind: '轻松版' },
  { id: 'easy-32', title: '周五晚上', a: '早早回家躺平', b: '约朋友聚一场', kind: '轻松版' },
  { id: 'easy-33', title: '奶茶甜度', a: '全糖快乐', b: '三分糖健康', kind: '轻松版' },
  { id: 'easy-34', title: '音乐口味', a: '流行金曲', b: '民谣小清新', kind: '轻松版' },
  { id: 'easy-35', title: '手机壁纸', a: '爱豆或萌宠', b: '风景大片', kind: '轻松版' },
  { id: 'easy-36', title: '假期充电', a: '宅家补觉', b: '短途周边游', kind: '轻松版' },
  { id: 'easy-37', title: '餐厅等位', a: '耐心刷手机', b: '换个不排队的', kind: '轻松版' },
  { id: 'easy-38', title: '衣服风格', a: '基础百搭款', b: '个性设计款', kind: '轻松版' },
  { id: 'easy-39', title: '减压方式', a: '大吃一顿', b: '大睡一觉', kind: '轻松版' },
  { id: 'easy-40', title: '电子产品', a: '全屋智能控', b: '够用就好极简派', kind: '轻松版' },
  { id: 'easy-41', title: '咖啡续命', a: '美式纯苦', b: '拿铁加糖', kind: '轻松版' },
  { id: 'easy-42', title: '旅行纪念', a: '收集冰箱贴', b: '寄明信片', kind: '轻松版' },
  { id: 'easy-43', title: '冬季限定', a: '第一口热奶茶', b: '第一顿火锅', kind: '轻松版' },
  { id: 'easy-44', title: '出门必带', a: '充电宝', b: '小镜子口红', kind: '轻松版' },
  { id: 'easy-45', title: '家务分工', a: '一起打扫更快', b: '各管一摊更清爽', kind: '轻松版' },
  { id: 'easy-46', title: '纪念日过法', a: '吃一顿大餐', b: '互送手工礼物', kind: '轻松版' },
  { id: 'easy-47', title: '春天约会', a: '公园野餐', b: '花海拍照', kind: '轻松版' },
  { id: 'easy-48', title: '追星态度', a: '疯狂打 call', b: '远远欣赏', kind: '轻松版' },
  { id: 'easy-49', title: '早餐时间', a: '早起慢慢吃', b: '赖床到最后一刻', kind: '轻松版' },
  { id: 'easy-50', title: '车上位置', a: '副驾陪聊', b: '后排补觉', kind: '轻松版' },
  { id: 'easy-51', title: '露营必带', a: '吉他唱歌', b: '吊床放空', kind: '轻松版' },
  { id: 'easy-52', title: '秋天限定', a: '糖炒栗子', b: '烤红薯', kind: '轻松版' },
  { id: 'easy-53', title: '一起看演出', a: '演唱会', b: '话剧脱口秀', kind: '轻松版' },
  { id: 'easy-54', title: '海边度假', a: '晒太阳躺平', b: '下水玩个痛快', kind: '轻松版' },
  { id: 'easy-55', title: '点外卖决策', a: '常点回购不踩雷', b: '每次都尝新店', kind: '轻松版' },
  { id: 'easy-56', title: '内存告急', a: '删照片', b: '删 App', kind: '轻松版' },
  { id: 'easy-57', title: '冬天穿搭', a: '要风度', b: '要温度', kind: '轻松版' },
  { id: 'easy-58', title: '拼图难度', a: '上千片硬核', b: '五百片休闲', kind: '轻松版' },
  { id: 'easy-59', title: '意外中奖', a: '当场昭告天下', b: '深藏功与名', kind: '轻松版' },
  { id: 'easy-60', title: '一起养植物', a: '好养的多肉', b: '有仪式感的开花植物', kind: '轻松版' },
  { id: 'heart-1', title: '未来生活', a: '一起旅行很多次', b: '一起布置一个家', kind: '走心版' },
  { id: 'heart-2', title: '难过的时候', a: '想先要一个拥抱', b: '想先听我慢慢说', kind: '走心版' },
  { id: 'heart-3', title: '被记住的瞬间', a: '第一次见面的细节', b: '某次被照顾的时刻', kind: '走心版' },
  { id: 'heart-4', title: '表达喜欢', a: '把爱说出来', b: '用行动默默证明', kind: '走心版' },
  { id: 'heart-5', title: '理想陪伴', a: '每天分享小事', b: '需要时一直在场', kind: '走心版' },
  { id: 'heart-6', title: '一起变好', a: '互相鼓励挑战', b: '接纳彼此节奏', kind: '走心版' },
  { id: 'heart-7', title: '关于安全感', a: '及时报备行程', b: '给彼此充分信任', kind: '走心版' },
  { id: 'heart-8', title: '想一起完成', a: '去看一场日出', b: '记录一本共同相册', kind: '走心版' },
  { id: 'heart-9', title: '吵架之后', a: '先冷静再谈', b: '当场就说开', kind: '走心版' },
  { id: 'heart-10', title: '表达爱意', a: '天天说出口', b: '藏在细节里', kind: '走心版' },
  { id: 'heart-11', title: '对方有压力时', a: '帮忙分担', b: '安静陪伴', kind: '走心版' },
  { id: 'heart-12', title: '理想周末', a: '完全放空', b: '一起做件小事', kind: '走心版' },
  { id: 'heart-13', title: '记忆中的味道', a: '家里的菜', b: '约会时的小吃', kind: '走心版' },
  { id: 'heart-14', title: '未来定居', a: '靠近家人', b: '我们俩说了算', kind: '走心版' },
  { id: 'heart-15', title: '遇到分歧', a: '各退一步', b: '找到双赢解法', kind: '走心版' },
  { id: 'heart-16', title: '最被治愈的瞬间', a: '生病被照顾', b: '难过被理解', kind: '走心版' },
  { id: 'heart-17', title: '仪式感', a: '每个纪念日都过', b: '平常日子也造惊喜', kind: '走心版' },
  { id: 'heart-18', title: '最珍贵的状态', a: '在你面前做自己', b: '一起玩闹不设防', kind: '走心版' },
  { id: 'heart-19', title: '爱情里最难的事', a: '说对不起', b: '说真实想法', kind: '走心版' },
  { id: 'heart-20', title: '相处秘诀', a: '给足空间', b: '保持黏度', kind: '走心版' },
  { id: 'heart-21', title: '深夜 emo', a: '想找人聊聊', b: '想被抱着不说', kind: '走心版' },
  { id: 'heart-22', title: '最好的礼物', a: '用心的手作', b: '心愿单里的那件', kind: '走心版' },
  { id: 'heart-23', title: '心动的瞬间', a: '认真做事的样子', b: '突然回头笑的样子', kind: '走心版' },
  { id: 'heart-24', title: '关于道歉', a: '先说先赢', b: '说清缘由更重要', kind: '走心版' },
  { id: 'heart-25', title: '面对彼此梦想', a: '全力托举', b: '提醒量力而行', kind: '走心版' },
  { id: 'heart-26', title: '老了以后', a: '一起种菜养花', b: '一起旅行看世界', kind: '走心版' },
  { id: 'heart-27', title: '当下与未来', a: '先过好今天', b: '先定好方向', kind: '走心版' },
  { id: 'heart-28', title: '安全感来源', a: '秒回消息', b: '言行一致', kind: '走心版' },
  { id: 'heart-29', title: '最想夸对方', a: '情绪稳定', b: '温柔可靠', kind: '走心版' },
  { id: 'heart-30', title: '爱的表达', a: '多说肯定的话', b: '多做贴心的事', kind: '走心版' },
  { id: 'heart-31', title: '遇到低谷', a: '一起扛', b: '允许各自消化', kind: '走心版' },
  { id: 'heart-32', title: '婚姻观', a: '领证是承诺', b: '日常就是承诺', kind: '走心版' },
  { id: 'heart-33', title: '异地的考验', a: '每天视频', b: '攒假见面', kind: '走心版' },
  { id: 'heart-34', title: '更看重', a: '被理解', b: '被尊重', kind: '走心版' },
  { id: 'heart-35', title: '对过去的自己', a: '说勇敢一点', b: '说别着急', kind: '走心版' },
  { id: 'heart-36', title: '幸福的定义', a: '平安喜乐', b: '一起成长', kind: '走心版' },
  { id: 'heart-37', title: '纪念日的惊喜', a: '对方偷偷准备', b: '一起挑选', kind: '走心版' },
  { id: 'heart-38', title: '争执时最怕', a: '冷暴力', b: '翻旧账', kind: '走心版' },
  { id: 'heart-39', title: '对未来的期待', a: '平淡细水长流', b: '一起折腾闯荡', kind: '走心版' },
  { id: 'heart-40', title: '恋爱教会我', a: '控制情绪', b: '换位思考', kind: '走心版' },
  { id: 'heart-41', title: '被夸开心', a: '夸我有能力', b: '夸我很用心', kind: '走心版' },
  { id: 'heart-42', title: '两人世界', a: '需要独处时间', b: '时刻想在一起', kind: '走心版' },
  { id: 'heart-43', title: '最想一起学', a: '一道拿手菜', b: '一门新语言', kind: '走心版' },
  { id: 'heart-44', title: '秘密分享', a: '毫无保留', b: '各有个的小抽屉', kind: '走心版' },
  { id: 'heart-45', title: '家庭账本', a: '分开记账', b: '混在一起管', kind: '走心版' },
  { id: 'heart-46', title: '遇见你之后', a: '更爱笑了', b: '更爱家了', kind: '走心版' },
  { id: 'heart-47', title: '说走就走', a: '深夜就出发', b: '计划好更安心', kind: '走心版' },
  { id: 'heart-48', title: '情绪上头时', a: '需要一个拥抱', b: '需要一点空间', kind: '走心版' },
  { id: 'heart-49', title: '理想的家', a: '温馨小窝', b: '阳光大房子', kind: '走心版' },
  { id: 'heart-50', title: '心动的开始', a: '相信一见钟情', b: '相信日久生情', kind: '走心版' },
  { id: 'heart-51', title: '最感动的付出', a: '为我挤出的时间', b: '记住我的小事', kind: '走心版' },
  { id: 'heart-52', title: '写给未来的信', a: '写给十年后的我们', b: '写给明天的彼此', kind: '走心版' },
  { id: 'heart-53', title: '爱的保存', a: '照片和vlog', b: '日记和票根', kind: '走心版' },
  { id: 'heart-54', title: '彼此的底线', a: '坦诚不隐瞒', b: '尊重不越界', kind: '走心版' },
  { id: 'heart-55', title: '最想感谢你', a: '接住我的坏情绪', b: '陪我变成更好的人', kind: '走心版' },
  { id: 'heart-56', title: '关于信任', a: '从不需要查证', b: '需要时坦诚相告', kind: '走心版' },
  { id: 'heart-57', title: '重要的习惯', a: '睡前互道晚安', b: '出门前一个拥抱', kind: '走心版' },
  { id: 'heart-58', title: '相处中的加分项', a: '记得我随口的话', b: '在我面前不装', kind: '走心版' },
  { id: 'heart-59', title: '爱情的模样', a: '像朋友一样聊得来', b: '像家人一样离不开', kind: '走心版' },
  { id: 'heart-60', title: '我们最棒的一天', a: '在一起的第一个日子', b: '一起熬过难关的日子', kind: '走心版' },
]

export const ALL_QUESTIONS = [...BUILT_IN_QUESTIONS, ...EXTRA_COUPLE_QUESTIONS, ...DEEP_COUPLE_QUESTIONS, ...MILESTONE_QUESTIONS]
let managedQuestionsCache: Question[] | null = null
const DARES = [
  '用三个具体细节夸夸对方，不能只说“很好”。',
  '给对方倒一杯水或准备一份小零食。',
  '模仿对方一个可爱的日常习惯，让对方猜是什么。',
  '一起选一首歌，认真听完并说说喜欢的部分。',
  '给对方发一条真诚的感谢消息。',
  '邀请对方散步十分钟，由对方选择路线。',
  '用一分钟讲出你们共同经历里最有趣的一幕。',
  '给对方一个拥抱，或尊重对方选择击掌。',
  '一起拍一张自然的合照，双方都同意再保存。',
  '为对方做一件现在就能完成的小事。',
  '轮流说出对方一个让你欣赏的优点。',
  '为下次约会各提一个点子，并选一个加入计划。',
  '用一句话描述今天最想和对方分享的心情。',
  '一起做三次深呼吸，然后互相问问现在感觉如何。',
  '把手机放下两分钟，专心听对方讲一件小事。',
  '给对方写一句鼓励的话，可以当面念出来。',
  '一起挑一张旧照片，各自讲讲当时记得的细节。',
  '为彼此准备一个不花钱的惊喜点子。',
  '轮流选一个表情，用动作演出来让对方猜。',
  '问对方现在最需要什么，再一起完成一个小步骤。',
]

const REQUIRED_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']

const key = (suffix: string, a: string | null, b: string | null) => {
  const [first, second] = (a || 'none') < (b || 'none') ? [a, b] : [b, a]
  return `couple-${suffix}-${first}-${second}`
}

const orderedPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a])

const dayNumber = () => Math.floor(Date.now() / 86_400_000)

function shuffleList<T>(list: T[]): T[] {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * 生成共享棋盘：首尾固定起点/终点，中间格子按类型分组后轮流抽取——
 * 每种类型都保证出现、分布均衡，且同一棋盘内内容尽量不重复（某类取尽才允许由其他类补位）。
 * extraPool 是情侣自定义的私密内容（每行一条），会合并进任务池一起参与抽取。
 */
function buildBoardCells(size: number, extraTexts: string[] = []): CoupleBoardCell[] {
  const middle = Math.max(0, size - 2)
  const pool: CoupleBoardCell[] = [
    ...extraTexts.map((text) => ({ kind: 'task' as const, text })),
    ...BOARD_CELL_POOL,
  ]
  const groups = new Map<CoupleBoardCellKind, CoupleBoardCell[]>()
  for (const cell of shuffleList(pool)) {
    const list = groups.get(cell.kind) ?? []
    list.push(cell)
    groups.set(cell.kind, list)
  }
  // 冲线（goal）格大概率不出现：约 10 局棋盘才出现 1 次冲线，保留惊喜感、不稀释常规玩法
  if (Math.random() > 0.1) groups.delete('goal')
  const picked: CoupleBoardCell[] = []
  // 第一轮：每种类型先各出一个，保证玩法齐全
  if (middle >= groups.size) {
    for (const list of groups.values()) picked.push(list.shift()!)
  }
  // 后续轮：每轮按随机顺序从各类型再取一个，直到填满或全部取尽
  while (picked.length < middle) {
    const before = picked.length
    for (const kind of shuffleList([...groups.keys()])) {
      if (picked.length >= middle) break
      const cell = groups.get(kind)?.shift()
      if (cell) picked.push(cell)
    }
    if (picked.length === before) break
  }
  return [{ kind: 'start', text: '起点' }, ...shuffleList(picked), { kind: 'end', text: '终点' }]
}

/** 解析自定义内容池：按行拆分、去空去重，最多 100 条 */
function parseCustomCells(text: string): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || seen.has(line) || lines.length >= 100) continue
    seen.add(line)
    lines.push(line)
  }
  return lines
}

/** 开局先手判定：双方各掷一次骰子，点数大的先走（平局重掷） */
function rollForFirst(names: [string, string], verb = '先走'): { turn: 0 | 1; logs: string[] } {
  const logs: string[] = []
  let a = 0
  let b = 0
  while (a === b) {
    a = 1 + Math.floor(Math.random() * 6)
    b = 1 + Math.floor(Math.random() * 6)
    logs.push(`🎲先手判定：${names[0]} 掷出 ${a} 点，${names[1]} 掷出 ${b} 点${a === b ? '，平局重掷' : ''}`)
  }
  const turn: 0 | 1 = a > b ? 0 : 1
  logs.push(`✌️${names[turn]}点数更大，由 TA ${verb}`)
  return { turn, logs }
}

/* ------------------------------ 摆方五福棋（模块级工具） ------------------------------ */

/**
 * 五福棋全部成项棋形（吃子规则）：
 * 通天 = 5 子斜贯两条对角；大棍（五福）= 5 子整行 / 整列；
 * 四斜 = 4 子斜连两条相邻边；三斜 = 3 子斜连两条相邻边；小方（井口）= 紧邻 2×2 方格。
 * cells 为 25 个落子点（行优先）中组成该棋形的点。
 */
const WUFU_PATTERNS: Array<{ name: string; cells: number[] }> = [
  // 大棍：5 行 + 5 列
  ...Array.from({ length: 5 }, (_, r) => ({ name: '大棍', cells: [0, 1, 2, 3, 4].map((c) => r * 5 + c) })),
  ...Array.from({ length: 5 }, (_, c) => ({ name: '大棍', cells: [0, 1, 2, 3, 4].map((r) => r * 5 + c) })),
  // 通天：两条主对角线
  { name: '通天', cells: [0, 6, 12, 18, 24] },
  { name: '通天', cells: [4, 8, 12, 16, 20] },
  // 四斜：长 4 的对角线，两端落在两条相邻边
  { name: '四斜', cells: [1, 7, 13, 19] },
  { name: '四斜', cells: [5, 11, 17, 23] },
  { name: '四斜', cells: [3, 7, 11, 15] },
  { name: '四斜', cells: [9, 13, 17, 21] },
  // 三斜：长 3 的对角线，两端落在两条相邻边
  { name: '三斜', cells: [2, 6, 10] },
  { name: '三斜', cells: [14, 18, 22] },
  { name: '三斜', cells: [2, 8, 14] },
  { name: '三斜', cells: [10, 16, 22] },
  // 小方（井口）：紧邻 2×2 小正方形
  ...Array.from({ length: 16 }, (_, i) => {
    const r = Math.floor(i / 4)
    const c = i % 4
    return { name: '小方', cells: [r * 5 + c, r * 5 + c + 1, (r + 1) * 5 + c, (r + 1) * 5 + c + 1] }
  }),
]

/** 玩家（1 = member_a ❤️ / 2 = member_b 💙）当前已成项的棋形下标集合 */
function wufuFormedPatterns(board: number[], player: number): Set<number> {
  const formed = new Set<number>()
  WUFU_PATTERNS.forEach((pattern, index) => {
    if (pattern.cells.every((cell) => board[cell] === player)) formed.add(index)
  })
  return formed
}

/** 玩家处于成项棋形中的棋子集合（受保护，不能被对方提走） */
function wufuProtectedCells(board: number[], player: number): Set<number> {
  const cells = new Set<number>()
  WUFU_PATTERNS.forEach((pattern) => {
    if (pattern.cells.every((cell) => board[cell] === player)) pattern.cells.forEach((cell) => cells.add(cell))
  })
  return cells
}

/** 走子阶段：某棋子沿线可走到的相邻空点（上下左右一格） */
function wufuMoveTargets(board: number[], from: number): number[] {
  const r = Math.floor(from / 5)
  const c = from % 5
  const targets: number[] = []
  if (r > 0 && board[from - 5] === 0) targets.push(from - 5)
  if (r < 4 && board[from + 5] === 0) targets.push(from + 5)
  if (c > 0 && board[from - 1] === 0) targets.push(from - 1)
  if (c < 4 && board[from + 1] === 0) targets.push(from + 1)
  return targets
}

/** 走子阶段：玩家是否还有任何一步可走（无路可走即判负） */
function wufuHasAnyMove(board: number[], player: number): boolean {
  for (let cell = 0; cell < 25; cell += 1) {
    if (board[cell] === player && wufuMoveTargets(board, cell).length) return true
  }
  return false
}

/* ------------------------------ 情侣扫雷（模块级工具） ------------------------------ */

/** 扫雷尺寸档位：多种大小可选，雷数随之递增；另支持「自定义」行/列/雷数 */
const MINES_PRESETS = [
  { key: 's', label: '6×6 · 6雷', rows: 6, cols: 6, mines: 6 },
  { key: 'm', label: '8×8 · 10雷', rows: 8, cols: 8, mines: 10 },
  { key: 'l', label: '10×10 · 15雷', rows: 10, cols: 10, mines: 15 },
  { key: 'xl', label: '12×12 · 24雷', rows: 12, cols: 12, mines: 24 },
]

/** 自定义数值收敛到安全范围（生成棋盘时调用） */
const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)))

/** 通关奖励池：随机解锁一条 */
const MINES_REWARDS = [
  '奖励兑换券：向对方兑换一个小心愿',
  '今晚的按摩 10 分钟券',
  '一次由你全权安排的小约会',
  '对方真心夸你 30 秒不许重样',
  '一杯对方亲手做的饮品',
  '一个不限时长的拥抱',
  '下次点餐由对方全包',
]

/** 数字格的颜色（经典扫雷配色） */
const MINES_NUMBER_COLORS = ['', 'text-blue-600', 'text-emerald-600', 'text-rose-600', 'text-indigo-700', 'text-amber-700', 'text-teal-600', 'text-slate-700', 'text-slate-500']

/** 首次点开时才生成雷区：避开首格及其周围一圈，保证第一步一定安全 */
function generateMines(rows: number, cols: number, count: number, safeIndex: number): number[] {
  const forbidden = new Set<number>()
  const sr = Math.floor(safeIndex / cols)
  const sc = safeIndex % cols
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const r = sr + dr
      const c = sc + dc
      if (r >= 0 && r < rows && c >= 0 && c < cols) forbidden.add(r * cols + c)
    }
  }
  const pool: number[] = []
  for (let i = 0; i < rows * cols; i += 1) {
    if (!forbidden.has(i)) pool.push(i)
  }
  return shuffleList(pool).slice(0, Math.min(count, pool.length))
}

/** 某格周围一圈的地雷数 */
function minesAroundOf(state: CoupleMinesState, index: number): number {
  const { rows, cols, mines } = state
  const r = Math.floor(index / cols)
  const c = index % cols
  let count = 0
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr
      const nc = c + dc
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && mines.includes(nr * cols + nc)) count += 1
    }
  }
  return count
}

/** 扫雷专属惩罚任务池：踩雷时随机抽取（抽取时对本局已触发过的去重） */
const MINES_TASK_POOL: string[] = [
  '夸对方10句不重样的彩虹屁',
  '模仿对方的口头禅和语气说3句话',
  '用一句诗或歌词向对方表白',
  '给对方唱一首完整的儿歌',
  '跳15秒搞怪舞蹈并录下来',
  '用屁股写自己的名字',
  '面无表情念「utation绕口令」2遍',
  '给对方当1分钟人肉靠枕',
  '说出你们第一次约会吃的什么',
  '模仿一种动物叫声直到对方猜出来',
  '用鼻子蹭对方脸颊3下',
  '帮对方做一件今晚的家务',
  '给对方画一幅简笔画肖像',
  '用左手喂对方吃一口零食',
  '对着窗外大喊一声「我最爱XX」',
  '给对方发一条20字以上的肉麻短信',
  '猜拳输给对方后再来一轮，连输两轮做10个深蹲',
  '说出对方身上你最喜欢的3个地方',
  '给对方拍一张最满意的照片并设为聊天背景',
  '讲一个冷笑话，对方笑了就再来一个',
  '用3种不同的声音说「我爱你」',
  '让对方在你手心写一个字并猜出来',
  '闭眼被对方喂一口东西并猜是什么',
  '给对方起3个可爱的外号并当场叫一次',
  '陪对方看他/她最爱的剧一集不许玩手机',
  '给对方唱两句对方手机铃声同款旋律',
  '用最温柔的语气念一段说明书',
  '扶着墙倒立或者平板支撑30秒',
  '复述对方最近一次生气的原因并道歉',
  '给对方做10秒肩部按摩',
  '学对方走路的样子走5步',
  '把「对方名字+我爱你」发到自己朋友圈（10分钟后可删）',
  '让对方在你脸上画一笔（可擦）',
  '和对方十指相扣唱完一句歌',
  '两人额头贴额头坚持20秒',
  '给对方许一个明天就能兑现的小承诺',
  '深情朗读对方最近一条朋友圈',
  '给对方剥一个橘子或切一块水果',
  '连续说5句押韵的土味情话',
  '被对方点额头一下并说「我错了」',
  '用膝盖学企鹅走路绕房间一圈',
  '给对方讲你们之间最尴尬的一件事',
]

/** 刮刮乐奖池：100 种结果，中奖概率由抽取逻辑控制为约 80% */
const scratchDay = (time: string): string => {
  const date = new Date(time)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const SCRATCH_PRIZES: string[] = [
  '亲吻一个', '拥抱一分钟', '一起看一集想看的剧', '一杯奶茶兑换券', '按摩肩膀五分钟',
  '今晚家务对方全包', '许一个对方必须答应的小愿望', '一个爱心早餐', '晚安吻一个', '看电影选片权一次',
  '抱抱举高高十秒', '对方夸你三句', '财政小金库加 10 元', '免吵小金牌一次', '一起散步半小时',
  '对方亲手做一道菜', '一起吃一顿火锅', '获得今日零食优先选择权', '对方给你捶背十分钟', '一起拍一张合照',
  '一杯咖啡兑换券', '周末睡懒觉一次', '对方帮你整理桌面', '一起听完一张专辑', '获得一个专属昵称',
  '对方讲一个冷笑话', '一起做一次甜点', '晚餐由你决定', '对方为你写一句情话', '一起看一部老电影',
  '获得一次摸头奖励', '对方帮你吹头发', '一起散步看晚霞', '一份秘密小礼物', '对方替你跑腿一次',
  '一起吃一份甜品', '获得一次撒娇特权', '对方给你一个惊喜拥抱', '一起玩桌游一小时', '一张手写便签',
  '对方为你拍九宫格', '一起逛一次超市', '获得一次选歌权', '对方为你泡一杯茶', '一起做拉伸运动',
  '获得一次优先被哄权', '对方陪你聊天半小时', '一起看一集综艺', '一份水果拼盘', '对方给你发一段语音情话',
  '一起完成一件小家务', '获得一次免洗碗券', '对方为你留一盏灯', '一起去附近走走', '一张电子表情包专属券',
  '对方为你准备早餐', '一起玩猜谜游戏', '获得一次被夸奖加倍', '对方给你一个额头吻', '一起整理相册',
  '获得一次晚安电话', '对方为你选一套穿搭', '一起尝试新饮料', '获得一次小脾气豁免', '对方给你讲睡前故事',
  '一起做十分钟冥想', '一份热腾腾的夜宵', '对方替你充一次水杯', '一起看一场直播', '获得一次拥抱续杯',
  '对方为你写三件优点', '一起做一次早餐', '获得一次先选座位权', '对方帮你按摩手腕', '一起玩成语接龙',
  '一份你喜欢的零食', '获得一次不被催促券', '对方为你拍一张认真工作的照片', '一起规划下一次约会', '对方为你唱一首歌',
  '一起吃一顿早餐', '获得一次菜单决定权', '对方替你收拾一次房间', '一起看旅行照片', '一份暖心饮品',
  '获得一次抱怨倾听券', '对方为你准备睡前水', '一起做一次手工', '获得一次小愿望加倍', '对方给你发一张可爱自拍',
  '一起看星星十分钟', '获得一次被宠爱宣言', '对方替你完成一次小任务', '一起吃一份冰淇淋', '对方说一句永远站你这边',
  '谢谢惠顾，再接再厉～', '谢谢惠顾，刮个寂寞～', '谢谢惠顾，下次一定～', '谢谢惠顾，甜蜜正在路上～', '谢谢惠顾，今日好运攒下啦～',
  '谢谢惠顾，差一点点～', '谢谢惠顾，抱歉没中奖～', '谢谢惠顾，留到明天吧～', '谢谢惠顾，空手也是一种浪漫～', '谢谢惠顾，下张会更甜～',
]

/**
 * 刮刮乐涂层：canvas 覆盖层，手指/鼠标刮开；刮开面积超过一半自动揭晓。
 * 纯前端渲染，仅涂层在本地；卡片与结果状态由父组件同步到数据库。
 */
function ScratchCover({ revealed, onReveal }: { revealed: boolean; onReveal: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const scratchingRef = useRef(false)
  const firedRef = useRef(false)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)
  const clearedRef = useRef(new Set<number>())

  /* 挂载时铺一层银色涂层 + 提示文字 */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#aeb8c6'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // 涂层上的细碎「刮痕纹理」小方块，更像真票
    ctx.fillStyle = '#98a4b4'
    for (let i = 0; i < 40; i += 1) {
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 6, 6)
    }
    ctx.fillStyle = '#5c6b80'
    ctx.font = 'bold 17px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('🎫 用手指刮开', canvas.width / 2, canvas.height / 2 + 6)
  }, [])

  /* 刮开面积 ≥ 55% 时回调揭晓（只触发一次） */
  const checkCleared = () => {
    if (firedRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const cols = 12
    const rows = 5
    const cell = new Set<number>()
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = Math.round(((c + 0.5) / cols) * canvas.width)
        const y = Math.round(((r + 0.5) / rows) * canvas.height)
        const data = ctx.getImageData(x, y, 1, 1).data
        if (data[3] < 128) cell.add(r * cols + c)
      }
    }
    clearedRef.current = cell
    if (cell.size >= Math.floor(cols * rows * 0.55)) {
      firedRef.current = true
      onReveal()
    }
  }

  const erase = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (firedRef.current || revealed) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height
    ctx.globalCompositeOperation = 'destination-out'
    // 从上一次位置到当前位置连一条粗线，快速滑动不断线
    const last = lastPosRef.current
    if (last && scratchingRef.current) {
      ctx.lineWidth = 44
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(x, y, 22, 0, Math.PI * 2)
    ctx.fill()
    lastPosRef.current = { x, y }
    checkCleared()
  }

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={128}
      className={`h-32 w-full touch-none select-none rounded-xl ${revealed ? 'hidden' : 'cursor-pointer'}`}
      onPointerDown={(event) => {
        scratchingRef.current = true
        lastPosRef.current = null
        event.currentTarget.setPointerCapture(event.pointerId)
        erase(event)
      }}
      onPointerMove={(event) => scratchingRef.current && erase(event)}
      onPointerUp={() => { scratchingRef.current = false; lastPosRef.current = null }}
      onPointerLeave={() => { scratchingRef.current = false; lastPosRef.current = null }}
    />
  )
}

/**
 * 点开一格的结算（纯函数）：经典扫雷的 0 格自动扩散属于同一次行动；
 * 踩雷不结束游戏，而是触发一条互动任务并记入日志；所有安全格点开即通关。
 */
function applyMinesOpen(
  state: CoupleMinesState,
  player: 0 | 1,
  index: number,
  names: [string, string]
): { state: CoupleMinesState; hitTask: string | null } {
  const mines = state.mines.length ? state.mines : generateMines(state.rows, state.cols, state.mineTotal, index)
  const cells = [...state.cells]
  const log: CoupleBoardLogItem[] = [...state.log]
  const hits: CoupleMinesHit[] = [...state.hits]
  const opened: number[] = []
  const withMines: CoupleMinesState = { ...state, mines }

  // 洪水扩散：安全格周围无雷时自动展开相邻格（标记格不会被自动展开）
  const open = (i: number) => {
    if (cells[i] !== MINES_CELL.closed) return
    cells[i] = MINES_CELL.opened
    opened.push(i)
    if (mines.includes(i)) return
    if (minesAroundOf(withMines, i) === 0) {
      const r = Math.floor(i / state.cols)
      const c = i % state.cols
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const nr = r + dr
          const nc = c + dc
          if ((dr !== 0 || dc !== 0) && nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) open(nr * state.cols + nc)
        }
      }
    }
  }
  open(index)

  const at = new Date().toISOString()
  let hitTask: string | null = null
  if (mines.includes(index)) {
    // 扫雷专属惩罚任务池 + 本局去重：已触发过的任务放到最后，尽量不重复
    const used = new Set(hits.map((h) => h.task))
    const pool = [...MINES_TASK_POOL, ...BOARD_CELL_POOL.filter((cell) => cell.kind === 'task').map((cell) => cell.text)]
    const fresh = pool.filter((text) => !used.has(text))
    const candidates = fresh.length ? fresh : pool
    hitTask = candidates[Math.floor(Math.random() * candidates.length)]
    hits.push({ player, index, task: hitTask, at })
    log.push({ at, text: `💣${names[player]}踩到地雷！触发任务：${hitTask}` })
  } else {
    log.push({ at, text: `${names[player]}点开了 ${opened.length} 格（剩 ${cells.filter((c, i) => c === MINES_CELL.closed && !mines.includes(i)).length} 个安全格）` })
  }

  // 通关判定：所有非地雷格子全部点开
  const cleared = cells.every((c, i) => c === MINES_CELL.opened || mines.includes(i))
  let reward = state.reward
  if (cleared && !state.cleared) {
    reward = MINES_REWARDS[Math.floor(Math.random() * MINES_REWARDS.length)]
    log.push({ at, text: `🎉全部安全格已点开，通关成功！解锁奖励：${reward}` })
  }

  return {
    state: { ...withMines, cells, log: log.slice(-30), hits, reward, cleared, turn: (1 - player) as 0 | 1 },
    hitTask,
  }
}

/**
 * 掷骰结算（纯函数）：返回下一份棋局快照和本次行动的消息（用于弹窗展示）；
 * 踩到大冒险格时返回抽到的题目，由调用方负责落库记录。
 */
function applyBoardRoll(
  state: CoupleBoardState,
  player: 0 | 1,
  dice: number,
  names: [string, string]
): { state: CoupleBoardState; darePrompt: string | null; messages: string[]; reroll: boolean } {
  const name = names[player]
  const log: CoupleBoardLogItem[] = [...state.log]
  const messages: string[] = []
  const push = (text: string) => {
    log.push({ at: new Date().toISOString(), text })
    messages.push(text)
  }
  const positions: [number, number] = [...state.positions]
  const paused: [number, number] = [...state.paused]
  const penalty: [boolean, boolean] = [...(state.penalty ?? [false, false])]
  let winner: 0 | 1 | null = state.winner
  let pending = state.pending
  let turn: 0 | 1 = state.turn
  let darePrompt: string | null = null

  if (paused[player] > 0) {
    paused[player] -= 1
    push(`⏸${name}本回合被暂停，跳过行动`)
    return {
      state: { ...state, positions, paused, penalty, log: log.slice(-20), dice: null, turn: (1 - player) as 0 | 1, winner, pending },
      darePrompt: null,
      messages,
      reroll: false,
    }
  }

  const pos = Math.min(state.size - 1, positions[player] + dice)
  positions[player] = pos
  push(`🎲${name}掷出 ${dice} 点，前进到第 ${pos + 1} 格`)

  const cell = state.cells[pos]
  if (cell && pos !== 0 && pos !== state.size - 1) {
    switch (cell.kind) {
      case 'task':
        push(`🎯任务：${cell.text}`)
        break
      case 'truth': {
        const prompt = TRUTH_PROMPTS[Math.floor(Math.random() * TRUTH_PROMPTS.length)]
        pending = { type: 'truth', prompt, player }
        push(`💬真心话：「${prompt}」等${name}作答`)
        break
      }
      case 'dare': {
        darePrompt = DARES[Math.floor(Math.random() * DARES.length)]
        push(`🔥大冒险：${darePrompt}`)
        break
      }
      case 'forward': {
        const to = Math.min(state.size - 1, pos + (cell.value ?? 1))
        positions[player] = to
        push(`🚀${cell.text}，前进到第 ${to + 1} 格`)
        break
      }
      case 'back': {
        const to = Math.max(0, pos - (cell.value ?? 1))
        positions[player] = to
        push(`🌀${cell.text}，退到第 ${to + 1} 格`)
        break
      }
      case 'pause':
        paused[player] += 1
        push(`⏸${cell.text}，下回合暂停一次`)
        break
      case 'reroll':
        push(`🎲${cell.text}，继续由${name}掷骰`)
        break
      case 'goal':
        positions[player] = state.size - 1
        push(`🏁${cell.text}，直接冲线！`)
        break
      case 'penalty':
        penalty[player] = true
        push(`⛓️惩罚：${cell.text}（踩到🔓解锁格才能解除）`)
        break
      case 'bonus':
        push(`🎁福利：${cell.text}`)
        break
      case 'release': {
        const to = Math.min(state.size - 1, pos + (cell.value ?? 2))
        positions[player] = to
        if (penalty[player]) {
          penalty[player] = false
          push(`🔓${cell.text}，惩罚已解除，前进到第 ${to + 1} 格`)
        } else {
          push(`🔓${cell.text}（当前没有惩罚），前进到第 ${to + 1} 格`)
        }
        break
      }
    }
  }

  if (positions[player] >= state.size - 1) {
    winner = player
    push(`🎉${name}到达终点，获得胜利！`)
  } else if (cell?.kind !== 'reroll') {
    turn = (1 - player) as 0 | 1
  }

  return {
    state: { ...state, positions, paused, penalty, log: log.slice(-20), dice, turn, winner, pending },
    darePrompt,
    messages,
    reroll: cell?.kind === 'reroll' && positions[player] < state.size - 1,
  }
}

function readCache<T>(cacheKey: string, fallback: T): T {
  try {
    // 私密互动内容只保留在当前标签页会话，避免长期驻留共享设备的 localStorage
    return JSON.parse(sessionStorage.getItem(cacheKey) ?? '') as T
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
  const [searchParams, setSearchParams] = useSearchParams()
  const noticeQuizId = searchParams.get('quiz')
  const { memberId, memberName, isAdmin } = useSession()
  const { isEnabled } = useModuleFlags()
  const { friends } = useFriends()
  // 选「另一个」成员作对方：排除自己，避免管理员切到某成员视角时 friendId 取到自己（自己配自己 → 数据为空）
  const selectedFriend = friends.find((f) => f.memberId !== '__admin__' && f.memberId !== memberId)
  const friendId = selectedFriend?.memberId ?? null
  const friendName = selectedFriend?.shownName ?? '好友'
  const myId = memberId || '__me__'
  const ready = Boolean(memberId && friendId)
  const peerOnline = useIsPeerOnline(friendId, memberId)

  useEffect(() => {
    if (!memberId) return
    markActive(memberId)
    const timer = window.setInterval(() => markActive(memberId), 30_000)
    return () => window.clearInterval(timer)
  }, [memberId])

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
          sessionStorage.setItem(key('draw-closed', memberId, friendId), JSON.stringify([...ids].slice(-20)))
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
  const [managedQuestions, setManagedQuestions] = useState<Question[] | null>(managedQuestionsCache)
  /* 深度版题目是否来自服务端题库表（0027 迁移入库），影响 pair 题目配置的过滤口径 */
  const [deepFromBank, setDeepFromBank] = useState(false)
  const [pairQuestionIds, setPairQuestionIds] = useState<string[] | null>(null)
  const [pairQuestionsLoaded, setPairQuestionsLoaded] = useState(false)
  const [usedQuestionIds, setUsedQuestionIds] = useState<Set<string>>(new Set())
  const [quiz, setQuiz] = useState<QuizView>({ question: null, myChoice: null, peerChoice: null, revealed: false })
  const [choiceMode, setChoiceMode] = useState<ChoiceMode>('preset')
  const [customAnswer, setCustomAnswer] = useState('')
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
  const [activeModule, setActiveModule] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('couple-active-module')
    } catch {
      return null
    }
  })
  /* ------------------------------ 真心话大冒险 ------------------------------ */
  const [truthDraw, setTruthDraw] = useState<{ type: 'truth' | 'dare'; prompt: string } | null>(null)
  const [truthAnswer, setTruthAnswer] = useState('')
  const [truthSubmitting, setTruthSubmitting] = useState(false)
  const [truthHistory, setTruthHistory] = useState<CoupleTruthDareRow[]>([])
  const [truthPromptBank, setTruthPromptBank] = useState<CoupleTruthPromptRow[]>([])
  const [truthPromptText, setTruthPromptText] = useState('')
  const [truthPromptSaving, setTruthPromptSaving] = useState(false)
  /* 大冒险自定义题库：结构与抽取规则同真心话题库 */
  const [darePromptBank, setDarePromptBank] = useState<CoupleDarePromptRow[]>([])
  const [darePromptText, setDarePromptText] = useState('')
  const [darePromptSaving, setDarePromptSaving] = useState(false)
  /* 题库管理面板当前维护的题库类型 */
  const [bankKind, setBankKind] = useState<'truth' | 'dare'>('truth')

  /* ------------------------------ 联网飞行棋 ------------------------------ */
  const [boardGame, setBoardGame] = useState<CoupleBoardGameRow | null>(null)
  const [boardLoaded, setBoardLoaded] = useState(false)
  const [boardSaving, setBoardSaving] = useState(false)
  const [boardSetup, setBoardSetup] = useState(false)
  const [boardSize, setBoardSize] = useState(30)
  /* 棋盘格数是否用自定义数值（10～100） */
  const [boardSizeCustom, setBoardSizeCustom] = useState(false)
  const [boardStepMin, setBoardStepMin] = useState(1)
  const [boardStepMax, setBoardStepMax] = useState(6)
  /* 每次步数是否用自定义数值（1～20）：自定义时从输入框取值，开局时做范围与大小校验 */
  const [boardStepMinCustom, setBoardStepMinCustom] = useState(false)
  const [boardStepMaxCustom, setBoardStepMaxCustom] = useState(false)
  const [boardStepMinCustomValue, setBoardStepMinCustomValue] = useState('')
  const [boardStepMaxCustomValue, setBoardStepMaxCustomValue] = useState('')
  const [boardTruthAnswer, setBoardTruthAnswer] = useState('')
  /* 自定义格子内容池（每行一条，私密内容由你们自己添加，按互动对象本地保存） */
  const [boardCustomText, setBoardCustomText] = useState('')
  /* 骰子滚动动画 + 掷骰结果弹窗（走几步 / 暂停 / 重摇） */
  const [diceRolling, setDiceRolling] = useState(false)
  const [diceFace, setDiceFace] = useState(1)
  const [diceResult, setDiceResult] = useState<{ dice: number | null; player: 0 | 1; messages: string[]; reroll: boolean } | null>(null)
  /* 对局历史：每局的过程日志与结果都可回看 */
  const [boardHistory, setBoardHistory] = useState<CoupleBoardGameHistoryRow[]>([])
  const [boardHistoryOpenId, setBoardHistoryOpenId] = useState<string | null>(null)
  /* 对局动态/详情日志分页：滚动容器在苹果设备上划不动，改用翻页 */
  const [boardLogPage, setBoardLogPage] = useState(0)
  const [boardDetailLogPage, setBoardDetailLogPage] = useState(0)
  /* 扫雷对局历史：每局通关的棋盘、踩雷任务与奖励都可回看 */
  const [minesHistory, setMinesHistory] = useState<CoupleMinesHistoryRow[]>([])
  const [minesHistoryOpenId, setMinesHistoryOpenId] = useState<string | null>(null)
  const [minesLogPage, setMinesLogPage] = useState(0)
  const [minesDetailLogPage, setMinesDetailLogPage] = useState(0)

  /* ------------------------------ 联网摆方（五福棋） ------------------------------ */
  const [wufuGame, setWufuGame] = useState<CoupleWufuRow | null>(null)
  const [wufuLoaded, setWufuLoaded] = useState(false)
  const [wufuSaving, setWufuSaving] = useState(false)
  /* 走子阶段已选中的己方棋子（点击相邻空点走子；再点一次取消） */
  const [wufuSelected, setWufuSelected] = useState<number | null>(null)
  /* 成项棋形刚形成时的闪烁高亮（cells + key，1.8 秒后自动消退） */
  const [wufuFlash, setWufuFlash] = useState<{ cells: number[]; key: number } | null>(null)
  /* 摆方对局历史：一局结束（正常分出胜负 / 投降认输）时存档，供回看 */
  const [wufuHistory, setWufuHistory] = useState<CoupleWufuHistoryRow[]>([])
  const [wufuHistoryOpenId, setWufuHistoryOpenId] = useState<string | null>(null)
  /* 摆方的「对局动态」与历史详情日志分页（同一时刻只展开一条历史） */
  const [wufuLogPage, setWufuLogPage] = useState(0)
  const [wufuDetailLogPage, setWufuDetailLogPage] = useState(0)

  /* ------------------------------ 联网五子棋 ------------------------------ */
  const [gomokuGame, setGomokuGame] = useState<CoupleGomokuRow | null>(null)
  const [gomokuLoaded, setGomokuLoaded] = useState(false)
  const [gomokuSaving, setGomokuSaving] = useState(false)
  const [gomokuHistory, setGomokuHistory] = useState<CoupleGomokuHistoryRow[]>([])
  const [gomokuHistoryOpenId, setGomokuHistoryOpenId] = useState<string | null>(null)
  const [gomokuLogPage, setGomokuLogPage] = useState(0)

  /* ------------------------------ 情侣西瓜分 ------------------------------ */
  const [watermelonScore, setWatermelonScore] = useState<CoupleWatermelonScoreRow | null>(null)
  const [watermelonLogs, setWatermelonLogs] = useState<CoupleWatermelonLogRow[]>([])
  const [watermelonLoading, setWatermelonLoading] = useState(false)
  const [watermelonSaving, setWatermelonSaving] = useState(false)
  const [watermelonDelta, setWatermelonDelta] = useState(0)
  const [watermelonCustomValue, setWatermelonCustomValue] = useState('')
  const [watermelonReason, setWatermelonReason] = useState('')

  /* ------------------------------ 骰子比大小 ------------------------------ */
  const [diceGame, setDiceGame] = useState<CoupleDiceRow | null>(null)
  const [diceLoaded, setDiceLoaded] = useState(false)
  const [diceSaving, setDiceSaving] = useState(false)
  const [diceHistory, setDiceHistory] = useState<CoupleDiceHistoryRow[]>([])
  const [myDiceBet, setMyDiceBet] = useState<DiceBetChoice>(null)

  /* 重要日倒计时 & 刮刮乐 */
  const [countdownGame, setCountdownGame] = useState<CoupleCountdownRow | null>(null)
  const [countdownLoaded, setCountdownLoaded] = useState(false)
  const [countdownSaving, setCountdownSaving] = useState(false)
  const [countdownTitle, setCountdownTitle] = useState('')
  const [countdownDate, setCountdownDate] = useState('')
  const [countdownEmoji, setCountdownEmoji] = useState('')

  const [scratchGame, setScratchGame] = useState<CoupleScratchRow | null>(null)
  const [scratchLoaded, setScratchLoaded] = useState(false)
  const [scratchSaving, setScratchSaving] = useState(false)

  /* ------------------------------ 备婚流程 ------------------------------ */
  const [weddingRow, setWeddingRow] = useState<CoupleWeddingRow | null>(null)
  const [weddingLoaded, setWeddingLoaded] = useState(false)
  const [weddingSaving, setWeddingSaving] = useState(false)
  /** 步骤条视图：跟着当前步骤看 / 全部步骤总览 */
  const [weddingView, setWeddingView] = useState<'stepper' | 'overview'>('stepper')
  /** 步骤条里被展开的步骤 id；null 表示只展开当前那一步 */
  const [weddingOpenStep, setWeddingOpenStep] = useState<string | null>(null)

  /* 备婚流程派生值：步骤是内置模板，云上只存「哪几步完成」和「哪几条待办勾好了」 */
  const weddingDone = weddingRow?.state.done ?? EMPTY_WEDDING_DONE
  const weddingChecked = weddingRow?.state.checked ?? EMPTY_WEDDING_CHECKED
  const weddingDoneCount = weddingDone.length
  const weddingAllDone = weddingDoneCount >= WEDDING_TOTAL
  /** 当前步骤 = 第一个还没完成的；全部完成时停在最后一步 */
  const weddingCurrentIndex = useMemo(() => {
    const index = WEDDING_STEPS.findIndex((step) => !weddingDone.includes(step.id))
    return index < 0 ? WEDDING_STEPS.length - 1 : index
  }, [weddingDone])
  const weddingCurrentStep = WEDDING_STEPS[weddingCurrentIndex]
  /** 每步待办勾了几条，总览里显示「待办 x/y」 */
  const weddingItemStats = useMemo(
    () =>
      WEDDING_STEPS.map((step) => {
        const total = step.todo.length + step.prepare.length
        let ticked = 0
        for (let i = 0; i < step.todo.length; i += 1) if (weddingChecked[weddingItemKey(step.id, 'todo', i)]) ticked += 1
        for (let i = 0; i < step.prepare.length; i += 1) if (weddingChecked[weddingItemKey(step.id, 'prepare', i)]) ticked += 1
        return { total, ticked }
      }),
    [weddingChecked]
  )

  const saveWeddingState = useCallback(
    async (next: CoupleWeddingState) => {
      if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
      setWeddingSaving(true)
      try {
        await upsertCoupleWedding(memberId, friendId, next)
        const [a, b] = orderedPair(memberId, friendId)
        setWeddingRow({ member_a: a, member_b: b, state: next, updated_at: new Date().toISOString() })
      } catch (error) {
        toast.show((error as Error).message, 'err')
      } finally {
        setWeddingSaving(false)
      }
    },
    [memberId, friendId, toast]
  )

  /** 完成 / 撤回某一步。完成后收起手动展开，让步骤条自动跟着走到下一步 */
  const toggleWeddingStep = useCallback(
    async (stepId: string) => {
      const wasDone = weddingDone.includes(stepId)
      const done = wasDone ? weddingDone.filter((id) => id !== stepId) : [...weddingDone, stepId]
      if (!wasDone) setWeddingOpenStep(null)
      await saveWeddingState({ done, checked: weddingChecked })
    },
    [weddingDone, weddingChecked, saveWeddingState]
  )

  const toggleWeddingItem = useCallback(
    async (key: string) => {
      const checked = { ...weddingChecked }
      if (checked[key]) delete checked[key]
      else checked[key] = true
      await saveWeddingState({ done: weddingDone, checked })
    },
    [weddingDone, weddingChecked, saveWeddingState]
  )

  /** 点步骤：展开 / 收起；收起时回到「跟着当前步骤」 */
  const toggleWeddingOpen = useCallback((stepId: string, isOpen: boolean, isCurrent: boolean) => {
    setWeddingOpenStep(isOpen && !isCurrent ? null : stepId)
  }, [])

  /* ------------------------------ 联网扫雷 ------------------------------ */
  const [minesGame, setMinesGame] = useState<CoupleMinesRow | null>(null)
  const [minesLoaded, setMinesLoaded] = useState(false)
  const [minesSaving, setMinesSaving] = useState(false)
  const [minesPresetKey, setMinesPresetKey] = useState('m')
  /* 自定义扫雷尺寸：行 / 列 / 雷数（生成棋盘时会按范围收敛） */
  const [minesCustomRows, setMinesCustomRows] = useState(9)
  const [minesCustomCols, setMinesCustomCols] = useState(9)
  const [minesCustomMines, setMinesCustomMines] = useState(12)
  /* 当前点击模式：open 打开格子 / flag 标记疑似地雷（标记不消耗回合） */
  const [minesMode, setMinesMode] = useState<'open' | 'flag'>('open')
  /* 踩雷任务弹层 / 通关奖励弹层 */
  const [minesTask, setMinesTask] = useState<string | null>(null)
  const [minesReward, setMinesReward] = useState<string | null>(null)
  const [minesFlashingCells, setMinesFlashingCells] = useState<Set<number>>(new Set())
  const [truthHistoryPage, setTruthHistoryPage] = useState(0)
  const [boardHistoryPage, setBoardHistoryPage] = useState(0)
  const [minesHistoryPage, setMinesHistoryPage] = useState(0)
  const [wufuHistoryPage, setWufuHistoryPage] = useState(0)
  const [gomokuHistoryPage, setGomokuHistoryPage] = useState(0)
  const [watermelonHistoryPage, setWatermelonHistoryPage] = useState(0)
  const [diceHistoryPage, setDiceHistoryPage] = useState(0)
  const [scratchHistoryPage, setScratchHistoryPage] = useState(0)
  const [messageHistoryPage, setMessageHistoryPage] = useState(0)

  /* 同步抉择总进度：总题库 = 题库全部题目（含轻松版/走心版）+ 双方自定义题；
     已做 = 历史记录里做过的题（进行中、还没双方答完的那道不计入，保证两边数字一致） */
  const quizTotalQuestions = useMemo(
    () => [...(managedQuestions ?? ALL_QUESTIONS), ...customQuestions],
    [managedQuestions, customQuestions]
  )
  /* 自定义题在「被出到」之前不公开：新加的题不计入「已出过」的数量，
     等这道题真的被出到、双方都看到题面了才算数（抽题本身不受影响）。 */
  const customRevealedCount = useMemo(
    () => customQuestions.filter((question) => usedQuestionIds.has(question.id)).length,
    [customQuestions, usedQuestionIds]
  )
  const activeUnrevealedQuizId = quiz.question && !quiz.revealed ? quiz.question.id : null
  const quizDoneCount = useMemo(
    () => quizTotalQuestions.filter((question) => usedQuestionIds.has(question.id) && question.id !== activeUnrevealedQuizId).length,
    [quizTotalQuestions, usedQuestionIds, activeUnrevealedQuizId]
  )
  /* 真心话可抽题库 = 固定题库 + 「对方出的」自定义题。
     自己出的题只能由对方抽到，所以不计入我自己的可抽题库。 */
  const peerTruthPrompts = useMemo(
    () => truthPromptBank.filter((row) => row.created_by !== memberId).map((row) => row.prompt),
    [truthPromptBank, memberId]
  )
  const truthPromptPool = useMemo(
    () => [...new Set([...TRUTH_PROMPTS, ...peerTruthPrompts])],
    [peerTruthPrompts]
  )
  /* 大冒险同理：自己出的题不给自抽，对方出的题优先抽 */
  const peerDarePrompts = useMemo(
    () => darePromptBank.filter((row) => row.created_by !== memberId).map((row) => row.prompt),
    [darePromptBank, memberId]
  )
  /* 已答过的题：情侣对共享，任一方答过就不再重复出现 */
  const usedTruthPrompts = useMemo(() => new Set(truthHistory.map((row) => row.prompt)), [truthHistory])
  const truthDoneCount = useMemo(
    () => truthPromptPool.filter((prompt) => usedTruthPrompts.has(prompt)).length,
    [usedTruthPrompts, truthPromptPool]
  )
  const loveMessage = LOVE_MESSAGES[dayNumber() % LOVE_MESSAGES.length]
  const mealDone = (list: Meal[]) => REQUIRED_SLOTS.filter((s) => list.some((m) => m.slot === s)).length
  const loveUnlocked = Boolean(friendId) && mealDone(myMeals) === 3 && mealDone(peerMeals) === 3
  const loveSeenKey = memberId && friendId ? key('love-seen', memberId, friendId) : ''

  /* ------------------------------ 揭晓动画 ------------------------------ */
  const [loveReveal, setLoveReveal] = useState(false)
  const [quizReveal, setQuizReveal] = useState(false)
  const [noticeQuiz, setNoticeQuiz] = useState<CoupleQuizHistoryRow | null>(null)
  const [noticeQuizLoading, setNoticeQuizLoading] = useState(false)
  const lovePrevRef = useRef<boolean | null>(null)

  /* 催对方打卡：我已打完三餐、对方还没打完时可发一条铃铛提醒，60 秒内只催一次 */
  const [mealNudgeCooldown, setMealNudgeCooldown] = useState(false)
  const nudgePeerMeals = async () => {
    if (!friendId || mealNudgeCooldown) return
    try {
      await notifyCoupleMealNudge(friendId, memberName || '我')
      toast.show(`已经催 ${friendName} 去打卡啦 💬`)
      setMealNudgeCooldown(true)
      window.setTimeout(() => setMealNudgeCooldown(false), 60_000)
    } catch {
      toast.show('提醒发送失败，稍后再试试', 'err')
    }
  }

  // 双方三餐打卡齐的那一刻同时揭晓：本方打完最后一餐、或对方实时打完，解锁从 false 变 true 时播放；
  // 同时给两人的铃铛各落一条「情话已解锁」提醒（每天每人只发一次，避免重复打扰）
  useEffect(() => {
    const prev = lovePrevRef.current
    lovePrevRef.current = loveUnlocked
    if (prev !== null && loveUnlocked && !prev && loveSeenKey && readCache<string | null>(loveSeenKey, null) !== todayStr()) {
      setLoveReveal(true)
      if (memberId && friendId) {
        void notifyLoveUnlocked([memberId, friendId], memberName || '我', todayStr())
      }
    }
  }, [loveUnlocked, loveSeenKey, memberId, friendId, memberName])

  // 彩带粒子参数固定在一次会话内，避免每次渲染跳动
  const confettiBits = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        emoji: ['💖', '✨', '🌸', '🎉', '💝', '💕'][i % 6],
        left: `${4 + Math.random() * 90}%`,
        delay: `${(Math.random() * 1.4).toFixed(2)}s`,
        duration: `${(2.2 + Math.random() * 1.8).toFixed(2)}s`,
        size: `${Math.round(16 + Math.random() * 16)}px`,
      })),
    []
  )

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
        // 聊天内容只在当前标签页存最近 100 条；标签页关闭或退出登录即清除
        sessionStorage.setItem(cacheKey, JSON.stringify(next.slice(-100)))
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
        // 心愿正文是私密内容，只保留到当前标签页会话结束
        sessionStorage.setItem(cacheKey, JSON.stringify(next.slice(-300)))
      } catch {
        // 存储失败不影响展示
      }
      return next
    })
  }, [])

  /* ------------------------------ 远端加载 ------------------------------ */

  const reloadTruthHistory = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      const [history, prompts, darePrompts] = await Promise.all([
        listCoupleTruthDare(memberId, friendId, 100),
        listCoupleTruthPromptBank(memberId, friendId),
        listCoupleDarePromptBank(memberId, friendId),
      ])
      setTruthHistory(history)
      setTruthPromptBank(prompts)
      setDarePromptBank(darePrompts)
    } catch (error) {
      console.warn('加载真心话记录失败', error)
    }
  }, [memberId, friendId])

  /*
   * 入口卡片计数：只问「有多少条」，不下载心愿 / 留言 / 答题 / 真心话的正文。
   * 之前停在入口页也要把四张表的内容拉回来只为拼卡片上的数字，是最大的一块无用流量。
   */
  const [gridCounts, setGridCounts] = useState({ wishes: 0, messages: 0, quizDone: 0, truthDone: 0 })
  const reloadGridCounts = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      const [wishes, messages, quizDone, truthPrompts] = await Promise.all([
        countCoupleWishes(memberId, friendId),
        countCoupleMessages(memberId, friendId),
        countCoupleQuizHistory(memberId, friendId),
        listCoupleTruthPrompts(memberId, friendId),
      ])
      setGridCounts({ wishes, messages, quizDone, truthDone: truthPrompts.length })
    } catch (error) {
      console.warn('加载入口计数失败', error)
    }
  }, [memberId, friendId])

  /** 应用远端棋局：null 表示本局已被对方销毁；确认属于当前这一对情侣再展示 */
  const applyBoardRow = useCallback(
    (row: CoupleBoardGameRow | null) => {
      if (!row) {
        setBoardGame(null)
        return
      }
      if (!memberId || !friendId) return
      const [a, b] = orderedPair(memberId, friendId)
      if (row.member_a !== a || row.member_b !== b) return
      setBoardGame(row)
    },
    [memberId, friendId]
  )

  const reloadBoard = useCallback(
    async (force = false) => {
      if (!memberId || !friendId) return
      const k = key('board', memberId, friendId)
      const cached = !force ? readCache<CoupleBoardGameRow | null>(k, null) : null
      if (cached) {
        applyBoardRow(cached)
        setBoardLoaded(true)
        return
      }
      try {
        applyBoardRow(await fetchCoupleBoardGame(memberId, friendId))
      } catch (error) {
        console.warn('加载飞行棋棋局失败', error)
      } finally {
        setBoardLoaded(true)
      }
    },
    [memberId, friendId, applyBoardRow]
  )

  const reloadBoardHistory = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      setBoardHistory(await listCoupleBoardGameHistory(memberId, friendId, 20))
    } catch (error) {
      console.warn('加载飞行棋对局历史失败', error)
    }
  }, [memberId, friendId])

  const reloadMinesHistory = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      setMinesHistory(await listCoupleMinesHistory(memberId, friendId, 20))
    } catch (error) {
      console.warn('加载情侣扫雷对局历史失败', error)
    }
  }, [memberId, friendId])

  /** 应用远端扫雷棋局：null 表示本局已被对方销毁 */
  const applyMinesRow = useCallback(
    (row: CoupleMinesRow | null) => {
      if (!row) {
        setMinesGame(null)
        return
      }
      if (!memberId || !friendId) return
      const [a, b] = orderedPair(memberId, friendId)
      if (row.member_a !== a || row.member_b !== b) return
      setMinesGame((current) => {
        // realtime 可能晚于本地写入到达：旧快照不能覆盖刚写入的旗子或对方动作。
        if (current && new Date(row.updated_at).getTime() < new Date(current.updated_at).getTime()) return current
        return row
      })
    },
    [memberId, friendId]
  )

  const reloadMines = useCallback(
    async (force = false) => {
      if (!memberId || !friendId) return
      const k = key('mines', memberId, friendId)
      const cached = !force ? readCache<CoupleMinesRow | null>(k, null) : null
      if (cached) {
        applyMinesRow(cached)
        setMinesLoaded(true)
        return
      }
      try {
        applyMinesRow(await fetchCoupleMines(memberId, friendId))
      } catch (error) {
        console.warn('加载情侣扫雷棋局失败', error)
      } finally {
        setMinesLoaded(true)
      }
    },
    [memberId, friendId, applyMinesRow]
  )

  /** 应用远端摆方棋局：null 表示本局已被对方销毁 */
  const applyWufuRow = useCallback(
    (row: CoupleWufuRow | null) => {
      if (!row) {
        setWufuGame(null)
        return
      }
      if (!memberId || !friendId) return
      const [a, b] = orderedPair(memberId, friendId)
      if (row.member_a !== a || row.member_b !== b) return
      setWufuGame(row)
    },
    [memberId, friendId]
  )

  const reloadWufu = useCallback(
    async (force = false) => {
      if (!memberId || !friendId) return
      const k = key('wufu', memberId, friendId)
      const cached = !force ? readCache<CoupleWufuRow | null>(k, null) : null
      if (cached) {
        applyWufuRow(cached)
        setWufuLoaded(true)
        return
      }
      try {
        applyWufuRow(await fetchCoupleWufu(memberId, friendId))
      } catch (error) {
        console.warn('加载摆方棋局失败', error)
      } finally {
        setWufuLoaded(true)
      }
    },
    [memberId, friendId, applyWufuRow]
  )

  const reloadWufuHistory = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      setWufuHistory(await listCoupleWufuHistory(memberId, friendId, 20))
    } catch (error) {
      console.warn('加载摆方对局历史失败', error)
    }
  }, [memberId, friendId])

  const applyGomokuRow = useCallback((row: CoupleGomokuRow | null) => {
    if (!row) {
      setGomokuGame(null)
      return
    }
    if (!memberId || !friendId) return
    const [a, b] = orderedPair(memberId, friendId)
    if (row.member_a === a && row.member_b === b) setGomokuGame(row)
  }, [memberId, friendId])

  const reloadGomoku = useCallback(async (force = false) => {
    if (!memberId || !friendId) return
    if (!force && gomokuLoaded) return
    try {
      applyGomokuRow(await fetchCoupleGomoku(memberId, friendId))
    } catch (error) {
      console.warn('加载五子棋棋局失败', error)
    } finally {
      setGomokuLoaded(true)
    }
  }, [memberId, friendId, applyGomokuRow, gomokuLoaded])

  const reloadGomokuHistory = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      setGomokuHistory(await listCoupleGomokuHistory(memberId, friendId, 20))
    } catch (error) {
      console.warn('加载五子棋历史失败', error)
    }
  }, [memberId, friendId])

  const reloadWatermelon = useCallback(async (force = false) => {
    if (!memberId || !friendId) return
    if (!force && !watermelonLoading && watermelonScore) return
    setWatermelonLoading(true)
    try {
      setWatermelonScore(await fetchCoupleWatermelon(memberId, friendId))
    } catch (error) {
      console.warn('加载西瓜分失败', error)
    } finally {
      setWatermelonLoading(false)
    }
  }, [memberId, friendId, watermelonLoading, watermelonScore])

  const reloadWatermelonLogs = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      setWatermelonLogs(await listCoupleWatermelonLogs(memberId, friendId, 500))
    } catch (error) {
      console.warn('加载西瓜分明细失败', error)
    }
  }, [memberId, friendId])

  const applyDiceRow = useCallback(
    (row: CoupleDiceRow | null) => {
      if (!row) {
        setDiceGame(null)
        return
      }
      if (!memberId || !friendId) return
      const [a, b] = orderedPair(memberId, friendId)
      if (row.member_a === a && row.member_b === b) {
        setDiceGame(row)
        const myIndex = memberId === row.member_a ? 0 : 1
        setMyDiceBet(row.state.bets[myIndex])
      }
    },
    [memberId, friendId]
  )

  const reloadDice = useCallback(
    async (force = false) => {
      if (!memberId || !friendId) return
      if (!force && diceLoaded) return
      try {
        applyDiceRow(await fetchCoupleDice(memberId, friendId))
      } catch (error) {
        console.warn('加载骰子比大小失败', error)
      } finally {
        setDiceLoaded(true)
      }
    },
    [memberId, friendId, applyDiceRow, diceLoaded]
  )

  const reloadDiceHistory = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      setDiceHistory(await listCoupleDiceHistory(memberId, friendId, 20))
    } catch (error) {
      console.warn('加载骰子比大小历史失败', error)
    }
  }, [memberId, friendId])

  const reloadCountdown = useCallback(
    async (force = false) => {
      if (!memberId || !friendId) return
      if (!force && countdownLoaded) return
      try {
        const row = await fetchCoupleCountdown(memberId, friendId)
        if (!row) {
          setCountdownGame(null)
        } else {
          const [a, b] = orderedPair(memberId, friendId)
          if (row.member_a === a && row.member_b === b) setCountdownGame(row)
        }
      } catch (error) {
        console.warn('加载重要日倒计时失败', error)
      } finally {
        setCountdownLoaded(true)
      }
    },
    [memberId, friendId, countdownLoaded]
  )

  const reloadScratch = useCallback(
    async (force = false) => {
      if (!memberId || !friendId) return
      if (!force && scratchLoaded) return
      try {
        const row = await fetchCoupleScratch(memberId, friendId)
        if (!row) {
          setScratchGame(null)
        } else {
          const [a, b] = orderedPair(memberId, friendId)
          if (row.member_a === a && row.member_b === b) setScratchGame(row)
        }
      } catch (error) {
        console.warn('加载刮刮乐失败', error)
      } finally {
        setScratchLoaded(true)
      }
    },
    [memberId, friendId, scratchLoaded]
  )

  const reloadWedding = useCallback(
    async (force = false) => {
      if (!memberId || !friendId) return
      if (!force && weddingLoaded) return
      try {
        const row = await fetchCoupleWedding(memberId, friendId)
        if (!row) {
          setWeddingRow(null)
        } else {
          const [a, b] = orderedPair(memberId, friendId)
          if (row.member_a === a && row.member_b === b) setWeddingRow(row)
        }
      } catch (error) {
        console.warn('加载备婚流程失败', error)
      } finally {
        setWeddingLoaded(true)
      }
    },
    [memberId, friendId, weddingLoaded]
  )

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
      if (managedQuestions && q.kind !== '自定义' && !managedQuestions.some((question) => question.id === q.id)) {
        setManagedQuestions((previous) => {
          const next = [...(previous ?? []), q]
          managedQuestionsCache = next
          return next
        })
      }
      setQuestionKind(q.kind)
      const mine = row.member_a === memberId ? row.choice_a : row.choice_b
      const theirs = row.member_a === memberId ? row.choice_b : row.choice_a
      const nowRevealed = row.status === 'revealed'
      setQuiz({ question: q, myChoice: mine, peerChoice: theirs, revealed: nowRevealed })
      setChoiceMode(mine && mine !== q.a && mine !== q.b ? 'custom' : 'preset')
      setCustomAnswer(mine && mine !== q.a && mine !== q.b ? mine : '')
      if (!quizLoadedRef.current) {
        quizLoadedRef.current = true
      } else if (nowRevealed && !revealedRef.current) {
        setQuizReveal(true)
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

  /* 轮询兜底带 TTL 内存缓存：实时连通时由事件即时刷新，不走这里。
     普通数据放宽到 1 次/分钟；正在玩的回合制游戏改用短 TTL 强制拉取，
     避免 realtime 降级时「对方已行动，本端要等很久或手动刷新才看到」 */
  const FETCH_TTL = 60_000
  const fetchStamp: Record<string, number> = {}
  const throttled = (key: string, fn: () => void | Promise<void>, ttl = FETCH_TTL) => {
    const t = fetchStamp[key]
    if (t && Date.now() - t < ttl) return
    fetchStamp[key] = Date.now()
    void fn()
  }

  /* 轮询兜底：只刷新「当前正在看的模块」，其余模块等切过去再拉，省流量 */
  const activeModuleRef = useRef(activeModule)
  activeModuleRef.current = activeModule
  const pollActiveModule = useCallback(() => {
    const m = activeModuleRef.current
    if (m === 'wish') throttled('wishes', reloadWishes)
    else if (m === 'chat') throttled('messages', reloadMessages)
    else if (m === 'quiz') throttled('quiz', reloadQuiz)
    else if (m === 'truth') throttled('truth', reloadTruthHistory)
    else if (m === 'board') {
      // 回合制对局：强制刷新 + 短 TTL（服务端状态是权威的，覆盖本地不会丢操作）
      throttled('board', () => reloadBoard(true), 15_000)
      // 对局历史一并兜底刷新：实时推送偶发丢失时不至于「打完一局要手动刷新才看到」
      throttled('boardHistory', reloadBoardHistory)
    } else if (m === 'mines') {
      throttled('mines', () => reloadMines(true), 15_000)
      throttled('minesHistory', reloadMinesHistory)
    } else if (m === 'wufu') {
      throttled('wufu', () => reloadWufu(true), 15_000)
      throttled('wufuHistory', reloadWufuHistory)
    } else if (m === 'gomoku') {
      // 五子棋是快速回合制：对方落子必须尽快可见（realtime 降级时靠这里兜底），4 秒强制刷新
      throttled('gomoku', () => reloadGomoku(true), 4_000)
      throttled('gomokuHistory', reloadGomokuHistory)
    } else if (m === 'watermelon') {
      throttled('watermelon', reloadWatermelon)
      throttled('watermelonLogs', reloadWatermelonLogs)
    } else if (m === 'dice') {
      // 骰子是押注 → 开骰的强同步流程，对方押注必须尽快可见：4 秒强制刷新
      throttled('dice', () => reloadDice(true), 4_000)
      throttled('diceHistory', reloadDiceHistory)
    } else if (m === 'countdown') {
      throttled('countdown', () => reloadCountdown(true))
    } else if (m === 'scratch') {
      throttled('scratch', () => reloadScratch(true))
    } else if (m === 'wedding') {
      throttled('wedding', () => reloadWedding(true))
    } else if (m === 'love') throttled('meals', reloadMeals)
    // 停在入口页：只刷新卡片计数（4 个 count 请求，正文一概不下载）
    else throttled('gridCounts', reloadGridCounts)
  }, [reloadWishes, reloadMessages, reloadQuiz, reloadTruthHistory, reloadBoard, reloadBoardHistory, reloadMines, reloadMinesHistory, reloadWufu, reloadWufuHistory, reloadGomoku, reloadGomokuHistory, reloadWatermelon, reloadWatermelonLogs, reloadDice, reloadDiceHistory, reloadCountdown, reloadScratch, reloadWedding, reloadMeals, reloadGridCounts])

  /* 切到某个模块时立即拉一次；棋局类（飞行棋/扫雷/摆方）走各自动作里的缓存，
     只在本地还没有该模块数据时补拉一次，来回切 Tab 不再重复打网络 */
  useEffect(() => {
    if (!ready) return
    const m = activeModule
    if (!m) void reloadGridCounts() // 从模块退回入口页：刷新卡片上的计数
    else if (m === 'wish') void reloadWishes()
    else if (m === 'chat') void reloadMessages()
    else if (m === 'quiz') void reloadQuiz()
    else if (m === 'truth') void reloadTruthHistory()
    else if (m === 'board') {
      void reloadBoard(boardLoaded ? undefined : true)
      void reloadBoardHistory()
    } else if (m === 'mines') {
      void reloadMines(minesLoaded ? undefined : true)
      void reloadMinesHistory()
    } else if (m === 'wufu') {
      void reloadWufu(wufuLoaded ? undefined : true)
      void reloadWufuHistory()
    } else if (m === 'gomoku') {
      void reloadGomoku(gomokuLoaded ? undefined : true)
      void reloadGomokuHistory()
    } else if (m === 'watermelon') {
      void reloadWatermelon()
      void reloadWatermelonLogs()
    } else if (m === 'dice') {
      void reloadDice(diceLoaded ? undefined : true)
      void reloadDiceHistory()
    } else if (m === 'countdown') {
      void reloadCountdown(countdownLoaded ? undefined : true)
    } else if (m === 'scratch') {
      void reloadScratch(scratchLoaded ? undefined : true)
    } else if (m === 'wedding') {
      void reloadWedding(weddingLoaded ? undefined : true)
    } else if (m === 'love') void reloadMeals()
  }, [activeModule, ready, reloadWishes, reloadMessages, reloadQuiz, reloadTruthHistory, reloadBoard, reloadBoardHistory, reloadMines, reloadMinesHistory, reloadWufu, reloadWufuHistory, reloadGomoku, reloadGomokuHistory, reloadWatermelon, reloadWatermelonLogs, reloadDice, reloadDiceHistory, reloadCountdown, reloadScratch, reloadWedding, reloadMeals, boardLoaded, minesLoaded, wufuLoaded, gomokuLoaded, diceLoaded, countdownLoaded, scratchLoaded, weddingLoaded])

  useRealtime(
    channelKey,
    [
      { table: 'couple_wishes', on: () => void reloadWishes() },
      { table: 'couple_events', event: 'INSERT', on: (p) => onEventRow(p.new as CoupleEventRow) },
      { table: 'couple_quiz', on: (p) => applyQuizRow(p.new as CoupleQuizRow) },
      // 真心话大冒险：对方抽题 / 提交答案后，双方记录列表即时刷新
      { table: 'couple_truth_dare', event: 'INSERT', on: () => void reloadTruthHistory() },
      { table: 'couple_truth_prompts', event: 'INSERT', on: () => void reloadTruthHistory() },
      { table: 'couple_truth_prompts', event: 'DELETE', on: () => void reloadTruthHistory() },
      { table: 'couple_dare_prompts', event: 'INSERT', on: () => void reloadTruthHistory() },
      { table: 'couple_dare_prompts', event: 'DELETE', on: () => void reloadTruthHistory() },
      // 联网飞行棋：对方掷骰 / 暂停 / 继续后，棋局即时同步
      // （只订阅 INSERT / UPDATE；DELETE 事件不带行数据、无法区分是谁的棋局，交由轮询兜底同步）
      { table: 'couple_board_games', event: 'INSERT', on: (p) => applyBoardRow(p.new as CoupleBoardGameRow) },
      { table: 'couple_board_games', event: 'UPDATE', on: (p) => applyBoardRow(p.new as CoupleBoardGameRow) },
      // 情侣扫雷：对方点开 / 标记 / 通关时即时同步（DELETE 交由轮询兜底）
      { table: 'couple_mines', event: 'INSERT', on: (p) => applyMinesRow(p.new as CoupleMinesRow) },
      { table: 'couple_mines', event: 'UPDATE', on: (p) => applyMinesRow(p.new as CoupleMinesRow) },
      // 摆方五福棋：对方摆子 / 提子 / 逼子 / 走子时即时同步（DELETE 交由轮询兜底）
      { table: 'couple_wufu', event: 'INSERT', on: (p) => applyWufuRow(p.new as CoupleWufuRow) },
      {
        table: 'couple_wufu',
        event: 'UPDATE',
        on: (p) => {
          const row = p.new as CoupleWufuRow
          // 棋局暂停中不再同步（省流量），继续时由「继续游戏」按钮主动拉取
          if (row.state.paused) return
          applyWufuRow(row)
        },
      },
      { table: 'couple_wufu_history', event: 'INSERT', on: () => void reloadWufuHistory() },
      { table: 'couple_gomoku', event: 'INSERT', on: (p) => applyGomokuRow(p.new as CoupleGomokuRow) },
      { table: 'couple_gomoku', event: 'UPDATE', on: (p) => applyGomokuRow(p.new as CoupleGomokuRow) },
      { table: 'couple_gomoku_history', event: 'INSERT', on: () => void reloadGomokuHistory() },
      { table: 'couple_watermelon_scores', on: () => void reloadWatermelon(true) },
      { table: 'couple_watermelon_logs', event: 'INSERT', on: () => void reloadWatermelonLogs() },
      { table: 'couple_dice_games', on: () => void reloadDice(true) },
      { table: 'couple_dice_history', event: 'INSERT', on: () => void reloadDiceHistory() },
      // 重要日倒计时 / 刮刮乐：对方改动时即时同步（DELETE 交由轮询兜底）
      { table: 'couple_countdown', event: 'INSERT', on: (p) => setCountdownGame(p.new as CoupleCountdownRow) },
      { table: 'couple_countdown', event: 'UPDATE', on: (p) => setCountdownGame(p.new as CoupleCountdownRow) },
      { table: 'couple_scratch', event: 'INSERT', on: (p) => setScratchGame(p.new as CoupleScratchRow) },
      { table: 'couple_scratch', event: 'UPDATE', on: (p) => setScratchGame(p.new as CoupleScratchRow) },
      // 备婚流程：谁勾了待办、谁完成了某一步，对方立刻看到
      { table: 'couple_wedding', event: 'INSERT', on: (p) => setWeddingRow(p.new as CoupleWeddingRow) },
      { table: 'couple_wedding', event: 'UPDATE', on: (p) => setWeddingRow(p.new as CoupleWeddingRow) },
      // 飞行棋对局历史：一局结束落库后即时刷新
      { table: 'couple_board_game_history', event: 'INSERT', on: () => void reloadBoardHistory() },
      // 扫雷对局历史：一局通关落库后即时刷新
      { table: 'couple_mines_history', event: 'INSERT', on: () => void reloadMinesHistory() },
      // 兜底：铃铛通知表的实时通道已被验证可靠（能收到消息提示），
      // 收到真心话 / 同步抉择通知时主动刷新对应列表，
      // 避免业务表的实时事件偶发丢失导致「有提示但列表不更新」
      {
        table: 'feed_notifications',
        event: 'INSERT',
        on: (p) => {
          const n = p.new as { recipient?: string; type?: string }
          if (!memberId || !n || n.recipient !== memberId) return
          if (n.type === 'truth') void reloadTruthHistory()
          else if (n.type === 'quiz') void reloadQuiz()
          // 回合制游戏：铃铛实时通道可靠，收到「轮到你了 / 新一局」类通知时立刻强刷对应对局，
          // 弥补 realtime 业务表事件偶发丢失
          else if (n.type === 'gomoku') void reloadGomoku(true)
          else if (n.type === 'mines') void reloadMines(true)
          else if (n.type === 'board') void reloadBoard(true)
          else if (n.type === 'wufu') void reloadWufu(true)
          // 骰子比大小：对方离线开骰时会落一条 dice 通知，借实时通道即时刷新本端对局，
          // 避免「对方已开骰、本端还停留在旧状态要等轮询」
          else if (n.type === 'dice') void reloadDice(true)
        },
      },
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
      enabled: ready && !(activeModule === 'wufu' && !!wufuGame?.state.paused) && !(activeModule === 'gomoku' && !!gomokuGame?.state.paused),
      // 实时推送连不上时的兜底轮询：只刷当前正在看的模块（省流量）
      // —— 高实时模块（对局中）10 秒；飞行棋整局暂停 30 秒；
      // —— 摆方整局暂停：0（彻底停轮询，仅靠「继续游戏」主动拉取）
      // —— 其余模块实时性要求低，放宽到 60 秒
      pollMs:
        (activeModule === 'board' && !boardGame?.state.gamePaused) ||
        (activeModule === 'mines' && !minesGame?.state.cleared) ||
        (activeModule === 'wufu' && wufuGame?.state.winner === null && !wufuGame?.state.paused)
          ? 10_000
          : activeModule === 'board' && boardGame?.state.gamePaused
            ? 30_000
            : 60_000,
      onPoll: () => pollActiveModule(),
    }
  )

  // 首次进入只拉「默认打开的模块」数据（省流量）；
  // 其余模块切到对应 Tab / 收到实时推送时再拉（切模块效果见下方「切到某模块立即拉一次」）
  useEffect(() => {
    if (!ready) return
    if (activeModuleRef.current === 'board') {
      void reloadBoard()
      void reloadBoardHistory()
    } else if (activeModuleRef.current === 'mines') {
      void reloadMines()
      void reloadMinesHistory()
    } else if (activeModuleRef.current === 'wufu') {
      void reloadWufu()
      void reloadWufuHistory()
    } else if (activeModuleRef.current === 'gomoku') {
      void reloadGomoku()
      void reloadGomokuHistory()
    } else if (activeModuleRef.current === 'watermelon') {
      void reloadWatermelon()
      void reloadWatermelonLogs()
    } else if (activeModuleRef.current === 'dice') {
      void reloadDice()
      void reloadDiceHistory()
    } else if (activeModuleRef.current === 'wish') {
      void reloadWishes()
      void reloadEvents()
    } else if (activeModuleRef.current === 'chat') {
      void reloadMessages()
    } else if (activeModuleRef.current === 'quiz') {
      void reloadQuiz()
    } else if (activeModuleRef.current === 'truth') {
      void reloadTruthHistory()
    } else if (activeModuleRef.current === 'love') {
      void reloadMeals()
    } else {
      // 无模块参数（停留在模块网格页）：只拉入口卡片要的计数，
      // 心愿 / 留言 / 答题 / 真心话的正文留到真正打开那个模块时再下载
      void reloadGridCounts()
    }
  }, [ready, reloadGridCounts, reloadWishes, reloadMessages, reloadQuiz, reloadEvents, reloadMeals, reloadTruthHistory, reloadBoard, reloadBoardHistory, reloadMines, reloadMinesHistory, reloadWufu, reloadWufuHistory, reloadGomoku, reloadGomokuHistory, reloadWatermelon, reloadWatermelonLogs, reloadDice, reloadDiceHistory])

  useEffect(() => {
    try {
      if (activeModule) sessionStorage.setItem('couple-active-module', activeModule)
      else sessionStorage.removeItem('couple-active-module')
    } catch {
      // 页面内导航仍可用，只是不跨刷新保留当前模块。
    }
  }, [activeModule])

  // 铃铛通知跳转：/couple?module=truth 直接打开真心话大冒险模块（?quiz= 的揭晓弹窗优先）；
  // 带 &focus=1 时（点击铃铛通知进入）高亮定位到对应模块，提示用户「要看的是这里」
  const [moduleFocus, setModuleFocus] = useState(false)
  useEffect(() => {
    const module = searchParams.get('module')
    const quizId = searchParams.get('quiz')
    const focus = searchParams.get('focus') === '1'
    // 同步抉择揭晓深链只有 ?quiz=<id>，没有 module 参数，也要能进来
    if (!module && !quizId) return
    setSearchParams(
      (params) => {
        params.delete('module')
        params.delete('focus')
        return params
      },
      { replace: true }
    )
    // 同步抉择揭晓通知：点铃铛直达时，先打开同步抉择模块并高亮，再弹出揭晓弹窗（quiz 参数由关闭弹窗时清理）
    if (quizId) {
      if (isEnabled('quiz')) {
        setActiveModule('quiz')
        if (focus) setModuleFocus(true)
      }
      return
    }
    // 只允许进入「存在的模块」且管理员没有关掉的模块（通知深链也受模块开关约束）
    if (!COUPLE_MODULE_KEYS.includes(module as ModuleKey) || !isEnabled(module as ModuleKey)) return
    setActiveModule(module)
    if (focus) setModuleFocus(true)
  }, [searchParams, setSearchParams, isEnabled])

  // 正在看某个模块时被管理员关掉 → 立刻退回互动入口页，避免留下不可用的界面
  useEffect(() => {
    if (activeModule && !isEnabled(activeModule as ModuleKey)) setActiveModule(null)
  }, [activeModule, isEnabled])

  // 高亮几秒后自动消退 + 滚动把模块带到视野内
  useEffect(() => {
    if (!moduleFocus) return
    document.getElementById('couple-active-module')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const timer = window.setTimeout(() => setModuleFocus(false), 4200)
    return () => window.clearTimeout(timer)
  }, [moduleFocus])

  useEffect(() => {
    let active = true
    // 深度版（是/否题）不参与首次播种：线上题库表可能还没跑 0027 迁移（kind 约束未放开），
    // 播种失败会拖垮整个题库初始化；深度版改由 0027 迁移入库，或在下方从客户端合并
    void listCoupleQuizBank(ALL_QUESTIONS.filter((question) => question.kind !== '深度版'))
      .then((rows) => {
        if (!active) return
        const enabledQuestions = rows.filter((row) => row.enabled).map((row) => ({
          id: row.id,
          title: row.title,
          a: row.a,
          b: row.b,
          kind: row.kind,
        }))
        // 题库表里还没有深度版（未跑迁移）时，从客户端直接并入，保证「深度版」可玩
        const bankHasDeep = rows.some((row) => row.kind === '深度版')
        const merged = bankHasDeep ? enabledQuestions : [...enabledQuestions, ...DEEP_COUPLE_QUESTIONS]
        setDeepFromBank(bankHasDeep)
        managedQuestionsCache = merged
        setManagedQuestions(merged)
      })
      .catch(() => {
        if (active) setManagedQuestions(null)
      })
    return () => { active = false }
  }, [])

  // 同步抉择的数据（本题单 + 已做清单）只在进入该模块、或从铃铛深链回看某题时才拉
  const quizDataNeeded = activeModule === 'quiz' || !!noticeQuizId
  useEffect(() => {
    if (!memberId || !friendId) {
      setUsedQuestionIds(new Set())
      setPairQuestionIds(null)
      setPairQuestionsLoaded(true)
      return
    }
    if (!quizDataNeeded) return
    let active = true
    void listCoupleQuizPairQuestions(memberId, friendId)
      .then((rows) => {
        if (!active) return
        setPairQuestionIds(rows.length ? rows[0].question_ids : null)
        setPairQuestionsLoaded(true)
      })
      .catch(() => {
        if (!active) return
        setPairQuestionIds(null)
        setPairQuestionsLoaded(true)
      })
    return () => { active = false }
  }, [memberId, friendId, quizDataNeeded])

  // 已做题目清单：只取 question_id 一列（以前把整条答题记录含题面与双方答案全下载）
  useEffect(() => {
    if (!memberId || !friendId) {
      setUsedQuestionIds(new Set())
      return
    }
    if (!quizDataNeeded) return
    let active = true
    void listCoupleQuizUsedIds(memberId, friendId)
      .then((ids) => {
        if (active) setUsedQuestionIds(new Set(ids))
      })
      .catch((error) => console.warn('加载已做题目失败', error))
    return () => { active = false }
  }, [memberId, friendId, quizDataNeeded])

  // 双方都答完（揭晓）的那一刻，把这道题计入「已做」，让进度数字在两边实时 +1
  useEffect(() => {
    if (quiz.revealed && quiz.question) {
      const id = quiz.question.id
      setUsedQuestionIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
    }
  }, [quiz.revealed, quiz.question])

  useEffect(() => {
    if (!noticeQuizId || !memberId || !friendId) {
      setNoticeQuiz(null)
      return
    }
    let active = true
    setNoticeQuizLoading(true)
    void fetchCoupleQuizHistory(noticeQuizId)
      .then((row) => {
        if (!active) return
        const [memberA, memberB] = orderedPair(memberId, friendId)
        if (!row || row.member_a !== memberA || row.member_b !== memberB) {
          toast.show('找不到这道题的揭晓记录', 'err')
          setNoticeQuiz(null)
          return
        }
        setNoticeQuiz(row)
      })
      .catch((error) => {
        if (active) toast.show((error as Error).message, 'err')
      })
      .finally(() => {
        if (active) setNoticeQuizLoading(false)
      })
    return () => {
      active = false
    }
  }, [noticeQuizId, memberId, friendId, toast])

  const closeNoticeQuiz = () => {
    setNoticeQuiz(null)
    setSearchParams((params) => {
      params.delete('quiz')
      return params
    }, { replace: true })
  }

  // 自定义题库本地持久化（按互动对象隔离）
  useEffect(() => {
    if (!myId || !friendId) return
    try {
      sessionStorage.setItem(key('questions', myId, friendId), JSON.stringify(customQuestions))
    } catch {
      // 存储失败不影响使用
    }
  }, [customQuestions, myId, friendId])

  // 飞行棋自定义格子内容池：进入时读取、修改即保存（按互动对象隔离）
  useEffect(() => {
    if (!myId || !friendId) return
    setBoardCustomText(readCache<string[]>(key('board-custom', myId, friendId), []).join('\n'))
  }, [myId, friendId])

  useEffect(() => {
    if (!myId || !friendId) return
    try {
      sessionStorage.setItem(key('board-custom', myId, friendId), JSON.stringify(parseCustomCells(boardCustomText)))
    } catch {
      // 存储失败不影响使用
    }
  }, [boardCustomText, myId, friendId])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ------------------------------ 互动操作 ------------------------------ */

  const pickQuestion = async (kind: QuestionKind = questionKind) => {
    // 一方已作答、另一方还没答完时，题目被锁定，不允许换题/切换分类
    if (quiz.question && !quiz.revealed) return
    // 先切分类：点「自定义」要能立刻看到出题表单（哪怕还没有自定义题）
    setQuestionKind(kind)
    if (kind === '自定义' && !customQuestions.length) {
      toast.show('还没有自定义题目，先在下方添加一道吧～')
      return
    }
    if (kind !== '自定义' && (!managedQuestions || !pairQuestionsLoaded)) {
      return toast.show('题库或情侣题目配置仍在加载，请稍后重试', 'err')
    }
    const pool = kind === '自定义'
      ? customQuestions
      : (managedQuestions ?? []).filter((question) =>
          question.kind === kind &&
          (pairQuestionIds === null ||
            pairQuestionIds.includes(question.id) ||
            // 深度版还是客户端合并来的（未入库）时，不受旧的 pair 题目配置限制
            (question.kind === '深度版' && !deepFromBank))
        )
    let usedIds = usedQuestionIds
    if (memberId && friendId) {
      try {
        const history = await listCoupleQuizHistory(memberId, friendId, 5000)
        usedIds = new Set(history.map((row) => row.question_id))
        const activeQuiz = await fetchCoupleQuiz(memberId, friendId)
        if (activeQuiz?.question?.id) usedIds.add(activeQuiz.question.id)
        if (quiz.question) usedIds.add(quiz.question.id)
        setUsedQuestionIds(usedIds)
      } catch {
        toast.show('无法读取已做题目记录，请稍后重试', 'err')
        return
      }
    }
    const normalizedUsedTitles = new Set(
      [...ALL_QUESTIONS, ...customQuestions]
        .filter((question) => usedIds.has(question.id))
        .map((question) => question.title.trim().toLocaleLowerCase())
    )
    const unused = pool.filter((question) =>
      !usedIds.has(question.id) && !normalizedUsedTitles.has(question.title.trim().toLocaleLowerCase())
    )
    if (!unused.length) {
      return toast.show(pool.length ? '这个分类的题目都做过啦' : kind === '自定义' ? '还没有自定义题目，先添加一道吧～' : '该分类暂无题目', 'err')
    }
    const nextQ = unused[Math.floor(Math.random() * unused.length)]
    revealedRef.current = false
    setQuestionKind(kind)
    setQuiz({ question: nextQ, myChoice: null, peerChoice: null, revealed: false })
    setUsedQuestionIds((previous) => new Set(previous).add(nextQ.id))
    setChoiceMode('preset')
    setCustomAnswer('')
    if (memberId && friendId) {
      // 保存题目历史成功后再显示，防止写入失败导致重复出题。
      try {
        await resetCoupleQuiz(memberId, friendId, nextQ)
      } catch (error) {
        setQuiz({ question: null, myChoice: null, peerChoice: null, revealed: false })
        setUsedQuestionIds((previous) => {
          const next = new Set(previous)
          next.delete(nextQ.id)
          return next
        })
        toast.show((error as Error).message, 'err')
      }
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

  /* ------------------------------ 真心话大冒险 ------------------------------ */

  /* 抽题规则：
     1. 自己出的自定义题不进自己的池子 —— 保证「自己绝对抽不到自己出的题」；
     2. 对方出的自定义题优先抽取 —— 保证「对方出的题一定会被自己抽到」，不被固定题库稀释；
     3. 对方出的题抽完后，再在「固定题库 + 对方出的题」里过滤掉已答过的随机抽。 */
  const drawTruth = () => {
    const peerUnused = peerTruthPrompts.filter((p) => !usedTruthPrompts.has(p))
    if (peerUnused.length) {
      setTruthDraw({ type: 'truth', prompt: peerUnused[Math.floor(Math.random() * peerUnused.length)] })
      setTruthAnswer('')
      return
    }
    const pool = truthPromptPool.filter((p) => !usedTruthPrompts.has(p))
    // 全部答完时提示一轮完成，然后从头再来（第二轮同样不重复）
    if (!pool.length) toast.show(`${truthPromptPool.length} 道真心话都答过啦，从头再来一轮 🎉`)
    const list = pool.length ? pool : truthPromptPool
    setTruthDraw({ type: 'truth', prompt: list[Math.floor(Math.random() * list.length)] })
    setTruthAnswer('')
  }

  const addTruthPrompt = async () => {
    const prompt = truthPromptText.trim()
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    if (!prompt) return toast.show('先写下题目再加入题库', 'err')
    if (truthPromptBank.some((item) => item.prompt === prompt)) return toast.show('这道题已经在题库里啦', 'err')
    setTruthPromptSaving(true)
    try {
      const row = await addCoupleTruthPrompt(memberId, friendId, memberId, prompt)
      setTruthPromptBank((prev) => [row, ...prev.filter((item) => item.prompt !== row.prompt)])
      setTruthPromptText('')
      toast.show('已加入题库，这道题只有 TA 能抽到 🎯')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setTruthPromptSaving(false)
    }
  }

  // const removeTruthPrompt = async (id: string) => {
  //   try {
  //     await deleteCoupleTruthPrompt(id)
  //     setTruthPromptBank((prev) => prev.filter((item) => item.id !== id))
  //     toast.show('已从自定义题库移除')
  //   } catch (error) {
  //     toast.show((error as Error).message, 'err')
  //   }
  // }

  const addDarePrompt = async () => {
    const prompt = darePromptText.trim()
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    if (!prompt) return toast.show('先写下大冒险内容再加入题库', 'err')
    if (darePromptBank.some((item) => item.prompt === prompt)) return toast.show('这道题已经在题库里啦', 'err')
    setDarePromptSaving(true)
    try {
      const row = await addCoupleDarePrompt(memberId, friendId, memberId, prompt)
      setDarePromptBank((prev) => [row, ...prev.filter((item) => item.prompt !== row.prompt)])
      setDarePromptText('')
      toast.show('已加入题库，这个挑战只有 TA 能抽到 🎯')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setDarePromptSaving(false)
    }
  }

  // const removeDarePrompt = async (id: string) => {
  //   try {
  //     await deleteCoupleDarePrompt(id)
  //     setDarePromptBank((prev) => prev.filter((item) => item.id !== id))
  //     toast.show('已从自定义题库移除')
  //   } catch (error) {
  //     toast.show((error as Error).message, 'err')
  //   }
  // }

  /* 抽大冒险：与真心话同口径 —— 自己出的题不进自己的池子，对方出的题优先抽 */
  const drawDare = async () => {
    const peerUnused = peerDarePrompts.filter((p) => !usedTruthPrompts.has(p))
    let prompt: string
    if (peerUnused.length) {
      prompt = peerUnused[Math.floor(Math.random() * peerUnused.length)]
    } else {
      const pool = DARES.filter((p) => !usedTruthPrompts.has(p))
      const list = pool.length ? pool : DARES
      prompt = list[Math.floor(Math.random() * list.length)]
    }
    setTruthDraw({ type: 'dare', prompt })
    // 大冒险抽到即记录，双方在历史里都能看到
    if (memberId && friendId) {
      try {
        await createCoupleTruthDare({
          userA: memberId,
          userB: friendId,
          senderId: memberId,
          senderName: memberName || '我',
          type: 'dare',
          prompt,
          notify: false,
        })
        void reloadTruthHistory()
      } catch (error) {
        toast.show((error as Error).message, 'err')
      }
    }
  }

  const submitTruthAnswer = async () => {
    if (!truthDraw || truthDraw.type !== 'truth') return
    const answer = truthAnswer.trim()
    if (!answer) return toast.show('先把答案写上再提交哦～', 'err')
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    setTruthSubmitting(true)
    try {
      await createCoupleTruthDare({
        userA: memberId,
        userB: friendId,
        senderId: memberId,
        senderName: memberName || '我',
        type: 'truth',
        prompt: truthDraw.prompt,
        answer,
      })
      setTruthDraw(null)
      setTruthAnswer('')
      await reloadTruthHistory()
      toast.show('答案已提交，对方马上就能看到 💬')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setTruthSubmitting(false)
    }
  }

  /* ------------------------------ 联网飞行棋 ------------------------------ */

  /** 我在棋局里的下标：member_a（红棋）为 0，member_b（蓝棋）为 1 */
  const myBoardIndex: 0 | 1 = boardGame && memberId === boardGame.member_b ? 1 : 0
  const boardState = boardGame?.state ?? null
  /* 扫雷的派生常量：与飞行棋同口径（下标 0 = member_a ❤️，1 = member_b 💙） */
  const myMinesIndex: 0 | 1 = minesGame && memberId === minesGame.member_b ? 1 : 0
  const minesState = minesGame?.state ?? null
  /* 摆方五福棋的派生常量：同口径（❤️=member_a 先摆与否由掷骰决定） */
  const myWufuIndex: 0 | 1 = wufuGame && memberId === wufuGame.member_b ? 1 : 0
  const wufuState = wufuGame?.state ?? null
  const wufuNames: [string, string] | null = wufuGame
    ? [
        wufuGame.member_a === memberId ? memberName || '我' : friendName,
        wufuGame.member_b === memberId ? memberName || '我' : friendName,
      ]
    : null
  /** 我的棋子编号（1 = ❤️ member_a / 2 = 💙 member_b） */
  const myWufuPiece = myWufuIndex + 1
  /** 双方棋盘上的存子数 */
  const wufuPieceCount = useMemo(() => {
    const board = wufuState?.board ?? []
    return [board.filter((cell) => cell === 1).length, board.filter((cell) => cell === 2).length] as [number, number]
  }, [wufuState])
  /** 走子阶段我选中棋子后可走的空点 */
  const wufuMoveTargetCells = useMemo(
    () => (wufuState && wufuSelected !== null && wufuState.board[wufuSelected] === myWufuPiece ? wufuMoveTargets(wufuState.board, wufuSelected) : []),
    [wufuState, wufuSelected, myWufuPiece]
  )
  /** 对方已成项的棋子（受保护不可被提），只在需要点选对方棋子时计算 */
  const wufuEnemyProtected = useMemo(() => {
    if (!wufuState || wufuState.winner !== null || wufuState.turn !== myWufuIndex) return new Set<number>()
    const needPick =
      wufuState.pendingCaptures > 0 || (wufuState.phase === 'forceRemove' && wufuState.turn === 1 - wufuState.firstMover)
    if (!needPick) return new Set<number>()
    return wufuProtectedCells(wufuState.board, 3 - myWufuPiece)
  }, [wufuState, myWufuIndex, myWufuPiece])
  const myGomokuIndex: 0 | 1 = gomokuGame && memberId === gomokuGame.member_b ? 1 : 0
  const gomokuState = gomokuGame?.state ?? null
  const gomokuNames: [string, string] | null = gomokuGame
    ? [
        gomokuGame.member_a === memberId ? memberName || '我' : friendName,
        gomokuGame.member_b === memberId ? memberName || '我' : friendName,
      ]
    : null

  const myDiceIndex: 0 | 1 = diceGame && memberId === diceGame.member_b ? 1 : 0
  const diceState = diceGame?.state ?? null
  const diceNames: [string, string] | null = diceGame
    ? [
        diceGame.member_a === memberId ? memberName || '我' : friendName,
        diceGame.member_b === memberId ? memberName || '我' : friendName,
      ]
    : null

  const minesNames: [string, string] | null = minesGame
    ? [
        minesGame.member_a === memberId ? memberName || '我' : friendName,
        minesGame.member_b === memberId ? memberName || '我' : friendName,
      ]
    : null
  /** 双方展示名：下标 0 = member_a（红棋），1 = member_b（蓝棋） */
  const boardNames: [string, string] | null = boardGame && memberId
    ? [
        boardGame.member_a === memberId ? memberName || '我' : friendName,
        boardGame.member_b === memberId ? memberName || '我' : friendName,
      ]
    : null

  const startBoardGame = async () => {
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    // 自定义步数：从输入框取值并收敛到 1～20；预设定：直接用下拉值
    const stepMinInput = boardStepMinCustom ? clampInt(Number(boardStepMinCustomValue) || 1, 1, 20) : boardStepMin
    const stepMaxInput = boardStepMaxCustom ? clampInt(Number(boardStepMaxCustomValue) || 1, 1, 20) : boardStepMax
    const stepMin = Math.min(stepMinInput, stepMaxInput)
    // 修复：之前误写成 stepMinInput，导致默认最少步数为 1 时骰子区间恒为 [1,1]，两人永远掷出 1 点
    const stepMax = Math.max(stepMinInput, stepMaxInput)
    if (boardStepMinCustom && !boardStepMinCustomValue.trim()) return toast.show('请填写自定义最少步数（1～20）', 'err')
    if (boardStepMaxCustom && !boardStepMaxCustomValue.trim()) return toast.show('请填写自定义最多步数（1～20）', 'err')
    const myName = memberName || '我'
    // 下标与 member_a / member_b 对齐：member_a（红棋）= 较小的 id
    const names: [string, string] = memberId < friendId ? [myName, friendName] : [friendName, myName]
    const first = rollForFirst(names)
    const at = new Date().toISOString()
    const state: CoupleBoardState = {
      // 自定义格数收敛到 10～100，防止误输入过大/过小
      size: clampInt(boardSize, 10, 100),
      stepMin,
      stepMax,
      cells: buildBoardCells(boardSize, parseCustomCells(boardCustomText)),
      positions: [0, 0],
      turn: first.turn,
      paused: [0, 0],
      penalty: [false, false],
      gamePaused: false,
      dice: null,
      log: [
        { at, text: '🎯棋盘已生成，先各掷一次骰子定先手（大点数先走）' },
        ...first.logs.map((text) => ({ at, text })),
      ],
      winner: null,
      pending: null,
    }
    setBoardSaving(true)
    try {
      await upsertCoupleBoardGame(memberId, friendId, state)
      const [memberA, memberB] = orderedPair(memberId, friendId)
      setBoardGame({ member_a: memberA, member_b: memberB, state, updated_at: new Date().toISOString() })
      // 自己新建的棋盘不算「对方生成了新棋盘」，提前对齐 prev 快照避免误弹 toast
      prevBoardRef.current = state
      // 先手是对方时：对方在线只靠状态同步弹 toast，离线才落铃铛提醒
      const myIndex: 0 | 1 = memberId < friendId ? 0 : 1
      if (first.turn !== myIndex && !peerOnline) void notifyBoardNew(friendId, myName)
      setBoardSetup(false)
      toast.show('棋盘已生成，先手已定，开掷吧 🎯')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setBoardSaving(false)
    }
  }

  /** 暂停 / 继续整局棋：暂停后双方可以去做别的（棋局不再频繁占用网络），回来接着玩 */
  const toggleBoardPause = async () => {
    if (!boardGame || !boardState || !memberId || !friendId || boardState.winner !== null) return
    setBoardSaving(true)
    try {
      const next = { ...boardState, gamePaused: !boardState.gamePaused }
      await upsertCoupleBoardGame(memberId, friendId, next)
      setBoardGame({ ...boardGame, state: next, updated_at: new Date().toISOString() })
      toast.show(next.gamePaused ? '⏸️ 已暂停，可以去做别的，回来点「继续游戏」接着玩' : '▶️ 继续游戏，轮到谁掷骰看顶部提示')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setBoardSaving(false)
    }
  }

  /** 重新设置棋盘：销毁本局（数据库与本地都不再保留），之后可重新开一局 */
  const endBoardGame = async () => {
    if (!boardGame || !memberId || !friendId) return
    if (!window.confirm('是否结束？\n本局将被销毁（数据库和本地不再保留这局数据），确认后可以重新设置棋盘再开一局。')) return
    setBoardSaving(true)
    try {
      await deleteCoupleBoardGame(memberId, friendId)
      setBoardGame(null)
      setBoardSetup(false)
      toast.show('本局已销毁，重新设置棋盘开新一局吧')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setBoardSaving(false)
    }
  }

  const rollBoardDice = async () => {
    if (!boardGame || !boardState || !memberId || !friendId) return
    if (boardState.gamePaused) return toast.show('本局已暂停，点「继续游戏」接着玩', 'err')
    if (boardState.winner !== null || boardState.pending || boardState.turn !== myBoardIndex) return
    setBoardSaving(true)
    setDiceResult(null)
    setDiceRolling(true)
    const startedAt = Date.now()
    const spin = window.setInterval(() => setDiceFace(1 + Math.floor(Math.random() * 6)), 90)
    try {
      // 先取最新棋局：回合已变化时放弃本次操作，降低双端同时掷骰的覆盖风险
      const fresh = (await fetchCoupleBoardGame(memberId, friendId)) ?? boardGame
      const latest = fresh.state
      if (latest.winner !== null || latest.pending || latest.turn !== myBoardIndex) {
        window.clearInterval(spin)
        setDiceRolling(false)
        setBoardGame(fresh)
        return
      }
      const dice = latest.stepMin + Math.floor(Math.random() * (latest.stepMax - latest.stepMin + 1))
      const names = boardNames ?? ['红棋', '蓝棋']
      const { state: next, darePrompt, messages, reroll } = applyBoardRoll(latest, myBoardIndex, dice, names)
      await upsertCoupleBoardGame(memberId, friendId, next)
      setBoardGame({ ...fresh, state: next, updated_at: new Date().toISOString() })
      // 轮到对方行动（无待答真心话、未分胜负、未整局暂停）：对方在线时不写铃铛（避免刷屏），
      // 只靠状态同步弹本地 toast；离线才落铃铛，回来登录也能看到「轮到你了」
      if (next.winner === null && !next.pending && next.turn !== myBoardIndex && !next.gamePaused && !peerOnline) {
        void notifyBoardTurn(friendId, memberName || '我')
      }
      if (darePrompt) {
        // 踩到大冒险格：抽到的题目也进真心话大冒险记录
        void createCoupleTruthDare({
          userA: memberId,
          userB: friendId,
          senderId: memberId,
          senderName: memberName || '我',
          type: 'dare',
          prompt: darePrompt,
          notify: false,
        })
          .then(() => reloadTruthHistory())
          .catch(() => {})
      }
      // 一局分出胜负：把整局快照（棋盘、过程日志、结果）留存进对局历史
      if (next.winner !== null && latest.winner === null) {
        void createCoupleBoardGameHistory(memberId, friendId, next)
          .then(() => reloadBoardHistory())
          .catch(() => {})
      }
      // 骰子动画播满时长再弹结果：展示最终点数和走几步 / 触发的格子
      window.setTimeout(
        () => {
          window.clearInterval(spin)
          setDiceFace(next.dice ?? 1)
          setDiceRolling(false)
          setDiceResult({ dice: next.dice, player: myBoardIndex, messages, reroll })
        },
        Math.max(0, 1200 - (Date.now() - startedAt))
      )
    } catch (error) {
      window.clearInterval(spin)
      setDiceRolling(false)
      toast.show((error as Error).message, 'err')
    } finally {
      setBoardSaving(false)
    }
  }

  const submitBoardTruth = async () => {
    if (!boardGame || !boardState?.pending || boardState.pending.player !== myBoardIndex) return
    const answer = boardTruthAnswer.trim()
    if (!answer) return toast.show('先把答案写上再提交哦～', 'err')
    if (!memberId || !friendId) return
    setBoardSaving(true)
    try {
      await createCoupleTruthDare({
        userA: memberId,
        userB: friendId,
        senderId: memberId,
        senderName: memberName || '我',
        type: 'truth',
        prompt: boardState.pending.prompt,
        answer,
      })
      const fresh = (await fetchCoupleBoardGame(memberId, friendId)) ?? boardGame
      const next: CoupleBoardState =
        fresh.state.pending?.player === myBoardIndex
          ? {
              ...fresh.state,
              pending: null,
              log: [
                ...fresh.state.log,
                { at: new Date().toISOString(), text: `💬${memberName || '我'}完成了真心话作答` },
              ].slice(-20),
            }
          : fresh.state
      await upsertCoupleBoardGame(memberId, friendId, next)
      setBoardGame({ ...fresh, state: next, updated_at: new Date().toISOString() })
      // 答完真心话后轮到对方掷骰：对方在线只弹本地 toast，离线才落铃铛
      if (next.winner === null && !next.pending && next.turn !== myBoardIndex && !next.gamePaused && !peerOnline) {
        void notifyBoardTurn(friendId, memberName || '我')
      }
      setBoardTruthAnswer('')
      void reloadTruthHistory()
      toast.show('答案已提交，对方马上就能看到 💬')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setBoardSaving(false)
    }
  }

  // 对方掷骰 / 开新局时弹提醒：自己掷骰的流程走 diceResult 弹窗，不走这里
  const prevBoardRef = useRef<CoupleBoardState | null>(null)
  useEffect(() => {
    const prev = prevBoardRef.current
    prevBoardRef.current = boardState
    if (!boardState || !prev || !boardGame) return
    // 对方掷骰走完，轮到我了
    if (
      boardState.winner === null &&
      !boardState.pending &&
      boardState.dice !== null &&
      boardState.turn === myBoardIndex &&
      prev.turn !== myBoardIndex
    ) {
      toast.show(`🎲 ${friendName} 掷出 ${boardState.dice} 点走完啦，轮到你掷骰了！`)
    }
    // 对方生成新棋盘（未掷骰、棋盘内容变化且先手是对方）。
    // 注意：必须按内容比较——轮询 / 实时推送每次都会反序列化出全新对象，
    // 引用比较会恒为 true，导致「等对方先掷骰」期间每 2 秒重复弹一次。
    if (
      boardState.winner === null &&
      boardState.dice === null &&
      JSON.stringify(prev.cells) !== JSON.stringify(boardState.cells) &&
      boardState.turn !== myBoardIndex
    ) {
      toast.show(`🎯 ${friendName} 生成了新棋盘，等 TA 先掷骰～`)
    }
    // 对方率先到达终点
    if (boardState.winner !== null && prev.winner === null && boardState.winner !== myBoardIndex) {
      toast.show(`🏁 ${friendName} 率先到达终点，这局 TA 赢啦～`)
      // 对方落库历史后实时推送偶发丢失时，这里兜底刷新一次对局历史列表
      void reloadBoardHistory()
    }
  }, [boardState, boardGame, myBoardIndex, friendName, toast, reloadBoardHistory])

  /**
   * 飞行棋 / 扫雷对局中加快同步：等待对方行动时，每 2 秒主动拉一次棋局——
   * 实时推送可用时它只是冗余兜底，推送连不上时也能把回合交接的等待压到 2 秒内。
   * 棋局暂停、已分胜负 / 已通关时自动停掉，不占网络。
   */
  const awaitingBoardPeer =
    activeModule === 'board' &&
    boardGame !== null &&
    boardGame.state.winner === null &&
    !boardGame.state.gamePaused &&
    (boardGame.state.turn !== myBoardIndex ||
      (boardGame.state.pending !== null && boardGame.state.pending.player !== myBoardIndex))
  const awaitingMinesPeer =
    activeModule === 'mines' && minesGame !== null && !minesGame.state.cleared && minesGame.state.turn !== myMinesIndex
  const awaitingWufuPeer =
    activeModule === 'wufu' && wufuGame !== null && wufuGame.state.winner === null && wufuGame.state.turn !== myWufuIndex
  useEffect(() => {
    if (!awaitingBoardPeer && !awaitingMinesPeer && !awaitingWufuPeer) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (awaitingBoardPeer) void reloadBoard()
      if (awaitingMinesPeer) void reloadMines()
      if (awaitingWufuPeer) void reloadWufu()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [awaitingBoardPeer, awaitingMinesPeer, awaitingWufuPeer, reloadBoard, reloadMines, reloadWufu])

  /* ------------------------------ 扫雷操作 ------------------------------ */

  const startMinesGame = async () => {
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    // 自定义尺寸：行/列收敛到 5～16，雷数收敛到 1 ～ (格数×30%，且保证首点安全区有空间)
    const customRows = clampInt(minesCustomRows, 5, 16)
    const customCols = clampInt(minesCustomCols, 5, 16)
    const customMinesMax = Math.max(1, Math.min(Math.floor(customRows * customCols * 0.3), customRows * customCols - 9))
    const customMines = clampInt(minesCustomMines, 1, customMinesMax)
    const preset =
      minesPresetKey === 'custom'
        ? { key: 'custom', label: '自定义', rows: customRows, cols: customCols, mines: customMines }
        : MINES_PRESETS.find((item) => item.key === minesPresetKey) ?? MINES_PRESETS[1]
    const myName = memberName || '我'
    // 下标与 member_a / member_b 对齐：member_a（❤️）= 较小的 id
    const names: [string, string] = memberId < friendId ? [myName, friendName] : [friendName, myName]
    const first = rollForFirst(names, '先点')
    const at = new Date().toISOString()
    const state: CoupleMinesState = {
      rows: preset.rows,
      cols: preset.cols,
      mineTotal: preset.mines,
      mines: [],
      cells: Array(preset.rows * preset.cols).fill(MINES_CELL.closed),
      turn: first.turn,
      log: [
        { at, text: `💣${preset.rows}×${preset.cols} 棋盘已生成，共 ${preset.mines} 颗雷` },
        ...first.logs.map((text) => ({ at, text })),
      ],
      hits: [],
      reward: null,
      cleared: false,
    }
    setMinesSaving(true)
    try {
      await upsertCoupleMines(memberId, friendId, state)
      const [memberA, memberB] = orderedPair(memberId, friendId)
      setMinesGame({ member_a: memberA, member_b: memberB, state, updated_at: new Date().toISOString() })
      // 自己新建的雷区不算对方的动作，提前对齐 prev 快照避免误弹 toast
      prevMinesRef.current = state
      // 先手是对方时：对方在线只靠状态同步弹 toast，离线才落铃铛提醒
      const myIndex: 0 | 1 = memberId < friendId ? 0 : 1
      if (first.turn !== myIndex && !peerOnline) void notifyMinesNew(friendId, myName)
      toast.show('扫雷开始，轮流点开格子吧 💣')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setMinesSaving(false)
    }
  }

  /** 点击格子：open 模式打开（仅轮到的人），flag 模式切换标记（双方随时可标，不消耗回合） */
  const actMinesCell = async (index: number) => {
    if (!minesGame || !minesState || !memberId || !friendId) return
    if (minesState.cleared || minesSaving) return
    if (minesState.cells[index] === MINES_CELL.opened) return
    const names: [string, string] =
      memberId === minesGame.member_a
        ? [memberName || '我', friendName]
        : [friendName, memberName || '我']
    // 标记模式：双方任何时候都可以标记 / 取消标记，不消耗回合
    if (minesMode === 'flag') {
      setMinesSaving(true)
      try {
        // 旗子不消耗回合，也不能用旧的 minesState 覆盖对方刚挖开的格子。
        const fresh = (await fetchCoupleMines(memberId, friendId)) ?? minesGame
        const latest = fresh.state
        if (latest.cleared || latest.cells[index] === MINES_CELL.opened) {
          setMinesGame(fresh)
          return
        }
        const next: CoupleMinesState = {
          ...latest,
          cells: latest.cells.map((c, i) => (i === index ? (c === MINES_CELL.flagged ? MINES_CELL.closed : MINES_CELL.flagged) : c)),
        }
        const updatedAt = new Date().toISOString()
        await upsertCoupleMines(memberId, friendId, next)
        setMinesGame({ ...fresh, state: next, updated_at: updatedAt })
      } catch (error) {
        toast.show((error as Error).message, 'err')
      } finally {
        setMinesSaving(false)
      }
      return
    }
    if (minesState.cells[index] === MINES_CELL.flagged) {
      return toast.show('这格被标记了，切到 🚩 标记模式点一下可取消标记', 'err')
    }
    if (minesState.turn !== myMinesIndex) return toast.show(`还没轮到你，等 ${friendName} 点完这一格～`, 'err')
    setMinesSaving(true)
    try {
      // 先取最新棋局：回合已变化 / 格子已被点开时放弃本次操作，降低双端同时操作的覆盖风险
      const fresh = (await fetchCoupleMines(memberId, friendId)) ?? minesGame
      const latest = fresh.state
      if (latest.cleared || latest.turn !== myMinesIndex || latest.cells[index] !== MINES_CELL.closed) {
        setMinesGame(fresh)
        return
      }
      const { state: next, hitTask } = applyMinesOpen(latest, myMinesIndex, index, names)
      await upsertCoupleMines(memberId, friendId, next)
      setMinesGame({ ...fresh, state: next, updated_at: new Date().toISOString() })
      // 点完轮到对方（未通关）：对方在线只弹本地 toast（状态同步效果已有），离线才落铃铛
      if (!next.cleared && next.turn !== myMinesIndex && !peerOnline) {
        void notifyMinesTurn(friendId, memberName || '我')
      }
      if (hitTask) setMinesTask(hitTask)
      if (next.cleared && !latest.cleared) {
        setMinesReward(next.reward)
        // 一局通关：把整局快照（棋盘、踩雷任务、奖励）留存进对局历史
        void createCoupleMinesHistory(memberId, friendId, next)
          .then(() => reloadMinesHistory())
          .catch(() => {})
      }
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setMinesSaving(false)
    }
  }

  /** 结束本局扫雷：销毁数据库与本地数据，之后可重新开一局 */
  const endMinesGame = async () => {
    if (!minesGame || !memberId || !friendId) return
    if (!window.confirm('是否结束？\n本局扫雷将被销毁（数据库和本地不再保留这局数据），确认后可以重新开一局。')) return
    setMinesSaving(true)
    try {
      await deleteCoupleMines(memberId, friendId)
      setMinesGame(null)
      toast.show('本局已销毁，重新开一局吧')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setMinesSaving(false)
    }
  }

  /* ------------------------------ 联网摆方（五福棋） ------------------------------ */

  /** 上一份棋局快照：识别「轮到我 / 对方获胜」等变化，避免把自己的动作误当提示 */
  const prevWufuRef = useRef<CoupleWufuState | null>(null)

  /** 开新棋局：双方掷骰定先手，先手摆 13 子、后手摆 12 子 */
  const startGomokuGame = async () => {
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    const at = new Date().toISOString()
    const names: [string, string] = memberId < friendId ? [memberName || '我', friendName] : [friendName, memberName || '我']
    const state: CoupleGomokuState = {
      board: Array(225).fill(0),
      turn: 0,
      winner: null,
      paused: false,
      log: [{ at, text: `⚫ 五子棋开局：${names[0]}执黑先手，横、竖或斜线连成五子获胜` }],
    }
    setGomokuSaving(true)
    try {
      await upsertCoupleGomoku(memberId, friendId, state)
      const [a, b] = orderedPair(memberId, friendId)
      setGomokuGame({ member_a: a, member_b: b, state, updated_at: at })
      setGomokuLoaded(true)
      if (myGomokuIndex !== 0) {
        if (peerOnline) toast.show(`⚫ ${memberName || '我'} 创建了五子棋，轮到 ${names[0]} 先手`)
        else void notifyGomokuNew(friendId, memberName || '我')
      }
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setGomokuSaving(false)
    }
  }

  const startWufuGame = async () => {
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    const myName = memberName || '我'
    const names: [string, string] = memberId < friendId ? [myName, friendName] : [friendName, myName]
    const first = rollForFirst(names, '先摆')
    const at = new Date().toISOString()
    const state: CoupleWufuState = {
      board: Array(25).fill(0),
      phase: 'place',
      firstMover: first.turn,
      turn: first.turn,
      placed: 0,
      capturedInPlace: false,
      pendingCaptures: 0,
      log: [
        { at, text: '♟️摆方开局：先摆子 → 成项提子 → 走子，把对方吃到只剩 2 子即获胜' },
        ...first.logs.map((text) => ({ at, text })),
        { at, text: `📐先手 ${names[first.turn]} 摆 13 子，${names[1 - first.turn]} 摆 12 子` },
      ],
      winner: null,
      paused: false,
    }
    setWufuSaving(true)
    try {
      await upsertCoupleWufu(memberId, friendId, state)
      const [memberA, memberB] = orderedPair(memberId, friendId)
      setWufuGame({ member_a: memberA, member_b: memberB, state, updated_at: new Date().toISOString() })
      prevWufuRef.current = state
      setWufuSelected(null)
      // 先手是对方时：对方在线只靠状态同步弹 toast，离线才落铃铛提醒
      const myIndex: 0 | 1 = memberId < friendId ? 0 : 1
      if (first.turn !== myIndex && !peerOnline) void notifyWufuNew(friendId, myName)
      else toast.show('🎲 点数更大，这局由你先摆子！')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setWufuSaving(false)
    }
  }

  /**
   * 当前行动方完成这一手（摆子 / 逼子 / 走子 + 可能的提子都结束后调用）：
   * 切换该谁行动，并处理摆子 → 逼子 / 走子的阶段流转与「无路可走即输」判定。
   * mover 为刚刚行动完的一方（提子期间 turn 一直保持行动方不变）。
   */
  const wufuFinishTurn = (next: CoupleWufuState, mover: 0 | 1) => {
    if (next.winner !== null) return
    const at = new Date().toISOString()
    if (next.phase === 'place') {
      if (next.placed < 25) {
        // 摆子继续：第 placed 手（从 0 计）该谁摆，先手摆双数手
        next.turn = next.placed % 2 === 0 ? next.firstMover : (1 - next.firstMover) as 0 | 1
        return
      }
      if (next.capturedInPlace) {
        next.phase = 'walk'
        next.turn = (1 - next.firstMover) as 0 | 1
        next.log.push({ at, text: '🚶25 子摆完，进入走子阶段：棋子沿线走一格，成项照样提子（后手先走）' })
      } else {
        next.phase = 'forceRemove'
        next.turn = (1 - next.firstMover) as 0 | 1
        next.log.push({ at, text: '⚖️棋盘摆满但双方都没吃子：后手先移出对方一枚棋子（逼子），然后先手开始走子' })
      }
      return
    }
    // 走子阶段：轮到对方行动；对方无路可走则直接判负
    const nextPlayer = (1 - mover) as 0 | 1
    next.turn = nextPlayer
    if (!wufuHasAnyMove(next.board, nextPlayer + 1)) {
      next.winner = mover
      next.log.push({ at, text: `🏆${wufuNames ? wufuNames[nextPlayer] : '对方'} 无路可走，${wufuNames ? wufuNames[mover] : '你'} 获胜！` })
    }
  }

  /** 成项后的待提子数按「对方可被提的棋子数」收敛（受保护的不能提） */
  const wufuCapCaptures = (next: CoupleWufuState, opp: number, freshCount: number, at: string) => {
    const protectedCells = wufuProtectedCells(next.board, opp)
    let capturable = 0
    next.board.forEach((cell, i) => {
      if (cell === opp && !protectedCells.has(i)) capturable += 1
    })
    if (capturable === 0) {
      next.pendingCaptures = 0
      next.log.push({ at, text: '🛡对方棋子都在成项棋形里受保护，这次提不了子' })
      return true // 没得提，直接算这一手完成
    }
    next.pendingCaptures = Math.min(freshCount, capturable)
    if (next.pendingCaptures < freshCount) next.log.push({ at, text: `🛡对方可提的棋子只剩 ${capturable} 枚，按 ${capturable} 枚提` })
    return next.pendingCaptures === 0
  }

  /** 摆方落点统一入口：摆子（点空点）/ 提子（点对方可提的子）/ 逼子 / 走子（先点己子再点相邻空点） */
  const wufuClickPoint = async (index: number) => {
    if (!wufuState || !wufuGame || !memberId || !friendId) return
    if (wufuSaving) return
    if (wufuState.winner !== null) return toast.show('本局已结束，点「再来一局」重新开始吧～')
    if (wufuState.paused === true) return toast.show('⏸️ 棋局已暂停：点下方「继续游戏」恢复对局～')
    if (wufuState.turn !== myWufuIndex) return toast.show(`还没轮到你，等 ${friendName} 行动吧～`)
    const at = new Date().toISOString()
    const board = [...wufuState.board]
    const me = myWufuPiece
    const opp = 3 - me
    const myName = memberName || '我'
    const next: CoupleWufuState = { ...wufuState, board, log: [...wufuState.log] }
    let needFinishTurn = false
    let flashCells: number[] | null = null

    if (next.pendingCaptures > 0) {
      // ① 成项后的提子：点对方的棋子提走（提完才轮到对方）
      if (board[index] !== opp) return toast.show('现在要提子：点击对方棋盘上「闪烁标记」的棋子', 'err')
      if (wufuEnemyProtected.has(index)) return toast.show('这枚棋子在对方成项棋形里，受保护不能提，换一枚试试', 'err')
      board[index] = 0
      next.pendingCaptures -= 1
      const enemyLeft = board.filter((cell) => cell === opp).length
      next.log.push({ at, text: `⚔️${myName} 提走 ${friendName} 一子（TA 还剩 ${enemyLeft} 枚）` })
      if (next.phase === 'walk' && enemyLeft <= 2) {
        next.pendingCaptures = 0
        next.winner = myWufuIndex
        next.log.push({ at, text: `🏆${friendName} 只剩 2 子，${myName} 获胜！` })
      }
      if (next.pendingCaptures === 0) needFinishTurn = true
    } else if (next.phase === 'place') {
      // ② 摆子：点空点落子，落子成项立刻获得提子机会
      if (board[index] !== 0) return toast.show('这个点已经有棋子啦，换一个空点', 'err')
      const before = wufuFormedPatterns(board, me)
      board[index] = me
      next.placed += 1
      const fresh = [...wufuFormedPatterns(board, me)].filter((patternIndex) => !before.has(patternIndex))
      if (fresh.length) {
        next.capturedInPlace = true
        const names = [...new Set(fresh.map((patternIndex) => WUFU_PATTERNS[patternIndex].name))]
        flashCells = fresh.flatMap((patternIndex) => WUFU_PATTERNS[patternIndex].cells)
        next.log.push({ at, text: `✨${myName} 摆成【${names.join(' + ')}】！可提对方 ${fresh.length} 子` })
        needFinishTurn = wufuCapCaptures(next, opp, fresh.length, at)
      } else {
        needFinishTurn = true
      }
    } else if (next.phase === 'forceRemove') {
      // ③ 逼子：摆满 25 点但全程没吃子，后手移出对方一枚棋子，随后先手开始走子
      if (board[index] !== opp) return toast.show('逼子：点击对方的一枚棋子，把它移出棋盘', 'err')
      board[index] = 0
      next.log.push({ at, text: `⚖️${myName} 逼子：移出 ${friendName} 一枚棋子` })
      next.phase = 'walk'
      next.turn = next.firstMover
      next.log.push({ at, text: '🚶进入走子阶段：棋子沿线走一格，成项照样提子（先手先走）' })
      if (!wufuHasAnyMove(next.board, next.firstMover + 1)) {
        next.winner = (1 - next.firstMover) as 0 | 1
        next.log.push({ at, text: `🏆${wufuNames ? wufuNames[next.firstMover] : '对方'} 无路可走，${myName} 获胜！` })
      }
    } else {
      // ④ 走子：先点己方棋子选中，再点相邻空点走过去
      if (board[index] === me) {
        if (wufuSelected === index) {
          setWufuSelected(null)
          return toast.show('已取消选子，重新点要走的棋子')
        }
        const targets = wufuMoveTargets(board, index)
        setWufuSelected(index)
        return toast.show(targets.length ? `已选中，再点相邻的空点走子（有 ${targets.length} 个可走点）` : '这枚棋子四周没有空点，换一枚试试')
      }
      if (wufuSelected === null) {
        return toast.show(`先点击自己（${myWufuIndex === 0 ? '❤️红' : '💙蓝'}）的棋子，再点相邻空点`, 'err')
      }
      if (board[index] !== 0) return toast.show('那是对方的棋子：先点自己的棋子，再点相邻空点', 'err')
      if (!wufuMoveTargetCells.includes(index)) return toast.show('只能沿线走到上下左右紧邻的空点', 'err')
      const before = wufuFormedPatterns(board, me)
      board[wufuSelected] = 0
      board[index] = me
      setWufuSelected(null)
      const fresh = [...wufuFormedPatterns(board, me)].filter((patternIndex) => !before.has(patternIndex))
      if (fresh.length) {
        const names = [...new Set(fresh.map((patternIndex) => WUFU_PATTERNS[patternIndex].name))]
        flashCells = fresh.flatMap((patternIndex) => WUFU_PATTERNS[patternIndex].cells)
        next.log.push({ at, text: `✨${myName} 走成【${names.join(' + ')}】！可提对方 ${fresh.length} 子` })
        needFinishTurn = wufuCapCaptures(next, opp, fresh.length, at)
      } else {
        needFinishTurn = true
      }
    }

    if (needFinishTurn) wufuFinishTurn(next, myWufuIndex)
    if (flashCells) setWufuFlash({ cells: flashCells, key: Date.now() })
    setWufuSaving(true)
    try {
      await upsertCoupleWufu(memberId, friendId, next)
      const [memberA, memberB] = orderedPair(memberId, friendId)
      setWufuGame({ member_a: memberA, member_b: memberB, state: next, updated_at: new Date().toISOString() })
      prevWufuRef.current = next
      // 胜利时落库一份历史快照（供对局历史回看）
      if (next.winner !== null) void createCoupleWufuHistory(memberId, friendId, next)
      // 轮到对方行动时：对方在线只弹本地 toast（prev 快照效果已有），离线才落铃铛
      if (next.winner === null && next.turn !== myWufuIndex && !peerOnline) void notifyWufuTurn(friendId, myName)
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setWufuSaving(false)
    }
  }

  const gomokuWinner = (board: number[], index: number, piece: number) => {
    const row = Math.floor(index / 15)
    const col = index % 15
    return [[0, 1], [1, 0], [1, 1], [1, -1]].some(([dr, dc]) => {
      let count = 1
      for (const sign of [-1, 1]) {
        let r = row + dr * sign
        let c = col + dc * sign
        while (r >= 0 && r < 15 && c >= 0 && c < 15 && board[r * 15 + c] === piece) {
          count += 1
          r += dr * sign
          c += dc * sign
        }
      }
      return count >= 5
    })
  }

  const toggleGomokuPause = async () => {
    if (!gomokuState || !memberId || !friendId || gomokuSaving) return
    if (gomokuState.winner !== null) return toast.show('本局已结束，无需暂停～')
    const paused = !gomokuState.paused
    const next = { ...gomokuState, paused, log: paused ? [...gomokuState.log, { at: new Date().toISOString(), text: `⏸️${memberName || '我'} 暂停五子棋` }] : gomokuState.log }
    setGomokuSaving(true)
    try {
      await upsertCoupleGomoku(memberId, friendId, next)
      const [a, b] = orderedPair(memberId, friendId)
      setGomokuGame({ member_a: a, member_b: b, state: next, updated_at: new Date().toISOString() })
      if (!paused) void reloadGomoku(true)
      toast.show(paused ? '⏸️ 五子棋已暂停，网络同步已停止' : '▶️ 五子棋已继续')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setGomokuSaving(false)
    }
  }

  const surrenderGomoku = async () => {
    if (!gomokuState || gomokuState.winner !== null || !memberId || !friendId || gomokuSaving) return
    if (!window.confirm('确定投降并保存本局五子棋历史吗？')) return
    const surrenderWinnerIndex = (1 - myGomokuIndex) as 0 | 1
    const next: CoupleGomokuState = {
      ...gomokuState,
      winner: surrenderWinnerIndex,
      paused: false,
      log: [
        ...gomokuState.log,
        {
          at: new Date().toISOString(),
          text: `🏳️ ${memberName || '我'} 主动投降，${friendName} 获胜`,
        },
      ],
    }
    setGomokuSaving(true)
    try {
      await createCoupleGomokuHistory(memberId, friendId, next)
      await deleteCoupleGomoku(memberId, friendId)
      setGomokuGame(null)
      void reloadGomokuHistory()
      toast.show('🏳️ 已投降并保存五子棋历史')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setGomokuSaving(false)
    }
  }

  /** 胜局归档后收尾：删除当前棋局，回到「开始新棋局」入口（历史已在获胜/投降时写入） */
  const finishGomoku = async () => {
    if (!memberId || !friendId || gomokuSaving) return
    if (!window.confirm('结束并清理当前棋盘？本局结果已保存在历史里。')) return
    setGomokuSaving(true)
    try {
      await deleteCoupleGomoku(memberId, friendId)
      setGomokuGame(null)
      void reloadGomokuHistory()
      toast.show('🏁 本局已结束，可以开新一局啦')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setGomokuSaving(false)
    }
  }

  const placeGomoku = async (index: number) => {
    if (!gomokuState || !gomokuGame || !memberId || !friendId || gomokuSaving) return
    if (gomokuState.paused) return toast.show('⏸️ 棋局已暂停，请先继续游戏')
    if (gomokuState.winner !== null) return toast.show('本局已结束，请重新开局')
    if (gomokuState.turn !== myGomokuIndex) return toast.show(`还没轮到你，等 ${friendName} 落子吧～`)
    if (gomokuState.board[index] !== 0) return
    const board = [...gomokuState.board]
    const piece = myGomokuIndex + 1
    board[index] = piece
    const win = gomokuWinner(board, index, piece)
    const next: CoupleGomokuState = { ...gomokuState, board, winner: win ? myGomokuIndex : null, turn: (1 - myGomokuIndex) as 0 | 1, log: [...gomokuState.log, { at: new Date().toISOString(), text: `${myGomokuIndex === 0 ? '⚫' : '⚪'}${memberName || '我'} 落子 ${Math.floor(index / 15) + 1}行${index % 15 + 1}列${win ? '，五连获胜' : ''}` }] }
    setGomokuSaving(true)
    try {
      await upsertCoupleGomoku(memberId, friendId, next)
      const [a, b] = orderedPair(memberId, friendId)
      setGomokuGame({ member_a: a, member_b: b, state: next, updated_at: new Date().toISOString() })
      if (next.winner !== null) {
        await createCoupleGomokuHistory(memberId, friendId, next)
        toast.show('🏆 恭喜，你赢得了五子棋！')
      } else if (next.turn !== myGomokuIndex) {
        // 对方在线只弹本地 toast，离线才落铃铛（下次登录可见），避免在线时铃铛刷屏
        if (peerOnline) toast.show(`⚫ ${memberName || '我'} 已落子，轮到 ${friendName} 了`)
        else void notifyGomokuTurn(friendId, memberName || '我')
      }
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setGomokuSaving(false)
    }
  }

  /* ------------------------------ 情侣西瓜分操作 ------------------------------ */
  const adjustWatermelonScore = async () => {
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    if (watermelonSaving || watermelonDelta === 0) return toast.show('请先选择加分或减分数值', 'err')
    setWatermelonSaving(true)
    try {
      const fresh = await fetchCoupleWatermelon(memberId, friendId)
      const [memberA, memberB] = orderedPair(memberId, friendId)
      const currentScoreA = fresh?.score_a ?? 0
      const currentScoreB = fresh?.score_b ?? 0
      const nextScoreA = memberA === friendId ? currentScoreA + watermelonDelta : currentScoreA
      const nextScoreB = memberB === friendId ? currentScoreB + watermelonDelta : currentScoreB
      await upsertCoupleWatermelon(memberId, friendId, { scoreA: nextScoreA, scoreB: nextScoreB })
      setWatermelonScore({ member_a: memberA, member_b: memberB, score_a: nextScoreA, score_b: nextScoreB, updated_at: new Date().toISOString() })
      const reason = watermelonReason.trim().slice(0, 80) || (watermelonDelta > 0 ? '加分' : '减分')
      await createCoupleWatermelonLog({
        userA: memberId,
        userB: friendId,
        targetMember: friendId,
        delta: watermelonDelta,
        reason,
        senderId: memberId,
        senderName: memberName || '我',
      })
      void reloadWatermelonLogs()
      // 西瓜分是结果变更通知，不受对局在线分流影响：对方铃铛始终留一条记录。
      await notifyWatermelonScore(friendId, memberName || '我', watermelonDelta, reason)
      toast.show(`🍉 已给 ${friendName} ${watermelonDelta > 0 ? `加 ${watermelonDelta} 分` : `减 ${Math.abs(watermelonDelta)} 分`}：${reason}`)
      setWatermelonDelta(0)
      setWatermelonCustomValue('')
      setWatermelonReason('')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setWatermelonSaving(false)
    }
  }

  /* ------------------------------ 骰子比大小操作 ------------------------------ */
  const startDiceGame = async () => {
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    const myName = memberName || '我'
    const names: [string, string] = memberId < friendId ? [myName, friendName] : [friendName, myName]
    const state: CoupleDiceState = {
      banker: 0,
      dices: null,
      bets: [null, null],
      chips: [100, 100],
      round: 1,
      rolling: false,
      lastResult: null,
      log: [
        {
          at: new Date().toISOString(),
          text: `🎲 骰子比大小开局：初始各 100 筹码，${names[0]} 担任第一轮庄家`,
        },
      ],
    }
    setDiceSaving(true)
    try {
      await upsertCoupleDice(memberId, friendId, state)
      const [a, b] = orderedPair(memberId, friendId)
      setDiceGame({ member_a: a, member_b: b, state, updated_at: new Date().toISOString() })
      toast.show('🎲 骰子比大小已开局，闲家请押大或押小')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setDiceSaving(false)
    }
  }

  const placeDiceBet = async (choice: 'small' | 'big') => {
    if (!diceGame || !diceState || !memberId || !friendId || diceSaving) return
    const isBanker = diceState.banker === myDiceIndex
    if (isBanker) return toast.show('你是当前庄家，由对方（闲家）押注大小～', 'err')
    const bets = [...diceState.bets] as [DiceBetChoice, DiceBetChoice]
    bets[myDiceIndex] = choice
    const state: CoupleDiceState = {
      ...diceState,
      bets,
      log: [
        ...diceState.log,
        {
          at: new Date().toISOString(),
          text: `🎯 ${memberName || '我'} 押了【${choice === 'small' ? '小（4~10点）' : '大（11~17点）'}】（底注 10 筹码）`,
        },
      ],
    }
    setDiceSaving(true)
    try {
      await upsertCoupleDice(memberId, friendId, state)
      const [a, b] = orderedPair(memberId, friendId)
      setDiceGame({ member_a: a, member_b: b, state, updated_at: new Date().toISOString() })
      setMyDiceBet(choice)
      toast.show(`已押【${choice === 'small' ? '小' : '大'}】，请等待庄家摇骰开盅`)
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setDiceSaving(false)
    }
  }

  const rollDiceAction = async () => {
    if (!diceGame || !diceState || !memberId || !friendId || diceSaving) return
    const isBanker = diceState.banker === myDiceIndex
    if (!isBanker) return toast.show('只有庄家可以摇骰开盅哦～', 'err')
    const playerIndex = (1 - diceState.banker) as 0 | 1
    const playerBet = diceState.bets[playerIndex]
    if (!playerBet) return toast.show(`请等待 ${friendName}（闲家）先押大或押小～`)

    // 生成 3 个随机骰子 (1~6)
    const d1 = Math.floor(Math.random() * 6) + 1
    const d2 = Math.floor(Math.random() * 6) + 1
    const d3 = Math.floor(Math.random() * 6) + 1
    const sum = d1 + d2 + d3
    const isTriple = d1 === d2 && d2 === d3
    const outcome: 'small' | 'big' | 'triple' = isTriple ? 'triple' : sum <= 10 ? 'small' : 'big'

    const chips = [...diceState.chips] as [number, number]
    const BET_AMOUNT = 10
    let winnerDesc = ''

    if (isTriple) {
      // 围骰 / 全骰：庄家通吃，无论闲家押大押小均判输
      chips[playerIndex] = Math.max(0, chips[playerIndex] - BET_AMOUNT)
      chips[diceState.banker] += BET_AMOUNT
      winnerDesc = `🎲 围骰（${d1}-${d2}-${d3}，${sum}点）！庄家通吃，闲家 -${BET_AMOUNT} 筹码`
    } else if (outcome === playerBet) {
      // 预测正确：1:1 赔率，闲家获双倍返还（净赚 10 筹码）
      chips[playerIndex] += BET_AMOUNT
      chips[diceState.banker] = Math.max(0, chips[diceState.banker] - BET_AMOUNT)
      winnerDesc = `🎉 开出 ${outcome === 'small' ? '小' : '大'}（${d1}+${d2}+${d3}=${sum}点），闲家预测正确净赢 +${BET_AMOUNT} 筹码`
    } else {
      // 预测错误：筹码归庄家
      chips[playerIndex] = Math.max(0, chips[playerIndex] - BET_AMOUNT)
      chips[diceState.banker] += BET_AMOUNT
      winnerDesc = `❌ 开出 ${outcome === 'small' ? '小' : '大'}（${d1}+${d2}+${d3}=${sum}点），闲家猜错筹码归庄家`
    }

    // 庄家轮换
    const nextBanker = (1 - diceState.banker) as 0 | 1
    const nextState: CoupleDiceState = {
      banker: nextBanker,
      dices: [d1, d2, d3],
      bets: [null, null],
      chips,
      round: diceState.round + 1,
      rolling: false,
      lastResult: {
        dices: [d1, d2, d3],
        sum,
        isTriple,
        outcome,
        winnerDesc,
      },
      log: [
        ...diceState.log,
        {
          at: new Date().toISOString(),
          text: `第${diceState.round}轮：${d1}, ${d2}, ${d3}（${sum}点 ${isTriple ? '围骰' : outcome === 'small' ? '小' : '大'}）-> ${winnerDesc}`,
        },
      ],
    }

    setDiceSaving(true)
    try {
      await upsertCoupleDice(memberId, friendId, nextState)
      const [a, b] = orderedPair(memberId, friendId)
      setDiceGame({ member_a: a, member_b: b, state: nextState, updated_at: new Date().toISOString() })
      setMyDiceBet(null)

      // 一方筹码耗尽 → 本局结束：只在此时把整局过程归档一次，普通每轮摇骰不写历史
      if (nextState.chips[0] === 0 || nextState.chips[1] === 0) {
        const loser = nextState.chips[0] === 0 ? 0 : 1
        const finalState: CoupleDiceState = {
          ...nextState,
          log: [
            ...nextState.log,
            {
              at: new Date().toISOString(),
              text: `🏁 本局结束：${diceNames?.[loser] ?? (loser === 0 ? '红方' : '蓝方')} 筹码耗尽，共进行 ${nextState.round - 1} 轮`,
            },
          ],
        }
        await createCoupleDiceHistory(memberId, friendId, finalState)
        await deleteCoupleDice(memberId, friendId)
        setDiceGame(null)
        toast.show('🏁 一方筹码耗尽，本局已归档到历史，可以开新一局啦')
      }
      void reloadDiceHistory()

      if (peerOnline) {
        toast.show(`🎲 开出 ${sum}点（${d1}-${d2}-${d3}）！${winnerDesc}`)
      } else {
        await notifyDiceRoll(friendId, memberName || '我')
        toast.show(`🎲 已摇出 ${sum}点！对方上线后会收到提醒`)
      }
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setDiceSaving(false)
    }
  }

  /** 手动结束本局：先把整局过程归档一条历史，再销毁当前对局（筹码未耗尽也可以收局） */
  const endDiceGame = async () => {
    if (!diceState || !memberId || !friendId || diceSaving) return
    if (!window.confirm('结束本局并把整局过程归档到历史？之后可以重新开局。')) return
    setDiceSaving(true)
    try {
      const finalState: CoupleDiceState = {
        ...diceState,
        log: [
          ...diceState.log,
          {
            at: new Date().toISOString(),
            text: `🏁 手动结束本局：共进行 ${Math.max(0, diceState.round - 1)} 轮，最终筹码 ❤️ ${diceState.chips[0]} / 💙 ${diceState.chips[1]}`,
          },
        ],
      }
      await createCoupleDiceHistory(memberId, friendId, finalState)
      await deleteCoupleDice(memberId, friendId)
      setDiceGame(null)
      setMyDiceBet(null)
      void reloadDiceHistory()
      toast.show('🏁 本局已结束并归档到历史')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setDiceSaving(false)
    }
  }

  /* ------------------------------ 重要日倒计时 ------------------------------ */

  /** 保存倒计时清单（双方共用一份，谁改都能存） */
  const saveCountdownItems = async (items: CoupleCountdownItem[]) => {
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    setCountdownSaving(true)
    try {
      const state: CoupleCountdownState = { items }
      await upsertCoupleCountdown(memberId, friendId, state)
      const [a, b] = orderedPair(memberId, friendId)
      setCountdownGame({ member_a: a, member_b: b, state, updated_at: new Date().toISOString() })
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setCountdownSaving(false)
    }
  }

  const addCountdown = async () => {
    const title = countdownTitle.trim()
    if (!title) return toast.show('请填写重要日名称，比如「领证纪念日」', 'err')
    if (!countdownDate) return toast.show('请选择目标日期', 'err')
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    const items = [...(countdownGame?.state.items ?? []), {
      id: crypto.randomUUID(),
      title,
      date: countdownDate,
      emoji: countdownEmoji.trim() || '📅',
      created_by: myId,
    }].sort((x, y) => x.date.localeCompare(y.date))
    await saveCountdownItems(items)
    setCountdownTitle('')
    setCountdownDate('')
    setCountdownEmoji('')
    toast.show('⏳ 重要日已添加')
  }

  const removeCountdown = async (id: string) => {
    if (!window.confirm('确定删除这个重要日吗？')) return
    await saveCountdownItems((countdownGame?.state.items ?? []).filter((item) => item.id !== id))
  }

  /* ------------------------------ 情侣刮刮乐 ------------------------------ */

  /** 抽一张只属于自己的新卡：约 1/3 概率谢谢惠顾，其余随机甜蜜奖励；抽卡动作不进记录 */
  const drawScratchCard = async () => {
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    if (scratchSaving) return
    const mine = scratchGame?.state.cards?.[myId]
    const today = scratchDay(new Date().toISOString())
    if (mine && !mine.revealed_at) return toast.show('先把当前这张刮开再抽新的吧～')
    if (mine && (scratchDay(mine.created_at) === today || (mine.revealed_at && scratchDay(mine.revealed_at) === today))) {
      return toast.show('今天已经刮过啦，明天再来吧～')
    }
    setScratchSaving(true)
    try {
      const miss = SCRATCH_PRIZES.filter((p) => p.startsWith('谢谢惠顾'))
      const prizes = SCRATCH_PRIZES.filter((p) => !p.startsWith('谢谢惠顾'))
      // 中奖率约 80%，谢谢惠顾约 20%
      const prize = Math.random() < 0.20 ? miss[Math.floor(Math.random() * miss.length)] : prizes[Math.floor(Math.random() * prizes.length)]
      const at = new Date().toISOString()
      const card: CoupleScratchCard = { id: crypto.randomUUID(), prize, created_by: myId, created_at: at, revealed_at: null, revealed_by: null }
      const state: CoupleScratchState = {
        cards: { ...(scratchGame?.state.cards ?? {}), [myId]: card },
        log: scratchGame?.state.log ?? [],
      }
      await upsertCoupleScratch(memberId, friendId, state)
      const [a, b] = orderedPair(memberId, friendId)
      setScratchGame({ member_a: a, member_b: b, state, updated_at: at })
      toast.show('🎫 新卡已就绪，用手指刮开吧')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setScratchSaving(false)
    }
  }

  /** 刮开自己的卡揭晓：刮到一半以上自动触发；记录里写「谁刮的 + 结果」，结果双方可见 */
  const revealScratch = async () => {
    const card = scratchGame?.state.cards?.[myId]
    if (!card || card.revealed_at || !memberId || !friendId || scratchSaving) return
    setScratchSaving(true)
    try {
      const at = new Date().toISOString()
      const state: CoupleScratchState = {
        cards: { ...(scratchGame?.state.cards ?? {}), [myId]: { ...card, revealed_at: at, revealed_by: myId } },
        log: [...(scratchGame?.state.log ?? []), { at, text: `${memberName || '我'} 刮了刮刮乐：${card.prize.startsWith('谢谢惠顾') ? '谢谢惠顾，没刮中～' : `刮中了「${card.prize}」`}` }].slice(-20),
      }
      await upsertCoupleScratch(memberId, friendId, state)
      const [a, b] = orderedPair(memberId, friendId)
      setScratchGame({ member_a: a, member_b: b, state, updated_at: at })
      void notifyScratchRevealed(friendId, memberName || '我', card.prize)
      toast.show(card.prize.startsWith('谢谢惠顾') ? `🎫 ${card.prize}` : `🎉 刮中了「${card.prize}」！`)
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setScratchSaving(false)
    }
  }

  /** 结束本局摆方：销毁数据库与本地数据，之后可重新开一局 */
  const endWufuGame = async () => {
    if (!wufuGame || !memberId || !friendId) return
    if (!window.confirm('是否结束？\n本局摆方将被销毁（数据库和本地不再保留这局数据），确认后可以重新开一局。')) return
    setWufuSaving(true)
    try {
      await deleteCoupleWufu(memberId, friendId)
      setWufuGame(null)
      setWufuSelected(null)
      toast.show('本局已销毁，重新开一局吧')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setWufuSaving(false)
    }
  }

  /** 投降认输：把整局存档为对局历史（含投降标记），再销毁当前棋局 */
  const surrenderWufuGame = async () => {
    if (!wufuState || !wufuGame || !memberId || !friendId || wufuSaving) return
    if (wufuState.winner !== null) return toast.show('本局已有结果，无需再投降～')
    if (!window.confirm('🏳️ 认输后本局会保存进「摆方对局历史」并结束棋局，确定要投降吗？')) return
    setWufuSaving(true)
    try {
      const state: CoupleWufuState = {
        ...wufuState,
        winner: (1 - myWufuIndex) as 0 | 1,
        log: [...wufuState.log, { at: new Date().toISOString(), text: `🏳️${memberName || '我'} 主动投降认输，${friendName} 获胜` }],
      }
      await createCoupleWufuHistory(memberId, friendId, state)
      await deleteCoupleWufu(memberId, friendId)
      setWufuGame(null)
      setWufuSelected(null)
      void reloadWufuHistory()
      toast.show('🏳️ 已投降并存档本局，重新开一局吧')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setWufuSaving(false)
    }
  }

  /** 暂停/继续棋局：暂停时前端停止网络轮询与实时订阅（省流量） */
  const toggleWufuPause = async () => {
    if (!wufuState || !wufuGame || !memberId || !friendId || wufuSaving) return
    if (wufuState.winner !== null) return toast.show('本局已结束，无需暂停～')
    const willPause = !wufuState.paused
    const next: CoupleWufuState = {
      ...wufuState,
      paused: willPause,
      log: willPause
        ? [...wufuState.log, { at: new Date().toISOString(), text: `⏸️${memberName || '我'} 暂停棋局（等待对方继续）` }]
        : wufuState.log,
    }
    setWufuSaving(true)
    try {
      await upsertCoupleWufu(memberId, friendId, next)
      const [memberA, memberB] = orderedPair(memberId, friendId)
      setWufuGame({ member_a: memberA, member_b: memberB, state: next, updated_at: new Date().toISOString() })
      toast.show(willPause ? '⏸️ 已暂停：网络轮询已停止，点「继续游戏」恢复' : '▶️ 已继续对局')
      // 继续时主动拉一次最新棋局（对方暂停期间可能已有动作）
      if (!willPause) void reloadWufu(true)
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setWufuSaving(false)
    }
  }

  // 我选中的棋子若已不在棋盘（被提走 / 棋局更新 / 本局结束），自动取消选子
  useEffect(() => {
    if (wufuSelected === null) return
    if (!wufuState || wufuState.board[wufuSelected] !== myWufuPiece || wufuState.winner !== null) setWufuSelected(null)
  }, [wufuState, wufuSelected, myWufuPiece])

  // 成项棋形的高亮 1.8 秒后自动消退
  useEffect(() => {
    if (!wufuFlash) return
    const timer = window.setTimeout(() => setWufuFlash(null), 1800)
    return () => window.clearTimeout(timer)
  }, [wufuFlash])

  // 对方行动完轮到我 / 对方成项提子 / 对方获胜时给出提示
  useEffect(() => {
    const prev = prevWufuRef.current
    prevWufuRef.current = wufuState
    if (!wufuState || !prev || !wufuGame) return
    if (wufuState.winner !== null && prev.winner === null) {
      toast.show(wufuState.winner === myWufuIndex ? '🏆 恭喜！你赢了这局摆方！' : `🏳️ ${friendName} 赢了这局摆方，不服再来一局？`)
      return
    }
    if (wufuState.turn === myWufuIndex && prev.turn !== myWufuIndex && wufuState.winner === null) {
      // 「轮到你下摆方」的常驻铃铛提醒已由行动方写入，这里只做页面内轻量 toast
      toast.show(
        activeModule === 'wufu' && document.visibilityState === 'visible'
          ? `♟️ ${friendName} 行动完，轮到你啦！`
          : '♟️ 轮到你下摆方了！去互动空间 → 摆方五福棋继续吧～'
      )
    }
    // 对方的关键动作（成项 / 提我的子 / 逼子）弹出提示，让节奏一目了然
    const freshLogs = wufuState.log.slice(prev.log.length).filter((item) => item.text.includes(friendName))
    const keyLog = freshLogs.find((item) => ['✨', '⚔️', '⚖️'].some((prefix) => item.text.startsWith(prefix)))
    if (keyLog) toast.show(keyLog.text)
  }, [wufuState, wufuGame, myWufuIndex, friendName, activeModule, toast])

  // 对方点完格子轮到我 / 对方通关时弹提醒与奖励
  const prevMinesRef = useRef<CoupleMinesState | null>(null)
  useEffect(() => {
    const prev = prevMinesRef.current
    prevMinesRef.current = minesState
    if (!minesState || !prev || !minesGame) return
    const opponentOpened = minesState.cells
      .map((cell, index) => (cell === MINES_CELL.opened && prev.cells[index] !== MINES_CELL.opened ? index : -1))
      .filter((index) => index >= 0)
    if (opponentOpened.length > 0 && minesState.turn === myMinesIndex) {
      setMinesFlashingCells(new Set(opponentOpened))
      window.setTimeout(() => setMinesFlashingCells(new Set()), 900)
    }
    if (minesState.cleared && !prev.cleared) {
      setMinesReward(minesState.reward)
      // 对方通关落库后实时推送偶发丢失时，这里兜底刷新一次对局历史列表
      void reloadMinesHistory()
      return
    }
    if (
      !minesState.cleared &&
      minesState.turn === myMinesIndex &&
      prev.turn !== myMinesIndex
    ) {
      // 「轮到你拆雷」的常驻铃铛提醒已改由行动方点完格子时直接写入（对方离线也能收到），
      // 这里只负责页面内的轻量 toast 提醒，不再重复写铃铛
      toast.show(
        activeModule === 'mines' && document.visibilityState === 'visible'
          ? `💣 ${friendName} 点完啦，轮到你拆雷了！`
          : `💣 轮到你拆雷了！去互动空间 → 情侣扫雷继续吧～`
      )
    }
    const latestHit = minesState.hits[minesState.hits.length - 1]
    const prevHit = prev.hits[prev.hits.length - 1]
    if (latestHit && prevHit?.at !== latestHit.at && latestHit.player !== myMinesIndex) {
      toast.show(`💣 ${friendName} 踩到地雷！TA 的任务：${latestHit.task}`)
    }
  }, [minesState, minesGame, myMinesIndex, friendName, toast, activeModule, reloadMinesHistory])

  // 五子棋对方端本地提醒：对方在线时不再写铃铛（行动方已按 peerOnline 分流），
  // 这里靠棋局状态变化弹轻量 toast——「对方落子轮到你 / 对方获胜」
  const prevGomokuRef = useRef<CoupleGomokuState | null>(null)
  useEffect(() => {
    const prev = prevGomokuRef.current
    prevGomokuRef.current = gomokuState
    if (!gomokuState || !prev || !gomokuGame) return
    if (gomokuState.winner !== null && prev.winner === null) {
      toast.show(gomokuState.winner === myGomokuIndex ? '🏆 恭喜！你赢得了五子棋！' : `🏳️ ${friendName} 五连获胜，不服再来一局？`)
      return
    }
    if (
      gomokuState.winner === null &&
      gomokuState.turn === myGomokuIndex &&
      prev.turn !== myGomokuIndex
    ) {
      toast.show(
        activeModule === 'gomoku' && document.visibilityState === 'visible'
          ? `⚫ ${friendName} 落子啦，轮到你！`
          : `⚫ 轮到你下五子棋了！去互动空间 → 情侣五子棋继续吧～`
      )
    }
  }, [gomokuState, gomokuGame, myGomokuIndex, friendName, toast, activeModule])

  const submitChoice = (val: string) => {
    const choice = val.trim()
    if (!quiz.question || quiz.revealed || quiz.myChoice || !choice) return
    const previousChoice = quiz.myChoice
    setCustomAnswer(choiceMode === 'custom' ? choice : '')
    setQuiz((prev) => ({ ...prev, myChoice: choice }))
    if (memberId && friendId) {
      void saveCoupleQuizChoice(memberId, friendId, memberId, choice)
        .then(() => fetchCoupleQuiz(memberId, friendId))
        .then((row) => applyQuizRow(row))
        .catch((error: Error) => {
          setQuiz((prev) => ({ ...prev, myChoice: previousChoice }))
          if (!previousChoice) setCustomAnswer('')
          toast.show(error.message, 'err')
        })
    }
  }

  const sendMessage = async () => {
    const text = messageText.trim()
    if (!text) return
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    try {
      const msg = await broadcastCoupleMessage(memberId, friendId, text)
      mergeMessages([msg], key('chat', memberId, friendId))
      // 给对方落一条铃铛提醒：对方离线时，回来登录也能从铃铛看到新留言
      void notifyCoupleChatMessage(friendId, memberName || '我', text)
      setMessageText('')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    }
  }

  // 收到对方新留言：不在留言板模块时弹 toast 提醒（在留言板上时消息实时可见，不打扰）
  const lastPeerMsgIdRef = useRef<string | null>(null)
  useEffect(() => {
    const lastPeer = [...messages].reverse().find((m) => m.sender_id !== myId)
    if (!lastPeer) return
    if (lastPeerMsgIdRef.current === null) {
      // 首次加载：只记录位置，不把历史留言当新消息提醒
      lastPeerMsgIdRef.current = lastPeer.id
      return
    }
    if (lastPeer.id === lastPeerMsgIdRef.current) return
    lastPeerMsgIdRef.current = lastPeer.id
    if (activeModule !== 'chat') {
      toast.show(`💬 ${friendName} 给你留言了：${lastPeer.content.slice(0, 20)}${lastPeer.content.length > 20 ? '…' : ''}`)
    }
  }, [messages, activeModule, friendName, toast, myId])

  const clearMessages = () => {
    setMessages([])
    sessionStorage.removeItem(key('chat', myId, friendId))
    toast.show('已清空本地聊天记录')
  }

  return (
    <div className="space-y-4">
      {/* <div className="min-w-0 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-rose-400 to-orange-300 p-4 text-white shadow-card sm:p-5">
        <div className="text-xs opacity-80">FRIENDSHIP PLAYGROUND</div>
        <h2 className="mt-1 break-words text-xl font-bold">和 {friendName} 的互动空间</h2>
        <p className="mt-1 break-words text-xs opacity-90">把日常、心愿和默契，变成你们的共同回忆。</p>
      </div> */}

      {isAdmin && !memberId && (
        <div className="animate-fade rounded-2xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-700">
          👆 你是管理视角，还没有选定要查看的成员，所以这里暂时没有数据。点右上角「👥 切换」选一个成员，即可像 TA 一样查看这份互动空间。
        </div>
      )}

      {!activeModule ? (
        <CoupleModuleGrid
          modules={[
            { id: 'love', icon: '💌', title: '今日情话', detail: loveUnlocked ? '今日已解锁' : '完成三餐打卡解锁' },
            { id: 'wish', icon: '🎁', title: '秘密心愿', detail: `${gridCounts.wishes} 个心愿` },
            { id: 'chat', icon: '💬', title: '甜蜜留言', detail: `${gridCounts.messages} 条留言` },
            { id: 'quiz', icon: '💞', title: '同步抉择', detail: `已做 ${gridCounts.quizDone}/${quizTotalQuestions.length} 题` },
            { id: 'truth', icon: '🎲', title: '真心话大冒险', detail: `已答 ${gridCounts.truthDone}/${truthPromptPool.length} 题` },
            { id: 'board', icon: '🎯', title: '情侣飞行棋', detail: '联网轮流掷骰对战' },
            { id: 'mines', icon: '💣', title: '情侣扫雷', detail: '轮流拆雷，踩雷做任务' },
            { id: 'wufu', icon: '♟️', title: '摆方五福棋', detail: '摆子提子走子，吃到剩2子' },
            { id: 'gomoku', icon: '⚫', title: '情侣五子棋', detail: '联网轮流落子，五连获胜' },
            { id: 'watermelon', icon: '🍉', title: '情侣西瓜分', detail: '给 TA 加减分，看专属甜蜜分变化' },
            { id: 'dice', icon: '🎲', title: '骰子比大小', detail: '3个骰子押大小，围骰庄家通吃' },
            { id: 'countdown', icon: '⏳', title: '重要日倒计时', detail: '纪念日、生日倒数还有多少天' },
            {
              id: 'wedding',
              icon: '💍',
              title: '备婚流程',
              detail: weddingDoneCount ? `已完成 ${weddingDoneCount}/${WEDDING_TOTAL} 步` : `从定心意到结完婚共 ${WEDDING_TOTAL} 步`,
            },
            { id: 'scratch', icon: '🎫', title: '情侣刮刮乐', detail: '刮开卡片赢甜蜜奖励' },
          ]}
          isEnabled={isEnabled}
          onSelect={setActiveModule}
        />
      ) : (
        <>
          <button type="button" className="btn-ghost w-full" onClick={() => setActiveModule(null)}>← 返回互动入口</button>
          {activeModule === 'truth' && (
            <section id="couple-active-module" className={`card space-y-4${moduleFocus ? ' module-focus' : ''}`}>
              <div>
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">🎲真心话大冒险</h3>
                    <p className="text-xs text-slate-400">真心话要写下答案；题目和答案都会留档。</p>
                  </div>
                  <span className="chip shrink-0 border-rose-200 bg-rose-50 text-rose-600">
                    已答 {truthDoneCount}/{truthPromptPool.length}
                  </span>
                </div>
                {/* 答题进度条：已答过的题不再重复出现，全部答完后从头再来 */}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-400 transition-all duration-500"
                    style={{ width: `${(truthDoneCount / truthPromptPool.length) * 100}%` }}
                  />
                </div>
              </div>
              {truthDraw ? (
                <div className="space-y-3 rounded-2xl bg-rose-50 p-4">
                  <span className={`chip ${truthDraw.type === 'truth' ? 'border-rose-200 bg-white text-rose-600' : 'border-orange-200 bg-white text-orange-600'}`}>
                    {truthDraw.type === 'truth' ? '💬真心话' : '🔥大冒险'}
                  </span>
                  <p className="break-words text-sm font-semibold leading-relaxed text-rose-700">{truthDraw.prompt}</p>
                  {truthDraw.type === 'truth' ? (
                    <>
                      <textarea
                        className="input min-h-[72px] resize-y"
                        placeholder="写下你的真心话答案…"
                        maxLength={300}
                        value={truthAnswer}
                        onChange={(e) => setTruthAnswer(e.target.value)}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button className="btn-ghost" disabled={truthSubmitting} onClick={() => { setTruthDraw(null); setTruthAnswer('') }}>跳过这题</button>
                        <button
                          className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={truthSubmitting || !truthAnswer.trim()}
                          onClick={() => void submitTruthAnswer()}
                        >
                          {truthSubmitting ? '提交中…' : '提交答案'}
                        </button>
                      </div>
                      <p className="text-center text-[11px] text-slate-400">提交后对方会收到通知，并在下面的记录里看到</p>
                    </>
                  ) : (
                    <button className="btn-ghost w-full" onClick={() => setTruthDraw(null)}>完成啦 / 再来一个</button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-soft" onClick={drawTruth}>抽真心话</button>
                  <button className="btn-primary" onClick={() => void drawDare()}>抽大冒险</button>
                </div>
              )}
              {(() => {
                const isTruthBank = bankKind === 'truth'
                // const bank = isTruthBank ? truthPromptBank : darePromptBank
                const text = isTruthBank ? truthPromptText : darePromptText
                const saving = isTruthBank ? truthPromptSaving : darePromptSaving
                /* 自定义题在「对方抽到」之前不公开：
                   只有出现在记录里的题才显示题面，没被抽到的一律不露内容，
                   双方抽题都保留悬念；自己新加的题留一条遮罩，方便发现写错了能撤回。 */
                // const revealed = bank.filter((item) => usedTruthPrompts.has(item.prompt))
                // const pendingMine = bank.filter((item) => !usedTruthPrompts.has(item.prompt) && item.created_by === memberId)
                // const pendingPeer = bank.length - revealed.length - pendingMine.length
                return (
                  <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-600">加入你们的题库</div>
                    <p className="text-[11px] leading-relaxed text-slate-400">
                      你出的题只有 TA 能抽到，你不会抽到自己出的题。
                    </p>
                    {/* 两个题库共用一块面板，用分段按钮切换要维护的题库 */}
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-white p-1">
                      <button
                        type="button"
                        className={`rounded-md py-1 text-[11px] transition ${isTruthBank ? 'bg-rose-50 font-semibold text-rose-600' : 'text-slate-400'}`}
                        onClick={() => setBankKind('truth')}
                      >
                        💬 真心话 {truthPromptBank.length}
                      </button>
                      <button
                        type="button"
                        className={`rounded-md py-1 text-[11px] transition ${!isTruthBank ? 'bg-orange-50 font-semibold text-orange-600' : 'text-slate-400'}`}
                        onClick={() => setBankKind('dare')}
                      >
                        🔥 大冒险 {darePromptBank.length}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        className="input min-w-0 flex-1"
                        maxLength={300}
                        value={text}
                        onChange={(e) => (isTruthBank ? setTruthPromptText(e.target.value) : setDarePromptText(e.target.value))}
                        placeholder={isTruthBank ? '写一道只有你们懂的题…' : '写一个想让 TA 完成的小挑战…'}
                      />
                      <button
                        className="btn-primary shrink-0 px-3"
                        disabled={saving || !text.trim()}
                        onClick={() => void (isTruthBank ? addTruthPrompt() : addDarePrompt())}
                      >
                        {saving ? '保存中…' : '加入'}
                      </button>
                    </div>
                    {/* {bank.length === 0 ? (
                      <p className="text-[11px] text-slate-400">这个题库还是空的，加入第一道吧～</p>
                    ) : (
                      <div className="space-y-1 text-[11px] text-slate-500">
                        {revealed.map((item) => {
                          const fromMe = item.created_by === memberId
                          return (
                            <div key={item.id} className="flex items-start gap-2 rounded-lg bg-white p-2">
                              <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${fromMe ? 'bg-rose-50 text-rose-500' : 'bg-brand-50 text-brand-600'}`}>
                                {fromMe ? '我出的' : 'TA 出的'}
                              </span>
                              <span className="min-w-0 flex-1 break-words">{item.prompt}</span>
                              <button className="shrink-0 text-rose-500" onClick={() => void (isTruthBank ? removeTruthPrompt(item.id) : removeDarePrompt(item.id))}>删除</button>
                            </div>
                          )
                        })}
                        {pendingMine.map((item) => (
                          <div key={item.id} className="flex items-start gap-2 rounded-lg bg-white p-2">
                            <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-400">🔒 待揭晓</span>
                            <span className="min-w-0 flex-1 text-slate-400">你出的题，等 TA 抽到后才公开</span>
                            <button className="shrink-0 text-rose-500" onClick={() => void (isTruthBank ? removeTruthPrompt(item.id) : removeDarePrompt(item.id))}>删除</button>
                          </div>
                        ))}
                        {pendingPeer > 0 && (
                          <p className="text-[10px] text-slate-400">还有 {pendingPeer} 道 TA 出的题，等你抽到后揭晓</p>
                        )}
                      </div>
                    )} */}
                  </div>
                )
              })()}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-600">我们的记录</h4>
                  <span className="chip border-slate-200 bg-slate-50 text-slate-500">{truthHistory.length} 条</span>
                </div>
                <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                  {truthHistory.length === 0 && <p className="py-4 text-center text-xs text-slate-400">还没有记录，抽一题试试吧～</p>}
                  {truthHistory.slice(truthHistoryPage * HISTORY_PAGE_SIZE, (truthHistoryPage + 1) * HISTORY_PAGE_SIZE).map((row) => {
                    const isMine = row.sender_id === memberId
                    return (
                      <div key={row.id} className="rounded-xl bg-white p-3 text-xs shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-600">{isMine ? '我' : row.sender_name || friendName}</span>
                          <span className={`chip shrink-0 ${row.type === 'truth' ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-orange-200 bg-orange-50 text-orange-600'}`}>
                            {row.type === 'truth' ? '真心话' : '大冒险'}
                          </span>
                        </div>
                        <p className="mt-1 break-words font-medium text-slate-700">{row.prompt}</p>
                        {row.type === 'truth' && (
                          <p className="mt-1 break-words rounded-lg bg-rose-50/70 p-2 text-rose-700">{row.answer ?? '（还没作答）'}</p>
                        )}
                        <p className="mt-1 text-[10px] text-slate-400">{new Date(row.created_at).toLocaleString('zh-CN')}</p>
                      </div>
                    )
                  })}
                </div>
                <HistoryPager page={truthHistoryPage} total={truthHistory.length} onChange={setTruthHistoryPage} />
              </div>
            </section>
          )}
          {activeModule === 'board' && (
            <section id="couple-active-module" className={`card space-y-4${moduleFocus ? ' module-focus' : ''}`}>
              <div>
                <h3 className="font-semibold">🎯情侣飞行棋</h3>
                <p className="text-xs text-slate-400">联网对战，先到终点者获胜。</p>
              </div>
              {!boardLoaded ? (
                <p className="py-6 text-center text-sm text-slate-400">棋局加载中…</p>
              ) : !boardGame || boardSetup || boardGame.state.winner !== null ? (
                <>
                  {boardGame && boardGame.state.winner !== null && (
                    <div className="rounded-2xl bg-amber-50 p-4 text-center text-sm font-semibold text-amber-700">
                      🎉 上一局 {boardNames?.[boardGame.state.winner] ?? ''} 获胜！
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-slate-500">
                      棋盘格数
                      <select
                        className="input mt-1"
                        value={boardSizeCustom ? 'custom' : String(boardSize)}
                        onChange={(event) => {
                          if (event.target.value === 'custom') setBoardSizeCustom(true)
                          else {
                            setBoardSizeCustom(false)
                            setBoardSize(Number(event.target.value))
                          }
                        }}
                      >
                        <option value={20}>20 格</option>
                        <option value={30}>30 格</option>
                        <option value={40}>40 格</option>
                        <option value={50}>50 格</option>
                        <option value="custom">自定义…</option>
                      </select>
                      {boardSizeCustom && (
                        <input
                          type="number"
                          min={10}
                          max={100}
                          className="input mt-1"
                          value={boardSize}
                          onChange={(event) => setBoardSize(Number(event.target.value) || 10)}
                        />
                      )}
                      {boardSizeCustom && <span className="mt-0.5 block text-[10px] text-slate-400">格数范围 10～100</span>}
                    </label>
                    <label className="text-xs text-slate-500">
                      每次最少步数
                      <select
                        className="input mt-1"
                        value={boardStepMinCustom ? 'custom' : String(boardStepMin)}
                        onChange={(event) => {
                          if (event.target.value === 'custom') {
                            setBoardStepMinCustom(true)
                            if (!boardStepMinCustomValue) setBoardStepMinCustomValue(String(boardStepMin))
                          } else {
                            setBoardStepMinCustom(false)
                            setBoardStepMin(Number(event.target.value))
                          }
                        }}
                      >
                        {[1, 2, 3, 4, 5, 6].map((value) => (
                          <option key={value} value={value}>{value} 步</option>
                        ))}
                        <option value="custom">自定义…</option>
                      </select>
                      {boardStepMinCustom && (
                        <>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            className="input mt-1"
                            value={boardStepMinCustomValue}
                            onChange={(event) => setBoardStepMinCustomValue(event.target.value)}
                          />
                          <span className="mt-0.5 block text-[10px] text-slate-400">步数范围 1～20，且不能大于最多步数</span>
                        </>
                      )}
                    </label>
                    <label className="text-xs text-slate-500">
                      每次最多步数
                      <select
                        className="input mt-1"
                        value={boardStepMaxCustom ? 'custom' : String(boardStepMax)}
                        onChange={(event) => {
                          if (event.target.value === 'custom') {
                            setBoardStepMaxCustom(true)
                            if (!boardStepMaxCustomValue) setBoardStepMaxCustomValue(String(boardStepMax))
                          } else {
                            setBoardStepMaxCustom(false)
                            setBoardStepMax(Number(event.target.value))
                          }
                        }}
                      >
                        {[2, 3, 4, 5, 6, 8, 10].map((value) => (
                          <option key={value} value={value}>{value} 步</option>
                        ))}
                        <option value="custom">自定义…</option>
                      </select>
                      {boardStepMaxCustom && (
                        <>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            className="input mt-1"
                            value={boardStepMaxCustomValue}
                            onChange={(event) => setBoardStepMaxCustomValue(event.target.value)}
                          />
                          <span className="mt-0.5 block text-[10px] text-slate-400">步数范围 1～20，且不能小于最少步数</span>
                        </>
                      )}
                    </label>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">✨自定义格子内容（每行一条，私密内容由你们自己定）</label>
                    <textarea
                      className="input min-h-[72px] resize-y text-xs"
                      placeholder={'例如：\n给对方一个撒娇的拥抱\n一起看一集喜欢的剧\n（留空则只用默认内容池）'}
                      maxLength={2000}
                      value={boardCustomText}
                      onChange={(e) => setBoardCustomText(e.target.value)}
                    />
                    {/* <p className="text-[10px] leading-relaxed text-slate-400">
                      自定义内容只保存在你的设备上，随生成棋盘一起生效并同步给对方；去重后最多 100 条。
                    </p> */}
                  </div>
                  <button className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40" disabled={boardSaving} onClick={() => void startBoardGame()}>
                    {boardSaving ? '生成中…' : boardGame ? '生成新棋盘并开始' : '生成棋盘并开始'}
                  </button>
                  {boardGame && boardGame.state.winner === null && (
                    <button className="btn-ghost w-full" onClick={() => setBoardSetup(false)}>返回当前棋局</button>
                  )}
                  <p className="text-center text-[11px] leading-relaxed text-slate-400">
                    开局双方各掷一次骰子定先手；格子任务做给对方，🎁福利自己享受。
                  </p>
                </>
              ) : boardState ? (
                <>
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-brand-50 px-3 py-2 text-xs text-brand-700">
                    <span className="min-w-0 flex-1 truncate">❤️ {boardNames?.[0]} · {boardState.positions[0] + 1} 格{boardState.penalty?.[0] ? ' ⛓️' : ''}</span>
                    <span className="shrink-0 font-semibold">
                      {boardState.winner !== null
                        ? `🎉${boardNames?.[boardState.winner] ?? ''}获胜！`
                        : boardState.turn === myBoardIndex
                          ? '轮到你掷骰'
                          : `等待 ${friendName} 掷骰…`}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right">💙 {boardNames?.[1]} · {boardState.positions[1] + 1} 格{boardState.penalty?.[1] ? ' ⛓️' : ''}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {boardState.cells.map((cell, index) => {
                      const positionA = Math.min(boardState.positions[0], boardState.size - 1)
                      const positionB = Math.min(boardState.positions[1], boardState.size - 1)
                      const special = cell.kind !== 'start' && cell.kind !== 'end'
                      return (
                        <div key={index} title={cell.text} className={`flex aspect-square flex-col items-center justify-center rounded-md text-[10px] text-slate-500 ring-1 ${special ? 'bg-amber-50 ring-amber-200' : 'bg-emerald-50 ring-emerald-100'}`}>
                          <div className="break-words px-0.5 text-center leading-tight">
                            {positionA === index && <span aria-label="红棋" className="mr-0.5">❤️</span>}
                            {positionB === index && <span aria-label="蓝棋" className="mr-0.5">💙</span>}
                            {positionA !== index && positionB !== index && (index === boardState.size - 1 ? '终点' : index === 0 ? '起点' : index + 1)}
                          </div>
                          {special && <span>{BOARD_CELL_META[cell.kind as BoardCellKind].icon}</span>}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex flex-wrap gap-1 text-[11px] text-slate-500">
                    {[...new Set(boardState.cells.map((cell) => cell.kind))]
                      .filter((kind) => kind !== 'start' && kind !== 'end')
                      .map((kind) => (
                        <span key={kind} className="chip border-amber-200 bg-amber-50 text-amber-700">
                          {BOARD_CELL_META[kind as BoardCellKind].icon}
                          {BOARD_CELL_META[kind as BoardCellKind].label}
                        </span>
                      ))}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    <LogList
                      items={[...boardState.log].reverse().map((item) => item.text)}
                      page={boardLogPage}
                      onPage={setBoardLogPage}
                      empty="还没有动态，掷骰开始吧～"
                    />
                  </div>
                  {boardState.dice !== null && <p className="text-center text-sm text-brand-600">上次掷出 {boardState.dice} 点</p>}
                  {boardState.pending && (
                    <div className="space-y-2 rounded-2xl bg-rose-50 p-3">
                      <p className="break-words text-sm font-semibold leading-relaxed text-rose-700">
                        💬 {boardState.pending.player === myBoardIndex ? '轮到你回答真心话' : `${friendName} 正在回答真心话`}：「{boardState.pending.prompt}」
                      </p>
                      {boardState.pending.player === myBoardIndex && (
                        <>
                          <textarea
                            className="input min-h-[60px] resize-y"
                            placeholder="写下你的答案…"
                            maxLength={300}
                            value={boardTruthAnswer}
                            onChange={(e) => setBoardTruthAnswer(e.target.value)}
                          />
                          <button
                            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={boardSaving || !boardTruthAnswer.trim()}
                            onClick={() => void submitBoardTruth()}
                          >
                            提交答案
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {boardState.winner === null && (
                    <button
                      className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={boardState.turn !== myBoardIndex || boardSaving || Boolean(boardState.pending) || Boolean(boardState.gamePaused)}
                      onClick={() => void rollBoardDice()}
                    >
                      {boardState.gamePaused
                        ? '⏸️ 本局已暂停'
                        : boardState.turn === myBoardIndex
                          ? boardSaving
                            ? '掷骰中…'
                            : boardState.paused[myBoardIndex] > 0
                              ? '掷骰子（本回合暂停）'
                              : '掷骰子'
                          : `等待 ${friendName} 掷骰…`}
                    </button>
                  )}
                  {boardState.gamePaused && boardState.winner === null && (
                    <div className="rounded-2xl bg-amber-50 p-3 text-center text-xs leading-relaxed text-amber-700">
                      ⏸️ 本局已暂停：双方可以去做别的，棋局不再频繁同步（省流量）；回来点「继续游戏」接着玩。
                    </div>
                  )}
                  {boardState.winner === null && (
                    <div className="grid grid-cols-2 gap-2">
                      <button className="btn-ghost" disabled={boardSaving} onClick={() => void toggleBoardPause()}>
                        {boardState.gamePaused ? '▶️ 继续游戏' : '⏸️ 暂停'}
                      </button>
                      <button className="btn-ghost text-rose-600" disabled={boardSaving} onClick={() => void endBoardGame()}>
                        重新设置棋盘
                      </button>
                    </div>
                  )}
                </>
              ) : null}

              {/* 对局历史：每局的过程、输出信息和结果都可回看 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-600">📜对局历史</h4>
                  <span className="chip border-slate-200 bg-slate-50 text-slate-500">{boardHistory.length} 局</span>
                </div>
                {boardHistory.length === 0 && (
                  <p className="rounded-xl bg-slate-50 py-3 text-center text-xs text-slate-400">还没有打完的棋局，先来一局吧～</p>
                )}
                {boardHistory.slice(boardHistoryPage * HISTORY_PAGE_SIZE, (boardHistoryPage + 1) * HISTORY_PAGE_SIZE).map((row) => {
                  const winnerId = row.winner === 0 ? row.member_a : row.member_b
                  const winnerName = winnerId === memberId ? memberName || '我' : friendName
                  const loserName = winnerId === memberId ? friendName : memberName || '我'
                  const open = boardHistoryOpenId === row.id
                  return (
                    <div key={row.id} className="rounded-xl bg-slate-50 p-3 text-xs">
                      <button
                        className="flex w-full items-center justify-between gap-2 text-left"
                        onClick={() => {
                          setBoardHistoryOpenId(open ? null : row.id)
                          if (!open) setBoardDetailLogPage(0)
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                          🏁 {winnerName} 胜 {loserName}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-400">
                          {new Date(row.finished_at).toLocaleString('zh-CN')}
                        </span>
                        <span className="shrink-0 text-slate-400">{open ? '收起' : '展开 ▼'}</span>
                      </button>
                      {open && (
                        <div className="mt-2 space-y-2">
                          <p className="text-[11px] text-slate-400">
                            棋盘 {row.state.size} 格 · 步数 {row.state.stepMin}-{row.state.stepMax} · 终局位置 ❤️ {row.state.positions[0] + 1} 格 / 💙 {row.state.positions[1] + 1} 格
                          </p>
                          <div className="rounded-lg bg-white p-2 text-[11px] leading-relaxed text-slate-600">
                            <LogList
                              items={row.state.log.map((item) => item.text)}
                              page={boardDetailLogPage}
                              onPage={setBoardDetailLogPage}
                              empty="本局没有过程记录"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                <HistoryPager page={boardHistoryPage} total={boardHistory.length} onChange={setBoardHistoryPage} />
              </div>
            </section>
          )}

          {activeModule === 'mines' && (
            <section id="couple-active-module" className={`card space-y-4${moduleFocus ? ' module-focus' : ''}`}>
              <div>
                <h3 className="font-semibold">💣情侣扫雷</h3>
                {/* <p className="text-xs text-slate-400">轮流点开格子，踩到雷做任务，点开全部安全格即通关。</p> */}
              </div>
              {!minesLoaded ? (
                <p className="py-6 text-center text-sm text-slate-400">棋局加载中…</p>
              ) : !minesGame || minesGame.state.cleared ? (
                <>
                  {minesGame?.state.cleared && (
                    <div className="rounded-2xl bg-emerald-50 p-4 text-center text-sm leading-relaxed text-emerald-700">
                      🎉 上一局通关成功！<br />解锁奖励：{minesGame.state.reward}
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">棋盘大小</label>
                    <div className="grid grid-cols-2 gap-2">
                      {MINES_PRESETS.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          className={`rounded-xl px-3 py-2 text-xs font-medium ring-1 transition ${
                            minesPresetKey === preset.key
                              ? 'bg-brand-50 text-brand-700 ring-brand-300'
                              : 'bg-white text-slate-500 ring-slate-200'
                          }`}
                          onClick={() => setMinesPresetKey(preset.key)}
                        >
                          {preset.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`rounded-xl px-3 py-2 text-xs font-medium ring-1 transition ${
                          minesPresetKey === 'custom'
                            ? 'bg-brand-50 text-brand-700 ring-brand-300'
                            : 'bg-white text-slate-500 ring-slate-200'
                        }`}
                        onClick={() => setMinesPresetKey('custom')}
                      >
                        自定义…
                      </button>
                    </div>
                    {minesPresetKey === 'custom' && (
                      <div className="space-y-1">
                        <div className="grid grid-cols-3 gap-2">
                          <label className="text-[11px] text-slate-500">行数
                            <input type="number" min={5} max={16} className="input mt-1" value={minesCustomRows} onChange={(e) => setMinesCustomRows(Number(e.target.value) || 5)} />
                          </label>
                          <label className="text-[11px] text-slate-500">列数
                            <input type="number" min={5} max={16} className="input mt-1" value={minesCustomCols} onChange={(e) => setMinesCustomCols(Number(e.target.value) || 5)} />
                          </label>
                          <label className="text-[11px] text-slate-500">雷数
                            <input type="number" min={1} max={72} className="input mt-1" value={minesCustomMines} onChange={(e) => setMinesCustomMines(Number(e.target.value) || 1)} />
                          </label>
                        </div>
                        <p className="text-[10px] leading-relaxed text-slate-400">
                          行列范围 5～16；雷数范围 1～格数×30%（超出会自动收敛），首格周围保证安全。
                        </p>
                      </div>
                    )}
                  </div>
                  <button className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40" disabled={minesSaving} onClick={() => void startMinesGame()}>
                    {minesSaving ? '生成中…' : minesGame ? '重新开一局' : '生成雷区并开始'}
                  </button>
                  <p className="text-center text-[11px] leading-relaxed text-slate-400">
                    开局双方各掷一次骰子定先后；轮流点开一格，数字表示周围地雷数（无雷自动展开相邻格）；
                    双方随时可 🚩 标记疑似地雷（不消耗回合）；踩到 💣 触发互动任务；点开全部安全格即通关解锁奖励。
                  </p>
                </>
              ) : minesState ? (
                <>
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-brand-50 px-3 py-2 text-xs text-brand-700">
                    <span className="min-w-0 flex-1 truncate">❤️ {minesNames?.[0]}</span>
                    <span className="shrink-0 font-semibold">
                      {minesState.turn === myMinesIndex ? '轮到你点开一格' : `等待 ${friendName} 点…`}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right">💙 {minesNames?.[1]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="grid flex-1 grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={`rounded-xl px-3 py-2 text-xs font-medium ring-1 transition ${
                          minesMode === 'open' ? 'bg-brand-50 text-brand-700 ring-brand-300' : 'bg-white text-slate-500 ring-slate-200'
                        }`}
                        onClick={() => setMinesMode('open')}
                      >
                        🔍 打开格子
                      </button>
                      <button
                        type="button"
                        className={`rounded-xl px-3 py-2 text-xs font-medium ring-1 transition ${
                          minesMode === 'flag' ? 'bg-amber-50 text-amber-700 ring-amber-300' : 'bg-white text-slate-500 ring-slate-200'
                        }`}
                        onClick={() => setMinesMode('flag')}
                      >
                        🚩 标记地雷
                      </button>
                    </div>
                    <span className="chip shrink-0 border-rose-200 bg-rose-50 text-rose-600">💣{minesState.hits.length}</span>
                    <span className="chip shrink-0 border-amber-200 bg-amber-50 text-amber-600">
                      🚩{minesState.cells.filter((c) => c === MINES_CELL.flagged).length}
                    </span>
                  </div>
                  <div className="select-none" style={{ display: 'grid', gridTemplateColumns: `repeat(${minesState.cols}, minmax(0, 1fr))`, gap: '0.125rem' }}>
                    {minesState.cells.map((cell, index) => {
                      const isMine = minesState.mines.includes(index)
                      const openedMine = cell === MINES_CELL.opened && isMine
                      const around = cell === MINES_CELL.opened && !isMine ? minesAroundOf(minesState, index) : 0
                      return (
                        <button
                          key={index}
                          type="button"
                          disabled={
                            minesSaving ||
                            (minesMode === 'open' &&
                              (minesState.turn !== myMinesIndex || cell !== MINES_CELL.closed))
                          }
                          onClick={() => void actMinesCell(index)}
                          className={`flex aspect-square items-center justify-center rounded text-[11px] font-bold ring-1 transition ${
                            minesFlashingCells.has(index) ? 'mines-opponent-flash' : ''
                          } ${
                            cell === MINES_CELL.opened
                              ? openedMine
                                ? 'bg-rose-100 text-rose-600 ring-rose-200'
                                : `bg-white ring-slate-100 ${MINES_NUMBER_COLORS[around] ?? 'text-slate-700'}`
                              : cell === MINES_CELL.flagged
                                ? 'bg-amber-50 ring-amber-200'
                                : 'bg-slate-100 ring-slate-200 active:scale-95'
                          }`}
                        >
                          {cell === MINES_CELL.flagged ? '🚩' : cell === MINES_CELL.opened ? (openedMine ? '💣' : around || '') : ''}
                        </button>
                      )
                    })}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    <LogList
                      items={[...minesState.log].reverse().map((item) => item.text)}
                      page={minesLogPage}
                      onPage={setMinesLogPage}
                      empty="还没有动态，翻开第一格吧～"
                    />
                  </div>
                  <button className="btn-ghost w-full text-rose-600" disabled={minesSaving} onClick={() => void endMinesGame()}>
                    结束本局（销毁数据重新设置）
                  </button>
                </>
              ) : null}

              {/* 对局历史：放在对局进行中的分支外面，没开局（或上一局刚通关）时也能回看之前的记录 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-600">📜对局历史</h4>
                  <span className="chip border-slate-200 bg-slate-50 text-slate-500">{minesHistory.length} 局</span>
                </div>
                {minesHistory.length === 0 && (
                  <p className="rounded-xl bg-slate-50 py-3 text-center text-xs text-slate-400">还没有通关的扫雷，先来一局吧～</p>
                )}
                {minesHistory.slice(minesHistoryPage * HISTORY_PAGE_SIZE, (minesHistoryPage + 1) * HISTORY_PAGE_SIZE).map((row) => {
                  const open = minesHistoryOpenId === row.id
                  const hitCount = row.state.hits?.length ?? 0
                  return (
                    <div key={row.id} className="rounded-xl bg-slate-50 p-3 text-xs">
                      <button
                        className="flex w-full items-center justify-between gap-2 text-left"
                        onClick={() => {
                          setMinesHistoryOpenId(open ? null : row.id)
                          if (!open) setMinesDetailLogPage(0)
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                          🎉 通关 · {row.state.rows}×{row.state.cols} · 💣{hitCount}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-400">
                          {new Date(row.finished_at).toLocaleString('zh-CN')}
                        </span>
                        <span className="shrink-0 text-slate-400">{open ? '收起' : '展开 ▼'}</span>
                      </button>
                      {open && (
                        <div className="mt-2 space-y-2">
                          {row.state.reward && (
                            <p className="text-[11px] text-emerald-600">🎁 解锁奖励：{row.state.reward}</p>
                          )}
                          {hitCount > 0 ? (
                            <div className="rounded-lg bg-white p-2 text-[11px] leading-relaxed text-slate-600">
                              <LogList
                                items={row.state.hits.map((h) => `💣 ${h.player === myMinesIndex ? '你' : friendName} 踩雷：${h.task}`)}
                                page={minesDetailLogPage}
                                onPage={setMinesDetailLogPage}
                                empty="本局没有踩雷记录"
                              />
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400">全程零踩雷，默契满分 💯</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                <HistoryPager page={minesHistoryPage} total={minesHistory.length} onChange={setMinesHistoryPage} />
              </div>
            </section>
          )}

          {activeModule === 'wufu' && (
            <section id="couple-active-module" className={`card space-y-4${moduleFocus ? ' module-focus' : ''}`}>
              <div>
                <h3 className="font-semibold">♟️摆方五福棋</h3>
                <p className="text-xs text-slate-400">摆子 → 成项提子 → 走子，把对方吃到只剩 2 子即获胜。</p>
              </div>
              {!wufuLoaded ? (
                <p className="py-6 text-center text-sm text-slate-400">棋局加载中…</p>
              ) : !wufuGame || wufuState?.winner !== null ? (
                <>
                  {wufuState?.winner !== null && wufuNames && (
                    <div className="rounded-2xl bg-brand-50 p-4 text-center text-sm leading-relaxed text-brand-700">
                      {wufuState?.winner === 0
                        ? `🏆 本局 ${wufuNames[0]} 获胜！`
                        : `🏆 本局 ${wufuNames[1]} 获胜！`}
                      <br />
                      <span className="text-xs text-slate-400">不服再来一局？</span>
                    </div>
                  )}
                  <details className="rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-600">📖 怎么玩？</summary>
                    <div className="mt-2 space-y-1">
                      <p>🎲 开局掷骰定先手：先手摆 13 子、后手摆 12 子。</p>
                      <p>📐 摆子：轮流点空点落子，落子成项立刻提对方 1 子。</p>
                      <p>⚖️ 若 25 子摆完双方都没吃子：后手先逼掉对方一子，然后先手开始走子。</p>
                      <p>🚶 走子：棋子沿线走一格到相邻空点，再次成项照样提子。</p>
                      <p>🏆 把对方吃到只剩 2 子，或对方无路可走，即获胜。</p>
                      <p>⚔️ 五种成项棋形（对方已成项的棋子受保护不能提）：</p>
                      <ul className="list-inside list-disc space-y-0.5 pl-2 text-slate-400">
                        <li>通天：5 子斜连，贯穿两条对角</li>
                        <li>大棍（五福）：5 子横或竖连成一条直线</li>
                        <li>四斜：4 子斜连，连接两条相邻边</li>
                        <li>三斜：3 子斜连，连接两条相邻边</li>
                        <li>小方（井口）：4 子组成紧邻的小正方形</li>
                      </ul>
                    </div>
                  </details>
                  <button
                    type="button"
                    className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={wufuSaving}
                    onClick={() => void startWufuGame()}
                  >
                    {wufuSaving ? '生成中…' : wufuGame ? '再来一局' : '掷骰开一局'}
                  </button>

                  {/* 摆方对局历史提前到开始之前/未对局页面，随时可查 */}
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-500">🏛️ 对局历史（{wufuHistory.length}）</h4>
                      {wufuHistory.length > 0 && (
                        <button
                          type="button"
                          className="btn-ghost text-xs text-slate-400"
                          onClick={() => void reloadWufuHistory()}
                        >
                          刷新
                        </button>
                      )}
                    </div>
                    {wufuHistory.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 py-2 text-center text-[11px] text-slate-400">还没有历史对局</p>
                    ) : (
                      <div className="space-y-2">
                        {wufuHistory.slice(wufuHistoryPage * HISTORY_PAGE_SIZE, (wufuHistoryPage + 1) * HISTORY_PAGE_SIZE).map((row) => {
                          const s = row.state
                          const winnerName = s.winner === null ? '—' : (wufuNames && s.winner === 0 ? wufuNames[0] : wufuNames ? wufuNames[1] : '')
                          const surrendered = s.log.some((item) => item.text.includes('🏳️'))
                          const open = wufuHistoryOpenId === row.id
                          return (
                            <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="flex items-center justify-between text-xs">
                                <span className={`font-semibold ${surrendered ? 'text-slate-500' : 'text-brand-600'}`}>
                                  {surrendered ? '🏳️ 认输' : '🏆 获胜'}
                                </span>
                                <span className="text-slate-400">{winnerName} · {new Date(row.finished_at).toLocaleString('zh-CN')}</span>
                              </div>
                              <button
                                type="button"
                                className="mt-1 text-[11px] text-brand-500 active:text-brand-600"
                                onClick={() => {
                                  setWufuHistoryOpenId(open ? null : row.id)
                                  if (!open) setWufuDetailLogPage(0)
                                }}
                              >
                                {open ? '收起棋局快照 ▴' : `展开棋局快照 ▾（共 ${s.log.length} 步）`}
                              </button>
                              {open && (
                                <div className="mt-2 space-y-2">
                                  <div className="mx-auto w-full max-w-[260px]">
                                    <div className="grid grid-cols-5 gap-0 rounded-lg border border-slate-200 bg-white p-1.5">
                                      {s.board.map((cell, i) => {
                                        const r = Math.floor(i / 5)
                                        const c = i % 5
                                        return (
                                          <div
                                            key={i}
                                            className={`flex aspect-square items-center justify-center
                                              ${r > 0 ? 'border-t' : ''} ${c > 0 ? 'border-l' : ''} border-slate-100`}
                                          >
                                            {cell === 1 ? (
                                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-rose-600 text-[10px] font-bold text-white">❤️</span>
                                            ) : cell === 2 ? (
                                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-sky-600 text-[10px] font-bold text-white">💙</span>
                                            ) : (
                                              <span className="h-1 w-1 rounded-full bg-slate-300" />
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                  <div className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                                    <LogList
                                      items={s.log.map((item) => item.text)}
                                      page={wufuDetailLogPage}
                                      onPage={setWufuDetailLogPage}
                                      empty="本局没有过程记录"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : wufuState && wufuNames ? (
                <>
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-brand-50 px-3 py-2 text-xs text-brand-700">
                    <span className="min-w-0 flex-1 truncate">
                      ❤️ {wufuNames[0]}{wufuState.firstMover === 0 ? '（先手）' : ''}
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold">
                      {wufuState.phase === 'place'
                        ? `摆子 第 ${wufuState.placed}/25 手`
                        : wufuState.phase === 'forceRemove'
                          ? '逼子阶段'
                          : '走子阶段'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right">
                      💙 {wufuNames[1]}{wufuState.firstMover === 1 ? '（先手）' : ''}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="chip border-rose-200 bg-rose-50 text-rose-600">❤️ {wufuPieceCount[0]}</span>
                    <span className="chip border-slate-200 bg-slate-50 text-slate-500">
                      {wufuState.winner !== null
                        ? '本局已结束'
                        : wufuState.turn === myWufuIndex
                          ? '轮到你行动'
                          : `等 ${friendName} 行动`}
                    </span>
                    <span className="chip border-sky-200 bg-sky-50 text-sky-600">💙 {wufuPieceCount[1]}</span>
                  </div>

                  {(() => {
                    const myTurn = wufuState.turn === myWufuIndex && wufuState.winner === null
                    let hint: string
                    let hintClass: string
                    if (wufuState.winner !== null) {
                      hint = wufuState.winner === myWufuIndex ? '🏆 你赢啦！点下方「再来一局」继续' : `🏳️ ${friendName} 赢啦，点下方「再来一局」翻盘`
                      hintClass = 'border-brand-200 bg-brand-50 text-brand-700'
                    } else if (!myTurn) {
                      hint = `🕐 等 ${friendName} 行动…（对方离线时铃铛会提醒你）`
                      hintClass = 'border-slate-200 bg-slate-50 text-slate-500'
                    } else if (wufuState.pendingCaptures > 0) {
                      hint = `⚔️ 你成了棋形！点击对方「闪烁」的棋子提走 ${wufuState.pendingCaptures} 枚（🛡 受保护的不行）`
                      hintClass = 'border-rose-200 bg-rose-50 text-rose-700'
                    } else if (wufuState.phase === 'place') {
                      hint = '📐 摆子阶段：点击任意空点落子，落子成项立刻提子'
                      hintClass = 'border-brand-200 bg-brand-50 text-brand-700'
                    } else if (wufuState.phase === 'forceRemove') {
                      hint = '⚖️ 逼子阶段：棋盘摆满没吃子，点对方一枚棋子移出棋盘，然后先手开始走子'
                      hintClass = 'border-amber-200 bg-amber-50 text-amber-700'
                    } else if (wufuSelected === null) {
                      hint = `🚶 走子阶段：先点自己（${myWufuIndex === 0 ? '❤️红' : '💙蓝'}）的棋子，再点相邻空点走子`
                      hintClass = 'border-brand-200 bg-brand-50 text-brand-700'
                    } else {
                      hint = wufuMoveTargetCells.length
                        ? '再点你高亮的相邻空点走过去，走成棋形照样提子'
                        : '这枚四周没有空点，点另一枚自己的棋子试试'
                      hintClass = 'border-brand-200 bg-brand-50 text-brand-700'
                    }
                    return (
                      <div className={`rounded-xl border px-3 py-2 text-xs font-medium leading-relaxed ${hintClass}`}>{hint}</div>
                    )
                  })()}

                  <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
                    <div className="grid grid-cols-5">
                      {wufuState.board.map((cell, index) => {
                        const r = Math.floor(index / 5)
                        const c = index % 5
                        const myTurn = wufuState.turn === myWufuIndex && wufuState.winner === null
                        const isOwn = cell === myWufuPiece
                        const isEnemy = cell !== 0 && !isOwn
                        const selected = wufuSelected === index
                        const isTarget = myTurn && wufuMoveTargetCells.includes(index)
                        const flashOn = wufuFlash?.cells.includes(index) ?? false
                        const protectedOn = wufuEnemyProtected.has(index)
                        const capturableOn =
                          isEnemy &&
                          (wufuState.pendingCaptures > 0 || (wufuState.phase === 'forceRemove' && myTurn)) &&
                          !protectedOn
                        return (
                          <button
                            key={index}
                            type="button"
                            disabled={wufuSaving}
                            onClick={() => void wufuClickPoint(index)}
                            className={`relative flex aspect-square select-none items-center justify-center
                              ${r > 0 ? 'border-t' : ''} ${c > 0 ? 'border-l' : ''}
                              ${flashOn ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}
                              transition active:scale-95`}
                          >
                            {cell === 0 && isTarget ? (
                              <span className="h-3 w-3 rounded-full bg-brand-400/80" />
                            ) : cell === 0 ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-300/70" />
                            ) : (
                              <span
                                className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-md transition
                                  ${cell === 1 ? 'bg-gradient-to-br from-rose-400 to-rose-600' : 'bg-gradient-to-br from-sky-400 to-sky-600'}
                                  ${selected ? 'scale-110 ring-2 ring-brand-500 ring-offset-2' : ''}
                                  ${capturableOn ? 'animate-pulse ring-2 ring-amber-400 ring-offset-2' : ''}`}
                              >
                                {cell === 1 ? '❤️' : '💙'}
                              </span>
                            )}
                            {protectedOn && (
                              <span className="absolute right-0.5 top-0.5 text-[9px]">🛡</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-2 text-center text-[10px] text-slate-400">
                      {wufuFlash ? '✨ 成项！高亮的棋形立刻提对方 1 子' : '点格子行动，受保护（🛡）的棋子不能提'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="chip border-slate-200 bg-slate-50 text-slate-500">棋子 ❤️{wufuPieceCount[0]} / 💙{wufuPieceCount[1]}</span>
                    <span className="chip border-slate-200 bg-slate-50 text-slate-500">
                      {wufuState.phase === 'place' ? `摆子 ${wufuState.placed}/25` : wufuState.phase === 'forceRemove' ? '逼子' : '走子'}
                    </span>
                    {wufuState.pendingCaptures > 0 && (
                      <span className="chip border-rose-200 bg-rose-50 text-rose-600">⚔️ 待提子 {wufuState.pendingCaptures}</span>
                    )}
                    {wufuState.paused && wufuState.winner === null && (
                      <span className="chip border-amber-200 bg-amber-50 text-amber-600">⏸️ 已暂停（停止轮询）</span>
                    )}
                    {wufuState.winner === null && (
                      <button
                        type="button"
                        className="btn-ghost ml-auto shrink-0 text-xs"
                        disabled={wufuSaving}
                        onClick={() => void toggleWufuPause()}
                      >
                        {wufuState.paused ? '▶️ 继续游戏' : '⏸️ 暂停棋局'}
                      </button>
                    )}
                    {wufuState.winner === null && (
                      <button
                        type="button"
                        className="btn-ghost shrink-0 border border-rose-200 text-xs text-rose-600 active:bg-rose-50"
                        disabled={wufuSaving}
                        onClick={() => void surrenderWufuGame()}
                      >
                        🏳️ 投降
                      </button>
                    )}
                    <button type="button" className="btn-ghost shrink-0 text-xs text-slate-400" disabled={wufuSaving} onClick={() => void endWufuGame()}>
                      结束本局
                    </button>
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-slate-500">📜 对局动态</h4>
                    <div className="rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600">
                      <LogList
                        items={[...wufuState.log].reverse().map((item) => item.text)}
                        page={wufuLogPage}
                        onPage={setWufuLogPage}
                      />
                    </div>
                  </div>

                  {/* 摆方对局历史：正常分出胜负或投降认输后自动存档，点击展开查看棋局快照 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-500">🏛️ 对局历史（{wufuHistory.length}）</h4>
                      {wufuHistory.length > 0 && (
                        <button
                          type="button"
                          className="btn-ghost text-xs text-slate-400"
                          onClick={() => void reloadWufuHistory()}
                        >
                          刷新
                        </button>
                      )}
                    </div>
                    {wufuHistory.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 py-2 text-center text-[11px] text-slate-400">还没有历史对局</p>
                    ) : (
                      <div className="space-y-2">
                        {wufuHistory.slice(wufuHistoryPage * HISTORY_PAGE_SIZE, (wufuHistoryPage + 1) * HISTORY_PAGE_SIZE).map((row) => {
                          const s = row.state
                          const winnerName = s.winner === null ? '—' : (wufuNames && s.winner === 0 ? wufuNames[0] : wufuNames ? wufuNames[1] : '')
                          const surrendered = s.log.some((item) => item.text.includes('🏳️'))
                          const open = wufuHistoryOpenId === row.id
                          return (
                            <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="flex items-center justify-between text-xs">
                                <span className={`font-semibold ${surrendered ? 'text-slate-500' : 'text-brand-600'}`}>
                                  {surrendered ? '🏳️ 认输' : '🏆 获胜'}
                                </span>
                                <span className="text-slate-400">{winnerName} · {new Date(row.finished_at).toLocaleString('zh-CN')}</span>
                              </div>
                              <button
                                type="button"
                                className="mt-1 text-[11px] text-brand-500 active:text-brand-600"
                                onClick={() => {
                                  setWufuHistoryOpenId(open ? null : row.id)
                                  if (!open) setWufuDetailLogPage(0)
                                }}
                              >
                                {open ? '收起棋局快照 ▴' : `展开棋局快照 ▾（共 ${s.log.length} 步）`}
                              </button>
                              {open && (
                                <div className="mt-2 space-y-2">
                                  <div className="mx-auto w-full max-w-[260px]">
                                    <div className="grid grid-cols-5 gap-0 rounded-lg border border-slate-200 bg-white p-1.5">
                                      {s.board.map((cell, i) => {
                                        const r = Math.floor(i / 5)
                                        const c = i % 5
                                        return (
                                          <div
                                            key={i}
                                            className={`flex aspect-square items-center justify-center
                                              ${r > 0 ? 'border-t' : ''} ${c > 0 ? 'border-l' : ''} border-slate-100`}
                                          >
                                            {cell === 1 ? (
                                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-rose-600 text-[10px] font-bold text-white">❤️</span>
                                            ) : cell === 2 ? (
                                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-sky-600 text-[10px] font-bold text-white">💙</span>
                                            ) : (
                                              <span className="h-1 w-1 rounded-full bg-slate-300" />
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                  <div className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                                    <LogList
                                      items={s.log.map((item) => item.text)}
                                      page={wufuDetailLogPage}
                                      onPage={setWufuDetailLogPage}
                                      empty="本局没有过程记录"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <HistoryPager page={wufuHistoryPage} total={wufuHistory.length} onChange={setWufuHistoryPage} />
                  </div>
                </>
              ) : null}
            </section>
          )}

          {activeModule === 'gomoku' && (
            <section id="couple-active-module" className={`card space-y-4${moduleFocus ? ' module-focus' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">⚫ 情侣五子棋</h3>
                  {/* <p className="mt-1 text-xs text-slate-500">标准 15×15 棋盘，黑棋先手，横竖斜任意方向连成五子获胜。</p> */}
                </div>
                <span className="chip shrink-0 border-slate-200 bg-slate-50 text-slate-600">{gomokuHistory.length} 局历史</span>
              </div>
              
              {!gomokuGame ? (
                <button type="button" className="btn-primary w-full" disabled={gomokuSaving || !ready} onClick={() => void startGomokuGame()}>
                  {gomokuSaving ? '创建中…' : '⚫ 开始新棋局'}
                </button>
              ) : gomokuState ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {gomokuState.winner !== null ? (
                      <span className="chip border-emerald-200 bg-emerald-50 text-emerald-700">🏆 {gomokuNames?.[gomokuState.winner]} 获胜</span>
                    ) : gomokuState.paused ? (
                      <span className="chip border-amber-200 bg-amber-50 text-amber-700">⏸️ 棋局已暂停</span>
                    ) : (
                      <span className="chip border-brand-200 bg-brand-50 text-brand-700">{gomokuState.turn === 0 ? '⚫ 黑棋' : '⚪ 白棋'}回合 · {gomokuNames?.[gomokuState.turn]}</span>
                    )}
                    {gomokuState.winner === null && (
                      <button type="button" className="btn-ghost ml-auto text-xs" disabled={gomokuSaving} onClick={() => void toggleGomokuPause()}>
                        {gomokuState.paused ? '▶️ 继续游戏' : '⏸️ 暂停'}
                      </button>
                    )}
                    {gomokuState.winner === null && (
                      <button type="button" className="btn-ghost text-xs text-rose-600" disabled={gomokuSaving} onClick={() => void surrenderGomoku()}>🏳️ 投降</button>
                    )}
                    {/* 分出胜负后：直接开新一局，或先收掉棋盘回到入口 */}
                    {gomokuState.winner !== null && (
                      <>
                        <button type="button" className="btn-primary ml-auto px-3 py-1 text-xs" disabled={gomokuSaving || !ready} onClick={() => void startGomokuGame()}>
                          🔄 再来一局
                        </button>
                        <button type="button" className="btn-ghost text-xs" disabled={gomokuSaving} onClick={() => void finishGomoku()}>
                          🏁 结束本局
                        </button>
                      </>
                    )}
                  </div>
                  <div className="mx-auto w-full max-w-[min(92vw,560px)] rounded-xl border border-amber-900/30 bg-[#e7bf7d] p-3 shadow-inner">
                    <div className="relative aspect-square w-full select-none overflow-hidden rounded bg-[#deb887]">
                      {/* 15x15 网格线：线交叉点对齐到每个交互格的中心（(i+0.5)/15），保证棋子中心精确落在交叉点上 */}
                      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {Array.from({ length: 15 }, (_, i) => {
                          const p = ((i + 0.5) / 15) * 100
                          return (
                            <g key={i}>
                              <line x1="0" y1={p} x2="100" y2={p} stroke="#8c5828" strokeWidth="0.75" />
                              <line x1={p} y1="0" x2={p} y2="100" stroke="#8c5828" strokeWidth="0.75" />
                            </g>
                          )
                        })}
                        {/* 星位与天元点 */}
                        {[
                          [3, 3],
                          [3, 11],
                          [7, 7],
                          [11, 3],
                          [11, 11],
                        ].map(([r, c], starIndex) => (
                          <circle key={starIndex} cx={((c + 0.5) / 15) * 100} cy={((r + 0.5) / 15) * 100} r="1.1" fill="#6d3f1a" />
                        ))}
                      </svg>

                      {/* 15x15 落子交互网格 */}
                      <div
                        className="relative z-10 grid h-full w-full"
                        style={{
                          gridTemplateColumns: 'repeat(15, minmax(0, 1fr))',
                          gridTemplateRows: 'repeat(15, minmax(0, 1fr))',
                        }}
                      >
                        {gomokuState.board.map((cell, index) => {
                          const row = Math.floor(index / 15)
                          const col = index % 15
                          const canPlace =
                            !gomokuSaving &&
                            !gomokuState.paused &&
                            gomokuState.winner === null &&
                            gomokuState.turn === myGomokuIndex &&
                            cell === 0
                          return (
                            <button
                              key={index}
                              type="button"
                              aria-label={`第${row + 1}行第${col + 1}列${cell === 1 ? '已有黑棋' : cell === 2 ? '已有白棋' : '落子点'}`}
                              className={`group relative flex items-center justify-center p-0 ${canPlace ? 'cursor-pointer hover:bg-black/5' : ''}`}
                              disabled={!canPlace}
                              onClick={() => void placeGomoku(index)}
                            >
                              {cell !== 0 ? (
                                <span
                                  className={`block aspect-square w-[78%] rounded-full shadow-md transition-transform ${
                                    cell === 1
                                      ? 'bg-gradient-to-br from-slate-700 via-slate-900 to-black ring-1 ring-slate-800'
                                      : 'border border-slate-300 bg-gradient-to-br from-white via-slate-100 to-slate-200 ring-1 ring-black/10'
                                  }`}
                                />
                              ) : canPlace ? (
                                <span className="block aspect-square w-[45%] rounded-full bg-black/20 opacity-0 transition-opacity group-hover:opacity-100" />
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                    <LogList
                      items={[...gomokuState.log].reverse().map((item) => item.text)}
                      page={gomokuLogPage}
                      onPage={setGomokuLogPage}
                      empty="还没有落子记录"
                    />
                  </div>
                </>
              ) : null}
              <div className="rounded-xl border border-slate-200 bg-amber-50 p-3 text-xs leading-relaxed text-slate-600">
                <strong>游戏规则：</strong>双方轮流在交叉点落子，黑棋先手；先在横竖斜任意方向连成连续五子者获胜。棋局可暂停，暂停期间不进行网络同步；投降会结束并保存历史。
              </div>
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-600">对局历史</h4>
                  <button type="button" className="btn-ghost text-xs" onClick={() => void reloadGomokuHistory()}>刷新</button>
                </div>
                {gomokuHistory.length === 0 ? <p className="text-xs text-slate-400">还没有已结束的对局</p> : gomokuHistory.slice(gomokuHistoryPage * HISTORY_PAGE_SIZE, (gomokuHistoryPage + 1) * HISTORY_PAGE_SIZE).map((row) => (
                  <div key={row.id} className="rounded-lg border border-slate-200 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                      <span className="flex flex-wrap items-center gap-2">
                        <span>{row.state.log.some((item) => item.text.includes('🏳️')) ? '🏳️ 投降结束' : '🏆 对局结束'}</span>
                        {/* member_a 固定执黑先手、member_b 执白 */}
                        <span className="text-slate-500">⚫ {row.member_a === memberId ? (memberName || '我') : friendName}</span>
                        <span className="text-slate-500">⚪ {row.member_b === memberId ? (memberName || '我') : friendName}</span>
                      </span>
                      <span className="text-slate-400">
                        {(() => {
                          const winnerIndex: 0 | 1 = row.winner === 0 ? 0 : 1
                          const winnerMemberId = winnerIndex === 0 ? row.member_a : row.member_b
                          const winnerDisplayName = winnerMemberId === memberId ? (memberName || '我') : friendName
                          return `获胜方：${winnerIndex === 0 ? '⚫' : '⚪'} ${winnerDisplayName}`
                        })()} · {new Date(row.finished_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <button type="button" className="mt-1 text-xs text-brand-600" onClick={() => setGomokuHistoryOpenId(gomokuHistoryOpenId === row.id ? null : row.id)}>
                      {gomokuHistoryOpenId === row.id ? '收起棋谱' : `查看棋谱（${row.state.log.length} 手）`}
                    </button>
                    {gomokuHistoryOpenId === row.id && (
                      <div className="mt-2 rounded-lg border border-amber-900/30 bg-[#deb887] p-2">
                        <div
                          className="grid aspect-square w-full gap-0 overflow-hidden rounded bg-[#deb887]"
                          style={{
                            gridTemplateColumns: 'repeat(15, minmax(0, 1fr))',
                            gridTemplateRows: 'repeat(15, minmax(0, 1fr))',
                          }}
                        >
                          {row.state.board.map((cell, i) => (
                            <span
                              key={i}
                              className="flex aspect-square items-center justify-center border-b border-r border-[#8c5828]/25 p-0"
                            >
                              {cell === 1 ? (
                                <span className="block aspect-square w-[75%] rounded-full bg-slate-900 shadow-sm" />
                              ) : cell === 2 ? (
                                <span className="block aspect-square w-[75%] rounded-full border border-slate-300 bg-white shadow-sm" />
                              ) : null}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <HistoryPager page={gomokuHistoryPage} total={gomokuHistory.length} onChange={setGomokuHistoryPage} />
            </section>
          )}

          {activeModule === 'watermelon' && (
            <section id="couple-active-module" className={`card space-y-4${moduleFocus ? ' module-focus' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">🍉 情侣西瓜分</h3>
                  <p className="mt-1 text-xs text-slate-500">信用分：给 {friendName} 加分或减分。</p>
                </div>
                <span className="chip shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">{watermelonLogs.length} 条记录</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(() => {
                  const myWatermelonScore = memberId && friendId
                    ? orderedPair(memberId, friendId)[0] === memberId
                      ? watermelonScore?.score_a ?? 0
                      : watermelonScore?.score_b ?? 0
                    : 0
                  const peerWatermelonScore = memberId && friendId
                    ? orderedPair(memberId, friendId)[0] === friendId
                      ? watermelonScore?.score_a ?? 0
                      : watermelonScore?.score_b ?? 0
                    : 0
                  return (
                    <>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                        <p className="text-[11px] text-emerald-700/70">{memberName || '我'}的西瓜分</p>
                        <p className="mt-1 text-2xl font-bold text-emerald-700">{myWatermelonScore}</p>
                      </div>
                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
                        <p className="text-[11px] text-rose-700/70">{friendName}的西瓜分</p>
                        <p className="mt-1 text-2xl font-bold text-rose-700">{peerWatermelonScore}</p>
                      </div>
                    </>
                  )
                })()}
              </div>

              <div className="rounded-xl border border-slate-200 bg-amber-50 p-3 text-xs leading-relaxed text-slate-600">
                <strong>规则说明：</strong>西瓜分代表你们之间的专属默契值。加分代表 TA 更可爱、更贴心；减分代表想提醒 TA 注意一点小细节。分数可以手动调整，并会保留最近明细。
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-700">给 {friendName} 调整西瓜分</h4>
                  <span className="text-[11px] text-slate-400">{watermelonSaving ? '保存中…' : '可加减任意分值'}</span>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500">快捷预设：</label>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: '-5', value: -5 },
                      { label: '-1', value: -1 },
                      { label: '+1', value: 1 },
                      { label: '+5', value: 5 },
                    ].map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        className={`btn-ghost text-xs ${watermelonDelta === option.value && !watermelonCustomValue ? 'ring-2 ring-emerald-500 font-semibold text-emerald-700' : ''}`}
                        onClick={() => {
                          setWatermelonDelta(option.value)
                          setWatermelonCustomValue('')
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500">自定义分值（可填负数如 -3，或正数如 8）：</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="1"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      placeholder="输入任意自定义数值（如 3、-2、20）"
                      value={watermelonCustomValue}
                      onChange={(event) => {
                        const raw = event.target.value
                        setWatermelonCustomValue(raw)
                        const parsed = parseInt(raw, 10)
                        if (!Number.isNaN(parsed)) {
                          setWatermelonDelta(parsed)
                        } else {
                          setWatermelonDelta(0)
                        }
                      }}
                    />
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="btn-soft px-2.5 py-1 text-xs"
                        onClick={() => {
                          const val = Math.abs(watermelonDelta) || 1
                          setWatermelonDelta(val)
                          setWatermelonCustomValue(String(val))
                        }}
                      >
                        设为+
                      </button>
                      <button
                        type="button"
                        className="btn-soft px-2.5 py-1 text-xs"
                        onClick={() => {
                          const val = -Math.abs(watermelonDelta || 1)
                          setWatermelonDelta(val)
                          setWatermelonCustomValue(String(val))
                        }}
                      >
                        设为-
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500">备注原因（必填或选填）：</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="输入原因备注（如：陪我吃夜宵 +5、爽约 -2）"
                    value={watermelonReason}
                    onChange={(event) => setWatermelonReason(event.target.value)}
                  />
                </div>

                <button
                  type="button"
                  className="btn-primary w-full"
                  disabled={watermelonSaving || watermelonDelta === 0}
                  onClick={() => void adjustWatermelonScore()}
                >
                  {watermelonDelta === 0
                    ? '请先选择或输入有效分值'
                    : watermelonDelta > 0
                      ? `确认给 ${friendName} 加 ${watermelonDelta} 分`
                      : `确认给 ${friendName} 减 ${Math.abs(watermelonDelta)} 分`}
                </button>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-700">全部西瓜分历史记录</h4>
                    <p className="text-[10px] text-slate-400">已完整保存所有加减分与备注</p>
                  </div>
                  <button type="button" className="btn-ghost text-xs" onClick={() => void reloadWatermelonLogs()}>刷新</button>
                </div>
                {watermelonLogs.length === 0 ? (
                  <p className="text-xs text-slate-400">还没有西瓜分记录，快给 TA 来第一分吧～</p>
                ) : (
                  <div className="space-y-2 pr-1">
                    {watermelonLogs.slice(watermelonHistoryPage * HISTORY_PAGE_SIZE, (watermelonHistoryPage + 1) * HISTORY_PAGE_SIZE).map((log) => (
                      <div key={log.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800">
                            {log.sender_name} 给 {log.target_member === friendId ? friendName : memberName || '我'} {log.delta > 0 ? '加了' : '减了'} {Math.abs(log.delta)} 分
                          </p>
                          <p className="mt-1 break-words rounded bg-slate-50 px-2 py-1 text-slate-600">
                            💬 备注：{log.reason || (log.delta > 0 ? '加分' : '减分')}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {new Date(log.created_at).toLocaleString('zh-CN')}
                          </p>
                        </div>
                        <span className={`chip shrink-0 font-bold ${log.delta > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                          {log.delta > 0 ? `+${log.delta}` : log.delta}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <HistoryPager page={watermelonHistoryPage} total={watermelonLogs.length} onChange={setWatermelonHistoryPage} />
            </section>
          )}

          {activeModule === 'dice' && (
            <section id="couple-active-module" className={`card space-y-4${moduleFocus ? ' module-focus' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">🎲3个骰子比大小</h3>
                  {/* <p className="mt-1 text-xs text-slate-500">4~10点为“小”，11~17点为“大”；围骰庄家通吃，预测正确获双倍（1:1）。</p> */}
                </div>
                <span className="chip shrink-0 border-amber-200 bg-amber-50 text-amber-700">第 {diceState?.round ?? 1} 轮</span>
              </div>

              

              {!diceGame ? (
                <button
                  type="button"
                  className="btn-primary w-full"
                  disabled={diceSaving || !ready}
                  onClick={() => void startDiceGame()}
                >
                  {diceSaving ? '正在开局…' : '🎲 开始骰子对决（双方初始 100 筹码）'}
                </button>
              ) : diceState && diceNames ? (
                <>
                  {/* 双方筹码 & 身份 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`rounded-xl border p-3 text-center ${diceState.banker === myDiceIndex ? 'border-amber-300 bg-amber-50/80' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-700">{memberName || '我'}</span>
                        {diceState.banker === myDiceIndex ? (
                          <span className="chip border-amber-300 bg-amber-100 text-[10px] text-amber-800">👑庄家</span>
                        ) : (
                          <span className="chip border-slate-200 bg-white text-[10px] text-slate-500">🎯闲家</span>
                        )}
                      </div>
                      <p className="mt-1 text-2xl font-bold text-amber-700">{diceState.chips[myDiceIndex]} <span className="text-xs font-normal text-slate-400">筹码</span></p>
                      {diceState.banker !== myDiceIndex && (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          已押：{diceState.bets[myDiceIndex] ? (diceState.bets[myDiceIndex] === 'small' ? '🔹 小' : '🔸 大') : '未押注'}
                        </p>
                      )}
                    </div>

                    <div className={`rounded-xl border p-3 text-center ${diceState.banker === (1 - myDiceIndex) ? 'border-amber-300 bg-amber-50/80' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-700">{friendName}</span>
                        {diceState.banker === (1 - myDiceIndex) ? (
                          <span className="chip border-amber-300 bg-amber-100 text-[10px] text-amber-800">👑庄家</span>
                        ) : (
                          <span className="chip border-slate-200 bg-white text-[10px] text-slate-500">🎯闲家</span>
                        )}
                      </div>
                      <p className="mt-1 text-2xl font-bold text-amber-700">{diceState.chips[1 - myDiceIndex]} <span className="text-xs font-normal text-slate-400">筹码</span></p>
                      {diceState.banker !== (1 - myDiceIndex) && (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          已押：{diceState.bets[1 - myDiceIndex] ? (diceState.bets[1 - myDiceIndex] === 'small' ? '🔹 小' : '🔸 大') : '等待押注'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 骰盅区域 */}
                  <div className="rounded-2xl border border-amber-900/20 bg-gradient-to-b from-amber-700 via-amber-800 to-amber-900 p-5 text-center text-white shadow-lg">
                    <p className="text-xs tracking-wider text-amber-200">
                      {diceState.lastResult ? `上轮点数：${diceState.lastResult.dices.join(' + ')} = ${diceState.lastResult.sum}点` : '骰盅待开启'}
                    </p>
                    <div className="my-4 flex items-center justify-center gap-3">
                      {(diceState.dices || [1, 2, 3]).map((dot, idx) => (
                        <div
                          key={idx}
                          className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-amber-200/50 bg-white text-3xl font-black text-slate-900 shadow-xl"
                        >
                          {['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][dot - 1] || '🎲'}
                        </div>
                      ))}
                    </div>
                    {diceState.lastResult && (
                      <div className="inline-block rounded-full bg-black/30 px-3 py-1 text-xs text-amber-200">
                        {diceState.lastResult.isTriple
                          ? `⚠️ 围骰（${diceState.lastResult.dices[0]}同号）· 庄家通吃！`
                          : `点数和：${diceState.lastResult.sum}点（${diceState.lastResult.outcome === 'small' ? '小 4~10' : '大 11~17'}）`}
                      </div>
                    )}
                  </div>

                  {/* 操作区 */}
                  {diceState.banker === myDiceIndex ? (
                    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-center">
                      <p className="text-xs text-amber-800">
                        你是本轮庄家 👑！
                        {diceState.bets[1 - myDiceIndex]
                          ? `对方已押【${diceState.bets[1 - myDiceIndex] === 'small' ? '小' : '大'}】，你可以开盅摇骰了`
                          : `正在等待 ${friendName}（闲家）押注大小…`}
                      </p>
                      <button
                        type="button"
                        className="btn-primary w-full text-base font-semibold"
                        disabled={diceSaving || !diceState.bets[1 - myDiceIndex]}
                        onClick={() => void rollDiceAction()}
                      >
                        {diceSaving ? '摇骰中…' : '🎲 摇骰开盅！'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">你是闲家，请预测大小（下注 10 筹码）：</span>
                        <span className="text-slate-400">{myDiceBet ? `已选: ${myDiceBet === 'small' ? '小' : '大'}` : '未选择'}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          className={`btn-soft py-3 text-sm font-bold ${myDiceBet === 'small' ? 'ring-2 ring-emerald-500 bg-emerald-50 text-emerald-700' : ''}`}
                          disabled={diceSaving}
                          onClick={() => void placeDiceBet('small')}
                        >
                          🔹 押 小（4~10点）
                        </button>
                        <button
                          type="button"
                          className={`btn-soft py-3 text-sm font-bold ${myDiceBet === 'big' ? 'ring-2 ring-amber-500 bg-amber-50 text-amber-700' : ''}`}
                          disabled={diceSaving}
                          onClick={() => void placeDiceBet('big')}
                        >
                          🔸 押 大（11~17点）
                        </button>
                      </div>
                      <p className="text-center text-[10px] text-slate-400">下注后由庄家开盅；遇围骰庄家通吃，预测正确获 1:1 双倍筹码</p>
                    </div>
                  )}
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-slate-700">
                    <p className="font-semibold">📜 玩法规则：</p>
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-slate-600">
                      <li>使用 3 个骰子，点数和 <strong>4~10 点为小</strong>，<strong>11~17 点为大</strong>。</li>
                      <li>闲家预测正确可获 1:1 赔率奖励（赢取 10 筹码），预测错误筹码归庄家。</li>
                      <li><strong>特别注意：</strong>若 3 个骰子点数相同（如 1-1-1、6-6-6，即<strong>“围骰/全骰”</strong>），无论押大押小均判输，<strong>庄家通吃</strong>！</li>
                      <li>双方初始各有 100 筹码，每轮开骰后自动轮换庄家。</li>
                    </ul>
                  </div>
                  {/* 对局历史与重置 */}
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-600">📜 骰子记录（{diceHistory.length} 局）</h4>
                      <div className="flex gap-2">
                        <button type="button" className="btn-ghost text-xs text-rose-500" disabled={diceSaving} onClick={() => void endDiceGame()}>🏁 结束本局</button>
                        <button type="button" className="btn-ghost text-xs" onClick={() => void reloadDiceHistory()}>刷新</button>
                      </div>
                    </div>
                    {diceHistory.length === 0 ? (
                      <p className="text-xs text-slate-400">暂无对局记录（一局结束才归档一条）</p>
                    ) : (
                      <div className="space-y-1 text-xs">
                        {diceHistory.slice(diceHistoryPage * HISTORY_PAGE_SIZE, (diceHistoryPage + 1) * HISTORY_PAGE_SIZE).map((row) => {
                          const s = row.state
                          const rounds = Math.max(0, s.round - 1)
                          const loser = s.chips[0] === 0 ? 0 : s.chips[1] === 0 ? 1 : null
                          const res = s.lastResult
                          return (
                            <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
                              <div className="min-w-0">
                                <span className="font-semibold text-slate-700">
                                  {loser !== null ? `${diceNames?.[1 - loser] ?? (loser === 1 ? '红方' : '蓝方')} 获胜` : '手动收局'} · {rounds} 轮
                                </span>
                                <span className="ml-2 text-slate-400">
                                  最终 ❤️ {s.chips[0]} / 💙 {s.chips[1]}
                                  {res ? ` · 末局 ${res.dices.join('+')}=${res.sum}点（${res.isTriple ? '围骰' : res.outcome === 'small' ? '小' : '大'}）` : ''}
                                </span>
                              </div>
                              <span className="shrink-0 text-slate-400">{new Date(row.finished_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          )
                        })}
                        <HistoryPager page={diceHistoryPage} total={diceHistory.length} onChange={setDiceHistoryPage} />
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </section>
          )}

          {/* ⏳ 重要日倒计时 */}
          {activeModule === 'countdown' && (
            <section id="couple-active-module" className={`card space-y-4${moduleFocus ? ' module-focus' : ''}`}>
              <div>
                <h3 className="font-semibold">⏳ 重要日倒计时</h3>
                <p className="mt-1 text-xs text-slate-400">纪念日、生日、旅行日……添加多个重要日期，一起倒数还有多少天。</p>
              </div>
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-[64px_1fr_150px_auto]">
                <select className="input w-full px-1 text-center text-lg" value={typeof countdownEmoji === 'string' && ['📅', '🎂', '💖', '💍', '✈️', '🏠', '🎓', '🎉', '🌸', '🍰', '🌟', '🎁'].includes(countdownEmoji) ? countdownEmoji : '📅'} onChange={(event) => setCountdownEmoji(event.target.value)}>
                  {['📅', '🎂', '💖', '💍', '✈️', '🏠', '🎓', '🎉', '🌸', '🍰', '🌟', '🎁'].map((emoji) => <option key={emoji} value={emoji}>{emoji}</option>)}
                </select>
                <input className="input" placeholder="名称" value={countdownTitle} onChange={(event) => setCountdownTitle(event.target.value)} maxLength={30} />
                <input className="input" type="date" value={countdownDate} onChange={(event) => setCountdownDate(event.target.value)} />
                <button type="button" className="btn-primary" disabled={countdownSaving || !memberId || !friendId} onClick={() => void addCountdown()}>添加</button>
              </div>
              {(!Array.isArray(countdownGame?.state.items) || countdownGame.state.items.length === 0) ? (
                <p className="py-4 text-center text-xs text-slate-400">还没有重要日，添加一个吧～</p>
              ) : (
                <div className="space-y-2">
                  {(Array.isArray(countdownGame?.state.items) ? countdownGame.state.items : []).map((item, index) => {
                    const itemId = safeDisplayText(item?.id, `countdown-${index}`)
                    const itemTitle = safeDisplayText(item.title, '未命名重要日')
                    const itemDate = safeDisplayText(item.date)
                    const itemEmoji = safeDisplayText(item.emoji, '📅')
                    const target = new Date(`${itemDate}T00:00:00`)
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const days = Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
                    const label = days > 0 ? `还有 ${days} 天` : days === 0 ? '🎉 就是今天！' : `已过去 ${-days} 天`
                    const soon = days >= 0 && days <= 7
                    return (
                      <div key={itemId} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <span className="text-xl">{itemEmoji || '📅'}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-700">{itemTitle}</div>
                          <div className="text-[11px] text-slate-400">{itemDate}</div>
                        </div>
                        <span className={`chip shrink-0 ${days === 0 ? 'border-rose-200 bg-rose-50 text-rose-600' : soon ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-brand-200 bg-brand-50 text-brand-600'}`}>{label}</span>
                        <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-xs text-rose-500" disabled={countdownSaving} onClick={() => void removeCountdown(itemId)}>删除</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* 💍 备婚流程 */}
          {activeModule === 'wedding' && (
            <section id="couple-active-module" className={`card space-y-4${moduleFocus ? ' module-focus' : ''}`}>
              <div>
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">💍备婚流程</h3>
                  </div>
                  <span className="chip shrink-0 border-rose-200 bg-rose-50 text-rose-600">
                    已完成 {weddingDoneCount}/{WEDDING_TOTAL}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-400 transition-all duration-500"
                    style={{ width: `${(weddingDoneCount / WEDDING_TOTAL) * 100}%` }}
                  />
                </div>
              </div>

              {/* 下一步：一眼看到接下来要做什么 */}
              {weddingAllDone ? (
                <div className="rounded-2xl bg-rose-50 p-3 text-center">
                  <div className="text-2xl">🎉</div>
                  <p className="mt-1 text-sm font-semibold text-rose-700">{WEDDING_TOTAL} 步都走完啦，祝你们一直这么甜</p>
                  <p className="mt-1 text-[11px] text-rose-500">想改的话，在下面点开任意一步可以撤回</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className="chip border-rose-200 bg-white text-rose-600">下一步</span>
                    <span className="text-[11px] text-slate-400">{weddingCurrentStep.timing}</span>
                  </div>
                  <h4 className="mt-2 flex items-center gap-2 font-semibold text-slate-700">
                    <span>{weddingCurrentStep.emoji}</span>
                    <span className="min-w-0 break-words">{weddingCurrentStep.title}</span>
                  </h4>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                    {weddingCurrentStep.todo.map((item) => (
                      <li key={item} className="break-words">· {item}</li>
                    ))}
                  </ul>
                  <button
                    className="btn-primary mt-3 w-full"
                    disabled={weddingSaving}
                    onClick={() => void toggleWeddingStep(weddingCurrentStep.id)}
                  >
                    {weddingSaving ? '保存中…' : '完成这一步'}
                  </button>
                </div>
              )}

              {/* 步骤条 / 总览 两种看法 */}
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-50 p-1">
                <button
                  type="button"
                  className={`rounded-md py-1 text-[11px] transition ${weddingView === 'stepper' ? 'bg-white font-semibold text-rose-600' : 'text-slate-400'}`}
                  onClick={() => setWeddingView('stepper')}
                >
                  🧭 步骤条
                </button>
                <button
                  type="button"
                  className={`rounded-md py-1 text-[11px] transition ${weddingView === 'overview' ? 'bg-white font-semibold text-rose-600' : 'text-slate-400'}`}
                  onClick={() => setWeddingView('overview')}
                >
                  📋 步骤总览
                </button>
              </div>

              {weddingView === 'stepper' ? (
                /* 步骤条：整条路都铺开，当前那一步自动展开要做什么 / 要准备什么 */
                <ol>
                  {WEDDING_STEPS.map((step, index) => {
                    const done = weddingDone.includes(step.id)
                    const isCurrent = index === weddingCurrentIndex && !weddingAllDone
                    const isOpen = weddingOpenStep ? weddingOpenStep === step.id : isCurrent
                    const isLast = index === WEDDING_STEPS.length - 1
                    return (
                      <li key={step.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <button
                            type="button"
                            aria-label={step.title}
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm transition ${
                              done
                                ? 'border-rose-300 bg-rose-100 text-rose-600'
                                : isCurrent
                                  ? 'border-rose-400 bg-white text-base ring-2 ring-rose-200'
                                  : 'border-slate-200 bg-white text-base'
                            }`}
                            onClick={() => toggleWeddingOpen(step.id, isOpen, isCurrent)}
                          >
                            {done ? '✓' : step.emoji}
                          </button>
                          {!isLast && <span className={`w-px flex-1 ${done ? 'bg-rose-200' : 'bg-slate-200'}`} />}
                        </div>
                        <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                          <button
                            type="button"
                            className="flex w-full items-start justify-between gap-2 text-left"
                            onClick={() => toggleWeddingOpen(step.id, isOpen, isCurrent)}
                          >
                            <span
                              className={`min-w-0 flex-1 break-words text-sm ${
                                done ? 'text-slate-400 line-through' : isCurrent ? 'font-semibold text-slate-700' : 'text-slate-600'
                              }`}
                            >
                              {index + 1}. {step.title}
                            </span>
                            <span className="shrink-0 text-[10px] text-slate-400">
                              {done ? '已完成' : isCurrent ? '进行中' : '未开始'}
                            </span>
                          </button>
                          <p className="mt-0.5 text-[11px] text-slate-400">{step.timing}</p>
                          {isOpen && (
                            <div className="mt-2 space-y-2">
                              <WeddingCheckList
                                title="要做的事"
                                items={step.todo}
                                stepId={step.id}
                                kind="todo"
                                checked={weddingChecked}
                                onToggle={(key) => void toggleWeddingItem(key)}
                                disabled={weddingSaving}
                              />
                              <WeddingCheckList
                                title="要准备的东西"
                                items={step.prepare}
                                stepId={step.id}
                                kind="prepare"
                                checked={weddingChecked}
                                onToggle={(key) => void toggleWeddingItem(key)}
                                disabled={weddingSaving}
                              />
                              <button
                                className="btn-ghost w-full text-xs"
                                disabled={weddingSaving}
                                onClick={() => void toggleWeddingStep(step.id)}
                              >
                                {done ? '撤回这一步' : '标记这一步完成'}
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              ) : (
                /* 总览：不展开细节，一眼看完全程的状态与待办进度 */
                <div className="space-y-1">
                  {WEDDING_STEPS.map((step, index) => {
                    const done = weddingDone.includes(step.id)
                    const isCurrent = index === weddingCurrentIndex && !weddingAllDone
                    const stat = weddingItemStats[index]
                    return (
                      <button
                        key={step.id}
                        type="button"
                        className={`flex w-full items-center gap-2 rounded-lg p-2 text-left ${isCurrent ? 'bg-rose-50' : done ? 'bg-slate-50' : 'bg-white'}`}
                        onClick={() => {
                          setWeddingOpenStep(step.id)
                          setWeddingView('stepper')
                        }}
                      >
                        <span className="w-6 shrink-0 text-center text-sm">{done ? '✓' : step.emoji}</span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block break-words text-xs ${
                              done ? 'text-slate-400 line-through' : isCurrent ? 'font-semibold text-slate-700' : 'text-slate-600'
                            }`}
                          >
                            {index + 1}. {step.title}
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            {step.timing} · 待办 {stat.ticked}/{stat.total}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                            done ? 'bg-rose-50 text-rose-500' : isCurrent ? 'bg-white text-rose-600' : 'bg-slate-50 text-slate-400'
                          }`}
                        >
                          {done ? '已完成' : isCurrent ? '进行中' : '未开始'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* 🎫 情侣刮刮乐 */}
          {activeModule === 'scratch' && (
            <section id="couple-active-module" className={`card space-y-4${moduleFocus ? ' module-focus' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">🎫 情侣刮刮乐</h3>
                  <p className="mt-1 text-xs text-slate-400">各抽各的卡、各刮各的，刮开结果两个人都看得到。抽卡后用手指把银色涂层刮开，刮中甜蜜奖励就兑现吧！</p>
                </div>
              </div>
              {/* 我的卡：自己抽、自己刮 */}
              {(() => {
                const mine = scratchGame?.state.cards?.[myId]
                return (
                  <div className={`space-y-3 rounded-2xl p-4 ${mine?.revealed_at ? 'bg-amber-50' : 'bg-slate-100'}`}>
                    <div className="text-xs font-semibold text-slate-500">🙋 我的刮刮乐</div>
                    {mine ? (
                      mine.revealed_at ? (
                        <div className="text-center">
                          <div className={`text-lg font-bold ${mine.prize.startsWith('谢谢惠顾') ? 'text-slate-500' : 'text-rose-600'}`}>
                            {mine.prize.startsWith('谢谢惠顾') ? '😅' : '🎉'} {mine.prize}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">刮开于 {new Date(mine.revealed_at).toLocaleString('zh-CN')}</div>
                          {scratchDay(mine.revealed_at) === scratchDay(new Date().toISOString()) ? (
                            <button type="button" className="btn-primary mt-3" disabled>🎫 明天再来</button>
                          ) : (
                            <button type="button" className="btn-primary mt-3" disabled={scratchSaving || !ready} onClick={() => void drawScratchCard()}>🎫 抽今天的刮刮乐</button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-[11px] text-slate-400">抽卡时间 {new Date(mine.created_at).toLocaleString('zh-CN')} · 刮开面积过半自动揭晓</div>
                          <ScratchCover revealed={false} onReveal={() => void revealScratch()} />
                        </div>
                      )
                    ) : (
                      <div className="space-y-3 py-2 text-center">
                        <div className="text-4xl">🎫</div>
                        <p className="text-xs text-slate-400">还没有属于你的刮刮乐</p>
                        <button type="button" className="btn-primary" disabled={scratchSaving || !ready} onClick={() => void drawScratchCard()}>🎫 抽一张刮刮乐</button>
                      </div>
                    )}
                  </div>
                )
              })()}
              {/* 对方的卡：只展示状态与结果，不能代刮 */}
              {(() => {
                const theirs = friendId ? scratchGame?.state.cards?.[friendId] : undefined
                return (
                  <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs font-semibold text-slate-500">👀 {friendName} 的刮刮乐</div>
                    {theirs ? (
                      theirs.revealed_at ? (
                        <div className="text-center">
                          <div className={`text-base font-bold ${theirs.prize.startsWith('谢谢惠顾') ? 'text-slate-500' : 'text-rose-600'}`}>
                            {theirs.prize.startsWith('谢谢惠顾') ? '😅' : '🎉'} {theirs.prize}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">{friendName} 刮开于 {new Date(theirs.revealed_at).toLocaleString('zh-CN')}</div>
                        </div>
                      ) : (
                        <div className="py-2 text-center text-xs text-slate-400">🎫 已抽卡，等 {friendName} 亲自刮开揭晓～</div>
                      )
                    ) : (
                      <div className="py-2 text-center text-xs text-slate-400">{friendName} 还没抽卡</div>
                    )}
                  </div>
                )
              })()}
              {(scratchGame?.state.log ?? []).length > 0 && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <h4 className="text-xs font-semibold text-slate-600">🎫 刮刮乐记录</h4>
                  <div className="space-y-1 text-[11px]">
                    {[...(scratchGame?.state.log ?? [])].reverse().slice(scratchHistoryPage * HISTORY_PAGE_SIZE, (scratchHistoryPage + 1) * HISTORY_PAGE_SIZE).map((entry, i) => (
                      <div key={`${entry.at}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2">
                        <span className="min-w-0 flex-1 break-words text-slate-600">{entry.text}</span>
                        <span className="shrink-0 text-slate-300">                    {new Date(entry.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))}
                    <HistoryPager page={scratchHistoryPage} total={(scratchGame?.state.log ?? []).length} onChange={setScratchHistoryPage} />
                  </div>
                </div>
              )}
            </section>
          )}

      {activeModule === 'love' ? <>
      {/* 今日专属情话：双方三餐打卡完毕才解锁，两边看到同一句 */}
      <section id="couple-active-module" className={`card space-y-3${moduleFocus ? ' module-focus' : ''}`}>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-semibold">💌今日专属情话</h3>
            <p className="text-[11px] text-slate-400">🔐完成今日三餐打卡，情话同时解锁</p>
          </div>
          <span
            className={`chip shrink-0 ${
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
            <MealCheck label="我的打卡" list={myMeals} />
            {friendId ? (
              <MealCheck label={`${friendName}的打卡`} list={peerMeals} />
            ) : (
              <p className="text-center text-[11px] text-slate-400">先添加好友，才能一起解锁情话哦</p>
            )}
            {mealDone(myMeals) < REQUIRED_SLOTS.length ? (
              <button className="btn-soft w-full" onClick={() => navigate('/meals')}>
                去完成我的三餐打卡
              </button>
            ) : (
              friendId && (
                <button
                  className="btn-soft w-full disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={mealNudgeCooldown}
                  onClick={() => void nudgePeerMeals()}
                >
                  {mealNudgeCooldown ? '刚刚已经催过啦，稍等一会～' : `💌 催 ${friendName} 去打卡`}
                </button>
              )
            )}
          </div>
        )}
      </section>

      </> : null}

      {activeModule === 'wish' ? <>
      {/* 秘密心愿池：好友双方共享，抽签结果双方同步 */}
      <section id="couple-active-module" className={`card space-y-3${moduleFocus ? ' module-focus' : ''}`}>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-semibold">🎁秘密心愿抽签</h3>
            <p className="text-[11px] text-slate-400">专属心愿池，抽到谁的心愿谁来完成</p>
          </div>
          <span className="chip border-brand-200 bg-brand-50 text-brand-600">{wishesList.length} 个❤</span>
        </div>
        {drawn && (
          <div className="animate-pop-in rounded-2xl border border-brand-200 bg-brand-50 p-4 text-center">
            <div className="text-xs text-brand-500">
              「{drawn.drawer}」抽中了「{drawn.owner}」的心愿
            </div>
            <div className="mt-1 break-words text-lg font-semibold text-brand-700">“{drawn.text}”</div>
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-2 min-[420px]:flex-row">
          <input
            className="input min-w-0 flex-1"
            placeholder="比如：给我捏肩"
            value={wishText}
            onChange={(e) => setWishText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addWish()}
          />
          <button className="btn-soft shrink-0 px-4" onClick={() => void addWish()}>
            放入心愿池
          </button>
        </div>
        <button className="btn-primary w-full" onClick={drawWish}>
          开始抽签
        </button>
      </section>

      </> : null}

      {activeModule === 'chat' ? <>
      {/* 甜蜜留言板：入库持久化，双方实时可见 */}
      <section id="couple-active-module" className={`card space-y-3${moduleFocus ? ' module-focus' : ''}`}>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-semibold">💬甜蜜聊天留言板</h3>
            <p className="text-[11px] text-slate-400">仅你们双方可见，留言实时同步</p>
          </div>
          <button className="text-xs text-brand-600" onClick={clearMessages}>
            清空
          </button>
        </div>
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          {messages.length === 0 && (
            <div className="py-5 text-center text-xs text-slate-400">发一句“今天也要开心”吧</div>
          )}
          {messages.slice(messageHistoryPage * HISTORY_PAGE_SIZE, (messageHistoryPage + 1) * HISTORY_PAGE_SIZE).map((m) => {
            const isMine = m.sender_id === myId
            const name = isMine ? '我' : friendName
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <span className="px-1 text-[10px] text-slate-400">
                  {name} · {new Date(m.created_at).toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </span>
                <span
                  className={`max-w-[80%] break-words rounded-2xl px-3 py-2 text-sm ${
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
        <HistoryPager page={messageHistoryPage} total={messages.length} onChange={setMessageHistoryPage} />
        <div className="flex min-w-0 flex-col gap-2 min-[420px]:flex-row">
          <input
            className="input min-w-0 flex-1"
            placeholder="如：想你啦 🥰"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void sendMessage()}
          />
          <button className="btn-primary shrink-0 px-4" onClick={() => void sendMessage()}>
            发送
          </button>
        </div>
      </section>

      </> : null}

      {activeModule === 'quiz' ? <>
      {/* 同步抉择：共享会话保证双方同题，双方作答后动画揭晓 */}
      <section id="couple-active-module" className={`card space-y-3${moduleFocus ? ' module-focus' : ''}`}>
        <div>
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">💞同步抉择</h3>
              <p className="text-[11px] text-slate-400">题目与选择双方实时同步，一起在线玩更配哦</p>
            </div>
            <span className="chip shrink-0 border-brand-200 bg-brand-50 text-brand-600">
              已做 {quizDoneCount}/{quizTotalQuestions.length}
            </span>
          </div>
          {/* 做题进度条：双方每答完一题实时前进 */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-rose-400 transition-all duration-500"
              style={{ width: `${quizTotalQuestions.length ? Math.min(100, (quizDoneCount / quizTotalQuestions.length) * 100) : 0}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 min-[360px]:grid-cols-4">
          {(['轻松版', '走心版', '深度版', '自定义'] as QuestionKind[]).map((kind) => (
            <button
              key={kind}
              className={`min-w-0 rounded-xl border px-2 py-2 text-xs ${
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
              <h4 className="mt-2 break-words font-semibold">{quiz.question.title}</h4>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
              {(['A', 'B'] as const).map((opt) => {
                const answer = opt === 'A' ? quiz.question!.a : quiz.question!.b
                return (
                  <button
                    key={opt}
                    className={`min-w-0 break-words rounded-2xl border p-3 text-left text-sm ${
                      quiz.myChoice === opt || quiz.myChoice === answer
                        ? 'border-brand-400 bg-brand-50 text-brand-600'
                        : 'border-slate-200'
                    }`}
                    onClick={() => {
                      setChoiceMode('preset')
                      submitChoice(answer)
                    }}
                    disabled={quiz.revealed || Boolean(quiz.myChoice)}
                  >
                    <span className="mr-1 font-semibold">{opt}</span>
                    <span>{answer}</span>
                  </button>
                )
              })}
              <button
                className={`min-w-0 rounded-2xl border p-3 text-left text-sm ${
                  choiceMode === 'custom' ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-slate-200'
                }`}
                onClick={() => setChoiceMode('custom')}
                disabled={quiz.revealed || Boolean(quiz.myChoice)}
              >
                <span className="mr-1 font-semibold">C</span>
                <span>自定义回答</span>
              </button>
            </div>
            {choiceMode === 'custom' && !quiz.revealed && (
              <div className="flex min-w-0 flex-col gap-2 min-[420px]:flex-row">
                <input
                  className="input min-w-0 flex-1"
                  placeholder="填写你自己的答案"
                  maxLength={120}
                  value={customAnswer}
                  disabled={Boolean(quiz.myChoice)}
                  onChange={(e) => setCustomAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitChoice(customAnswer)}
                />
                <button
                  className="btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => submitChoice(customAnswer)}
                  disabled={Boolean(quiz.myChoice) || !customAnswer.trim()}
                >
                  提交回答
                </button>
              </div>
            )}

            {quiz.revealed && quiz.myChoice && quiz.peerChoice ? (
              <div
                key={`reveal-${quiz.question.id}`}
                className={`animate-pop-in space-y-1 rounded-2xl border p-4 text-center shadow-sm ${
                  quiz.myChoice === quiz.peerChoice
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                <div className="animate-heart text-2xl">{quiz.myChoice === quiz.peerChoice ? '💖' : '✨'}</div>
                <div className={`break-words text-sm font-semibold ${quiz.myChoice === quiz.peerChoice ? 'text-rose-700' : 'text-emerald-700'}`}>
                  我选了「{choiceLabel(quiz.myChoice, quiz.question)}」
                </div>
                <div className={`break-words text-sm ${quiz.myChoice === quiz.peerChoice ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {friendName} 选了「{choiceLabel(quiz.peerChoice, quiz.question)}」
                </div>
                <div className={`text-xs ${quiz.myChoice === quiz.peerChoice ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {quiz.myChoice === quiz.peerChoice ? '默契满分 💖' : '各有想法也是浪漫 ✨'}
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
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              <input
                className="input min-w-0"
                placeholder="选项 A"
                maxLength={120}
                value={customA}
                onChange={(e) => setCustomA(e.target.value)}
              />
              <input
                className="input min-w-0"
                placeholder="选项 B"
                maxLength={120}
                value={customB}
                onChange={(e) => setCustomB(e.target.value)}
              />
            </div>
            <button className="btn-soft w-full" onClick={addCustomQuestion}>
              加入自定义题库
            </button>
            <p className="text-center text-[11px] text-slate-400">
              已出过 {customRevealedCount} 道自定义题{customQuestions.length > customRevealedCount ? ` · ${customQuestions.length - customRevealedCount} 道待揭晓` : ''}
            </p>
          </div>
        )}
      </section>
      </> : null}

      {activeModule === 'quiz' && (
        <p className="px-1 text-center text-[11px] leading-relaxed text-slate-400">
          同步抉择题库共 {ALL_QUESTIONS.length} 道，每道题只会向你们出一次。
        </p>
      )}

      {activeModule === 'quiz' && quizReveal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden p-6">
          <div className={`absolute inset-0 ${quiz.myChoice === quiz.peerChoice ? 'bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-500' : 'bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500'} opacity-95`} />
          {confettiBits.map((b, i) => (
            <span key={`quiz-${i}`} className="animate-confetti pointer-events-none absolute -top-6" style={{ left: b.left, animationDelay: b.delay, animationDuration: b.duration, fontSize: b.size }}>
              {b.emoji}
            </span>
          ))}
          <div className="animate-pop-in relative w-full max-w-sm rounded-3xl bg-white/95 p-7 text-center shadow-2xl">
            <div className="animate-heart text-5xl">{quiz.myChoice === quiz.peerChoice ? '💖' : '🌿'}</div>
            <div className={`mt-2 text-xs font-medium tracking-widest ${quiz.myChoice === quiz.peerChoice ? 'text-rose-500' : 'text-emerald-500'}`}>
              {quiz.myChoice === quiz.peerChoice ? '默契满分，答案一致' : '答案不同，也各有想法'}
            </div>
            <p className="mt-4 text-lg font-semibold text-slate-700">同步抉择结果已揭晓</p>
            <button className="btn-primary mt-5 w-full" onClick={() => setQuizReveal(false)}>查看结果</button>
          </div>
        </div>
      )}

      {activeModule === 'quiz' && noticeQuizId && (noticeQuizLoading || noticeQuiz) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4" onClick={closeNoticeQuiz}>
          <section className="animate-pop-in max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            {noticeQuizLoading ? (
              <p className="py-8 text-center text-sm text-slate-400">正在加载揭晓结果…</p>
            ) : noticeQuiz && (
              <>
                <div className="text-center text-3xl">{noticeQuiz.matched ? '💖' : '🌿'}</div>
                <p className={`mt-1 text-center text-xs font-medium ${noticeQuiz.matched ? 'text-rose-500' : 'text-emerald-600'}`}>
                  {noticeQuiz.matched ? '默契满分，答案一致' : '答案不同，也各有想法'}
                </p>
                <h2 className="mt-3 break-words text-center text-base font-semibold text-slate-800">{noticeQuiz.question_title}</h2>
                <div className="mt-4 space-y-2">
                  <div className={`break-words rounded-xl p-3 text-sm ${noticeQuiz.matched ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    我选了「{choiceLabel(noticeQuiz.member_a === memberId ? noticeQuiz.choice_a : noticeQuiz.choice_b, {
                      id: noticeQuiz.question_id,
                      title: noticeQuiz.question_title,
                      kind: noticeQuiz.question_kind as QuestionKind,
                      a: noticeQuiz.option_a,
                      b: noticeQuiz.option_b,
                    })}」
                  </div>
                  <div className={`break-words rounded-xl p-3 text-sm ${noticeQuiz.matched ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {friendName} 选了「{choiceLabel(noticeQuiz.member_a === memberId ? noticeQuiz.choice_b : noticeQuiz.choice_a, {
                      id: noticeQuiz.question_id,
                      title: noticeQuiz.question_title,
                      kind: noticeQuiz.question_kind as QuestionKind,
                      a: noticeQuiz.option_a,
                      b: noticeQuiz.option_b,
                    })}」
                  </div>
                </div>
                <button className="btn-primary mt-5 w-full" onClick={closeNoticeQuiz}>关闭</button>
              </>
            )}
          </section>
        </div>
      )}
      </>
    )}

      {/* 情话揭晓动画：双方三餐打卡齐的那一刻同时绽放 */}
      {activeModule === 'love' && loveReveal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 opacity-95" />
          {confettiBits.map((b, i) => (
            <span
              key={i}
              className="animate-confetti pointer-events-none absolute -top-6"
              style={{ left: b.left, animationDelay: b.delay, animationDuration: b.duration, fontSize: b.size }}
            >
              {b.emoji}
            </span>
          ))}
          <div className="animate-pop-in relative w-full max-w-sm rounded-3xl bg-white/95 p-7 text-center shadow-2xl">
            <div className="animate-heart text-4xl">💌</div>
            <div className="mt-2 text-xs font-medium tracking-widest text-rose-400">今日专属情话已解锁</div>
            <p className="mt-4 text-lg font-semibold leading-relaxed text-rose-700">“{loveMessage}”</p>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              你们今日三餐都打卡完啦，这是属于你们的一句话
            </p>
            <button
              className="btn-primary mt-5 w-full"
              onClick={() => {
                if (loveSeenKey) {
                  try {
                    localStorage.setItem(loveSeenKey, JSON.stringify(todayStr()))
                  } catch {
                    // 存储失败不影响关闭本次动画
                  }
                }
                setLoveReveal(false)
              }}
            >
              收下这份甜蜜 💖
            </button>
          </div>
        </div>
      )}

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

      {/* 飞行棋 · 骰子滚动动画 */}
      {diceRolling && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-slate-900/50">
          <div className="animate-bounce text-7xl leading-none text-white drop-shadow-lg">{DICE_FACES[diceFace - 1]}</div>
          <p className="text-sm text-white/90">{memberName || '我'}的骰子正在滚动…</p>
        </div>
      )}

      {/* 飞行棋 · 掷骰结果弹窗：显示走几步和触发的格子 */}
      {diceResult && !diceRolling && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="animate-pop-in w-full max-w-xs space-y-3 rounded-2xl bg-white p-5 text-center shadow-2xl">
            <div className="text-5xl leading-none text-slate-800">
              {diceResult.dice !== null ? (diceResult.dice <= 6 ? DICE_FACES[diceResult.dice - 1] : '🎲') : '⏸'}
            </div>
            <p className="text-base font-bold text-slate-800">
              {diceResult.dice !== null ? `掷出 ${diceResult.dice} 点！` : '本回合被暂停'}
            </p>
            <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-left text-xs leading-relaxed text-slate-600">
              {diceResult.messages.map((text, index) => (
                <p key={index} className="break-words">{text}</p>
              ))}
            </div>
            {diceResult.reroll && diceResult.player === myBoardIndex && (
              <p className="text-[11px] text-brand-600">🎲 踩到重摇格，关掉后继续由你掷骰！</p>
            )}
            <button className="btn-primary w-full" onClick={() => setDiceResult(null)}>
              {diceResult.reroll && diceResult.player === myBoardIndex ? '继续掷骰 🎲' : '知道了'}
            </button>
          </div>
        </div>
      )}

      {/* 扫雷 · 踩雷任务弹窗 */}
      {minesTask && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="animate-pop-in w-full max-w-xs space-y-3 rounded-2xl bg-white p-5 text-center shadow-2xl">
            <div className="animate-bounce text-5xl leading-none">💣</div>
            <p className="text-base font-bold text-slate-800">踩到地雷啦！</p>
            <p className="break-words rounded-xl bg-rose-50 p-3 text-sm leading-relaxed text-rose-700">
              你的互动任务：{minesTask}
            </p>
            <p className="text-[11px] text-slate-400">完成后把回合交给对方继续拆雷～</p>
            <button className="btn-primary w-full" onClick={() => setMinesTask(null)}>接受挑战 💪</button>
          </div>
        </div>
      )}

      {/* 扫雷 · 通关奖励弹窗 */}
      {minesReward && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="animate-pop-in w-full max-w-xs space-y-3 rounded-2xl bg-white p-5 text-center shadow-2xl">
            <div className="text-5xl leading-none">🎉</div>
            <p className="text-base font-bold text-slate-800">通关成功！</p>
            <p className="break-words rounded-xl bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-700">
              解锁奖励：{minesReward}
            </p>
            <button className="btn-primary w-full" onClick={() => setMinesReward(null)}>太棒了 🎉</button>
          </div>
        </div>
      )}
    </div>
  )
}
