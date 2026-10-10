import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../components/Toast'
import {
  appendCoupleEvent,
  broadcastCoupleMessage,
  createCoupleBoardGameHistory,
  createCoupleTruthDare,
  createCoupleWish,
  fetchCoupleBoardGame,
  fetchCoupleQuiz,
  fetchCoupleQuizHistory,
  listCoupleBoardGameHistory,
  listCoupleQuizBank,
  listCoupleQuizPairQuestions,
  listCoupleEvents,
  listCoupleMessages,
  listCoupleQuizHistory,
  listCoupleTruthDare,
  listCoupleWishes,
  listMealsRange,
  resetCoupleQuiz,
  saveCoupleQuizChoice,
  upsertCoupleBoardGame,
  type CoupleBoardCell,
  type CoupleBoardCellKind,
  type CoupleBoardGameHistoryRow,
  type CoupleBoardGameRow,
  type CoupleBoardLogItem,
  type CoupleBoardState,
  type CoupleEventRow,
  type CoupleQuizHistoryRow,
  type CoupleQuizRow,
  type CoupleTruthDareRow,
} from '../lib/db'
import { todayStr } from '../lib/date'
import { EXTRA_COUPLE_QUESTIONS } from '../lib/coupleQuestions'
import { useRealtime } from '../lib/realtime'
import { SLOT_LABEL, type Meal, type MealSlot } from '../lib/types'
import { useFriends } from '../store/friends'
import { useSession } from '../store/session'

type Wish = { id: string; text: string; owner: string }
type DrawnWish = Wish & { drawer: string }
type ChatItem = { id: string; sender_id: string; receiver_id: string; content: string; created_at: string }
export type QuestionKind = '轻松版' | '走心版' | '自定义'
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
  { kind: 'task', text: '说一句一定的话' },
  { kind: 'task', text: '说出对方3个优点' },
  { kind: 'task', text: '请对方一杯奶茶' },
  { kind: 'task', text: '亲亲对方脑阔' },
  { kind: 'task', text: '帮对方剪指甲' },
  { kind: 'dare', text: '做一个大冒险' },
  { kind: 'task', text: '噪声2分钟' },
  { kind: 'truth', text: '回答一个真心话' },
  { kind: 'task', text: '吐舌头2分钟' },
  { kind: 'task', text: '小猪叫3声' },
  { kind: 'task', text: '闭眼撅嘴10秒' },
  { kind: 'task', text: '捏捏对方脸' },
  { kind: 'task', text: '亲亲对方脸蛋' },
  { kind: 'task', text: '十指相扣30秒' },
  { kind: 'task', text: '喂对方喝水' },
  { kind: 'task', text: '舔对方锁骨' },
  { kind: 'task', text: '让对方摸指定位置' },
  { kind: 'task', text: '在对方脸上写字' },
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
  { kind: 'task', text: '手牵手30秒' },
  { kind: 'task', text: '拥抱30秒' },
  { kind: 'task', text: '尝试接吻的感觉' },
  { kind: 'task', text: '说说初次见面的感觉' },
  { kind: 'task', text: '对方闭上眼睛给你涂口红' },
  { kind: 'task', text: '一起给对方按摩' },
  { kind: 'task', text: '背女生转3圈' },
  { kind: 'task', text: '摸对方耳朵2秒' },
  { kind: 'task', text: '摸摸头10秒' },
  { kind: 'task', text: '给对方唱歌' },
  { kind: 'task', text: '一起喝一杯水' },
  { kind: 'task', text: '拍一段表白视频做纪念' },
  { kind: 'task', text: '给对方梳头发' },
  { kind: 'task', text: '给对方按摩捶背1分钟' },
  { kind: 'task', text: '亲吻对方手背30秒' },
  { kind: 'task', text: '拥抱1分钟' },
  { kind: 'task', text: '亲吻一下对方的手' },
  { kind: 'task', text: '被ta挠痒痒30秒' },
  { kind: 'task', text: '从背后抱对方1分钟' },
  { kind: 'task', text: '亲吻对方额头' },
  { kind: 'task', text: '浪漫表白' },
  { kind: 'forward', text: '向前一步', value: 1 },
  { kind: 'forward', text: '继续向前一步', value: 1 },
  { kind: 'forward', text: '前进三格', value: 3 },
  { kind: 'back', text: '后退一格', value: 1 },
  { kind: 'back', text: '后退二格', value: 2 },
  { kind: 'back', text: '后退三格', value: 3 },
  { kind: 'pause', text: '暂停一下' },
  { kind: 'reroll', text: '重摇一次' },
  { kind: 'goal', text: '红色棋子进入终点' },
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

export const ALL_QUESTIONS = [...BUILT_IN_QUESTIONS, ...EXTRA_COUPLE_QUESTIONS]
let managedQuestionsCache: Question[] | null = null
const TRUTH_PROMPTS = [
  '最近一次觉得被我理解的时刻是什么？',
  '我们一起做过的哪件小事让你最开心？',
  '你希望我多了解你的哪一个习惯或想法？',
  '遇到压力时，什么样的陪伴最能帮到你？',
  '你觉得我们最近在哪件事上配合得很好？',
  '有什么简单的小约会是你想和我尝试的？',
  '我做过哪件小事让你觉得很贴心？',
  '未来一年你最期待我们一起完成什么？',
  '意见不同时，怎样沟通会让你更安心？',
  '你想和我一起养成什么日常习惯？',
  '最近有什么感谢我的事还没说出口？',
  '你希望我们怎样庆祝彼此的小成就？',
  '和我在一起时，你最自在的时刻通常是什么？',
  '你最近想学会或重新拾起什么兴趣？',
  '我们可以怎样让忙碌的日子也留有相处时间？',
  '你心目中舒服的周末是什么样子？',
  '有什么话题你希望我们找时间认真聊聊？',
  '你希望我在你难过时先做的第一件事是什么？',
  '如果安排一次半天约会，你最想怎么度过？',
  '你觉得我们共同创造的哪段回忆最珍贵？',
]
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

/** 生成共享棋盘：首尾固定起点/终点，中间格子从内容池随机抽取（池子不够大时循环取） */
function buildBoardCells(size: number): CoupleBoardCell[] {
  const pool = shuffleList(BOARD_CELL_POOL)
  const cells: CoupleBoardCell[] = [{ kind: 'start', text: '起点' }]
  for (let i = 1; i < size - 1; i += 1) {
    cells.push({ ...pool[(i - 1) % pool.length] })
  }
  cells.push({ kind: 'end', text: '终点' })
  return cells
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
  let winner: 0 | 1 | null = state.winner
  let pending = state.pending
  let turn: 0 | 1 = state.turn
  let darePrompt: string | null = null

  if (paused[player] > 0) {
    paused[player] -= 1
    push(`⏸${name}本回合被暂停，跳过行动`)
    return {
      state: { ...state, positions, paused, log: log.slice(-20), dice: null, turn: (1 - player) as 0 | 1, winner, pending },
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
    }
  }

  if (positions[player] >= state.size - 1) {
    winner = player
    push(`🎉${name}到达终点，获得胜利！`)
  } else if (cell?.kind !== 'reroll') {
    turn = (1 - player) as 0 | 1
  }

  return {
    state: { ...state, positions, paused, log: log.slice(-20), dice, turn, winner, pending },
    darePrompt,
    messages,
    reroll: cell?.kind === 'reroll' && positions[player] < state.size - 1,
  }
}

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
  const [searchParams, setSearchParams] = useSearchParams()
  const noticeQuizId = searchParams.get('quiz')
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
  const [managedQuestions, setManagedQuestions] = useState<Question[] | null>(managedQuestionsCache)
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

  /* ------------------------------ 联网飞行棋 ------------------------------ */
  const [boardGame, setBoardGame] = useState<CoupleBoardGameRow | null>(null)
  const [boardLoaded, setBoardLoaded] = useState(false)
  const [boardSaving, setBoardSaving] = useState(false)
  const [boardSetup, setBoardSetup] = useState(false)
  const [boardSize, setBoardSize] = useState(30)
  const [boardStepMin, setBoardStepMin] = useState(1)
  const [boardStepMax, setBoardStepMax] = useState(6)
  const [boardTruthAnswer, setBoardTruthAnswer] = useState('')
  /* 骰子滚动动画 + 掷骰结果弹窗（走几步 / 暂停 / 重摇） */
  const [diceRolling, setDiceRolling] = useState(false)
  const [diceFace, setDiceFace] = useState(1)
  const [diceResult, setDiceResult] = useState<{ dice: number | null; player: 0 | 1; messages: string[]; reroll: boolean } | null>(null)
  /* 对局历史：每局的过程日志与结果都可回看 */
  const [boardHistory, setBoardHistory] = useState<CoupleBoardGameHistoryRow[]>([])
  const [boardHistoryOpenId, setBoardHistoryOpenId] = useState<string | null>(null)

  const questionPool = questionKind === '自定义'
    ? customQuestions
    : (managedQuestions ?? ALL_QUESTIONS).filter((question) => question.kind === questionKind && (pairQuestionIds === null || pairQuestionIds.includes(question.id)))
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

  // 双方三餐打卡齐的那一刻同时揭晓：本方打完最后一餐、或对方实时打完，解锁从 false 变 true 时播放
  useEffect(() => {
    const prev = lovePrevRef.current
    lovePrevRef.current = loveUnlocked
    if (prev !== null && loveUnlocked && !prev && loveSeenKey && readCache<string | null>(loveSeenKey, null) !== todayStr()) {
      setLoveReveal(true)
    }
  }, [loveUnlocked, loveSeenKey])

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

  const reloadTruthHistory = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      setTruthHistory(await listCoupleTruthDare(memberId, friendId, 100))
    } catch (error) {
      console.warn('加载真心话记录失败', error)
    }
  }, [memberId, friendId])

  /** 应用远端棋局：确认属于当前这一对情侣再展示 */
  const applyBoardRow = useCallback(
    (row: CoupleBoardGameRow | null) => {
      if (!row || !memberId || !friendId) return
      const [a, b] = orderedPair(memberId, friendId)
      if (row.member_a !== a || row.member_b !== b) return
      setBoardGame(row)
    },
    [memberId, friendId]
  )

  const reloadBoard = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      applyBoardRow(await fetchCoupleBoardGame(memberId, friendId))
    } catch (error) {
      console.warn('加载飞行棋棋局失败', error)
    } finally {
      setBoardLoaded(true)
    }
  }, [memberId, friendId, applyBoardRow])

  const reloadBoardHistory = useCallback(async () => {
    if (!memberId || !friendId) return
    try {
      setBoardHistory(await listCoupleBoardGameHistory(memberId, friendId, 20))
    } catch (error) {
      console.warn('加载飞行棋对局历史失败', error)
    }
  }, [memberId, friendId])

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

  useRealtime(
    channelKey,
    [
      { table: 'couple_wishes', on: () => void reloadWishes() },
      { table: 'couple_events', event: 'INSERT', on: (p) => onEventRow(p.new as CoupleEventRow) },
      { table: 'couple_quiz', on: (p) => applyQuizRow(p.new as CoupleQuizRow) },
      // 真心话大冒险：对方抽题 / 提交答案后，双方记录列表即时刷新
      { table: 'couple_truth_dare', event: 'INSERT', on: () => void reloadTruthHistory() },
      // 联网飞行棋：对方生成棋盘 / 掷骰后，棋局即时同步
      { table: 'couple_board_games', on: (p) => applyBoardRow(p.new as CoupleBoardGameRow) },
      // 飞行棋对局历史：一局结束落库后即时刷新
      { table: 'couple_board_game_history', event: 'INSERT', on: () => void reloadBoardHistory() },
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
      // 实时推送连不上时的兜底轮询：这里涉及双人互动，比默认 10 秒更勤一些
      pollMs: 5000,
      onPoll: () => {
        void reloadWishes()
        void reloadMessages()
        void reloadQuiz()
        void reloadEvents()
        void reloadMeals()
        void reloadTruthHistory()
        void reloadBoard()
        void reloadBoardHistory()
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
    void reloadTruthHistory()
    void reloadBoard()
    void reloadBoardHistory()
  }, [ready, reloadWishes, reloadMessages, reloadQuiz, reloadEvents, reloadMeals, reloadTruthHistory, reloadBoard, reloadBoardHistory])

  useEffect(() => {
    try {
      if (activeModule) sessionStorage.setItem('couple-active-module', activeModule)
      else sessionStorage.removeItem('couple-active-module')
    } catch {
      // 页面内导航仍可用，只是不跨刷新保留当前模块。
    }
  }, [activeModule])

  // 铃铛通知跳转：/couple?module=truth 直接打开真心话大冒险模块（?quiz= 的揭晓弹窗优先）
  useEffect(() => {
    const module = searchParams.get('module')
    if (!module) return
    setSearchParams(
      (params) => {
        params.delete('module')
        return params
      },
      { replace: true }
    )
    if (noticeQuizId) return
    if (['love', 'wish', 'chat', 'quiz', 'truth', 'board'].includes(module)) setActiveModule(module)
  }, [searchParams, noticeQuizId, setSearchParams])

  useEffect(() => {
    let active = true
    void listCoupleQuizBank(ALL_QUESTIONS)
      .then((rows) => {
        if (!active) return
        const enabledQuestions = rows.filter((row) => row.enabled).map((row) => ({
          id: row.id,
          title: row.title,
          a: row.a,
          b: row.b,
          kind: row.kind,
        }))
        managedQuestionsCache = enabledQuestions
        setManagedQuestions(enabledQuestions)
      })
      .catch(() => {
        if (active) setManagedQuestions(null)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!memberId || !friendId) {
      setUsedQuestionIds(new Set())
      setPairQuestionIds(null)
      setPairQuestionsLoaded(true)
      return
    }
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
  }, [memberId, friendId])

  useEffect(() => {
    if (!memberId || !friendId) {
      setUsedQuestionIds(new Set())
      return
    }
    let active = true
    void listCoupleQuizHistory(memberId, friendId, 5000)
      .then((history) => {
        if (active) setUsedQuestionIds(new Set(history.map((row) => row.question_id)))
      })
      .catch((error) => console.warn('加载已做题目失败', error))
    return () => { active = false }
  }, [memberId, friendId])

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
      localStorage.setItem(key('questions', myId, friendId), JSON.stringify(customQuestions))
    } catch {
      // 存储失败不影响使用
    }
  }, [customQuestions, myId, friendId])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ------------------------------ 互动操作 ------------------------------ */

  const pickQuestion = async (kind: QuestionKind = questionKind) => {
    // 一方已作答、另一方还没答完时，题目被锁定，不允许换题/切换分类
    if (quiz.question && !quiz.revealed) return
    if (kind !== '自定义' && (!managedQuestions || !pairQuestionsLoaded)) {
      return toast.show('题库或情侣题目配置仍在加载，请稍后重试', 'err')
    }
    const pool = kind === '自定义'
      ? customQuestions
      : (managedQuestions ?? []).filter((question) => question.kind === kind && (pairQuestionIds === null || pairQuestionIds.includes(question.id)))
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

  const drawTruth = () => {
    const usedPrompts = new Set(truthHistory.map((row) => row.prompt))
    const pool = TRUTH_PROMPTS.filter((p) => !usedPrompts.has(p))
    const list = pool.length ? pool : TRUTH_PROMPTS
    setTruthDraw({ type: 'truth', prompt: list[Math.floor(Math.random() * list.length)] })
    setTruthAnswer('')
  }

  const drawDare = async () => {
    const usedPrompts = new Set(truthHistory.map((row) => row.prompt))
    const pool = DARES.filter((p) => !usedPrompts.has(p))
    const list = pool.length ? pool : DARES
    const prompt = list[Math.floor(Math.random() * list.length)]
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
  /** 双方展示名：下标 0 = member_a（红棋），1 = member_b（蓝棋） */
  const boardNames: [string, string] | null = boardGame && memberId
    ? [
        boardGame.member_a === memberId ? memberName || '我' : friendName,
        boardGame.member_b === memberId ? memberName || '我' : friendName,
      ]
    : null

  const startBoardGame = async () => {
    if (!memberId || !friendId) return toast.show('暂未检测到专属好友对象', 'err')
    const stepMax = Math.max(boardStepMin, boardStepMax)
    const myIndex: 0 | 1 = memberId < friendId ? 0 : 1
    const myName = memberName || '我'
    const state: CoupleBoardState = {
      size: boardSize,
      stepMin: boardStepMin,
      stepMax,
      cells: buildBoardCells(boardSize),
      positions: [0, 0],
      turn: myIndex,
      paused: [0, 0],
      dice: null,
      log: [{ at: new Date().toISOString(), text: `🎯棋盘已生成，由${myName}先掷骰` }],
      winner: null,
      pending: null,
    }
    setBoardSaving(true)
    try {
      await upsertCoupleBoardGame(memberId, friendId, state)
      const [memberA, memberB] = orderedPair(memberId, friendId)
      setBoardGame({ member_a: memberA, member_b: memberB, state, updated_at: new Date().toISOString() })
      setBoardSetup(false)
      toast.show('棋盘已生成，和 TA 轮流掷骰吧 🎯')
    } catch (error) {
      toast.show((error as Error).message, 'err')
    } finally {
      setBoardSaving(false)
    }
  }

  const rollBoardDice = async () => {
    if (!boardGame || !boardState || !memberId || !friendId) return
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
    // 对方生成新棋盘（未掷骰、棋盘内容变化且先手是对方）
    if (
      boardState.winner === null &&
      boardState.dice === null &&
      prev.cells !== boardState.cells &&
      boardState.turn !== myBoardIndex
    ) {
      toast.show(`🎯 ${friendName} 生成了新棋盘，等 TA 先掷骰～`)
    }
    // 对方率先到达终点
    if (boardState.winner !== null && prev.winner === null && boardState.winner !== myBoardIndex) {
      toast.show(`🏁 ${friendName} 率先到达终点，这局 TA 赢啦～`)
    }
  }, [boardState, boardGame, myBoardIndex, friendName, toast])

  /**
   * 飞行棋对局中加快同步：等待对方行动（对方掷骰 / 对方作答真心话）时，
   * 每 2 秒主动拉一次棋局——实时推送可用时它只是冗余兜底，
   * 推送连不上时也能把回合交接的等待压到 2 秒内。
   */
  const awaitingBoardPeer =
    activeModule === 'board' &&
    boardGame !== null &&
    boardGame.state.winner === null &&
    (boardGame.state.turn !== myBoardIndex ||
      (boardGame.state.pending !== null && boardGame.state.pending.player !== myBoardIndex))
  useEffect(() => {
    if (!awaitingBoardPeer) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reloadBoard()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [awaitingBoardPeer, reloadBoard])

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
      <div className="min-w-0 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-rose-400 to-orange-300 p-4 text-white shadow-card sm:p-5">
        <div className="text-xs opacity-80">FRIENDSHIP PLAYGROUND</div>
        <h2 className="mt-1 break-words text-xl font-bold">和 {friendName} 的互动空间</h2>
        {/* <p className="mt-1 break-words text-xs opacity-90">把日常、心愿和默契，变成你们的共同回忆。</p> */}
      </div>

      {!activeModule ? (
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: 'love', icon: '💌', title: '今日情话', detail: loveUnlocked ? '今日已解锁' : '完成三餐打卡解锁' },
            { id: 'wish', icon: '🎁', title: '秘密心愿', detail: `${wishesList.length} 个心愿` },
            { id: 'chat', icon: '💬', title: '甜蜜留言', detail: `${messages.length} 条留言` },
            { id: 'quiz', icon: '💞', title: '同步抉择', detail: `${ALL_QUESTIONS.length + customQuestions.length} 道题` },
            { id: 'truth', icon: '🎲', title: '真心话大冒险', detail: '聊聊心里话，完成小挑战' },
            { id: 'board', icon: '🎯', title: '情侣飞行棋', detail: '联网轮流掷骰对战' },
          ].map((module) => (
            <button key={module.id} type="button" className="card flex min-h-28 flex-col items-start justify-between gap-3 text-left transition hover:border-brand-200" onClick={() => setActiveModule(module.id)}>
              <span className="text-2xl">{module.icon}</span>
              <span>
                <span className="block text-sm font-semibold text-slate-700">{module.title}</span>
                <span className="mt-1 block text-[11px] text-slate-400">{module.detail}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <button type="button" className="btn-ghost w-full" onClick={() => setActiveModule(null)}>← 返回互动入口</button>
          {activeModule === 'truth' && (
            <section className="card space-y-4">
              <div>
                <h3 className="font-semibold">🎲真心话大冒险</h3>
                <p className="text-xs text-slate-400">真心话要写下答案，提交后对方立刻知晓；题目和答案都会留档。</p>
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-600">我们的记录</h4>
                  <span className="chip border-slate-200 bg-slate-50 text-slate-500">{truthHistory.length} 条</span>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
                  {truthHistory.length === 0 && <p className="py-4 text-center text-xs text-slate-400">还没有记录，抽一题试试吧～</p>}
                  {truthHistory.map((row) => {
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
              </div>
            </section>
          )}
          {activeModule === 'board' && (
            <section className="card space-y-4">
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
                    <label className="text-xs text-slate-500">棋盘格数<select className="input mt-1" value={boardSize} onChange={(event) => setBoardSize(Number(event.target.value))}><option value={20}>20 格</option><option value={30}>30 格</option><option value={40}>40 格</option><option value={50}>50 格</option></select></label>
                    <label className="text-xs text-slate-500">每次最少步数<select className="input mt-1" value={boardStepMin} onChange={(event) => setBoardStepMin(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value} 步</option>)}</select></label>
                    <label className="text-xs text-slate-500">每次最多步数<select className="input mt-1" value={boardStepMax} onChange={(event) => setBoardStepMax(Math.max(boardStepMin, Number(event.target.value)))}>{[2, 3, 4, 5, 6, 8, 10].map((value) => <option key={value} value={value}>{value} 步</option>)}</select></label>
                  </div>
                  <button className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40" disabled={boardSaving} onClick={() => void startBoardGame()}>
                    {boardSaving ? '生成中…' : boardGame ? '生成新棋盘并开始' : '生成棋盘并开始'}
                  </button>
                  {boardGame && boardGame.state.winner === null && (
                    <button className="btn-ghost w-full" onClick={() => setBoardSetup(false)}>返回当前棋局</button>
                  )}
                  <p className="text-center text-[11px] leading-relaxed text-slate-400">棋盘和步数会同步给对方，双方轮流掷骰，格子任务从专属内容池随机抽取。</p>
                </>
              ) : boardState ? (
                <>
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-brand-50 px-3 py-2 text-xs text-brand-700">
                    <span className="truncate">🔴 {boardNames?.[0]} · {boardState.positions[0] + 1} 格</span>
                    <span className="shrink-0 font-semibold">
                      {boardState.winner !== null
                        ? `🎉${boardNames?.[boardState.winner] ?? ''}获胜！`
                        : boardState.turn === myBoardIndex
                          ? '轮到你掷骰'
                          : `等待 ${friendName} 掷骰…`}
                    </span>
                    <span className="truncate">🔵 {boardNames?.[1]} · {boardState.positions[1] + 1} 格</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {boardState.cells.map((cell, index) => {
                      const positionA = Math.min(boardState.positions[0], boardState.size - 1)
                      const positionB = Math.min(boardState.positions[1], boardState.size - 1)
                      const special = cell.kind !== 'start' && cell.kind !== 'end'
                      return (
                        <div key={index} title={cell.text} className={`flex aspect-square flex-col items-center justify-center rounded-md text-[10px] text-slate-500 ring-1 ${special ? 'bg-amber-50 ring-amber-200' : 'bg-emerald-50 ring-emerald-100'}`}>
                          <div className="break-words px-0.5 text-center leading-tight">
                            {positionA === index && <span aria-label="红棋" className="mr-0.5">🔴</span>}
                            {positionB === index && <span aria-label="蓝棋" className="mr-0.5">🔵</span>}
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
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    {[...boardState.log].reverse().map((item, index) => (
                      <p key={`${item.at}-${index}`} className="break-words">{item.text}</p>
                    ))}
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
                      disabled={boardState.turn !== myBoardIndex || boardSaving || Boolean(boardState.pending)}
                      onClick={() => void rollBoardDice()}
                    >
                      {boardState.turn === myBoardIndex
                        ? boardSaving
                          ? '掷骰中…'
                          : boardState.paused[myBoardIndex] > 0
                            ? '掷骰子（本回合暂停）'
                            : '掷骰子'
                        : `等待 ${friendName} 掷骰…`}
                    </button>
                  )}
                  <button
                    className="btn-ghost w-full"
                    onClick={() => {
                      if (window.confirm('重新生成棋盘会结束当前棋局，确定吗？')) setBoardSetup(true)
                    }}
                  >
                    重新设置棋盘
                  </button>
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
                {boardHistory.map((row) => {
                  const winnerId = row.winner === 0 ? row.member_a : row.member_b
                  const winnerName = winnerId === memberId ? memberName || '我' : friendName
                  const loserName = winnerId === memberId ? friendName : memberName || '我'
                  const open = boardHistoryOpenId === row.id
                  return (
                    <div key={row.id} className="rounded-xl bg-slate-50 p-3 text-xs">
                      <button
                        className="flex w-full items-center justify-between gap-2 text-left"
                        onClick={() => setBoardHistoryOpenId(open ? null : row.id)}
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
                            棋盘 {row.state.size} 格 · 步数 {row.state.stepMin}-{row.state.stepMax} · 终局位置 红 {row.state.positions[0] + 1} 格 / 蓝 {row.state.positions[1] + 1} 格
                          </p>
                          <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg bg-white p-2 text-[11px] leading-relaxed text-slate-600">
                            {row.state.log.map((item, index) => (
                              <p key={index} className="break-words">{item.text}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}

      {activeModule === 'love' ? <>
      {/* 今日专属情话：双方三餐打卡完毕才解锁，两边看到同一句 */}
      <section className="card space-y-3">
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
            <button className="btn-soft w-full" onClick={() => navigate('/meals')}>
              去完成我的三餐打卡
            </button>
          </div>
        )}
      </section>

      </> : null}

      {activeModule === 'wish' ? <>
      {/* 秘密心愿池：好友双方共享，抽签结果双方同步 */}
      <section className="card space-y-3">
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
      <section className="card space-y-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-semibold">💬甜蜜聊天留言板</h3>
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
      <section className="card space-y-3">
        <div>
          <h3 className="font-semibold">💞同步抉择</h3>
          <p className="text-[11px] text-slate-400">题目与选择双方实时同步，一起在线玩更配哦</p>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
          {(['轻松版', '走心版', '自定义'] as QuestionKind[]).map((kind) => (
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
            <p className="text-center text-[11px] text-slate-400">已有 {questionPool.length} 道自定义题</p>
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
              你们今天的三餐都打卡完成啦，这是只属于你们的一句话
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
    </div>
  )
}
