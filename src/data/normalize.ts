import type { Board, BoardMember, DashboardData, Order, RecentResult, Starter } from '../types';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const toString = (value: unknown) => (value === null || value === undefined ? undefined : String(value));
const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const PLAY_NAMES: Record<string, string> = {
  '500': '竞彩足球混合',
  '501': '竞彩足球胜平负',
  '502': '竞彩足球总进球',
  '503': '竞彩足球比分',
  '504': '竞彩足球半全场',
};

// lotNo 决定彩种名（已确认）：J00011 = 混合过关，其余为单一玩法
const LOT_NAMES: Record<string, string> = {
  J00001: '竞彩足球胜平负',
  J00002: '竞彩足球比分',
  J00003: '竞彩足球总进球',
  J00004: '竞彩足球半全场',
  J00011: '竞彩足球混合',
  J00013: '竞彩足球让球胜平负',
};

export function playName(playType?: string, fallback?: string, lotNo?: string) {
  if (fallback) return fallback;
  if (lotNo && LOT_NAMES[lotNo]) return LOT_NAMES[lotNo];
  return (playType && PLAY_NAMES[playType]) ?? '竞彩足球';
}

// lastTen 形如 "P2026...#false,P2026...#true,..."，系统返回的近期战绩
function parseRecent(value: unknown): RecentResult[] | undefined {
  const text = toString(value);
  if (!text) return undefined;
  const items = text.split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [orderId, flag] = entry.split('#');
    return { orderId: orderId || undefined, win: flag === 'true' || flag === '1' };
  });
  return items.length ? items : undefined;
}

// getPrescientMilitaryDetail 里的字段是「近 N 日」窗口（7 日盈利 / 7 日命中）
const looksLikeMilitaryDetail = (raw: Record<string, unknown>) =>
  raw.userName !== undefined && raw.totalPrescientNum !== undefined;

// 累计奖金：totalPrizeAmt 单位为分，换算成元
const bonusYuan = (raw: Record<string, unknown>) => {
  const cents = toNumber(raw.totalPrizeAmt);
  if (cents !== undefined) return Math.round(cents) / 100;
  return toNumber(raw.totalBonus ?? raw.cumulativeBonus ?? raw.totalEarnings);
};

function normalizeStarter(raw: Record<string, unknown>): Starter | undefined {
  const military = asRecord(raw.militaryInfo);
  const focus = asRecord(raw.focusInfo);
  const id = toString(raw.starterId ?? raw.starter ?? raw.id ?? focus?.starter);
  const nickname = toString(raw.nickname ?? raw.nickName ?? raw.staterName ?? raw.starterNickname ?? raw.starterName ?? raw.userName ?? raw.name);
  if (!id || !nickname) return undefined;
  const isDetail = looksLikeMilitaryDetail(raw);

  return {
    id,
    nickname,
    storeId: toString(raw.storeId),
    avatar: toString(raw.headPic ?? raw.headPicture ?? raw.headPhotoUrl ?? raw.staterPhoto ?? raw.avatar ?? raw.starterHeadPic ?? raw.usericonURL),
    doyenRank: toString(raw.doyenRank ?? raw.rank),
    hitRate: toString(military?.hitRate ?? raw.hitRate),
    // 战绩胶囊的盈利率取整体（militaryInfo）；militaryDetail 的 earningsRate 属于近 7 日
    earningsRate: toString(military?.earningsRate ?? (isDetail ? undefined : raw.earningsRate)),
    subscribeCount: toNumber(focus?.subscribeCount ?? raw.subscribeCount ?? raw.fansNumber ?? raw.fansNum),
    orderCount: toNumber(raw.totalPrescientNum ?? raw.publishNumber ?? raw.orderNumber ?? raw.publishCount ?? military?.publishNumber),
    monthlyWin: toNumber(military?.winNumber ?? raw.winNumber ?? raw.rate ?? raw.winPeopleCount),
    cumulativeBonus: bonusYuan(raw),
    profit7d: toString(military?.profitRate7 ?? raw.profitRate7 ?? raw.earningsRate7 ?? raw.weekProfitRate ?? (isDetail ? raw.earningsRate : undefined)),
    weekBet: toNumber(isDetail ? raw.allBetCount : undefined),
    weekHit: toNumber(isDetail ? raw.allHitCount : undefined),
    settledCount: toNumber(military?.allBetCount ?? raw.settleNumber ?? raw.hitTotal),
    settledWin: toNumber(military?.allHitCount ?? raw.hitNumber ?? raw.winCount),
    keepHit: toNumber(raw.keepHitNum ?? raw.number),
    lastTenHit: toString(raw.lastTenHit),
    recent: parseRecent(military?.lastTen ?? raw.lastTen),
    badges: toString(raw.badges ?? raw.levelIcon),
  };
}

function mergeStarter(existing: Starter | undefined, incoming: Starter): Starter {
  const defined = Object.fromEntries(Object.entries(incoming).filter(([, value]) => value !== undefined));
  return { ...existing, ...defined } as Starter;
}

const WEEK_NAME: Record<string, string> = { '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '7': '日', '0': '日' };
const deriveMatchNo = (week: unknown, teamId: unknown): string | undefined => {
  const w = toString(week);
  const t = toString(teamId);
  if (!w || !t) return undefined;
  return `周${WEEK_NAME[w] ?? w}${t}`;
};

// preAmtRecord 是 JSON 字符串：{minMoneny,maxMoneny,minPeilv,maxPeilv,count,amount}
function parsePreAmt(value: unknown): Record<string, unknown> | undefined {
  const text = toString(value);
  if (!text) return undefined;
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function expectedMultiple(preAmt: Record<string, unknown> | undefined, betCount: number | undefined, useCombinedMultiple: boolean): string | undefined {
  if (useCombinedMultiple) {
    const combinedMultiple = toNumber(preAmt?.maxPeilv);
    const combinations = toNumber(preAmt?.count) ?? betCount;
    if (combinedMultiple !== undefined && combinations !== undefined && combinations > 0) {
      return (Math.round((combinedMultiple / combinations) * 10) / 10).toFixed(1);
    }
  }
  return toString(preAmt?.minPeilv ?? preAmt?.maxPeilv);
}

function optionCount(game: string | undefined, option: string): number {
  if (!option) return 1;
  if ((game === 'J00002' || game === 'J00004') && /^\d+$/.test(option) && option.length % 2 === 0) return option.length / 2;
  if (game === 'J00003' || game === 'J00001' || game === 'J00013') return option.length;
  return 1;
}

function systemCombinationCount(selectionCounts: number[], passSize: number): number {
  let total = 0;
  const visit = (start: number, remaining: number, product: number) => {
    if (remaining === 0) {
      total += product;
      return;
    }
    for (let index = start; index <= selectionCounts.length - remaining; index += 1) {
      visit(index + 1, remaining - 1, product * selectionCounts[index]);
    }
  };
  visit(0, passSize, 1);
  return total;
}

function inferPassType(raw: Record<string, unknown>, matchCount: number, betCount?: number): { type: 'single' | 'parlay' | 'hybrid'; size?: number } {
  const playType = toString(raw.playType);
  if (playType === '500') return { type: 'single' };
  if (playType === '502') return { type: 'parlay', size: 2 };
  if (playType === 'MIX') return { type: 'hybrid', size: 2 };
  if (matchCount < 2 || betCount === undefined || betCount <= 0) return { type: 'single' };
  const mixedPass = toString(raw.lotNo) === 'J00011';
  const source = toString(raw.betCode) || toString(raw.betCodeForResult);
  if (!source) return mixedPass ? { type: 'parlay', size: matchCount } : { type: 'single' };

  let currentPlay = toString(raw.playType);
  const selectionsByMatch = new Map<string, number>();
  source.split('^').forEach((part) => {
    if (!part) return;
    const separator = part.indexOf('@');
    const payload = separator >= 0 ? part.slice(separator + 1) : part;
    if (separator >= 0) currentPlay = part.slice(0, separator);
    const fields = payload.split('|');
    if (fields.length < 4 || !fields[2]) return;
    const game = fields.length > 4 ? fields[3] : (toString(raw.lotNo) ?? currentPlay);
    const option = fields.length > 4 ? fields[4] : fields[3];
    selectionsByMatch.set(fields[2], (selectionsByMatch.get(fields[2]) ?? 0) + optionCount(game, option));
  });

  const selectionCounts = [...selectionsByMatch.values()];
  if (selectionCounts.length === matchCount) {
    for (let passSize = 2; passSize <= matchCount; passSize += 1) {
      if (systemCombinationCount(selectionCounts, passSize) === betCount) return { type: 'parlay', size: passSize };
    }
  }
  return mixedPass ? { type: 'parlay', size: matchCount } : { type: 'single' };
}

function normalizeOrder(raw: Record<string, unknown>, starterId: string): Order | undefined {
  const id = toString(raw.id ?? raw.prescientId);
  if (!id) return undefined;
  const matches = Array.isArray(raw.jingcaiResultList) ? raw.jingcaiResultList : [];
  const amount = toNumber(raw.selfBuyAmt ?? raw.orderInitAmt);
  const playType = toString(raw.playType);
  const followers = toNumber(raw.followerNumber ?? raw.totalNum);
  const preAmt = parsePreAmt(raw.preAmtRecord);
  const betCount = toNumber(raw.betnum ?? raw.betNum ?? preAmt?.count);
  const pass = inferPassType(raw, matches.length, betCount);

  return {
    id,
    starterId: toString(raw.starterId ?? raw.starter) ?? starterId,
    lotNo: toString(raw.lotNo),
    playType,
    playName: playName(playType, toString(raw.playName ?? raw.playTypeName), toString(raw.lotNo)),
    betCode: toString(raw.betCode),
    resultCode: toString(raw.betCodeForResult),
    createdAt: toNumber(raw.createTime),
    endedAt: toNumber(raw.endTime ?? raw.deadline ?? raw.enddate),
    status: toNumber(raw.displayState ?? raw.state),
    winFlag: toNumber(raw.winFlag),
    amount,
    unitAmount: toNumber(raw.unitAmt),
    followerCount: followers,
    totalAmount: toNumber(raw.totalAmt),
    commissionRate: toNumber(raw.commissionRate),
    popularity: toNumber(raw.hotNum ?? raw.popularity ?? raw.hot ?? raw.totalNum ?? raw.followerNumber),
    // 串关的 maxPeilv 是所有组合的汇总赔率；单关直接取最低可中赔率。
    expectMultiple: toString(raw.preMultiple ?? raw.expectMultiple ?? raw.forecastMultiple) ?? expectedMultiple(preAmt, betCount, pass.type !== 'single'),
    confidence: toNumber(raw.confidence) ?? (amount !== undefined ? Math.round(amount / 100) : undefined),
    prizeAmount: toNumber(raw.allPrizeAmt ?? raw.totalPrizeAmt ?? raw.prizeAmt ?? raw.bonusAmt ?? raw.winAmt),
    betCount,
    multiple: toNumber(raw.lotmulti ?? raw.multiple ?? raw.times),
    passType: pass.type,
    passSize: pass.size,
    description: toString(raw.description ?? raw.recommendReason ?? raw.reason),
    matches: matches.map(asRecord).filter((match): match is Record<string, unknown> => Boolean(match)).map((match) => ({
      team: toString(match.team),
      teamId: toString(match.teamId),
      day: toString(match.day),
      week: toString(match.week),
      // 场次编号 = 周X + 场次号（竞彩规则），接口按 week + teamId 组合
      matchNo: toString(match.matchNo ?? match.issueNo ?? match.weekNo ?? match.matchNumber) ?? deriveMatchNo(match.week, match.teamId),
      matchId: toString(match.matchId),
      handicap: toString(match.letpoint ?? match.handicap ?? match.rangqiu ?? match.concede ?? match.goalLine),
      league: toString(match.league),
      enddate: toString(match.enddate),
      result: toString(match.result) ?? null,
      firsthalfresult: toString(match.firsthalfresult) ?? null,
      peilvs: Array.isArray(match.peilvs) ? match.peilvs.map(asRecord).filter((selection): selection is Record<string, unknown> => Boolean(selection)).map((selection) => ({
        type: toString(selection.type),
        peilv: toString(selection.peilv),
        isHit: toString(selection.isHit),
      })) : [],
    })),
  };
}

function getCandidateLists(value: unknown): unknown[][] {
  const record = asRecord(value);
  if (!record) return [];
  const data = asRecord(record.data);
  return [record.list, record.records, record.rows, record.rankList, record.recommendList, record.buyerList, record.starterInfos, record.prescientInfos,
    record.streakList, record.winRateList, record.profitList,
    data?.list, data?.records, data?.rows, data?.rankList, data?.recommendList, data?.buyerList, data?.starterInfos, data?.prescientInfos,
    data?.streakList, data?.winRateList, data?.profitList]
    .filter(Array.isArray) as unknown[][];
}

function collectResponses(value: unknown): unknown[] {
  const collected: unknown[] = [];
  const seen = new Set<object>();
  const visit = (entry: unknown) => {
    const record = asRecord(entry);
    if (!record || seen.has(record)) return;
    seen.add(record);
    collected.push(record);
    for (const list of getCandidateLists(record)) list.forEach(visit);
    // 下探单对象节点：data 可能是单个发起人（militaryDetail）或订单包裹
    for (const nested of [record.data, record.starterInfo, record.prescientInfo, record.orderInfo, record.prescientIng]) {
      if (Array.isArray(nested)) nested.forEach(visit);
      else if (asRecord(nested)) visit(nested);
    }
  };
  visit(value);
  return collected;
}

const streak = (starter: Starter) => {
  let count = 0;
  for (const entry of starter.recent ?? []) {
    if (!entry.win) break;
    count += 1;
  }
  return count;
};

const rate = (value?: string) => {
  const parsed = Number((value ?? '').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : -1;
};

// 榜单由当前接口响应中的发起人字段派生：连红看当前连胜、胜率看命中率、盈利看收益率。
export function deriveBoards(starters: Record<string, Starter>): Board[] {
  const all = Object.values(starters);
  const build = (key: string, title: string, score: (s: Starter) => number, note: (s: Starter) => string | undefined): Board => ({
    key,
    title,
    members: [...all]
      .filter((starter) => score(starter) > 0)
      .sort((a, b) => score(b) - score(a))
      .slice(0, 8)
      .map((starter) => ({ id: starter.id, nickname: starter.nickname, avatar: starter.avatar, note: note(starter) })),
  });

  return [
    build('streak', '连红榜', streak, (s) => (streak(s) ? `${streak(s)}连红` : undefined)),
    build('winRate', '胜率榜', (s) => rate(s.hitRate), (s) => s.hitRate),
    build('profit', '盈利榜', (s) => rate(s.earningsRate), (s) => s.earningsRate),
  ].filter((board) => board.members.length > 0);
}

function readBoards(value: unknown, starters: Record<string, Starter>): Board[] | undefined {
  const record = asRecord(value);
  const source = asRecord(record?.data) ?? record;
  const mapMembers = (list: unknown): BoardMember[] =>
    (Array.isArray(list) ? list : []).map(asRecord).flatMap((entry) => {
      if (!entry) return [];
      const id = toString(entry.starter ?? entry.starterId ?? entry.id);
      const nickname = toString(entry.nickname ?? entry.nickName ?? entry.starterNickname ?? entry.name);
      if (!id || !nickname) return [];
      return [{ id, nickname, avatar: toString(entry.headPic ?? entry.headPicture ?? entry.avatar), note: toString(entry.note ?? entry.tag ?? entry.number) }];
    });

  const definitions: Array<[string, string, unknown]> = [
    ['streak', '连红榜', source?.streakList ?? source?.lianhongList ?? source?.continuousList],
    ['winRate', '胜率榜', source?.winRateList ?? source?.hitRateList],
    ['profit', '盈利榜', source?.profitList ?? source?.earningsList],
  ];
  const boards = definitions
    .map(([key, title, list]) => ({ key, title, members: mapMembers(list) }))
    .filter((board) => board.members.length > 0);
  // 只有排行榜接口能更新首页榜单。用户资料、订单和搜索响应也会携带发起人字段，
  // 不能从这些单条响应临时推导榜单，否则返回首页时会覆盖原来的完整排行榜。
  return boards.length ? boards : undefined;
}

export function parseResponse(input: unknown): DashboardData {
  const root = asRecord(input);
  const normalizedStarters = asRecord(root?.starters);
  const normalizedOrders = Array.isArray(root?.orders) ? root.orders : undefined;
  if (normalizedStarters && normalizedOrders) {
    const starters = Object.fromEntries(Object.entries(normalizedStarters).flatMap(([id, value]) => {
      const starter = normalizeStarter(asRecord(value) ?? {});
      return starter ? [[id, starter]] : [];
    }));
    return {
      starters,
      orders: normalizedOrders.map(asRecord).filter((order): order is Record<string, unknown> => Boolean(order)).map((order) => ({ ...order, matches: Array.isArray(order.matches) ? order.matches : [] } as Order)),
      boards: Array.isArray(root?.boards) ? (root.boards as Board[]) : deriveBoards(starters),
      updatedAt: Date.now(),
    };
  }
  const seeds = Array.isArray(input) ? input : [input];
  const responses = seeds.flatMap(collectResponses);
  const starters: Record<string, Starter> = {};
  const orders: Order[] = [];

  for (const response of responses) {
    const root = asRecord(response);
    const data = asRecord(root?.data);
    const starterInfo = asRecord(data?.starterInfo);
    const prescientInfo = asRecord(data?.prescientInfo);

    if (starterInfo) {
      const starter = normalizeStarter(starterInfo);
      if (starter) starters[starter.id] = mergeStarter(starters[starter.id], starter);
      if (starter && prescientInfo) {
        const order = normalizeOrder(prescientInfo, starter.id);
        if (order) orders.push(order);
      }
    }

    const candidate = asRecord(response);
    if (candidate) {
      const starter = normalizeStarter(asRecord(candidate.starterInfo) ?? candidate);
      if (starter) starters[starter.id] = mergeStarter(starters[starter.id], starter);
      const looksLikeOrder = typeof candidate.prescientId === 'string'
        || typeof candidate.betCode === 'string'
        || (typeof candidate.id === 'string' && candidate.id.startsWith('P'));
      const nestedOrder = asRecord(candidate.prescientInfo) ?? asRecord(candidate.orderInfo) ?? asRecord(candidate.prescientIng) ?? (looksLikeOrder ? candidate : undefined);
      if (starter && nestedOrder) {
        const order = normalizeOrder(nestedOrder, starter.id);
        if (order) orders.push(order);
      }
    }
  }

  const uniqueOrders = Object.values(Object.fromEntries(orders.map((order) => [order.id, order])));
  return {
    starters,
    orders: uniqueOrders.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    boards: readBoards(seeds[0], starters),
    updatedAt: Date.now(),
  };
}

export function mergeDashboardData(current: DashboardData, incoming: DashboardData): DashboardData {
  // 订单按 id 去重，当前请求的完整字段覆盖之前同一会话内的较早响应。
  const orders = Object.values(Object.fromEntries([...current.orders, ...incoming.orders].map((order) => [order.id, order])))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  // 资料接口经常只返回统计字段的一部分，不能用 undefined 覆盖同一会话中刚返回的完整资料。
  const starters = { ...current.starters };
  for (const [id, incomingStarter] of Object.entries(incoming.starters)) {
    const definedFields = Object.fromEntries(Object.entries(incomingStarter).filter(([, value]) => value !== undefined));
    starters[id] = { ...starters[id], ...definedFields } as Starter;
  }
  const boards = incoming.boards?.length ? incoming.boards : (current.boards?.length ? current.boards : deriveBoards(starters));
  return { starters, orders, boards, updatedAt: Date.now() };
}
