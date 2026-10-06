import type { Batch, Cell, Product, Rack, Zone } from '../types';
import type { CellUse, RackLoad } from './inventory';
import { splitKey } from './inventory';
import { CELL_TYPES, STORAGE_UNITS, accepts } from './materials';
import { DAY } from './analytics';

// Контроль размещения: какие правила хранения нарушены в текущем срезе остатков.

export type ViolationKind =
  | 'blockedFilled'
  | 'overload'
  | 'sectionOverload'
  | 'rackOverload'
  | 'hazard'
  | 'gasMix'
  | 'expired'
  | 'places'
  | 'cellType'
  | 'mixed'
  | 'nonHazard'
  | 'zoneGroup'
  | 'expiring'
  | 'idle';

export type Level = 'critical' | 'warning' | 'info';

export const VIOLATIONS: Record<ViolationKind, { title: string; level: Level }> = {
  blockedFilled: { title: 'Товар в заблокированной ячейке', level: 'critical' },
  overload: { title: 'Перегруз ячейки', level: 'critical' },
  sectionOverload: { title: 'Перегруз секции стеллажа', level: 'critical' },
  rackOverload: { title: 'Перегруз стеллажа', level: 'critical' },
  hazard: { title: 'ЛВЖ или газ вне зоны ЛВЖ', level: 'critical' },
  gasMix: { title: 'Кислород вместе с горючими газами', level: 'critical' },
  expired: { title: 'Истёк срок годности', level: 'critical' },
  places: { title: 'Мест занято больше, чем есть', level: 'warning' },
  cellType: { title: 'Тип ячейки не подходит товару', level: 'warning' },
  mixed: { title: 'Разные товары в моно-ячейке', level: 'warning' },
  nonHazard: { title: 'Обычный товар в зоне ЛВЖ', level: 'warning' },
  zoneGroup: { title: 'ТМЦ не по назначению зоны', level: 'warning' },
  expiring: { title: 'Срок годности истекает в 30 дней', level: 'warning' },
  idle: { title: 'Нет движения больше 90 дней', level: 'info' },
};

export const LEVEL_ORDER: Record<Level, number> = { critical: 0, warning: 1, info: 2 };

export interface Violation {
  kind: ViolationKind;
  address: string;
  cellKey?: string;
  rackId?: string;
  text: string;
}

/** Ячейки, где хранить можно только один товар. */
const MONO = new Set(['pallet', 'cantilever', 'floor']);

export interface CheckInput {
  cells: Cell[];
  usage: Map<string, CellUse>;
  products: Map<string, Product>;
  batches: Record<string, Batch>;
  racks: Rack[];
  loads: Map<string, RackLoad>;
  lastMove: Record<string, number>;
  now: number;
  /** Зоны — для проверки назначения (допустимых групп ТМЦ) */
  zones?: Map<string, Zone>;
}

const kg = (v: number) => `${Math.round(v).toLocaleString('ru-RU')} кг`;

/** Проверка размещения по всем ячейкам и стеллажам. */
export function checkPlacement(x: CheckInput): Violation[] {
  const out: Violation[] = [];
  const firstCell = new Map<string, Cell>();
  for (const c of x.cells) {
    const key = `${c.rackId}:${c.section}`;
    if (!firstCell.has(key)) firstCell.set(key, c);
    const u = x.usage.get(c.address);
    if (!u || (u.qty <= 0 && !Object.keys(u.tare).length)) continue;
    const at = { address: c.address, cellKey: c.key, rackId: c.rackId };
    if (c.blocked && u.qty > 0)
      out.push({ kind: 'blockedFilled', ...at, text: c.note ? `Блокировка: ${c.note}` : 'Ячейка заблокирована' });
    if (c.maxLoad > 0 && u.weight > c.maxLoad * 1.0001)
      out.push({ kind: 'overload', ...at, text: `${kg(u.weight)} при допустимой ${kg(c.maxLoad)}` });
    if (c.places > 0 && u.places > c.places)
      out.push({
        kind: 'places',
        ...at,
        text: `Занято ${u.places} из ${c.places} ${CELL_TYPES[c.cellType].placeUnit}`,
      });
    const pids = Object.keys(u.byProduct);
    if (MONO.has(c.cellType) && pids.length > 1)
      out.push({ kind: 'mixed', ...at, text: `${pids.length} разных товара` });
    for (const pid of pids) {
      const p = x.products.get(pid);
      if (!p || c.virtual) continue;
      if (!accepts(c.cellType, p.storage))
        out.push({
          kind: 'cellType',
          ...at,
          text: `${p.name}: «${STORAGE_UNITS[p.storage].title.toLowerCase()}» в ячейке «${CELL_TYPES[c.cellType].title.toLowerCase()}»`,
        });
      if (p.hazard && !c.hazard) out.push({ kind: 'hazard', ...at, text: p.name });
      if (!p.hazard && c.hazard) out.push({ kind: 'nonHazard', ...at, text: p.name });
      const zone = x.zones?.get(c.zoneId);
      if (zone?.groups?.length && !zone.groups.includes(p.group))
        out.push({ kind: 'zoneGroup', ...at, text: `${p.name} в зоне «${zone.name}»` });
    }
    for (const k of Object.keys(u.items)) {
      const [pid, bid] = splitKey(k);
      const b = bid ? x.batches[bid] : undefined;
      if (!b?.expiry) continue;
      const name = x.products.get(pid)?.name ?? pid;
      if (b.expiry < x.now) out.push({ kind: 'expired', ...at, text: `${name}, партия ${b.number}` });
      else if (b.expiry < x.now + 30 * DAY)
        out.push({
          kind: 'expiring',
          ...at,
          text: `${name}, партия ${b.number} — до ${new Date(b.expiry).toLocaleDateString('ru-RU')}`,
        });
    }
    const lm = x.lastMove[c.address];
    if (lm && u.qty > 0 && x.now - lm > 90 * DAY)
      out.push({ kind: 'idle', ...at, text: `Последнее движение ${new Date(lm).toLocaleDateString('ru-RU')}` });
  }
  // Кислород (окислитель) и горючие газы нельзя хранить в одном отсеке
  const gasCells = new Map<string, { ox: Cell[]; fl: Cell[] }>();
  for (const c of x.cells) {
    const u = x.usage.get(c.address);
    if (!u || c.virtual) continue;
    for (const pid of Object.keys(u.byProduct)) {
      const cls = x.products.get(pid)?.attrs?.class;
      if (cls !== 'окислитель' && cls !== 'горючий') continue;
      const g = gasCells.get(c.zoneId) ?? { ox: [], fl: [] };
      gasCells.set(c.zoneId, g);
      (cls === 'окислитель' ? g.ox : g.fl).push(c);
    }
  }
  gasCells.forEach((g) => {
    if (!g.ox.length || !g.fl.length) return;
    const oxMinor = g.ox.length <= g.fl.length;
    for (const c of oxMinor ? g.ox : g.fl)
      out.push({
        kind: 'gasMix',
        address: c.address,
        cellKey: c.key,
        rackId: c.rackId,
        text: oxMinor ? 'Кислород в отсеке горючих газов' : 'Горючий газ в отсеке кислорода',
      });
  });
  for (const r of x.racks) {
    const l = x.loads.get(r.id);
    if (!l) continue;
    if (r.maxLoad && l.total > r.maxLoad * 1.0001)
      out.push({
        kind: 'rackOverload',
        address: r.code,
        rackId: r.id,
        text: `Стеллаж ${r.code}: ${kg(l.total)} при допустимой ${kg(r.maxLoad)}`,
      });
    if (r.sectionLoad)
      l.sections.forEach((w, s) => {
        if (w > r.sectionLoad! * 1.0001) {
          const c = firstCell.get(`${r.id}:${s}`);
          out.push({
            kind: 'sectionOverload',
            address: c?.address ?? r.code,
            cellKey: c?.key,
            rackId: r.id,
            text: `Стеллаж ${r.code}, секция ${s}: ${kg(w)} при допустимой ${kg(r.sectionLoad!)}`,
          });
        }
      });
  }
  return out.sort((a, b) => LEVEL_ORDER[VIOLATIONS[a.kind].level] - LEVEL_ORDER[VIOLATIONS[b.kind].level]);
}

/** Худший уровень нарушения по каждой ячейке (для окраски 3D и карт). */
export function worstByAddress(list: Violation[]): Map<string, Level> {
  const m = new Map<string, Level>();
  for (const v of list) {
    const lvl = VIOLATIONS[v.kind].level;
    const cur = m.get(v.address);
    if (!cur || LEVEL_ORDER[lvl] < LEVEL_ORDER[cur]) m.set(v.address, lvl);
  }
  return m;
}
