import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  Home,
  ListChecks,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  StickyNote,
  Trash2,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

type Tab = 'home' | 'ledger' | 'voice' | 'schedule' | 'mine';
type ExpenseCategory = '餐饮' | '交通' | '购物' | '学习' | '娱乐' | '住宿' | '医疗' | '其他';
type ReimbursementStatus = '无需报销' | '待报销' | '已报销';
type ScheduleStatus = '未开始' | '进行中' | '已完成';
type Intent = 'expense' | 'income' | 'schedule' | 'memo' | 'query' | 'delete' | 'unknown';
type MoneyType = 'expense' | 'income';

interface Expense {
  id: string;
  type?: MoneyType;
  date: string;
  amount: number;
  item: string;
  category: ExpenseCategory;
  paymentMethod: string;
  reimbursable: boolean;
  reimbursementStatus: ReimbursementStatus;
  sourceText: string;
  createdAt: string;
}

interface ScheduleItem {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  location: string;
  note: string;
  status: ScheduleStatus;
  sourceText: string;
  createdAt: string;
}

interface MemoItem {
  id: string;
  title: string;
  content: string;
  status: '未完成' | '已完成';
  sourceText: string;
  createdAt: string;
}

interface SettingsState {
  defaultPaymentMethod: string;
  paymentMethods: string[];
  reimbursementKeywords: string;
  remindersEnabled: boolean;
  useLLM: boolean;
}

type EngineStatus = 'idle' | 'qwen' | 'rules' | 'qwen-unavailable';
type EngineInfo = { status: EngineStatus; model?: string };

interface AuthUser {
  id: string;
  username: string;
  createdAt: string;
}

type ParsedResult =
  | { intent: 'expense'; sourceText: string; expense: Expense; engine: 'rules' | 'qwen' }
  | { intent: 'income'; sourceText: string; income: Expense; engine: 'rules' | 'qwen' }
  | { intent: 'schedule'; sourceText: string; schedule: ScheduleItem; engine: 'rules' | 'qwen' }
  | { intent: 'memo'; sourceText: string; memo: MemoItem; engine: 'rules' | 'qwen' }
  | { intent: 'query'; sourceText: string; queryType: string; engine: 'rules' | 'qwen' }
  | { intent: 'reimbursed'; sourceText: string; target: Expense; engine: 'rules' | 'qwen' }
  | { intent: 'delete'; sourceText: string; targetType: 'expense' | 'schedule' | 'memo'; target: Expense | ScheduleItem | MemoItem; engine: 'rules' | 'qwen' }
  | { intent: 'unknown'; sourceText: string; message: string; engine: 'rules' | 'qwen' };

const expenseCategories: ExpenseCategory[] = ['餐饮', '交通', '购物', '学习', '娱乐', '住宿', '医疗', '其他'];
const today = new Date();

const pad = (n: number) => String(n).padStart(2, '0');
const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateAdd = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};
const yuan = (n: number) => `¥${n.toFixed(2).replace('.00', '')}`;
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const demoExpenses: Expense[] = [
  { id: uid(), type: 'expense', date: toDateKey(today), amount: 18, item: '咖啡', category: '餐饮', paymentMethod: '支付宝', reimbursable: false, reimbursementStatus: '无需报销', sourceText: '我刚刚买咖啡花了18元', createdAt: new Date().toISOString() },
  { id: uid(), type: 'expense', date: toDateKey(dateAdd(-1)), amount: 32, item: '打车', category: '交通', paymentMethod: '微信', reimbursable: true, reimbursementStatus: '待报销', sourceText: '我昨天打车花了32元，需要报销', createdAt: new Date().toISOString() },
  { id: uid(), type: 'expense', date: toDateKey(dateAdd(-4)), amount: 96, item: '课程资料', category: '学习', paymentMethod: '银行卡', reimbursable: true, reimbursementStatus: '待报销', sourceText: '买课程资料花了96元，公司报', createdAt: new Date().toISOString() },
  { id: uid(), type: 'income', date: toDateKey(dateAdd(-2)), amount: 3800, item: '项目兼职收入', category: '其他', paymentMethod: '银行卡', reimbursable: false, reimbursementStatus: '无需报销', sourceText: '这个月兼职收入3800元', createdAt: new Date().toISOString() },
];

const demoSchedules: ScheduleItem[] = [
  { id: uid(), date: toDateKey(today), startTime: '09:30', endTime: '10:30', title: '项目晨会', location: '线上会议室', note: '', status: '未开始', sourceText: '今天上午9点半项目晨会', createdAt: new Date().toISOString() },
  { id: uid(), date: toDateKey(today), startTime: '15:00', endTime: '', title: '面试作品演示', location: '', note: '准备 LifeFlow 演示', status: '未开始', sourceText: '今天下午3点面试作品演示', createdAt: new Date().toISOString() },
  { id: uid(), date: toDateKey(dateAdd(1)), startTime: '10:00', endTime: '', title: '组会', location: '', note: '', status: '未开始', sourceText: '明天上午10点有组会', createdAt: new Date().toISOString() },
];

const demoMemos: MemoItem[] = [
  { id: uid(), title: '面试演示重点', content: '强调语音入口、Qwen 结构化、年度账单和备忘录场景。', status: '未完成', sourceText: '记一下，面试演示要强调语音入口和年度账单', createdAt: new Date().toISOString() },
];

const defaultSettings: SettingsState = {
  defaultPaymentMethod: '',
  paymentMethods: ['支付宝', '微信', '银行卡', '现金', '其他'],
  reimbursementKeywords: '报销,待报销,公司报,可以报,记得报,走报销',
  remindersEnabled: true,
  useLLM: true,
};

function normalizeSettings(settings: SettingsState): SettingsState {
  const methods = Array.isArray(settings.paymentMethods) && settings.paymentMethods.length
    ? settings.paymentMethods
    : defaultSettings.paymentMethods;
  return {
    ...defaultSettings,
    ...settings,
    paymentMethods: Array.from(new Set([...methods.filter(Boolean), '其他'])),
  };
}

function useStoredState<T>(key: string, initial: T) {
  const [activeKey, setActiveKey] = useState(key);
  const [state, setState] = useState<T>(() => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : initial;
  });
  useEffect(() => {
    if (activeKey !== key) {
      const raw = localStorage.getItem(key);
      setState(raw ? (JSON.parse(raw) as T) : initial);
      setActiveKey(key);
    }
  }, [activeKey, initial, key]);
  useEffect(() => {
    if (activeKey === key) localStorage.setItem(key, JSON.stringify(state));
  }, [activeKey, key, state]);
  return [state, setState] as const;
}

function cnAmountToNumber(text: string) {
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const m = text.match(/([一二两三四五六七八九十]+)块([一二两三四五六七八九])?/);
  if (!m) return null;
  const whole = m[1];
  let value = 0;
  if (whole === '十') value = 10;
  else if (whole.includes('十')) {
    const [a, b] = whole.split('十');
    value = (a ? digits[a] : 1) * 10 + (b ? digits[b] : 0);
  } else value = digits[whole] ?? 0;
  if (m[2]) value += (digits[m[2]] ?? 0) / 10;
  return value;
}

function parseDate(text: string) {
  const weekMatch = text.match(/(?:这周|本周|周|星期)([一二三四五六日天]|[1-7])/);
  if (weekMatch) {
    const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7 };
    const start = startOfWeekDate();
    start.setDate(start.getDate() + (map[weekMatch[1]] || 1) - 1);
    return toDateKey(start);
  }
  if (/前天/.test(text)) return toDateKey(dateAdd(-2));
  if (/昨天/.test(text)) return toDateKey(dateAdd(-1));
  if (/明天/.test(text)) return toDateKey(dateAdd(1));
  if (/后天/.test(text)) return toDateKey(dateAdd(2));
  const md = text.match(/(\d{1,2})\s*(?:月|[.\/-])\s*(\d{1,2})\s*(?:日|号)?/);
  if (md) return `${today.getFullYear()}-${pad(Number(md[1]))}-${pad(Number(md[2]))}`;
  return toDateKey(today);
}

function parseAmount(text: string) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:元|块|块钱|人民币)/);
  if (m) return Number(m[1]);
  return cnAmountToNumber(text) ?? 0;
}

function parsePaymentMethod(text: string) {
  if (/支付宝|花呗/.test(text)) return '支付宝';
  if (/微信|零钱|微信支付/.test(text)) return '微信';
  if (/银行卡|信用卡|储蓄卡|卡里|刷卡/.test(text)) return '银行卡';
  if (/现金/.test(text)) return '现金';
  if (/美团|大众点评/.test(text)) return '美团';
  if (/京东/.test(text)) return '京东';
  if (/淘宝|天猫/.test(text)) return '淘宝';
  return '';
}

function chineseTimeNumber(raw: string) {
  const map: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === '十') return 10;
  if (raw.startsWith('十')) return 10 + (map[raw.slice(1)] ?? 0);
  if (raw.includes('十')) {
    const [a, b] = raw.split('十');
    return (map[a] ?? 1) * 10 + (b ? map[b] ?? 0 : 0);
  }
  return map[raw] ?? Number.NaN;
}

function cleanSourceForItem(text: string) {
  return text
    .replace(/支付方式(是|为)?[^，。,. ]+/g, '')
    .replace(/(用|从|通过)(支付宝|微信|银行卡|信用卡|储蓄卡|现金|花呗|美团|京东|淘宝|天猫)(支付|付|付款|收款|收到)?/g, '')
    .replace(/\d+(?:\.\d+)?\s*(元|块|块钱|人民币)/g, '')
    .replace(/[，。,.]/g, ' ')
    .trim();
}

function parseTimeOne(raw: string, marker = '') {
  const m = raw.match(/(\d{1,2}|[一二两三四五六七八九十]{1,3})(?::|：)?(\d{2})?\s*(?:点|分)?/);
  if (!m) return '';
  let hour = chineseTimeNumber(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (/下午|晚上|今晚|夜里|傍晚/.test(marker) && hour < 12) hour += 12;
  if (/中午/.test(marker) && hour < 11) hour += 12;
  return `${pad(hour)}:${pad(minute)}`;
}

function parseTimeRange(text: string) {
  const range = text.match(/(上午|下午|晚上|今晚|中午|傍晚|夜里)?\s*(\d{1,2}|[一二两三四五六七八九十]{1,3})(?:(?::|：)(\d{2}))?\s*(?:点)?\s*(?:到|至|-|~)\s*(上午|下午|晚上|今晚|中午|傍晚|夜里)?\s*(\d{1,2}|[一二两三四五六七八九十]{1,3})(?:(?::|：)(\d{2}))?/);
  if (range) return { startTime: parseTimeOne(`${range[2]}${range[3] ? `:${range[3]}` : ''}`, range[1] || ''), endTime: parseTimeOne(`${range[5]}${range[6] ? `:${range[6]}` : ''}`, range[4] || range[1] || '') };
  const single = text.match(/(上午|下午|晚上|今晚|中午|傍晚|夜里)?\s*(\d{1,2}(?::|：)\d{2}|(?:\d{1,2}|[一二两三四五六七八九十]{1,3})\s*点(?:半)?)/);
  if (!single) {
    if (/今晚|晚上|夜里/.test(text)) return { startTime: '晚上', endTime: '' };
    if (/下午/.test(text)) return { startTime: '下午', endTime: '' };
    if (/上午|早上|早晨/.test(text)) return { startTime: '上午', endTime: '' };
    if (/中午/.test(text)) return { startTime: '中午', endTime: '' };
    return { startTime: '', endTime: '' };
  }
  const raw = single[2].replace('半', '30');
  return { startTime: parseTimeOne(raw, single[1] || ''), endTime: '' };
}

function inferCategory(text: string): ExpenseCategory {
  if (/咖啡|奶茶|水果|苹果|香蕉|吃饭|外卖|餐|饭|面包/.test(text)) return '餐饮';
  if (/打车|地铁|公交|机票|火车票|订票|充电/.test(text)) return '交通';
  if (/衣服|鞋|淘宝|京东|买了|购物/.test(text)) return '购物';
  if (/书|课程|资料|学习/.test(text)) return '学习';
  if (/电影|游戏|演唱会|娱乐/.test(text)) return '娱乐';
  if (/酒店|住宿|民宿/.test(text)) return '住宿';
  if (/医院|药|体检|医疗/.test(text)) return '医疗';
  return '其他';
}

function inferItem(text: string, category: ExpenseCategory) {
  const direct = ['token', '会员', '咖啡', '奶茶', '水果', '苹果', '香蕉', '打车', '地铁', '公交', '机票', '火车票', '课程资料', '书', '电影', '游戏', '药', '体检', '鞋', '衣服'];
  const hit = direct.find((x) => text.includes(x));
  if (hit) return hit;
  const cleaned = cleanSourceForItem(text);
  const recharge = cleaned.match(/充值(?:了)?(?:[^的]{0,12})的([^，。,. ]{1,12})/);
  if (recharge?.[1]) return recharge[1];
  const platform = cleaned.match(/在([^，。,. ]{2,16})(?:上面|上)?(?:充值|买|支付|消费)/);
  const object = cleaned.match(/(?:买了|买|订|支付|付了|消费|吃了|充值)(?:个|一份|一杯)?([^，。,. ]{1,12})/);
  const item = object?.[1]?.replace(/花了.*/, '').replace(/的$/, '');
  if (platform?.[1] && item) return `${platform[1]} ${item}`;
  return item || platform?.[1] || category;
}

function inferTitle(text: string) {
  const cleaned = text
    .replace(/我|今天|明天|后天|昨天|上午|下午|晚上|中午|\d{1,2}(:|：)?\d{0,2}点?|要|有|一个|去/g, '')
    .replace(/6\s*(月|[.\/-])\s*\d{1,2}\s*(日|号)?/g, '')
    .trim();
  if (/组会/.test(text)) return '组会';
  if (/面试/.test(text)) return '面试';
  if (/体检/.test(text)) return '体检';
  if (/聚餐/.test(text)) return '聚餐';
  if (/汇报/.test(text)) return '汇报';
  if (/会议|开会|参加/.test(text)) return cleaned || '参加会议';
  return cleaned || '待办行程';
}

function inferMemo(text: string): MemoItem {
  const content = text
    .replace(/^(帮我)?(记一下|记录一下|备忘一下|备忘|memo|待办|想法|灵感)[:：，,\s]*/i, '')
    .replace(/提醒我[:：，,\s]*/g, '')
    .trim() || text;
  return {
    id: uid(),
    title: content.slice(0, 16),
    content,
    status: '未完成',
    sourceText: text,
    createdAt: new Date().toISOString(),
  };
}

function parseByRules(text: string, settings: SettingsState): ParsedResult {
  const queryWords = /给出|看看|查询|统计|账单|花了多少|待报销|今天有什么|本周行程|下周安排|最大三笔消费|安排/;
  const expenseWords = /花了|买了|支付|付了|消费|打车|吃饭|点外卖|买咖啡|订票|充电|充值/;
  const incomeWords = /收入|工资|到账|收款|赚了|奖金|报酬|兼职/;
  const scheduleWords = /要去|参加|开会|会议|约了|上课|线上课|课|面试|考试|聚餐|体检|出差|组会|汇报/;
  const memoWords = /记一下|记录一下|备忘|备忘录|memo|想法|灵感|待办|提醒我|以后记得|没有时间|先记着/;
  if (queryWords.test(text) && !/(花了|买了|支付|付了).+(\d|块|元)/.test(text)) {
    return { intent: 'query', sourceText: text, queryType: inferQueryType(text), engine: 'rules' };
  }
  if (memoWords.test(text) && !parseAmount(text) && !scheduleWords.test(text)) {
    return { intent: 'memo', sourceText: text, memo: inferMemo(text), engine: 'rules' };
  }
  if (incomeWords.test(text) && parseAmount(text) > 0) {
    const amount = parseAmount(text);
    return {
      intent: 'income',
      sourceText: text,
      engine: 'rules',
      income: {
        id: uid(),
        type: 'income',
        date: parseDate(text),
        amount,
        item: inferItem(text, '其他') || '收入',
        category: '其他',
        paymentMethod: parsePaymentMethod(text) || settings.defaultPaymentMethod || '',
        reimbursable: false,
        reimbursementStatus: '无需报销',
        sourceText: text,
        createdAt: new Date().toISOString(),
      },
    };
  }
  if (expenseWords.test(text) || parseAmount(text) > 0) {
    const amount = parseAmount(text);
    if (amount > 0) {
      const reimbursable = new RegExp(settings.reimbursementKeywords.split(',').join('|')).test(text);
      const category = inferCategory(text);
      return {
        intent: 'expense',
        sourceText: text,
        engine: 'rules',
        expense: {
          id: uid(),
          type: 'expense',
          date: parseDate(text),
          amount,
          item: inferItem(text, category),
          category,
          paymentMethod: parsePaymentMethod(text) || settings.defaultPaymentMethod || '',
          reimbursable,
          reimbursementStatus: reimbursable ? '待报销' : '无需报销',
          sourceText: text,
          createdAt: new Date().toISOString(),
        },
      };
    }
  }
  if (scheduleWords.test(text)) {
    const { startTime, endTime } = parseTimeRange(text);
    return {
      intent: 'schedule',
      sourceText: text,
      engine: 'rules',
      schedule: {
        id: uid(),
        date: parseDate(text),
        startTime,
        endTime,
        title: inferTitle(text),
        location: '',
        note: '',
        status: '未开始',
        sourceText: text,
        createdAt: new Date().toISOString(),
      },
    };
  }
  return { intent: 'unknown', sourceText: text, message: '我还没理解这句话，可以换一种说法，或补充金额/时间。', engine: 'rules' };
}

function inferQueryType(text: string) {
  if (/待报销|报销清单/.test(text)) return 'reimbursements';
  if (/最大三笔|前三/.test(text)) return 'topExpenses';
  if (/日账单|当天账单|今天.*账单|今日.*账单/.test(text)) return 'todayBills';
  if (/年度账单|年账单|今年账单|全年账单/.test(text)) return 'yearBills';
  if (/今天有什么|今天.*安排|今日行程/.test(text)) return 'todaySchedules';
  if (/本周|这周|周.*行程|周.*安排/.test(text)) return 'weekSchedules';
  if (/本月餐饮|这个月餐饮/.test(text)) return 'monthFood';
  if (/上周/.test(text)) return 'lastWeekBills';
  if (/本月|这个月|月账单/.test(text)) return 'monthBills';
  return 'summary';
}

function readNested<T extends Record<string, unknown>>(parsed: T, key: string) {
  const nested = parsed[key];
  if (nested && typeof nested === 'object') return nested as Record<string, unknown>;
  return parsed;
}

function qwenExpensePayload(parsed: any, text: string, settings: SettingsState): Expense {
  const raw = readNested(parsed, 'expense');
  const rawCategory = String(raw.category || '');
  const category = expenseCategories.includes(rawCategory as ExpenseCategory) ? rawCategory : inferCategory(text);
  const reimbursable = Boolean(raw.reimbursable) || /报销|待报销|公司报|可以报|记得报|走报销/.test(text);
  const validStatus = ['无需报销', '待报销', '已报销'].includes(String(raw.reimbursementStatus));
  const explicitPayment = parsePaymentMethod(text);
  const ruleItem = inferItem(text, category as ExpenseCategory);
  return {
    id: uid(),
    type: 'expense',
    date: String(raw.date || parseDate(text)),
    amount: Number(raw.amount || parseAmount(text)),
    item: String(ruleItem !== category ? ruleItem : raw.item || ruleItem),
    category: category as ExpenseCategory,
    paymentMethod: String(explicitPayment || raw.paymentMethod || settings.defaultPaymentMethod || ''),
    reimbursable,
    reimbursementStatus: validStatus ? raw.reimbursementStatus as ReimbursementStatus : reimbursable ? '待报销' : '无需报销',
    sourceText: text,
    createdAt: new Date().toISOString(),
  };
}

function qwenIncomePayload(parsed: any, text: string, settings: SettingsState): Expense {
  const raw = readNested(parsed, 'income');
  return {
    id: uid(),
    type: 'income',
    date: String(raw.date || parseDate(text)),
    amount: Number(raw.amount || parseAmount(text)),
    item: String(raw.item || inferItem(text, '其他') || '收入'),
    category: '其他',
    paymentMethod: String(parsePaymentMethod(text) || raw.paymentMethod || settings.defaultPaymentMethod || ''),
    reimbursable: false,
    reimbursementStatus: '无需报销',
    sourceText: text,
    createdAt: new Date().toISOString(),
  };
}

async function parseWithQwen(text: string, settings: SettingsState): Promise<ParsedResult | null> {
  if (!settings.useLLM) return null;
  const prompt = `你是 LifeFlow 的中文对话式意图识别器。只输出 JSON，不要 markdown。必须严格按以下顶层结构返回：{"intent":"expense","expense":{...}} 或 {"intent":"income","income":{...}} 或 {"intent":"schedule","schedule":{...}} 或 {"intent":"memo","memo":{...}} 或 {"intent":"query","queryType":"..."} 或 {"intent":"unknown","message":"..."}。
intent 只能是 expense/income/schedule/memo/query/unknown。
今天日期是 ${toDateKey(today)}。
expense 字段: type="expense", date(YYYY-MM-DD), amount(number), item, category(餐饮/交通/购物/学习/娱乐/住宿/医疗/其他), paymentMethod(没说就空字符串), reimbursable(boolean), reimbursementStatus(无需报销/待报销/已报销)。
income 字段: type="income", date(YYYY-MM-DD), amount(number), item, category="其他", paymentMethod(没说就空字符串), reimbursable=false, reimbursementStatus="无需报销"。
schedule 字段: date(YYYY-MM-DD), startTime(可空字符串；如果用户说了明确时间如晚上7点/下午三点/14:30，必须输出 24 小时制 HH:mm，例如 19:00/15:00/14:30；只有用户只说今晚/上午且没有数字时间时，才可输出"晚上"/"上午"), endTime(可空字符串), title, location, note。
memo 字段: title, content, status="未完成"。当用户只是想记录一个想法、备忘、待办，且没有明确日期或行程时间时，用 memo。
query 字段: queryType(reimbursements/topExpenses/todaySchedules/weekSchedules/monthFood/lastWeekBills/monthBills/todayBills/dayBills/yearBills/summary)。
注意：不要把“支付方式是支付宝/微信/银行卡”识别成事项；充值类事项优先提取被充值对象，例如 token、会员、课程额度。
用户输入: ${text}`;
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const res = await fetch('/api/qwen/parse', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    }).finally(() => window.clearTimeout(timeout));
    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content.replace(/```json|```/g, '').trim());
    if (parsed.intent === 'expense') {
      return {
        intent: 'expense',
        sourceText: text,
        engine: 'qwen',
        expense: qwenExpensePayload(parsed, text, settings),
      };
    }
    if (parsed.intent === 'income') {
      return {
        intent: 'income',
        sourceText: text,
        engine: 'qwen',
        income: qwenIncomePayload(parsed, text, settings),
      };
    }
    if (parsed.intent === 'schedule' && parsed.schedule) {
      return {
        intent: 'schedule',
        sourceText: text,
        engine: 'qwen',
        schedule: normalizeScheduleTime({ id: uid(), createdAt: new Date().toISOString(), sourceText: text, status: '未开始', ...parsed.schedule }, text),
      };
    }
    if (parsed.intent === 'memo' && parsed.memo) {
      return {
        intent: 'memo',
        sourceText: text,
        engine: 'qwen',
        memo: { id: uid(), createdAt: new Date().toISOString(), sourceText: text, status: '未完成', ...parsed.memo },
      };
    }
    if (parsed.intent === 'query') return { intent: 'query', sourceText: text, queryType: parsed.queryType || inferQueryType(text), engine: 'qwen' };
    return { intent: 'unknown', sourceText: text, message: '大模型没有识别出可执行操作。', engine: 'qwen' };
  } catch {
    return null;
  }
}

async function parseWithQwenDetailed(text: string, settings: SettingsState): Promise<{ result: ParsedResult | null; model?: string }> {
  const result = await parseWithQwen(text, settings);
  return { result };
}

function inRange(date: string, mode: 'today' | 'week' | 'month' | 'lastWeek') {
  const d = new Date(`${date}T00:00:00`);
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (mode === 'today') return date === toDateKey(now);
  if (mode === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  if (mode === 'lastWeek') start.setDate(start.getDate() - 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return d >= start && d <= end;
}

function startOfWeekDate(base = new Date()) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

function sameMonth(date: string, month: Date) {
  return date.startsWith(monthKey(month));
}

function sameYear(date: string, year = today.getFullYear()) {
  return date.startsWith(`${year}-`);
}

function sumExpenses(items: Expense[]) {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

function scheduleDisplayTime(s: ScheduleItem) {
  if (!s.startTime) return '时间未设置';
  return s.endTime ? `${s.startTime} - ${s.endTime}` : `${s.startTime} 开始｜结束时间未设置`;
}

function normalizeScheduleTime(schedule: ScheduleItem, sourceText: string) {
  const parsed = parseTimeRange(sourceText);
  const hasExplicitTime = /(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*(点|:|：)/.test(sourceText);
  if (!hasExplicitTime) return schedule;
  return {
    ...schedule,
    startTime: /^\d{2}:\d{2}$/.test(schedule.startTime) ? schedule.startTime : parsed.startTime,
    endTime: schedule.endTime || parsed.endTime,
  };
}

function findDeleteTarget(text: string, expenses: Expense[], schedules: ScheduleItem[], memos: MemoItem[]): ParsedResult | null {
  if (!/删掉|删除|取消|移除|不去了|不用去了/.test(text)) return null;
  const wantSchedule = /行程|安排|会议|组会|面试|体检|聚餐|上课|线上课|课|取消/.test(text);
  const wantMemo = /备忘|备忘录|待办|想法|灵感|记录/.test(text);
  const wantExpense = /账单|消费|支出|花了|报销|咖啡|打车|香蕉|苹果/.test(text);
  if (/刚才|上一条|最新/.test(text)) {
    if (wantMemo && memos[0]) return { intent: 'delete', sourceText: text, targetType: 'memo', target: memos[0], engine: 'rules' };
    if (wantSchedule && schedules[0]) return { intent: 'delete', sourceText: text, targetType: 'schedule', target: schedules[0], engine: 'rules' };
    if (wantExpense && expenses[0]) return { intent: 'delete', sourceText: text, targetType: 'expense', target: expenses[0], engine: 'rules' };
  }
  const memoHit = memos.find((m) => text.includes(m.title) || text.includes(m.content.slice(0, 8)));
  if ((wantMemo || memoHit) && memoHit) return { intent: 'delete', sourceText: text, targetType: 'memo', target: memoHit, engine: 'rules' };
  const expenseHit = expenses.find((e) => text.includes(e.item) || text.includes(e.category) || text.includes(String(e.amount)));
  if ((wantExpense || expenseHit) && expenseHit) return { intent: 'delete', sourceText: text, targetType: 'expense', target: expenseHit, engine: 'rules' };
  const scheduleHit = schedules.find((s) => text.includes(s.title) || (s.location && text.includes(s.location)) || text.includes(s.startTime.slice(0, 2)));
  if ((wantSchedule || scheduleHit) && scheduleHit) return { intent: 'delete', sourceText: text, targetType: 'schedule', target: scheduleHit, engine: 'rules' };
  const latest = wantMemo ? memos[0] : wantSchedule ? schedules[0] : expenses[0];
  if (!latest) return { intent: 'unknown', sourceText: text, message: '没有找到可以删除的记录。', engine: 'rules' };
  return { intent: 'delete', sourceText: text, targetType: wantMemo ? 'memo' : wantSchedule ? 'schedule' : 'expense', target: latest, engine: 'rules' };
}

function findReimbursedTarget(text: string, expenses: Expense[]): ParsedResult | null {
  if (!/(已经报销|已报销|报销了|报完了)/.test(text)) return null;
  const pending = expenses.filter((e) => (e.type ?? 'expense') === 'expense' && e.reimbursementStatus === '待报销');
  const hit = pending.find((e) => text.includes(e.item) || text.includes(e.category) || text.includes(String(e.amount)));
  const target = hit ?? pending[0];
  if (!target) return { intent: 'unknown', sourceText: text, message: '没有找到待报销账单。', engine: 'rules' };
  return { intent: 'reimbursed', sourceText: text, target, engine: 'rules' };
}

export default function App() {
  const [user, setUser] = useStoredState<AuthUser | null>('lifeflow-user', null);
  const [tab, setTab] = useState<Tab>('home');
  const storageScope = user?.id ?? 'guest';
  const [expenses, setExpenses] = useStoredState<Expense[]>(`lifeflow-expenses-${storageScope}`, []);
  const [schedules, setSchedules] = useStoredState<ScheduleItem[]>(`lifeflow-schedules-${storageScope}`, []);
  const [memos, setMemos] = useStoredState<MemoItem[]>(`lifeflow-memos-${storageScope}`, []);
  const [storedSettings, setSettings] = useStoredState<SettingsState>(`lifeflow-settings-${storageScope}`, defaultSettings);
  const settings = normalizeSettings(storedSettings);
  const [panelOpen, setPanelOpen] = useState(false);
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [queryResult, setQueryResult] = useState<ReturnType<typeof buildQueryResult> | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scheduleView, setScheduleView] = useState<'今日' | '本周' | '本月' | '备忘'>('今日');
  const [scheduleMonth, setScheduleMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const recognitionRef = useRef<any>(null);

  const speechSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const todaySchedules = useMemo(() => schedules.filter((s) => inRange(s.date, 'today')).sort((a, b) => a.startTime.localeCompare(b.startTime)), [schedules]);
  const reimbursing = expenses.filter((e) => e.reimbursementStatus === '待报销');
  const stats = useMemo(() => ({
    today: sumExpenses(expenses.filter((e) => (e.type ?? 'expense') === 'expense' && inRange(e.date, 'today'))),
    week: sumExpenses(expenses.filter((e) => (e.type ?? 'expense') === 'expense' && inRange(e.date, 'week'))),
    month: sumExpenses(expenses.filter((e) => (e.type ?? 'expense') === 'expense' && inRange(e.date, 'month'))),
    year: sumExpenses(expenses.filter((e) => (e.type ?? 'expense') === 'expense' && sameYear(e.date))),
    income: sumExpenses(expenses.filter((e) => e.type === 'income' && inRange(e.date, 'month'))),
    yearIncome: sumExpenses(expenses.filter((e) => e.type === 'income' && sameYear(e.date))),
    totalExpense: sumExpenses(expenses.filter((e) => (e.type ?? 'expense') === 'expense')),
    totalIncome: sumExpenses(expenses.filter((e) => e.type === 'income')),
    reimburse: sumExpenses(reimbursing),
  }), [expenses]);

  async function recognize(text = input) {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try {
      const actionResult = findReimbursedTarget(value, expenses) ?? findDeleteTarget(value, expenses, schedules, memos);
      const llm = actionResult ? null : await parseWithQwen(value, settings);
      setEngineStatus(actionResult ? 'rules' : llm ? 'qwen' : settings.useLLM ? 'qwen-unavailable' : 'rules');
      const result = actionResult ?? llm ?? parseByRules(value, settings);
      setParsed(result);
      if (result.intent === 'query') setQueryResult(buildQueryResult(result.queryType, expenses, schedules));
      else setQueryResult(null);
    } catch {
      setEngineStatus('qwen-unavailable');
      setParsed({ intent: 'unknown', sourceText: value, message: '识别服务暂时没有返回，请稍后再试，或先用更明确的一句话输入。', engine: 'rules' });
      setQueryResult(null);
    } finally {
      setBusy(false);
    }
  }

  function fillExample(text: string) {
    setInput(text);
    setPanelOpen(true);
    setTimeout(() => void recognize(text), 50);
  }

  function startSpeech() {
    if (!speechSupported || listening) return;
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Speech();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setInput(text);
      void recognize(text);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopSpeech() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function confirmParsed() {
    if (!parsed) return;
    if (parsed.intent === 'expense') setExpenses([parsed.expense, ...expenses]);
    if (parsed.intent === 'income') setExpenses([parsed.income, ...expenses]);
    if (parsed.intent === 'schedule') setSchedules([parsed.schedule, ...schedules]);
    if (parsed.intent === 'memo') setMemos([parsed.memo, ...memos]);
    if (parsed.intent === 'reimbursed') setExpenses(expenses.map((e) => e.id === parsed.target.id ? { ...e, reimbursable: true, reimbursementStatus: '已报销' } : e));
    if (parsed.intent === 'delete' && parsed.targetType === 'expense') setExpenses(expenses.filter((e) => e.id !== parsed.target.id));
    if (parsed.intent === 'delete' && parsed.targetType === 'schedule') setSchedules(schedules.filter((s) => s.id !== parsed.target.id));
    if (parsed.intent === 'delete' && parsed.targetType === 'memo') setMemos(memos.filter((m) => m.id !== parsed.target.id));
    setParsed(null);
    setInput('');
    setPanelOpen(false);
  }

  function resetData() {
    setExpenses([]);
    setSchedules([]);
    setMemos([]);
  }

  function loadDemoData() {
    setExpenses(demoExpenses);
    setSchedules(demoSchedules);
    setMemos(demoMemos);
  }

function exportReimbursements() {
    const body = [
      '# LifeFlow 待报销清单',
      '',
      `总金额: ${yuan(sumExpenses(reimbursing))}`,
      `笔数: ${reimbursing.length}`,
      '',
      ...reimbursing.map((e) => `- ${e.date} | ${e.item} | ${e.category} | ${yuan(e.amount)} | ${e.sourceText}`),
    ].join('\n');
    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifeflow-reimbursements-${toDateKey(today)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function canConfirmCurrent() {
    if (!parsed) return false;
    if (parsed.intent === 'expense') return Boolean(parsed.expense.paymentMethod.trim());
    if (parsed.intent === 'income') return Boolean(parsed.income.paymentMethod.trim());
    return true;
  }

  if (!user) {
    return <AuthScreen onAuthed={setUser} />;
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef6f2,#f7f7fb_45%,#fff4ef)] text-ink md:grid md:place-items-center">
      <main className="mx-auto flex h-[100dvh] w-full max-w-[390px] flex-col overflow-hidden bg-mist shadow-phone md:my-5 md:h-[calc(100vh-40px)] md:rounded-[34px] md:border-[8px] md:border-white">
        <AppHeader tab={tab} user={user} onLogout={() => setUser(null)} />
        <section className="flex-1 overflow-y-auto px-4 pb-28 pt-3">
          {tab === 'home' && <HomePage user={user} stats={stats} todaySchedules={todaySchedules} reimbursing={reimbursing} goLedger={() => setTab('ledger')} goSchedule={() => setTab('schedule')} openPanel={() => setPanelOpen(true)} />}
          {tab === 'ledger' && <LedgerPage expenses={expenses} stats={stats} onDelete={(id: string) => setExpenses(expenses.filter((e) => e.id !== id))} onPaid={(id: string) => setExpenses(expenses.map((e) => e.id === id ? { ...e, reimbursable: true, reimbursementStatus: '已报销' } : e))} onExport={exportReimbursements} />}
          {tab === 'schedule' && <SchedulePage view={scheduleView} setView={setScheduleView} month={scheduleMonth} setMonth={setScheduleMonth} schedules={schedules} memos={memos} onMemoDone={(id: string) => setMemos(memos.map((m) => m.id === id ? { ...m, status: '已完成' } : m))} onMemoDelete={(id: string) => setMemos(memos.filter((m) => m.id !== id))} onDelete={(id: string) => setSchedules(schedules.filter((s) => s.id !== id))} />}
          {tab === 'mine' && <MinePage user={user} settings={settings} setSettings={setSettings} onReset={resetData} onLoadDemo={loadDemoData} onExport={exportReimbursements} expenses={expenses} schedules={schedules} memos={memos} onQuery={(q: string) => { setInput(q); setPanelOpen(true); void recognize(q); }} />}
        </section>
        <BottomNav tab={tab} setTab={(next) => next === 'voice' ? setPanelOpen(true) : setTab(next)} />
      </main>
      {panelOpen && (
        <InputPanel
          input={input}
          setInput={setInput}
          parsed={parsed}
          setParsed={setParsed}
          queryResult={queryResult}
          engineStatus={engineStatus}
          settings={settings}
          busy={busy}
          listening={listening}
          speechSupported={speechSupported}
          onClose={() => setPanelOpen(false)}
          onRecognize={() => void recognize()}
          onStartSpeech={startSpeech}
          onStopSpeech={stopSpeech}
          onConfirm={confirmParsed}
          canConfirm={canConfirmCurrent()}
        />
      )}
    </div>
  );
}

function AuthScreen({ onAuthed }: { onAuthed: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      onAuthed(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络异常');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#eef6f2,#f7f7fb_45%,#fff4ef)] text-ink md:grid md:place-items-center">
      <main className="mx-auto flex h-[100dvh] w-full max-w-[390px] flex-col bg-white px-6 py-8 shadow-phone md:my-5 md:h-[calc(100vh-40px)] md:rounded-[34px] md:border-[8px] md:border-white">
        <div className="mt-10">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-ink text-white shadow-soft">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="mt-6 text-3xl font-bold">LifeFlow</h1>
          <p className="mt-2 text-slate-500">语音个人规划助手</p>
        </div>

        <section className="mt-10 rounded-3xl bg-mist p-4">
          <div className="grid grid-cols-2 rounded-2xl bg-white p-1">
            <button onClick={() => setMode('login')} className={`rounded-xl py-2 text-sm font-semibold ${mode === 'login' ? 'bg-ink text-white' : 'text-slate-500'}`}>登录</button>
            <button onClick={() => setMode('register')} className={`rounded-xl py-2 text-sm font-semibold ${mode === 'register' ? 'bg-ink text-white' : 'text-slate-500'}`}>注册</button>
          </div>
          <label className="mt-5 block text-sm text-slate-500">用户名</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="field mt-2 bg-white" placeholder="例如 lifeflow_demo" />
          <label className="mt-4 block text-sm text-slate-500">密码</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="field mt-2 bg-white" placeholder="至少 6 位" />
          {error && <div className="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}
          <button onClick={submit} disabled={busy} className="mt-5 w-full rounded-2xl bg-ink py-4 font-semibold text-white disabled:opacity-60">
            {busy ? '处理中...' : mode === 'login' ? '进入 LifeFlow' : '创建账号'}
          </button>
        </section>

        <div className="mt-auto rounded-3xl bg-[#f8fafc] p-4 text-sm leading-6 text-slate-500">
          账号保存在本地 SQLite 数据库中，密码会加盐哈希后入库。登录后首页保持干净，从第一条语音记录开始。
        </div>
      </main>
    </div>
  );
}

function AppHeader({ tab, user, onLogout }: { tab: Tab; user: AuthUser; onLogout: () => void }) {
  const titles: Record<Tab, string> = { home: 'LifeFlow', ledger: '账本', voice: '语音', schedule: '行程', mine: '我的' };
  return (
    <header className="flex items-center justify-between bg-mist px-5 pb-2 pt-5">
      <div>
        <h1 className="text-2xl font-bold tracking-normal">{titles[tab]}</h1>
        <p className="text-sm text-slate-500">{tab === 'home' ? `${user.username}，一句话管理生活` : '语音个人规划助手'}</p>
      </div>
      <button onClick={onLogout} className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-soft">
        <UserRound className="h-5 w-5 text-leaf" />
      </button>
    </header>
  );
}

function HomePage({ user, stats, todaySchedules, reimbursing, goLedger, goSchedule, openPanel }: any) {
  const hour = new Date().getHours();
  const greeting = hour < 11 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-white p-5 shadow-soft">
        <p className="text-sm text-slate-500">{greeting}，{user.username}</p>
        <div className="mt-1 text-xl font-semibold">今天有 {todaySchedules.length} 个行程，今日花费 {yuan(stats.today)}</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">可以直接说“我用微信买咖啡花了18元”或“明天下午3点面试”。</p>
        <button onClick={openPanel} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-4 text-base font-semibold text-white">
          <Mic className="h-5 w-5" /> 按住说话
        </button>
      </section>
      <CardTitle title="今日行程" action="查看全部" onAction={goSchedule} />
      <div className="rounded-2xl bg-white p-4 shadow-soft">
        {todaySchedules.length ? todaySchedules.slice(0, 3).map((s: ScheduleItem) => <ScheduleMini key={s.id} item={s} />) : <Empty text="今天暂时没有安排" />}
      </div>
      <section className="grid grid-cols-3 gap-3">
        <Metric label="今日支出" value={yuan(stats.today)} />
        <Metric label="本周支出" value={yuan(stats.week)} />
        <Metric label="本月支出" value={yuan(stats.month)} />
      </section>
      <section className="rounded-2xl bg-[#fff7ed] p-4 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-orange-700">待报销</p>
            <p className="mt-1 text-2xl font-bold">{yuan(stats.reimburse)}</p>
            <p className="text-sm text-slate-500">{reimbursing.length} 笔等待处理</p>
          </div>
          <button onClick={goLedger} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-orange-700">查看清单</button>
        </div>
      </section>
    </div>
  );
}

function LedgerPage({ expenses, stats, onDelete, onPaid, onExport }: any) {
  const [billDay, setBillDay] = useState(toDateKey(today));
  const years = Array.from(new Set([today.getFullYear(), ...expenses.map((e: Expense) => Number(e.date.slice(0, 4)) || today.getFullYear())])).sort((a, b) => b - a);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const monthExpenses = expenses.filter((e: Expense) => (e.type ?? 'expense') === 'expense' && inRange(e.date, 'month'));
  const dayBills = expenses.filter((e: Expense) => e.date === billDay).sort((a: Expense, b: Expense) => b.createdAt.localeCompare(a.createdAt));
  const yearExpense = sumExpenses(expenses.filter((e: Expense) => (e.type ?? 'expense') === 'expense' && sameYear(e.date, selectedYear)));
  const yearIncome = sumExpenses(expenses.filter((e: Expense) => e.type === 'income' && sameYear(e.date, selectedYear)));
  const byCategory = expenseCategories.map((category) => ({ category, amount: sumExpenses(monthExpenses.filter((e: Expense) => e.category === category)) }));
  const max = Math.max(1, ...byCategory.map((x) => x.amount));
  const pending = expenses.filter((e: Expense) => e.reimbursementStatus === '待报销');
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3">
        <Metric label="累计支出" value={yuan(stats.totalExpense)} />
        <Metric label="累计收入" value={yuan(stats.totalIncome)} />
        <Metric label="今日支出" value={yuan(stats.today)} />
        <Metric label="本周支出" value={yuan(stats.week)} />
        <Metric label="本月支出" value={yuan(stats.month)} />
        <Metric label="本月收入" value={yuan(stats.income)} />
        <Metric label="待报销" value={yuan(stats.reimburse)} tone="warm" />
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">年度概览</h2>
          <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">
            {years.map((year) => <option key={year} value={year}>{year} 年</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="年支出" value={yuan(yearExpense)} />
          <Metric label="年收入" value={yuan(yearIncome)} />
        </div>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-soft">
        <h2 className="font-semibold">本月分类统计</h2>
        <div className="mt-3 space-y-3">
          {byCategory.map((x) => (
            <div key={x.category}>
              <div className="mb-1 flex justify-between text-sm"><span>{x.category}</span><span>{yuan(x.amount)}</span></div>
              <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-leaf" style={{ width: x.amount ? `${Math.max(4, x.amount / max * 100)}%` : '0%' }} /></div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">日账单查询</h2>
          <input value={billDay} onChange={(e) => setBillDay(e.target.value)} type="date" className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm outline-none" />
        </div>
        {dayBills.length ? dayBills.map((e: Expense) => <ExpenseRow key={e.id} e={e} onDelete={onDelete} onPaid={onPaid} />) : <Empty text="这一天没有账单记录" />}
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">待报销专区</h2>
          <button onClick={onExport} className="flex items-center gap-1 rounded-full bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700"><Download className="h-4 w-4" />导出</button>
        </div>
        {pending.length ? pending.map((e: Expense) => <ExpenseRow key={e.id} e={e} onDelete={onDelete} onPaid={onPaid} />) : <Empty text="没有待报销账单" />}
      </section>
    </div>
  );
}

function SchedulePage({ view, setView, month, setMonth, schedules, memos, onDelete, onMemoDone, onMemoDelete }: any) {
  const [selectedWeekDay, setSelectedWeekDay] = useState(toDateKey(today));
  const [selectedMonthDay, setSelectedMonthDay] = useState(toDateKey(today));
  const sorted = [...schedules].sort((a: ScheduleItem, b: ScheduleItem) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const todayItems = sorted.filter((s: ScheduleItem) => inRange(s.date, 'today'));
  const weekStart = startOfWeekDate();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const monthItems = sorted.filter((s: ScheduleItem) => sameMonth(s.date, month));
  const selectedWeekItems = sorted.filter((s: ScheduleItem) => s.date === selectedWeekDay);
  const selectedMonthItems = sorted.filter((s: ScheduleItem) => s.date === selectedMonthDay);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = (first.getDay() || 7) - 1;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthCells = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  const changeMonth = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 rounded-2xl bg-white p-1 shadow-soft">
        {(['今日', '本周', '本月', '备忘'] as const).map((x) => <button key={x} onClick={() => setView(x)} className={`rounded-xl py-2 text-sm font-semibold ${view === x ? 'bg-ink text-white' : 'text-slate-500'}`}>{x}</button>)}
      </div>

      {view === '今日' && (
        <section className="rounded-2xl bg-white p-4 shadow-soft">
          <h2 className="mb-3 font-semibold">今日时间线</h2>
          <div className="space-y-3">
            {todayItems.length ? todayItems.map((s: ScheduleItem) => <ScheduleRow key={s.id} s={s} onDelete={onDelete} />) : <Empty text="今天暂时没有安排" />}
          </div>
        </section>
      )}

      {view === '本周' && (
        <section className="rounded-2xl bg-white p-4 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">本周周报</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">{sorted.filter((s: ScheduleItem) => inRange(s.date, 'week')).length} 项</span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day) => {
              const key = toDateKey(day);
              const items = sorted.filter((s: ScheduleItem) => s.date === key);
              return (
                <button key={key} onClick={() => setSelectedWeekDay(key)} className={`min-h-16 rounded-2xl p-1 text-center text-xs ${selectedWeekDay === key ? 'bg-ink text-white' : 'bg-slate-50 text-slate-600'}`}>
                  <div className="font-semibold">周{['一', '二', '三', '四', '五', '六', '日'][weekDays.indexOf(day)]}</div>
                  <div className="mt-1">{pad(day.getMonth() + 1)}/{pad(day.getDate())}</div>
                  {items.length > 0 && <div className={`mx-auto mt-1 h-1.5 w-1.5 rounded-full ${selectedWeekDay === key ? 'bg-white' : 'bg-leaf'}`} />}
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-2">
            {selectedWeekItems.length ? selectedWeekItems.map((s: ScheduleItem) => <ScheduleRow key={s.id} s={s} onDelete={onDelete} />) : <Empty text="这一天没有行程" />}
          </div>
        </section>
      )}

      {view === '本月' && (
        <section className="rounded-2xl bg-white p-4 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <button onClick={() => changeMonth(-1)} className="icon-btn"><ChevronRight className="h-4 w-4 rotate-180" /></button>
            <h2 className="font-semibold">{month.getFullYear()} 年 {month.getMonth() + 1} 月</h2>
            <button onClick={() => changeMonth(1)} className="icon-btn"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
            {['一', '二', '三', '四', '五', '六', '日'].map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {monthCells.map((day, index) => {
              const key = day ? toDateKey(day) : `blank-${index}`;
              const items = day ? monthItems.filter((s: ScheduleItem) => s.date === key) : [];
              return (
                <button key={key} onClick={() => day && setSelectedMonthDay(key)} className={`min-h-14 rounded-xl p-1 text-left text-xs ${!day ? '' : selectedMonthDay === key ? 'bg-ink text-white' : 'bg-slate-50 text-slate-600'}`}>
                  {day && <div className="font-semibold">{day.getDate()}</div>}
                  {items.slice(0, 2).map((s: ScheduleItem) => <div key={s.id} className={`mt-1 truncate rounded px-1 py-0.5 text-[10px] ${selectedMonthDay === key ? 'bg-white/20 text-white' : 'bg-leaf/10 text-leaf'}`}>{s.title}</div>)}
                  {items.length > 2 && <div className="mt-1 text-[10px] text-slate-400">+{items.length - 2}</div>}
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-2">
            {selectedMonthItems.length ? selectedMonthItems.map((s: ScheduleItem) => <ScheduleRow key={s.id} s={s} onDelete={onDelete} />) : <Empty text="这一天没有行程，可以点击其他日期或切换月份" />}
          </div>
        </section>
      )}

      {view === '备忘' && (
        <section className="rounded-2xl bg-white p-4 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">备忘与灵感</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">{memos.length} 条</span>
          </div>
          <div className="space-y-3">
            {memos.length ? memos.map((memo: MemoItem) => <MemoRow key={memo.id} memo={memo} onDone={onMemoDone} onDelete={onMemoDelete} />) : <Empty text="还没有备忘或灵感，可以说“记一下……”" />}
          </div>
        </section>
      )}
    </div>
  );
}

function MinePage({ user, settings, setSettings, onReset, onLoadDemo, onExport, expenses, schedules, memos }: any) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow-soft">
        <h2 className="font-semibold">账号</h2>
        <p className="mt-2 text-sm text-slate-500">当前账号</p>
        <p className="mt-1 text-xl font-bold">{user.username}</p>
        <p className="mt-2 text-xs text-slate-400">账号保存在本地 SQLite 数据库中，密码加盐哈希存储。</p>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-soft">
        <h2 className="font-semibold">基础设置</h2>
        <label className="mt-3 block text-sm text-slate-500">默认支付方式</label>
        <select value={settings.defaultPaymentMethod} onChange={(e) => setSettings({ ...settings, defaultPaymentMethod: e.target.value })} className="field">
          <option value="">不设置</option>
          {settings.paymentMethods.map((method: string) => <option key={method} value={method}>{method}</option>)}
        </select>
        <label className="mt-3 block text-sm text-slate-500">常用支付方式</label>
        <input
          value={settings.paymentMethods.join('，')}
          onChange={(e) => {
            const methods = e.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
            setSettings({ ...settings, paymentMethods: Array.from(new Set([...methods, '其他'])) });
          }}
          className="field"
          placeholder="支付宝，微信，银行卡，现金，其他"
        />
        <label className="mt-3 block text-sm text-slate-500">报销关键词</label>
        <input value={settings.reimbursementKeywords} onChange={(e) => setSettings({ ...settings, reimbursementKeywords: e.target.value })} className="field" />
        <label className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 p-3">
          <span className="text-sm font-medium">提醒设置</span>
          <input type="checkbox" checked={settings.remindersEnabled} onChange={(e) => setSettings({ ...settings, remindersEnabled: e.target.checked })} className="h-5 w-5 accent-ink" />
        </label>
      </section>
      <section className="grid grid-cols-2 gap-3">
        <button onClick={onExport} className="rounded-2xl bg-white p-4 text-left font-semibold shadow-soft"><Download className="mb-2 h-5 w-5" />数据导出</button>
        <button onClick={onLoadDemo} className="rounded-2xl bg-white p-4 text-left font-semibold shadow-soft"><Plus className="mb-2 h-5 w-5" />加载演示数据</button>
        <button onClick={onReset} className="rounded-2xl bg-white p-4 text-left font-semibold text-red-600 shadow-soft"><Trash2 className="mb-2 h-5 w-5" />清空本地数据</button>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-soft">
        <h2 className="font-semibold">为什么做 LifeFlow？</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          很多时候不是我们不想记录生活，而是生活发生得太快了。钱花在不同平台，行程散在聊天和脑子里，灵感常常只闪一下就过去。传统工具要求我们停下来、分类、填写、维护，可真正需要记录的瞬间，往往正是最不方便打开表单的瞬间。
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          LifeFlow 想做的是把这些碎片接住。你只要说一句话，它帮你判断这是账单、行程、报销、收入，还是一个暂时没有时间限制的想法。它不替你制造复杂系统，只是在你需要的时候，让生活信息自然地留下来。
        </p>
      </section>
    </div>
  );
}

function InputPanel(props: any) {
  const { input, setInput, parsed, setParsed, queryResult, engineStatus, settings, busy, listening, speechSupported, onClose, onRecognize, onStartSpeech, onStopSpeech, onConfirm, canConfirm } = props;
  const engineText: Record<EngineStatus, string> = {
    idle: '等待识别',
    qwen: 'Qwen 已优先解析',
    rules: '规则识别',
    'qwen-unavailable': 'Qwen 未连通，已临时用规则兜底',
  };
  return (
    <div className="fixed inset-0 z-50 grid items-end bg-slate-900/30 backdrop-blur-sm">
      <div className="mx-auto max-h-[88dvh] w-full max-w-[390px] overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-phone">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">一句话交给 LifeFlow</h2>
            <p className={`text-sm ${engineStatus === 'qwen-unavailable' ? 'text-amber-600' : 'text-slate-500'}`}>{engineText[engineStatus as EngineStatus]}</p>
          </div>
          <button onClick={onClose} className="icon-btn"><X className="h-5 w-5" /></button>
        </div>
        {!speechSupported && <div className="mb-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-700">当前浏览器不支持语音识别，请使用文字输入</div>}
        <div className="mb-4 space-y-2 rounded-3xl bg-slate-50 p-3">
          <div className="max-w-[86%] rounded-2xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
            我会先用 Qwen 理解你的话，再生成可确认的账单、收入、行程或查询结果。信息不完整时，我会在确认卡里继续问你。
          </div>
          {input && <div className="ml-auto max-w-[86%] rounded-2xl bg-ink px-3 py-2 text-sm text-white">{input}</div>}
        </div>
        <button
          onMouseDown={onStartSpeech}
          onMouseUp={onStopSpeech}
          onMouseLeave={listening ? onStopSpeech : undefined}
          onTouchStart={(e) => { e.preventDefault(); onStartSpeech(); }}
          onTouchEnd={(e) => { e.preventDefault(); onStopSpeech(); }}
          onContextMenu={(e) => e.preventDefault()}
          className={`mx-auto grid h-28 w-28 select-none place-items-center rounded-full text-white shadow-soft ${listening ? 'animate-pulse bg-coral' : 'bg-ink'}`}
        >
          {listening ? <MicOff className="h-10 w-10" /> : <Mic className="h-10 w-10" />}
        </button>
        <p className="mt-3 text-center text-sm text-slate-500">{listening ? '正在听你说，松开后结束' : '长按说话，松开识别；也可以说“删掉刚才那条账单”'}</p>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} className="mt-4 min-h-24 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 outline-none focus:border-ink" placeholder="也可以直接输入一句话" />
        <button onClick={onRecognize} disabled={busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-leaf py-3 font-semibold text-white disabled:opacity-60"><Search className="h-5 w-5" />{busy ? '识别中...' : '识别'}</button>
        {parsed && parsed.intent !== 'query' && <ConfirmCard parsed={parsed} setParsed={setParsed} onConfirm={onConfirm} canConfirm={canConfirm} paymentMethods={settings.paymentMethods} />}
        {parsed?.intent === 'query' && queryResult && <QueryResultCard result={queryResult} />}
        {parsed?.intent === 'unknown' && <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">{parsed.message}</div>}
      </div>
    </div>
  );
}

function ConfirmCard({ parsed, setParsed, onConfirm, canConfirm, paymentMethods }: any) {
  if (parsed.intent === 'expense' || parsed.intent === 'income') {
    const isIncome = parsed.intent === 'income';
    const e: Expense = isIncome ? parsed.income : parsed.expense;
    const update = (patch: Partial<Expense>) => setParsed(isIncome ? { ...parsed, income: { ...e, ...patch } } : { ...parsed, expense: { ...e, ...patch } });
    const methodOptions = Array.from(new Set([...(paymentMethods || defaultSettings.paymentMethods), '其他'].filter(Boolean)));
    const regularMethods = methodOptions.filter((method) => method !== '其他');
    const selectedMethod = e.paymentMethod && regularMethods.includes(e.paymentMethod) ? e.paymentMethod : e.paymentMethod ? '其他' : '';
    const needsCustomMethod = selectedMethod === '其他';
    return (
      <section className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <h3 className="mb-3 font-semibold">{isIncome ? '收入确认卡' : '记账确认卡'}</h3>
        <GridInput label="日期" value={e.date} onChange={(v: string) => update({ date: v })} />
        <GridInput label="金额" value={String(e.amount)} onChange={(v: string) => update({ amount: Number(v) || 0 })} />
        <GridInput label="事项" value={e.item} onChange={(v: string) => update({ item: v })} />
        {!isIncome && <Select label="分类" value={e.category} options={expenseCategories} onChange={(v: string) => update({ category: v as ExpenseCategory })} />}
        <Select label={isIncome ? '收款账户' : '支付方式'} value={selectedMethod} options={['', ...methodOptions]} onChange={(v: string) => update({ paymentMethod: v === '其他' ? '其他' : v })} />
        {needsCustomMethod && <GridInput label="其他" value={e.paymentMethod} onChange={(v: string) => update({ paymentMethod: v })} placeholder="请输入方式" />}
        {!e.paymentMethod && (
          <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
            {isIncome ? '请问这笔收入是通过哪个账户收到的？' : '请问这笔消费的支付平台是什么？'}请选择后才能保存。
          </div>
        )}
        {!isIncome && <Select label="报销状态" value={e.reimbursementStatus} options={['无需报销', '待报销', '已报销']} onChange={(v: string) => update({ reimbursementStatus: v as ReimbursementStatus, reimbursable: v !== '无需报销' })} />}
        <Source text={e.sourceText} />
        <ConfirmActions onConfirm={onConfirm} onCancel={() => setParsed(null)} label={isIncome ? '确认收入' : '确认入账'} disabled={!canConfirm} />
      </section>
    );
  }
  if (parsed.intent === 'schedule') {
    const s: ScheduleItem = parsed.schedule;
    const update = (patch: Partial<ScheduleItem>) => setParsed({ ...parsed, schedule: { ...s, ...patch } });
    return (
      <section className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <h3 className="mb-3 font-semibold">行程确认卡</h3>
        <GridInput label="日期" value={s.date} onChange={(v: string) => update({ date: v })} />
        <GridInput label="开始时间" value={s.startTime} onChange={(v: string) => update({ startTime: v })} />
        <GridInput label="结束时间" value={s.endTime} onChange={(v: string) => update({ endTime: v })} placeholder="可为空" />
        <GridInput label="标题" value={s.title} onChange={(v: string) => update({ title: v })} />
        <GridInput label="地点" value={s.location} onChange={(v: string) => update({ location: v })} placeholder="可为空" />
        <GridInput label="备注" value={s.note} onChange={(v: string) => update({ note: v })} />
        <Source text={s.sourceText} />
        <div className="mb-3 rounded-xl bg-white p-3 text-sm text-slate-600">{scheduleDisplayTime(s)}</div>
        <ConfirmActions onConfirm={onConfirm} onCancel={() => setParsed(null)} label="确认添加行程" disabled={false} />
      </section>
    );
  }
  if (parsed.intent === 'memo') {
    const memo: MemoItem = parsed.memo;
    const update = (patch: Partial<MemoItem>) => setParsed({ ...parsed, memo: { ...memo, ...patch } });
    return (
      <section className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <h3 className="mb-3 font-semibold">备忘确认卡</h3>
        <GridInput label="标题" value={memo.title} onChange={(v: string) => update({ title: v })} />
        <label className="mb-2 grid grid-cols-[72px_1fr] gap-2 text-sm">
          <span className="pt-2 text-slate-500">内容</span>
          <textarea value={memo.content} onChange={(e) => update({ content: e.target.value })} className="min-h-24 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-ink" />
        </label>
        <Source text={memo.sourceText} />
        <ConfirmActions onConfirm={onConfirm} onCancel={() => setParsed(null)} label="确认保存" disabled={false} />
      </section>
    );
  }
  if (parsed.intent === 'reimbursed') {
    const target = parsed.target;
    return (
      <section className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
        <h3 className="mb-3 font-semibold text-emerald-700">报销确认卡</h3>
        <div className="rounded-xl bg-white p-3 text-sm text-slate-600">
          {target.date} · {target.item} · {yuan(target.amount)}
        </div>
        <Source text={parsed.sourceText} />
        <ConfirmActions onConfirm={onConfirm} onCancel={() => setParsed(null)} label="标记已报销" disabled={false} />
      </section>
    );
  }
  if (parsed.intent === 'delete') {
    const target: any = parsed.target;
    return (
      <section className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4">
        <h3 className="mb-3 font-semibold text-red-700">删除确认卡</h3>
        <div className="rounded-xl bg-white p-3 text-sm text-slate-600">
          {parsed.targetType === 'expense' ? `${target.date} · ${target.item} · ${yuan(target.amount)}` : parsed.targetType === 'memo' ? `${target.title} · ${target.content}` : `${target.date} · ${target.title} · ${scheduleDisplayTime(target)}`}
        </div>
        <Source text={parsed.sourceText} />
        <ConfirmActions onConfirm={onConfirm} onCancel={() => setParsed(null)} label="确认删除" disabled={false} />
      </section>
    );
  }
  return null;
}

function buildQueryResult(type: string, expenses: Expense[], schedules: ScheduleItem[]) {
  const expenseOnly = expenses.filter((e) => (e.type ?? 'expense') === 'expense');
  const targetExpenses = type === 'yearBills' ? expenseOnly.filter((e) => sameYear(e.date)) : type === 'todayBills' || type === 'dayBills' ? expenseOnly.filter((e) => inRange(e.date, 'today')) : type === 'lastWeekBills' ? expenseOnly.filter((e) => inRange(e.date, 'lastWeek')) : type === 'monthFood' ? expenseOnly.filter((e) => inRange(e.date, 'month') && e.category === '餐饮') : type === 'monthBills' ? expenseOnly.filter((e) => inRange(e.date, 'month')) : expenseOnly;
  const targetSchedules = type === 'todaySchedules' ? schedules.filter((s) => inRange(s.date, 'today')) : type === 'weekSchedules' ? schedules.filter((s) => inRange(s.date, 'week')) : schedules;
  const topCategory = expenseCategories.map((c) => ({ c, amount: sumExpenses(targetExpenses.filter((e) => e.category === c)) })).sort((a, b) => b.amount - a.amount)[0]?.c || '其他';
  return {
    type,
    total: sumExpenses(targetExpenses),
    count: targetExpenses.length,
    topCategory,
    reimburse: sumExpenses(targetExpenses.filter((e) => e.reimbursementStatus === '待报销')),
    topExpenses: [...targetExpenses].sort((a, b) => b.amount - a.amount).slice(0, 3),
    expenses: type === 'reimbursements' ? expenses.filter((e) => e.reimbursementStatus === '待报销') : targetExpenses,
    schedules: targetSchedules.sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)),
  };
}

function QueryResultCard({ result }: any) {
  const scheduleMode = ['todaySchedules', 'weekSchedules'].includes(result.type);
  return (
    <section className="mt-4 rounded-2xl bg-slate-50 p-4">
      <h3 className="font-semibold">查询结果</h3>
      {scheduleMode ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2"><Metric label="行程数量" value={`${result.schedules.length} 个`} /><Metric label="未完成" value={`${result.schedules.filter((s: ScheduleItem) => s.status !== '已完成').length} 个`} /></div>
          <div className="mt-3 space-y-2">{result.schedules.map((s: ScheduleItem) => <ScheduleMini key={s.id} item={s} />)}</div>
        </>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2"><Metric label="总金额" value={yuan(result.total)} /><Metric label="消费笔数" value={`${result.count} 笔`} /><Metric label="最高类别" value={result.topCategory} /><Metric label="待报销" value={yuan(result.reimburse)} /></div>
          <h4 className="mt-4 text-sm font-semibold">最大三笔消费</h4>
          <div className="mt-2 space-y-2">{result.topExpenses.map((e: Expense) => <ExpenseTiny key={e.id} e={e} />)}</div>
          <h4 className="mt-4 text-sm font-semibold">明细列表</h4>
          <div className="mt-2 space-y-2">{result.expenses.slice(0, 8).map((e: Expense) => <ExpenseTiny key={e.id} e={e} />)}</div>
        </>
      )}
    </section>
  );
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const items = [
    { id: 'home' as Tab, label: '首页', icon: Home },
    { id: 'ledger' as Tab, label: '账本', icon: WalletCards },
    { id: 'voice' as Tab, label: '说', icon: Mic },
    { id: 'schedule' as Tab, label: '行程', icon: CalendarDays },
    { id: 'mine' as Tab, label: '我的', icon: UserRound },
  ];
  return (
    <nav className="absolute bottom-0 left-1/2 grid w-full max-w-[390px] -translate-x-1/2 grid-cols-5 items-end border-t border-slate-100 bg-white/95 px-3 pb-3 pt-2 backdrop-blur">
      {items.map(({ id, label, icon: Icon }) => (
        <button key={id} onClick={() => setTab(id)} className={`grid justify-items-center gap-1 text-xs ${id === 'voice' ? '-mt-8' : ''} ${tab === id ? 'text-ink' : 'text-slate-400'}`}>
          <span className={id === 'voice' ? 'grid h-16 w-16 place-items-center rounded-full bg-ink text-white shadow-soft' : 'grid h-8 w-8 place-items-center'}><Icon className={id === 'voice' ? 'h-7 w-7' : 'h-5 w-5'} /></span>
          <span className="font-medium">{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={`rounded-2xl bg-white p-3 shadow-soft ${tone === 'warm' ? 'text-orange-700' : ''}`}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>;
}

function CardTitle({ title, action, onAction }: any) {
  return <div className="flex items-center justify-between"><h2 className="font-semibold">{title}</h2><button onClick={onAction} className="flex items-center text-sm text-slate-500">{action}<ChevronRight className="h-4 w-4" /></button></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">{text}</div>;
}

function Pill({ text }: { text: string }) {
  return <span className="rounded-full bg-slate-50 px-3 py-2 text-slate-600">{text}</span>;
}

function Tag({ text }: { text: string }) {
  const color = text === '待报销' || text === '未开始' || text === '未完成' ? 'bg-amber-50 text-amber-700' : text === '已报销' || text === '已完成' || text === '收入' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600';
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${color}`}>{text}</span>;
}

function ExpenseRow({ e, onDelete, onPaid }: any) {
  const isIncome = e.type === 'income';
  return (
    <article className="mb-3 rounded-2xl bg-white p-4 shadow-soft">
      <div className="flex justify-between gap-3">
        <div><h3 className="font-semibold">{e.item}</h3><p className="mt-1 text-sm text-slate-500">{e.date} · {e.category} · {e.paymentMethod}</p></div>
        <p className={`text-lg font-bold ${isIncome ? 'text-emerald-600' : ''}`}>{isIncome ? '+' : ''}{yuan(e.amount)}</p>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Tag text={isIncome ? '收入' : e.reimbursementStatus} />
        <div className="flex gap-2">
          {e.reimbursementStatus === '待报销' && <button onClick={() => onPaid(e.id)} className="icon-btn text-emerald-700"><Check className="h-4 w-4" /></button>}
          <button onClick={() => onDelete(e.id)} className="icon-btn text-red-500"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </article>
  );
}

function ExpenseTiny({ e }: { e: Expense }) {
  const isIncome = e.type === 'income';
  return <div className="flex justify-between rounded-xl bg-white p-3 text-sm"><span>{e.date} · {e.item} · {e.category}</span><strong className={isIncome ? 'text-emerald-600' : ''}>{isIncome ? '+' : ''}{yuan(e.amount)}</strong></div>;
}

function ScheduleMini({ item }: { item: ScheduleItem }) {
  return <div className="mb-2 flex items-center gap-3 rounded-xl bg-slate-50 p-3"><Clock3 className="h-4 w-4 text-leaf" /><div><p className="font-semibold">{item.title}</p><p className="text-sm text-slate-500">{scheduleDisplayTime(item)}</p></div></div>;
}

function ScheduleRow({ s, onDelete }: any) {
  return (
    <article className="border-l-2 border-leaf pl-3">
      <div className="rounded-2xl bg-slate-50 p-3">
        <div className="flex justify-between gap-3">
          <div><p className="font-semibold">{s.title}</p><p className="text-sm text-slate-500">{scheduleDisplayTime(s)}{s.location ? ` · ${s.location}` : ''}</p></div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={() => onDelete(s.id)} className="icon-btn text-red-500"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </article>
  );
}

function MemoRow({ memo, onDone, onDelete }: any) {
  return (
    <article className="rounded-2xl bg-slate-50 p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-leaf">
          <StickyNote className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-semibold">{memo.title}</h3>
            <Tag text={memo.status} />
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{memo.content}</p>
          <p className="mt-2 text-xs text-slate-400">{new Date(memo.createdAt).toLocaleString('zh-CN')}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {memo.status !== '已完成' && <button onClick={() => onDone(memo.id)} className="icon-btn text-emerald-700"><ListChecks className="h-4 w-4" /></button>}
        <button onClick={() => onDelete(memo.id)} className="icon-btn text-red-500"><Trash2 className="h-4 w-4" /></button>
      </div>
    </article>
  );
}

function GridInput({ label, value, onChange, placeholder }: any) {
  return <label className="mb-2 grid grid-cols-[72px_1fr] items-center gap-2 text-sm"><span className="text-slate-500">{label}</span><input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-ink" /></label>;
}

function Select({ label, value, options, onChange }: any) {
  return <label className="mb-2 grid grid-cols-[72px_1fr] items-center gap-2 text-sm"><span className="text-slate-500">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-ink">{options.map((o: string) => <option key={o}>{o}</option>)}</select></label>;
}

function Source({ text }: { text: string }) {
  return <div className="my-3 rounded-xl bg-white p-3 text-xs text-slate-500">原始输入：{text}</div>;
}

function ConfirmActions({ onConfirm, onCancel, label, disabled }: any) {
  return <div className="grid grid-cols-2 gap-2"><button onClick={onCancel} className="rounded-2xl bg-white py-3 font-semibold text-slate-600"><Pencil className="mr-1 inline h-4 w-4" />取消</button><button onClick={onConfirm} disabled={disabled} className="rounded-2xl bg-ink py-3 font-semibold text-white disabled:bg-slate-300 disabled:text-slate-500"><Plus className="mr-1 inline h-4 w-4" />{label}</button></div>;
}
