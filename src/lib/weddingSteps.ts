/**
 * 备婚流程步骤模板：从「确定心意」到「结完婚」。
 *
 * 这里只是**内置起点**，不是硬编码的死流程：情侣可以增删改大步骤和每条小待办，
 * 自定义后的完整流程存在 couple_wedding.state.steps 里；没存过就用这里的默认模板。
 *
 * 小待办的 id 是稳定标识——默认项的 id 就是原来的序号（'0' / '1' / '2'），
 * 这样老版本按序号存的勾选和备注能无缝接上；新增项用独立 id，插在中间也不会让旧数据串位。
 */

/** 待办项归属：todo = 要做的事，prepare = 要准备的东西 */
export type WeddingItemKind = 'todo' | 'prepare'

/** 一条小待办：id 稳定、文案可改 */
export interface WeddingItem {
  id: string
  text: string
}

export interface WeddingStep {
  id: string
  emoji: string
  title: string
  /** 这一步大概在什么时候做，给个时间感 */
  timing: string
  /** 要做的事（可勾选） */
  todo: WeddingItem[]
  /** 要准备的东西（可勾选） */
  prepare: WeddingItem[]
}

const it = (id: string, text: string): WeddingItem => ({ id, text })

export const WEDDING_STEPS: WeddingStep[] = [
  {
    id: 'proposal',
    emoji: '💍',
    title: '求婚与确定心意',
    timing: '一切的开始',
    todo: [
      it('0', '认真聊一次「我们到底要不要结婚」'),
      it('1', '对齐彼此对婚期的预期'),
      it('2', '先和各自父母通个气'),
      it('talk-city', '深聊定居哪座城市、两人的事业怎么安排（异地尤其要谈拢）'),
      it('talk-boundary', '聊清双方父母赡养、婚后边界和各自的底线'),
    ],
    prepare: [
      it('0', '一颗确定的心'),
      it('1', '想好怎么开口'),
      it('2', '对婚后生活的大致想法'),
    ],
  },
  {
    id: 'meet-parents',
    emoji: '🤝',
    title: '见双方父母',
    timing: '婚前 12 个月',
    todo: [
      it('0', '先去一方家里正式拜访'),
      it('1', '再去另一方家里'),
      it('2', '商量两家人正式见面的时间'),
      it('talk-visit', '两个人先说好见面礼、称呼和拜访节奏，别临时才发现想法不一样'),
      it('talk-habit', '异地恋爱的话，提前聊聊两家习俗和作息差异，互相打个底'),
    ],
    prepare: [
      it('0', '见面礼（补品 / 水果 / 特产）'),
      it('1', '自己的基本情况'),
      it('2', '可能被问到的问题的答案'),
    ],
  },
  {
    id: 'betrothal',
    emoji: '💰',
    title: '提亲与谈彩礼',
    timing: '婚前 10 个月',
    todo: [
      it('0', '两家人正式坐下来谈一次'),
      it('1', '谈彩礼、嫁妆和各自承担的部分'),
      it('2', '把谈定的结果留个书面记录'),
      it('talk-money', '两个人先关起门来谈好彩礼、嫁妆和婚前财产的期望与底线，再各自去做父母工作'),
      it('talk-far', '异地要提前说清：谁先回家乡、来回几次、婚礼前多久住到一起'),
    ],
    prepare: [
      it('0', '双方家庭的心理预期'),
      it('1', '谁来当中间人'),
      it('2', '自己能接受的底线与让步空间'),
    ],
  },
  {
    id: 'date',
    emoji: '📅',
    title: '定婚期与择日',
    timing: '婚前 8-10 个月',
    todo: [
      it('0', '圈出双方都方便的时间段'),
      it('1', '参考长辈意见或黄历择日'),
      it('2', '避开旺季涨价和亲友档期冲突'),
      it('talk-date', '异地先把两人的假期、往返交通和请假成本摆出来，再定日子'),
    ],
    prepare: [
      it('0', '双方的工作与假期安排'),
      it('1', '重要亲友的时间'),
      it('2', '备选的两个日期'),
    ],
  },
  {
    id: 'budget',
    emoji: '🧮',
    title: '定预算与分工',
    timing: '婚前 8 个月',
    todo: [
      it('0', '列出所有可能花钱的项目'),
      it('1', '确定总预算和两家分摊比例'),
      it('2', '开一张备婚专用的记账表'),
      it('talk-cost', '把异地带来的交通、住宿、请假日成本也算进来，说清谁承担哪一块'),
    ],
    prepare: [
      it('0', '各自的存款情况'),
      it('1', '双方父母愿意支持多少'),
      it('2', '哪些项目可以省'),
    ],
  },
  {
    id: 'venue',
    emoji: '🏨',
    title: '订婚礼场地',
    timing: '婚前 6-8 个月',
    todo: [
      it('0', '确定办几场、在哪几座城市办'),
      it('1', '实地看 3-5 家场地对比'),
      it('2', '签合同、交定金'),
    ],
    prepare: [
      it('0', '预估的桌数与人数'),
      it('1', '场地预算'),
      it('2', '交通与住宿是否方便'),
    ],
  },
  {
    id: 'register',
    emoji: '💒',
    title: '领证',
    timing: '婚前 6 个月或更早',
    todo: [
      it('0', '挑一个对你们有意义的日子'),
      it('1', '去一方户籍所在地的民政局'),
      it('2', '领完证拍张合照纪念一下'),
    ],
    prepare: [
      it('0', '双方身份证、户口本'),
      it('1', '3 张 2 寸近期半身免冠合影'),
      it('2', '离婚 / 丧偶证明（如适用）'),
    ],
  },
  {
    id: 'photo',
    emoji: '📸',
    title: '拍婚纱照',
    timing: '婚前 4-6 个月',
    todo: [
      it('0', '选风格和拍摄地（影楼 / 旅拍）'),
      it('1', '定下拍摄档期'),
      it('2', '拍摄并选片'),
    ],
    prepare: [
      it('0', '几套自己的衣服'),
      it('1', '隐形内衣、胸贴、浅色鞋'),
      it('2', '喜欢的样片参考'),
    ],
  },
  {
    id: 'vendors',
    emoji: '🎤',
    title: '定婚庆与四大金刚',
    timing: '婚前 3-5 个月',
    todo: [
      it('0', '定司仪、摄影、摄像、化妆'),
      it('1', '和婚庆确认布置方案'),
      it('2', '把所有服务写进合同'),
    ],
    prepare: [
      it('0', '婚礼风格参考图'),
      it('1', '各环节的音乐清单'),
      it('2', '当天的流程表'),
    ],
  },
  {
    id: 'dress',
    emoji: '👗',
    title: '挑婚纱与礼服',
    timing: '婚前 3-4 个月',
    todo: [
      it('0', '试穿并定下主纱与敬酒服'),
      it('1', '给新郎定西装'),
      it('2', '安排伴娘伴郎的服装'),
    ],
    prepare: [
      it('0', '准确的身材尺寸'),
      it('1', '婚礼场地的风格参考'),
      it('2', '预留改衣的时间'),
    ],
  },
  {
    id: 'rings',
    emoji: '💎',
    title: '买三金五金与对戒',
    timing: '婚前 2-3 个月',
    todo: [
      it('0', '逛几家对比金价与款式'),
      it('1', '定下三金 / 五金和对戒'),
      it('2', '留好发票与证书'),
    ],
    prepare: [
      it('0', '这一项的预算'),
      it('1', '双方的戒指手寸'),
      it('2', '长辈对样式的意见'),
    ],
  },
  {
    id: 'invite',
    emoji: '💌',
    title: '发请柬与统计人数',
    timing: '婚前 1-2 个月',
    todo: [
      it('0', '列宾客名单、分桌'),
      it('1', '发电子 / 纸质请柬'),
      it('2', '回收人数、安排座位'),
    ],
    prepare: [
      it('0', '双方亲友的联系方式'),
      it('1', '酒店的桌数上限'),
      it('2', '回门 / 答谢宴的名单'),
    ],
  },
  {
    id: 'rehearsal',
    emoji: '🎀',
    title: '彩排与婚前准备',
    timing: '婚前 1 周',
    todo: [
      it('0', '完整走一遍婚礼流程'),
      it('1', '确认所有供应商的到场时间'),
      it('2', '布置婚房、备好红包与伴手礼'),
    ],
    prepare: [
      it('0', '当天的物品清单'),
      it('1', '红包、喜糖、伴手礼'),
      it('2', '应急包（针线、别针、创可贴）'),
    ],
  },
  {
    id: 'wedding-day',
    emoji: '🎊',
    title: '婚礼当天',
    timing: '最重要的那一天',
    todo: [
      it('0', '按流程走完接亲、仪式、敬酒'),
      it('1', '留十分钟给两个人单独待一会儿'),
      it('2', '当天拍一张只有你们的合照'),
    ],
    prepare: [
      it('0', '结婚证与戒指'),
      it('1', '仪式上想说的话'),
      it('2', '一份好心情'),
    ],
  },
  {
    id: 'honeymoon',
    emoji: '✈️',
    title: '蜜月旅行',
    timing: '婚后 1 个月内',
    todo: [
      it('0', '定目的地和出行时间'),
      it('1', '订机票酒店、办签证'),
      it('2', '把工作和家里的事交代好'),
    ],
    prepare: [
      it('0', '护照与签证'),
      it('1', '旅行保险'),
      it('2', '行李与常用药品'),
    ],
  },
  {
    id: 'after',
    emoji: '🏠',
    title: '回门与婚后生活',
    timing: '婚礼之后',
    todo: [
      it('0', '办回门 / 答谢宴'),
      it('1', '整理婚礼的照片与视频'),
      it('2', '结清礼金和备婚账目'),
    ],
    prepare: [
      it('0', '回门礼'),
      it('1', '婚礼影像的备份'),
      it('2', '一张小家的计划表'),
    ],
  },
]

/** 新建一份可自由编辑的步骤副本（深拷贝），避免改到模板本身 */
export const cloneWeddingSteps = (): WeddingStep[] =>
  WEDDING_STEPS.map((step) => ({
    ...step,
    todo: step.todo.map((item) => ({ ...item })),
    prepare: step.prepare.map((item) => ({ ...item })),
  }))

/** 待办项的存储 key：步骤 id + 归属 + 稳定的待办 id，改文案不会错位 */
export const weddingItemKey = (stepId: string, kind: WeddingItemKind, itemId: string): string =>
  `${stepId}|${kind}|${itemId}`

/** 内置模板的步数；实际总步数以 state.steps 为准 */
export const WEDDING_TOTAL = WEDDING_STEPS.length
