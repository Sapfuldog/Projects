import type { Section, SyncStatus, Warehouse } from '../types';
import { LEVEL_ORDER, VIOLATIONS, type Level, type ViolationKind } from './control';
import type { Monitor } from './monitor';

export interface Alert {
  id: string;
  level: Level;
  title: string;
  text: string;
  at?: number;
  section?: Section;
  address?: string;
  kind?: ViolationKind;
}

/** Уведомления: нарушения правил хранения (по видам), ошибки и задержки обмена с учётной системой. */
export function buildAlerts(w: Warehouse | undefined, m: Monitor | undefined, sync?: SyncStatus): Alert[] {
  const out: Alert[] = [];
  if (m) {
    const byKind = new Map<ViolationKind, string[]>();
    for (const v of m.violations) {
      const list = byKind.get(v.kind) ?? [];
      list.push(v.address);
      byKind.set(v.kind, list);
    }
    byKind.forEach((addresses, kind) => {
      const spec = VIOLATIONS[kind];
      const uniq = [...new Set(addresses)];
      out.push({
        id: `v-${kind}`,
        level: spec.level,
        title: spec.title,
        text: `${uniq.length} ${uniq.length === 1 ? 'место' : 'мест'}: ${uniq.slice(0, 3).join(', ')}${uniq.length > 3 ? '…' : ''}`,
        section: 'control',
        address: uniq[0],
        kind,
      });
    });
  }
  if (sync?.error)
    out.push({
      id: 'sync',
      level: 'critical',
      title: 'Ошибка обмена с учётной системой',
      text: sync.error,
      at: sync.at,
      section: 'settings',
    });
  const conn = w?.connection;
  const updated = m?.inv?.updatedAt ?? 0;
  if (conn?.active && (conn.type === 'rest' || conn.type === 'demo') && updated) {
    const period = (conn.type === 'rest' ? conn.interval : conn.demoInterval) * 1000;
    if (Date.now() - updated > Math.max(5 * 60000, period * 5))
      out.push({
        id: 'stale',
        level: 'warning',
        title: 'Данные устарели',
        text: `Срез остатков не обновлялся с ${new Date(updated).toLocaleString('ru-RU')}`,
        at: updated,
        section: 'settings',
      });
  }
  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
