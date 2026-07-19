export type Selection = {
  type?: string;
  peilv?: string;
  isHit?: string;
};

export type Match = {
  team?: string;
  teamId?: string;
  day?: string;
  week?: string; // 周几（周三 = 3 …）
  matchNo?: string; // 场次，如 "周三102"
  matchId?: string;
  handicap?: string; // 让球（letpoint），如 "-1"（附在主队上）
  league?: string;
  enddate?: string;
  result?: string | null;
  firsthalfresult?: string | null;
  peilvs?: Selection[];
};

export type RecentResult = {
  orderId?: string;
  win: boolean;
};

export type Starter = {
  id: string;
  nickname: string;
  storeId?: string;
  avatar?: string;
  doyenRank?: string;
  hitRate?: string;
  earningsRate?: string;
  subscribeCount?: number; // 粉丝
  orderCount?: number; // 发单（totalPrescientNum）
  monthlyWin?: number; // 月带红 (rate / winNumber)
  cumulativeBonus?: number; // 累计奖金（元）
  profit7d?: string; // 7 日盈利（earningsRate）
  weekBet?: number; // 7 日发单数（allBetCount）
  weekHit?: number; // 7 日命中数（allHitCount）
  settledCount?: number; // 战绩胶囊总场次（militaryInfo.allBetCount）
  settledWin?: number; // 战绩胶囊命中数（militaryInfo.allHitCount）
  keepHit?: number; // 当前连红
  lastTenHit?: string; // "9中8"
  recent?: RecentResult[]; // 近期战绩（lastTen）
  badges?: string; // 等级徽章 emoji
};

// 跟单买家（order/info/buyer/list）
export type Buyer = {
  nickname?: string;
  avatar?: string;
  amount?: number; // totalAmt（分）
  isStarter?: boolean;
};

export type Order = {
  id: string;
  starterId: string;
  lotNo?: string;
  playType?: string;
  playName?: string; // 竞彩足球总进球 / 混合 ...
  betCode?: string;
  resultCode?: string;
  createdAt?: number;
  endedAt?: number; // 截止时间
  status?: number;
  winFlag?: number; // 2 = 已中奖, 1 = 未中奖, 0 = 进行中/未开奖
  amount?: number; // selfBuyAmt（分）
  unitAmount?: number; // unitAmt（分）
  followerCount?: number; // 跟单人数（totalNum / followerNumber）
  totalAmount?: number;
  commissionRate?: number;
  popularity?: number; // 人气
  expectMultiple?: string; // 预计倍数
  confidence?: number; // 推荐信心（元）
  prizeAmount?: number; // 中奖金额 allPrizeAmt（分）
  betCount?: number; // 注数
  multiple?: number; // 倍数（lotmulti）
  passType?: 'single' | 'parlay' | 'hybrid';
  passSize?: number;
  description?: string;
  buyers?: Buyer[]; // 跟单记录
  buyerTotal?: number; // 跟单总人数
  matches: Match[];
};

export type BoardMember = {
  id: string;
  nickname: string;
  avatar?: string;
  note?: string;
};

export type Board = {
  key: string;
  title: string;
  members: BoardMember[];
};

export type DashboardData = {
  starters: Record<string, Starter>;
  orders: Order[];
  boards?: Board[];
  updatedAt?: number;
};
