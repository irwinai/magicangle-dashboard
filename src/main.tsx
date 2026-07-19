import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  HelpCircle,
  RotateCcw,
  Search,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { deriveBoards, mergeDashboardData, parseResponse, playName } from './data/normalize';
import { decodeSelections } from './data/playbook';
import { requestBackend } from './api';
import type { Board, BoardMember, Buyer, DashboardData, Match, Order, RecentResult, Starter } from './types';
import './styles.css';

const EMPTY_DATA: DashboardData = { starters: {}, orders: [], boards: [] };

const integer = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0, useGrouping: false });
const decimal = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

const formatCount = (value?: number) => (value === undefined ? '—' : integer.format(value));
const formatMoney = (cents?: number) => (cents === undefined ? '—' : `¥${integer.format(Math.round(cents / 100))}`);
const formatYuan = (yuan?: number) => (yuan === undefined ? '—' : integer.format(yuan));
const formatBonus = (yuan?: number) => (yuan === undefined ? '—' : `${decimal.format(yuan)}元`);
// 中奖金额按万显示（分 -> 元 -> 万）：18500000 -> ¥18.5万
function formatWan(cents?: number) {
  if (cents === undefined) return '—';
  const yuan = Math.round(cents / 100);
  if (yuan >= 10000) {
    const wan = yuan / 10000;
    return `¥${Number.isInteger(wan) ? wan : wan.toFixed(1)}万`;
  }
  return `¥${integer.format(yuan)}`;
}

function formatDateTime(time?: number) {
  if (!time) return '—';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(time))
    .replaceAll('/', '-');
}

type Settlement = 'win' | 'loss' | 'open';
type DisplayStatus = Settlement | 'closed';

// winFlag：2 = 已中奖，1 = 未中奖，0/未定 = 进行中
function settlement(order: Order): Settlement {
  if (order.winFlag === 2) return 'win';
  if (order.winFlag === 1) return 'loss';
  return 'open';
}

const SETTLEMENT_LABEL: Record<Settlement, string> = { win: '已中奖', loss: '未中奖', open: '进行中' };
const DISPLAY_STATUS_LABEL: Record<DisplayStatus, string> = { ...SETTLEMENT_LABEL, closed: '已截止' };

function displayStatus(order: Order, now: number): DisplayStatus {
  const state = settlement(order);
  if (state === 'open' && order.endedAt !== undefined && order.endedAt <= now) return 'closed';
  return state;
}

// 中奖单展示中奖金额（allPrizeAmt，分）：中奖：185000元
function statusLabel(order: Order, now: number): string {
  const state = displayStatus(order, now);
  if (state === 'win' && order.prizeAmount !== undefined) return `中奖：${formatYuan(Math.round(order.prizeAmount / 100))}元`;
  return DISPLAY_STATUS_LABEL[state];
}

const passLabel = (order: Order) => {
  if (order.passType === 'hybrid') return `单关+${order.passSize ?? 2}串1`;
  if (order.passType === 'parlay' && order.passSize) return `${order.passSize}串1`;
  return '单关';
};
const followCount = (order: Order) => order.buyerTotal ?? order.followerCount ?? order.popularity;
// 卡片底部只显示彩种（竞彩足球），详情页保留完整玩法名（竞彩足球总进球 …）
const lotteryFamily = (order: Order) => {
  const name = order.playName ?? playName(order.playType);
  return name.startsWith('竞彩足球') ? '竞彩足球' : name;
};

function splitTeams(match: Match): { home: string; away: string } {
  const [home = '', away = ''] = (match.team ?? '').split(/[:：]/);
  return { home: home.trim(), away: away.trim() };
}

// 场次编号：周X + 场次号（竞彩规则），接口按 week + teamId 组合
const WEEK_NAME: Record<string, string> = { '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '7': '日', '0': '日' };
const matchLabel = (match: Match) =>
  match.matchNo ?? (match.week && match.teamId ? `周${WEEK_NAME[match.week] ?? match.week}${match.teamId}` : (match.enddate ?? '—'));

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function countdown(target: number | undefined, now: number) {
  if (!target) return '—';
  const diff = target - now;
  if (diff <= 0) return '已截止';
  const seconds = Math.floor(diff / 1000);
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function Avatar({ starter, size = 44 }: { starter?: { avatar?: string; nickname?: string }; size?: number }) {
  const style = { width: size, height: size } as const;
  if (starter?.avatar) return <img className="avatar" style={style} src={starter.avatar} alt="" />;
  return <span className="avatar avatar--initial" style={style}>{starter?.nickname?.slice(0, 1) ?? '?'}</span>;
}

function BallIcon({ size = 34 }: { size?: number }) {
  return <span className="ball-icon" style={{ width: size, height: size, fontSize: size * 0.55 }}>⚽</span>;
}

function RecentDots({ recent, limit = 5, linked = false }: { recent?: RecentResult[]; limit?: number; linked?: boolean }) {
  const visible = (recent ?? []).slice(0, limit);
  if (visible.length === 0) return <span className="dots-empty">暂无战绩</span>;
  return (
    <div className={linked ? 'dots dots--linked' : 'dots'}>
      {visible.map((entry, index) => (
        <span key={index} className={entry.win ? 'dot dot--win' : 'dot dot--loss'}>{entry.win ? '红' : '黑'}</span>
      ))}
    </div>
  );
}

const BOARD_ICON: Record<string, typeof Flame> = { streak: Flame, winRate: Trophy, profit: TrendingUp };

type View = { name: 'hall' } | { name: 'profile'; id: string } | { name: 'order'; id: string };
type ProfileTarget = Pick<Starter, 'id' | 'nickname' | 'avatar' | 'storeId'>;
type RequestState = { id?: string; loading: boolean; error?: string };

function App() {
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [view, setView] = useState<View>({ name: 'hall' });
  const [stack, setStack] = useState<View[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Starter[]>([]);
  const [tab, setTab] = useState<'popular' | 'amount'>('popular');
  const [deepTab, setDeepTab] = useState<'plan' | 'buyers'>('plan');
  const [notice, setNotice] = useState('');
  const [hallLoading, setHallLoading] = useState(false);
  const [hallOrderIds, setHallOrderIds] = useState<string[]>([]);
  const [profileRequest, setProfileRequest] = useState<RequestState>({ loading: false });
  const [orderRequest, setOrderRequest] = useState<RequestState>({ loading: false });
  const [buyersLoading, setBuyersLoading] = useState(false);
  const now = useNow();

  // 支持 #profile/<id>、#order/<id>、#order/<id>/buyers 深链，便于分享与直达。
  useEffect(() => {
    const [name, id, sub] = window.location.hash.replace(/^#/, '').split('/');
    if (!id) return;
    if (name === 'profile') setView({ name: 'profile', id });
    else if (name === 'order') {
      setView({ name: 'order', id });
      if (sub === 'buyers') setDeepTab('buyers');
    }
  }, []);

  const boards = useMemo<Board[]>(() => (data.boards?.length ? data.boards : deriveBoards(data.starters)), [data]);
  const query = search.trim().toLowerCase();
  const hallOrderIdSet = useMemo(() => new Set(hallOrderIds), [hallOrderIds]);

  const ordersByStarter = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of data.orders) {
      const list = map.get(order.starterId) ?? [];
      list.push(order);
      map.set(order.starterId, list);
    }
    return map;
  }, [data.orders]);

  const feed = useMemo(() => {
    // 跟单大厅只展示首页推荐接口本次返回的进行中方案。
    // 用户主页加载的历史单不能回流到首页，否则会出现重复卡片。
    let orders = data.orders.filter((order) => hallOrderIdSet.has(order.id) && settlement(order) === 'open');
    if (query) {
      orders = orders.filter((order) => {
        const starter = data.starters[order.starterId];
        return `${starter?.nickname ?? ''} ${order.id}`.toLowerCase().includes(query);
      });
    }
    if (tab === 'amount') orders.sort((a, b) => (b.totalAmount ?? 0) - (a.totalAmount ?? 0));
    else orders.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    return orders;
  }, [data, hallOrderIdSet, query, tab]);

  const starterResults = useMemo(
    () => (query ? searchResults.filter((starter) => `${starter.nickname} ${starter.id}`.toLowerCase().includes(query)) : []),
    [query, searchResults],
  );

  function push(next: View) {
    setStack((prev) => [...prev, view]);
    setView(next);
    window.scrollTo({ top: 0 });
  }

  function back() {
    setView(stack[stack.length - 1] ?? { name: 'hall' });
    setStack((prev) => prev.slice(0, -1));
    window.scrollTo({ top: 0 });
  }

  function toProfileTarget(value: string | Starter | BoardMember): ProfileTarget {
    if (typeof value === 'string') {
      const starter = data.starters[value];
      return { id: value, nickname: starter?.nickname, avatar: starter?.avatar, storeId: starter?.storeId };
    }
    return { id: value.id, nickname: value.nickname, avatar: value.avatar, storeId: 'storeId' in value ? value.storeId : undefined };
  }

  function includeProfileTarget(target: ProfileTarget) {
    if (!target.nickname) return;
    setData((current) => ({
      ...current,
      starters: {
        ...current.starters,
        [target.id]: {
          ...current.starters[target.id],
          id: target.id,
          nickname: target.nickname,
          avatar: target.avatar ?? current.starters[target.id]?.avatar,
          storeId: target.storeId ?? current.starters[target.id]?.storeId,
        },
      },
    }));
  }

  const goProfile = (value: string | Starter | BoardMember) => {
    const target = toProfileTarget(value);
    includeProfileTarget(target);
    push({ name: 'profile', id: target.id });
    void loadProfile(target);
  };

  const openOrder = (id: string) => {
    push({ name: 'order', id });
    void loadOrder(id);
  };

  // 每次响应仅合并到当前页面会话；刷新页面后会重新从后端查询。
  function applyResponses(payloads: unknown[]): { starters: number; orders: number; parsed: DashboardData[] } {
    const parsed = payloads
      .map((payload) => parseResponse(payload))
      .filter((response) => Object.keys(response.starters).length > 0 || response.orders.length > 0);
    const starterIds = new Set<string>();
    let orders = 0;
    parsed.forEach((entry) => {
      Object.keys(entry.starters).forEach((id) => starterIds.add(id));
      orders += entry.orders.length;
    });
    if (parsed.length > 0) {
      setData((current) => parsed.reduce((accumulated, incoming) => mergeDashboardData(accumulated, incoming), current));
    }
    return { starters: starterIds.size, orders, parsed };
  }

  async function loadHall(showNotice = false) {
    setHallLoading(true);
    try {
      const response = await requestBackend('/home');
      const added = applyResponses([response.raw]);
      setHallOrderIds([...new Set(added.parsed.flatMap((entry) => entry.orders.map((order) => order.id)))]);
      if (showNotice) {
        setNotice(added.orders || added.starters
          ? `推荐列表已更新 ${added.starters} 位发起人 · ${added.orders} 笔订单`
          : '推荐列表本次未返回可显示内容');
      }
    } catch (error) {
      if (showNotice) setNotice(error instanceof Error ? `推荐列表：${error.message}` : '推荐列表请求失败');
    } finally {
      setHallLoading(false);
    }
  }

  async function loadProfile(initialTarget: ProfileTarget) {
    setProfileRequest({ id: initialTarget.id, loading: true });
    let target = initialTarget;
    const failures: string[] = [];
    const recentOrderIds = [...new Set(
      (data.starters[initialTarget.id]?.recent ?? [])
        .map((entry) => entry.orderId)
        .filter((orderId): orderId is string => Boolean(orderId)),
    )];

    try {
      const response = await requestBackend(`/starters/${encodeURIComponent(target.id)}/military`, { day: 7 });
      const result = applyResponses([response.raw]);
      if (result.starters === 0) failures.push('7日战绩');
    } catch {
      failures.push('7日战绩');
    }

    if (target.nickname) {
      try {
        const response = await requestBackend('/starters/search', { nickname: target.nickname, pageNum: 1, pageSize: 20 });
        const result = applyResponses([response.raw]);
        const matchingStarter = result.parsed
          .flatMap((entry) => Object.values(entry.starters))
          .find((starter) => starter.id === target.id)
          ?? result.parsed.flatMap((entry) => Object.values(entry.starters)).find((starter) => starter.nickname === target.nickname);
        if (matchingStarter) target = matchingStarter;
      } catch {
        failures.push('资料');
      }
    }

    if (recentOrderIds.length > 0) {
      try {
        const response = await requestBackend('/orders/batch', { prescientIds: recentOrderIds });
        const result = applyResponses([response.raw]);
        if (result.orders === 0) failures.push('历史订单');
      } catch {
        failures.push('历史订单');
      }
    } else {
      try {
        const response = await requestBackend(`/starters/${encodeURIComponent(target.id)}/orders`, {
          resultSize: 10,
          pageIndex: 0,
          day: 30,
        });
        const result = applyResponses([response.raw]);
        if (result.orders === 0) failures.push('历史订单');
      } catch {
        failures.push('历史订单');
      }
    }

    setProfileRequest({
      id: initialTarget.id,
      loading: false,
      error: failures.length ? `${failures.join('、')}接口本次未返回可显示数据` : undefined,
    });
  }

  async function loadOrder(orderId: string) {
    setOrderRequest({ id: orderId, loading: true });
    try {
      const response = await requestBackend(`/orders/${encodeURIComponent(orderId)}`);
      applyResponses([response.raw]);
      setOrderRequest({ id: orderId, loading: false });
    } catch {
      setOrderRequest({ id: orderId, loading: false, error: '订单详情接口本次未返回可显示数据' });
    }
  }

  async function loadBuyers(orderId: string) {
    setBuyersLoading(true);
    try {
      const response = await requestBackend('/buyers', { prescientId: orderId });
      const buyers = response.buyers ?? [];
      if (buyers.length === 0) {
        setNotice('跟单用户：接口未返回可显示记录');
        return;
      }
      setData((current) => ({
        ...current,
        orders: current.orders.map((order) => order.id === orderId ? {
          ...order,
          buyers,
          buyerTotal: response.buyerSummary?.totalNumber ?? order.buyerTotal,
          totalAmount: response.buyerSummary?.totalAmount ?? order.totalAmount,
          prizeAmount: response.buyerSummary?.totalPrizeAmount ?? order.prizeAmount,
        } : order),
        updatedAt: Date.now(),
      }));
      setNotice(`跟单用户已更新 ${buyers.length} 条记录`);
    } catch (error) {
      setNotice(error instanceof Error ? `跟单用户：${error.message}` : '跟单用户请求失败');
    } finally {
      setBuyersLoading(false);
    }
  }

  useEffect(() => {
    void loadHall();
  }, []);

  useEffect(() => {
    const nickname = search.trim();
    if (!nickname) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await requestBackend('/starters/search', { nickname, pageNum: 1, pageSize: 20 });
        const result = applyResponses([response.raw]);
        setSearchResults(result.parsed.flatMap((entry) => Object.values(entry.starters)));
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (view.name === 'profile' && profileRequest.id !== view.id) {
      void loadProfile(toProfileTarget(view.id));
    }
    if (view.name === 'order' && orderRequest.id !== view.id) {
      void loadOrder(view.id);
    }
  }, [view, profileRequest.id, orderRequest.id]);

  return (
    <div className="app">
      {view.name === 'hall' && (
        <>
          <header className="appbar">
            <span className="appbar__icon appbar__icon--ghost" aria-hidden="true" />
            <h1 className="appbar__title">跟单大厅</h1>
            <span className="appbar__actions">
              <button className="appbar__icon" type="button" title="重新查询推荐列表" aria-label="重新查询推荐列表" disabled={hallLoading} onClick={() => void loadHall(true)}><RotateCcw size={19} /></button>
            </span>
          </header>

          <div className="searchbar">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索发起人用户名 / 订单号" />
            {search && <button type="button" aria-label="清除" onClick={() => setSearch('')}><X size={16} /></button>}
          </div>

          {notice && <div className="notice" role="status"><span>{notice}</span><button type="button" aria-label="关闭" onClick={() => setNotice('')}><X size={15} /></button></div>}

          <main className="scroll">
            {query ? (
              <section className="results">
                <p className="results__label">用户名匹配 {starterResults.length} 位</p>
                {starterResults.length === 0 ? <div className="empty">没有匹配的发起人</div> : starterResults.map((starter) => (
                  <button className="result-row" type="button" key={starter.id} onClick={() => goProfile(starter)}>
                    <Avatar starter={starter} size={40} />
                    <span className="result-row__name">
                      <strong>{starter.nickname}</strong>
                      <small>命中 {starter.hitRate ?? '—'} · 盈利 {starter.earningsRate ?? '—'} · {ordersByStarter.get(starter.id)?.length ?? 0} 单</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </section>
            ) : (
              <section className="boards">
                {boards.length === 0 ? (
                  <div className="live-status">{hallLoading ? '正在查询实时排行榜' : '排行榜接口本次未返回可显示数据'}</div>
                ) : boards.map((board) => {
                  const Icon = BOARD_ICON[board.key] ?? Trophy;
                  return (
                    <div className="board" key={board.key}>
                      <span className={`board__tag board__tag--${board.key}`}><Icon size={15} />{board.title}</span>
                      <div className="board__strip">
                        {board.members.map((member) => (
                          <button className="board__member" type="button" key={member.id} onClick={() => goProfile(member)}>
                            <Avatar starter={member} size={44} />
                            <small>{member.nickname}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            <div className="tabs">
              <button className={tab === 'popular' ? 'tab tab--active' : 'tab'} type="button" onClick={() => setTab('popular')}>人气跟单</button>
              <button className={tab === 'amount' ? 'tab tab--active' : 'tab'} type="button" onClick={() => setTab('amount')}>跟单总额</button>
            </div>

            <section className="feed">
              {hallLoading && feed.length === 0 ? <div className="live-status">正在查询人气跟单</div> : feed.length === 0 ? <div className="empty">没有可显示的订单</div> : feed.map((order) => {
                const starter = data.starters[order.starterId];
                const state = settlement(order);
                const monthlyWin = starter?.monthlyWin;
                return (
                  <article className="card" key={order.id}>
                    <button className="card__head" type="button" onClick={() => goProfile(starter ?? order.starterId)}>
                      <Avatar starter={starter} size={44} />
                      <span className="card__id">
                        <strong>{starter?.nickname ?? `发起人 ${order.starterId}`}</strong>
                        <small className="card__sub">
                          <span>{order.playName ?? playName(order.playType)}</span>
                          <span>预计 {order.expectMultiple ?? '—'} 倍</span>
                          {state === 'open'
                            ? <span className="card__sub-deadline"><Clock size={12} />截止 {countdown(order.endedAt, now)}</span>
                            : <span className={`badge badge--${state}`}>{SETTLEMENT_LABEL[state]}</span>}
                        </small>
                      </span>
                      <span className="card__win">
                        <b>{monthlyWin === undefined ? '—' : `${formatCount(monthlyWin)}人`}</b>
                        <small>月带红</small>
                      </span>
                    </button>
                    <button className="card__body" type="button" onClick={() => openOrder(order.id)}>
                      <p className="card__desc">{order.description ?? '查看该发起人本单的对阵与投注内容'}</p>
                      <div className="card__foot">
                        <span className="card__foot-play"><BallIcon size={26} />{lotteryFamily(order)}</span>
                        <span className="stat"><b>{formatYuan(order.confidence)}</b><small>推荐信心</small></span>
                        <span className="stat"><b>{formatCount(order.popularity)}</b><small>人气</small></span>
                        <span className="card__foot-more">查看<ChevronRight size={15} /></span>
                      </div>
                    </button>
                  </article>
                );
              })}
            </section>
            <p className="disclaimer">数据实时查询自本项目后端接口，仅供信息核对，不构成任何投注建议。</p>
          </main>
        </>
      )}

      {view.name === 'profile' && (
        <ProfileScreen
          starter={data.starters[view.id]}
          starterId={view.id}
          orders={(ordersByStarter.get(view.id) ?? []).slice().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))}
          onBack={back}
          onOpenOrder={openOrder}
          loading={profileRequest.id === view.id && profileRequest.loading}
          error={profileRequest.id === view.id ? profileRequest.error : undefined}
          onReload={() => void loadProfile(toProfileTarget(view.id))}
          now={now}
        />
      )}

      {view.name === 'order' && (() => {
        const order = data.orders.find((entry) => entry.id === view.id);
        if (!order) {
          const loading = orderRequest.id === view.id && orderRequest.loading;
          return <div className="empty">{loading ? '正在查询订单详情' : (orderRequest.error ?? '订单详情暂无返回数据')}</div>;
        }
        return (
          <OrderScreen
            key={order.id}
            order={order}
            starter={data.starters[order.starterId]}
            initialTab={deepTab}
            onBack={back}
            onOpenProfile={goProfile}
            onLoadBuyers={loadBuyers}
            buyersLoading={buyersLoading}
            now={now}
          />
        );
      })()}

    </div>
  );
}

function ProfileScreen({ starter, starterId, orders, onBack, onOpenOrder, loading, error, onReload, now }: {
  starter?: Starter;
  starterId: string;
  orders: Order[];
  onBack: () => void;
  onOpenOrder: (id: string) => void;
  loading: boolean;
  error?: string;
  onReload: () => void;
  now: number;
}) {
  const recent = starter?.recent?.length
    ? starter.recent
    : orders
      .filter((order) => order.winFlag === 1 || order.winFlag === 2)
      .slice(0, 5)
      .map((order) => ({ orderId: order.id, win: order.winFlag === 2 }));
  const window5 = recent.slice(0, 5);
  const hit5 = window5.filter((entry) => entry.win).length;
  const weekLabel = starter?.weekBet !== undefined ? `${starter.weekBet}中${starter.weekHit ?? 0}` : `${window5.length}中${hit5}`;

  return (
    <>
      <header className="appbar appbar--profile">
        <button className="appbar__icon" type="button" aria-label="返回" onClick={onBack}><ChevronLeft size={22} /></button>
        <h1 className="appbar__title">Ta的主页</h1>
        <button className="appbar__icon" type="button" title="重新查询资料" aria-label="重新查询资料" disabled={loading} onClick={onReload}><RotateCcw size={19} /></button>
      </header>

      <main className="scroll scroll--profile">
        <section className="profile-hero">
          <Avatar starter={starter} size={58} />
          <div className="profile-hero__id">
            <div className="profile-hero__name">
              <strong>{starter?.nickname ?? `发起人 ${starterId}`}</strong>
            </div>
            <small>
              粉丝 {formatCount(starter?.subscribeCount)} · 发单 {formatCount(starter?.orderCount ?? orders.length)}
              {starter?.badges && <span className="profile-hero__badges"> · {starter.badges}</span>}
            </small>
          </div>
        </section>

        <section className="profile-stats">
          <div><b className="hot">{formatBonus(starter?.cumulativeBonus)}</b><small>累计奖金</small></div>
          <div><b className="hot">{starter?.profit7d ?? '—'}</b><small>7日盈利</small></div>
          <div><b className="hot">{weekLabel}</b><small>7日命中</small></div>
        </section>

        <section className="profile-recent">
          <span className="profile-recent__label">近{window5.length || 5}场战绩</span>
          {starter ? <RecentDots recent={recent} linked /> : <span className="dots-empty">暂无战绩</span>}
        </section>

        <section className="p-orders">
          {loading ? <div className="live-status">正在查询该发起人的实时订单</div> : orders.length === 0 ? <div className="empty">该发起人本次未返回历史订单</div> : orders.map((order) => {
            const state = displayStatus(order, now);
            return (
              <button className="p-order" type="button" key={order.id} onClick={() => onOpenOrder(order.id)}>
                <BallIcon size={34} />
                <span className="p-order__main">
                  <span className="p-order__top">
                    <strong>{order.playName ?? playName(order.playType)}</strong>
                    <time>{formatDateTime(order.endedAt ?? order.createdAt)}</time>
                  </span>
                  <span className="p-order__bottom">
                    <span className={`badge badge--${state}`}>{statusLabel(order, now)}</span>
                    <span className="p-order__meta">推荐信心：<b>{formatYuan(order.confidence)}</b> 跟单人数：<b>{formatCount(order.followerCount)}人</b></span>
                  </span>
                </span>
              </button>
            );
          })}
        </section>
        {error && <p className="profile-query-error">{error}</p>}
        <p className="disclaimer">资料、战绩和订单均以本次接口响应为准。</p>
      </main>
    </>
  );
}

function OrderScreen({ order, starter, initialTab = 'plan', onBack, onOpenProfile, onLoadBuyers, buyersLoading, now }: {
  order: Order;
  starter?: Starter;
  initialTab?: 'plan' | 'buyers';
  onBack: () => void;
  onOpenProfile: (id: string) => void;
  onLoadBuyers: (id: string) => Promise<void>;
  buyersLoading: boolean;
  now: number;
}) {
  const [tab, setTab] = useState<'plan' | 'buyers'>(initialTab);
  const closed = Boolean(order.endedAt && order.endedAt < now);
  const state = settlement(order);
  // 详情页状态：中奖 -> 已中奖(+金额)，其余按是否截止显示 已截止 / 进行中
  const stateText = state === 'win' ? '已中奖' : (closed ? '已截止' : '进行中');
  const record = starter && starter.settledCount !== undefined ? `${starter.settledCount}中${starter.settledWin ?? 0}` : undefined;
  const buyers = order.buyers ?? [];

  useEffect(() => {
    if (tab === 'buyers') void onLoadBuyers(order.id);
  }, [tab, order.id]);

  return (
    <>
      <header className="appbar appbar--detail">
        <button className="appbar__icon" type="button" aria-label="返回" onClick={onBack}><ChevronLeft size={22} /></button>
        <h1 className="appbar__title">神单详情</h1>
        <span className="appbar__icon appbar__icon--ghost" aria-hidden="true" />
      </header>

      <main className="scroll scroll--order">
        <section className="order-person">
          <button className="order-person__id" type="button" onClick={() => onOpenProfile(order.starterId)}>
            <Avatar starter={starter} size={54} />
            <span className="order-person__text">
              <span className="order-person__name">
                <strong>{starter?.nickname ?? order.starterId}</strong>
                {starter?.badges && <em className="order-person__badges">{starter.badges}</em>}
              </span>
              {record && (
                <span className="record-pill"><b>{record}</b><i>盈利率{starter?.earningsRate ?? '—'}</i></span>
              )}
            </span>
            <ChevronRight className="order-person__arrow" size={18} />
          </button>
        </section>

        <section className="order-card">
          <div className="order-card__top">
            <span className="order-card__play"><BallIcon size={30} />{order.playName ?? playName(order.playType)}</span>
            <span className="order-card__meta">预计回报：<b>{order.expectMultiple ?? '—'}倍</b><i>佣金{order.commissionRate ?? '—'}%</i><HelpCircle size={13} /></span>
          </div>
          {order.description && <p className="order-card__desc">{order.description}</p>}
            <div className="order-card__figures">
              <span className="order-card__state">
                <b className={`order-card__state-tag order-card__state-tag--${state}`}>{stateText}</b>
                {state === 'win' && order.prizeAmount !== undefined && <i>{formatWan(order.prizeAmount)}</i>}
              </span>
              <div className="figure"><small>推荐信心</small><b>¥{formatYuan(order.confidence)}</b></div>
              <div className="figure"><small>自购金额</small><b>{formatMoney(order.amount)}</b></div>
              <div className="figure"><small>起投金额</small><b>{formatMoney(order.unitAmount)}</b></div>
              <div className="figure"><small>总跟单金额</small><b>{formatMoney(order.totalAmount)}</b></div>
              <div className="figure"><small>中奖金额</small><b>{formatMoney(order.prizeAmount)}</b></div>
            </div>
        </section>

        <section className="order-plan">
          <div className="order-plan__head">
            <button className={tab === 'plan' ? 'order-plan__tab order-plan__tab--on' : 'order-plan__tab'} type="button" onClick={() => setTab('plan')}>方案详情</button>
            <button className={tab === 'buyers' ? 'order-plan__tab order-plan__tab--on' : 'order-plan__tab'} type="button" onClick={() => setTab('buyers')}>跟单次数({formatCount(followCount(order))})</button>
          </div>

          {tab === 'plan' ? (
            <>
              <div className="order-plan__summary">
                <span className="order-plan__play">{order.playName ?? playName(order.playType)}</span>
                {order.betCount !== undefined && <span className="ptag ptag--bets">{order.betCount} 注</span>}
                {order.multiple !== undefined && <span className="ptag ptag--multi">{formatCount(order.multiple)} 倍</span>}
                <span className="ptag ptag--pass">{passLabel(order)}</span>
              </div>

              <div className="bet-table">
                <div className="bet-table__head">
                  <span>场次</span><span>主队/客队</span><span>投注内容</span><span>赛果(全/半)</span>
                </div>
                {order.matches.length === 0 ? <div className="bet-table__empty">接口未返回对阵明细</div> : order.matches.map((match, index) => {
                  const { home, away } = splitTeams(match);
                  const selections = decodeSelections(order, match);
                  return (
                    <div className="bet-table__row" key={`${match.teamId}-${index}`}>
                      <span className="bt-no">{matchLabel(match)}</span>
                      <span className="bt-team">
                        <em>{home || '主队'}{match.handicap ? ` (${match.handicap})` : ''}</em>
                        <i>vs</i>
                        <em>{away || '客队'}</em>
                      </span>
                      <span className="bt-bet">
                        {selections.length === 0 ? <span className="bt-muted">{closed ? '接口未返回' : '未开赛'}</span> : selections.map((selection, i) => (
                          <span className={selection.hit ? 'bt-pick bt-pick--hit' : 'bt-pick'} key={`${selection.label}-${i}`}>
                            <b>{selection.label}</b>{selection.odds && <i>({selection.odds})</i>}
                          </span>
                        ))}
                      </span>
                      <span className="bt-result">
                        {match.result ? <><b>{match.result}</b><i>半场:{match.firsthalfresult ?? '—'}</i></> : <span className="bt-muted">待回传</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="disclaimer disclaimer--sheet">编码内容以接口返回为准，已确认映射的显示为可读玩法，其余保留原始编码，不猜测投注选项。</p>
            </>
          ) : (
            <BuyerList buyers={buyers} total={order.buyerTotal} loading={buyersLoading} />
          )}
        </section>
      </main>
    </>
  );
}

function BuyerList({ buyers, total, loading }: { buyers: Buyer[]; total?: number; loading: boolean }) {
  if (loading) return <div className="bet-table__empty">正在查询跟单记录</div>;
  if (buyers.length === 0) return <div className="bet-table__empty">接口未返回跟单记录</div>;
  return (
    <div className="buyer-list">
      {buyers.map((buyer, index) => (
        <div className="buyer-row" key={index}>
          <Avatar starter={{ avatar: buyer.avatar, nickname: buyer.nickname }} size={38} />
          <span className="buyer-name">
            {buyer.nickname ?? '匿名'}
            {buyer.isStarter && <em className="buyer-tag">发起人</em>}
          </span>
          <span className="buyer-amt">{formatMoney(buyer.amount)}</span>
        </div>
      ))}
      {total !== undefined && total > buyers.length && <p className="buyer-more">共 {formatCount(total)} 人跟单，仅展示前 {buyers.length} 位</p>}
    </div>
  );
}

const rootElement = document.getElementById('root')!;
const root = import.meta.hot?.data.root ?? createRoot(rootElement);
root.render(<App />);

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.root = root;
  });
}
