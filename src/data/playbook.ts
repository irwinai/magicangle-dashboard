import type { Match, Order, Selection } from '../types';

export type DisplaySelection = {
  label: string;
  odds?: string;
  hit?: boolean;
};

type BetSegment = {
  play?: string;
  teamId?: string;
  game?: string;
  option?: string;
};

// 赔率统一 2 位小数：1.850 -> 1.85，4.000 -> 4.00
function fmtOdds(value?: string): string | undefined {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : value;
}

const SPF: Record<string, string> = { '3': '胜', '1': '平', '0': '负' };
const LET_SPF: Record<string, string> = { '3': '让胜', '1': '让平', '0': '让负' };

function scoreLabel(option: string) {
  if (/^\d{2}$/.test(option)) return `${option[0]}:${option[1]}`;
  return `比分代码 ${option}`;
}

// 总进球：单位数编码，7 及以上按竞彩惯例记作 7+
function goalLabel(digit: string) {
  return digit === '7' ? '7+球' : `${digit}球`;
}

// 半全场：两位编码「半场+全场」，每位 3=胜/1=平/0=负（half_v33 = 胜-胜，half_v11 = 平-平）
function halfFullLabel(option: string) {
  if (/^[310]{2}$/.test(option)) return `${SPF[option[0]]}-${SPF[option[1]]}`;
  if (option === '4') return '平-平'; // 兼容个别旧单的单码
  return `半全场代码 ${option}`;
}

// 从 peilvs 的 type 解出玩法标签：
// v3/v1/v0 = 胜平负，letVs_v* = 让球胜平负，goal_vN = 总进球，score/half = 比分/半全场
function labelFromType(type?: string): string {
  if (!type) return '未标注';
  let m: RegExpMatchArray | null;
  if ((m = type.match(/^letVs_v(\d)$/))) return LET_SPF[m[1]] ?? `让球${m[1]}`;
  if ((m = type.match(/^v(\d{2})$/))) return scoreLabel(m[1]);
  if ((m = type.match(/^v(\d)$/))) return SPF[m[1]] ?? `选项${m[1]}`;
  if ((m = type.match(/^goal_v(\d+)$/))) return `${m[1]}球`;
  if ((m = type.match(/^(?:score|bf)_?v?(\d{2})$/))) return scoreLabel(m[1]);
  if ((m = type.match(/^(?:half|bqc)_?v?(\d+)$/))) return halfFullLabel(m[1]);
  return type;
}

// betCode 兜底：无 peilvs（未开赛）时按玩法编码解 option
function labelFromGame(game: string | undefined, option: string): string {
  switch (game) {
    case 'J00001': return SPF[option] ?? `选项${option}`;
    case 'J00013': return LET_SPF[option] ?? `让球${option}`;
    case 'J00002': // 比分：两位一组（13=1:3，1113=1:1 1:3）
      if (/^(\d{2})+$/.test(option)) return (option.match(/.{2}/g) ?? []).map(scoreLabel).join(' ');
      return scoreLabel(option);
    case 'J00003': // 总进球：每位一个进球数（34=3球 4球）
      if (/^\d+$/.test(option)) return [...option].map(goalLabel).join(' ');
      return `${option}球`;
    case 'J00004': // 半全场：两位一组（11=平-平，13=平-胜，3311=胜-胜 平-平）
      if (/^([310]{2})+$/.test(option)) return (option.match(/.{2}/g) ?? []).map(halfFullLabel).join(' ');
      return halfFullLabel(option);
    default:
      // 玩法未确认时保留原编码，不猜测
      return `${game ?? '玩法'} · ${option}`;
  }
}

function segments(order: Order): BetSegment[] {
  const source = order.betCode || order.resultCode;
  if (!source) return [];

  let currentPlay = order.playType;
  return source.split('^').flatMap((part) => {
    const separator = part.indexOf('@');
    const hasPlayPrefix = separator >= 0;
    const play = hasPlayPrefix ? part.slice(0, separator) : currentPlay;
    const payload = hasPlayPrefix ? part.slice(separator + 1) : part;
    if (play) currentPlay = play;
    const fields = payload?.split('|') ?? [];
    if (fields.length < 4) return [];
    const hasGameCode = fields.length > 4; // day|week|teamId|game|option
    return [{
      play,
      teamId: fields[2],
      // 无显式玩法编码时用订单的 lotNo（J00004 比分 / J00003 半全场 …）兜底
      game: hasGameCode ? fields[3] : (order.lotNo || play),
      option: hasGameCode ? fields[4] : fields[3],
    }];
  });
}

export function decodeSelections(order: Order, match: Match): DisplaySelection[] {
  // 已开赛的单里 peilvs 直接带了所投选项 + 赔率 + 命中，优先使用
  if (match.peilvs && match.peilvs.length > 0) {
    const decoded = match.peilvs.map((selection: Selection) => ({
      label: labelFromType(selection.type),
      odds: fmtOdds(selection.peilv),
      hit: selection.isHit === 'true',
    }));
    return Object.values(Object.fromEntries(decoded.map((selection) => [selection.label, selection])));
  }
  // 未开赛（无 peilvs）时按 betCode 解出选项，仅有标签、无赔率
  const decoded = segments(order)
    .filter((segment) => segment.teamId === match.teamId)
    .map((segment) => ({ label: labelFromGame(segment.game, segment.option ?? '') }));
  return Object.values(Object.fromEntries(decoded.map((selection) => [selection.label, selection])));
}
