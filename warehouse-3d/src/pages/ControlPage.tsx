import { useMemo, useState } from 'react';
import { useStore, useWarehouse } from '../store';
import { useMonitor } from '../lib/derived';
import { LEVEL_ORDER, VIOLATIONS, type Level, type ViolationKind } from '../lib/control';
import { LEVEL_COLOR } from '../lib/colors';
import { rackContext } from '../lib/rack';
import { timeAgo } from '../lib/analytics';
import { Kpi } from './HomePage';
import { Icon } from '../components/icons';

const RULES: { kind: ViolationKind; text: string }[] = [
  { kind: 'overload', text: 'Вес груза в ячейке больше допустимой нагрузки ячейки (яруса).' },
  { kind: 'sectionOverload', text: 'Сумма веса в секции больше допустимой нагрузки на раму секции.' },
  { kind: 'rackOverload', text: 'Сумма веса на стеллаже больше допустимой нагрузки стеллажа.' },
  { kind: 'blockedFilled', text: 'В заблокированной ячейке (повреждение, ремонт) остался груз.' },
  { kind: 'hazard', text: 'ЛКМ, растворители и газы хранятся вне помещений и зон для ЛВЖ.' },
  { kind: 'gasMix', text: 'Кислород и горючие газы (пропан, ацетилен) в одном отсеке.' },
  { kind: 'expired', text: 'Истёк срок годности партии (ЛКМ, ГСМ).' },
  { kind: 'places', text: 'Занято больше паллетомест, коробомест или баллономест, чем есть в ячейке.' },
  {
    kind: 'cellType',
    text: 'Способ хранения ТМЦ не подходит типу ячейки: длинномер в паллетной ячейке, паллета на полке.',
  },
  { kind: 'mixed', text: 'В паллетной, консольной или напольной ячейке лежат разные ТМЦ.' },
  { kind: 'nonHazard', text: 'Обычные ТМЦ занимают места в зоне ЛВЖ.' },
  {
    kind: 'zoneGroup',
    text: 'Группа ТМЦ не соответствует назначению зоны (например, полуфабрикат на площадке листа).',
  },
  { kind: 'expiring', text: 'Срок годности партии истекает в ближайшие 30 дней.' },
  { kind: 'idle', text: 'По ячейке нет движения больше 90 дней — кандидат на инвентаризацию или списание.' },
];

const LEVEL_TITLE: Record<Level, string> = { critical: 'Критично', warning: 'Внимание', info: 'К сведению' };

/** Раздел «Контроль»: нарушения правил хранения по срезу остатков. */
export function ControlPage() {
  const w = useWarehouse();
  const m = useMonitor();
  const st = useStore.getState;
  const [level, setLevel] = useState<Level | null>(null);
  const [kind, setKind] = useState<ViolationKind | null>(null);
  const [roomId, setRoomId] = useState('');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    if (!m || !w) return [];
    return m.violations.map((v) => {
      const c = v.address ? m.idx.byAddress.get(v.address) : undefined;
      const rack = v.rackId ? w.racks.find((r) => r.id === v.rackId) : undefined;
      const ctx = rack ? rackContext(w, rack) : undefined;
      return { v, c, rack, room: ctx?.room, zone: ctx?.zone };
    });
  }, [m, w]);

  if (!m || !w) return null;
  const counts: Record<Level, number> = { critical: 0, warning: 0, info: 0 };
  const byKind = new Map<ViolationKind, number>();
  for (const v of m.violations) {
    counts[VIOLATIONS[v.kind].level]++;
    byKind.set(v.kind, (byKind.get(v.kind) ?? 0) + 1);
  }
  const t = q.trim().toUpperCase();
  const list = rows.filter(
    (r) =>
      (!level || VIOLATIONS[r.v.kind].level === level) &&
      (!kind || r.v.kind === kind) &&
      (!roomId || r.room?.id === roomId) &&
      (!t || r.v.address.toUpperCase().includes(t) || r.v.text.toUpperCase().includes(t)),
  );
  const addresses = [...new Set(list.map((r) => r.v.address).filter((a) => m.idx.byAddress.has(a)))];

  return (
    <div className="page control-page">
      <div className="page-head">
        <div>
          <h1>Контроль хранения</h1>
          <p className="muted">
            Проверка среза остатков по правилам размещения · данные{' '}
            {m.inv?.updatedAt ? timeAgo(m.inv.updatedAt) : 'не получены'}
          </p>
        </div>
        <button
          className="btn primary"
          disabled={!addresses.length}
          onClick={() => {
            st().setColorMode('control');
            st().showCells(addresses);
          }}
        >
          <Icon name="cube" size={16} /> Показать на 3D ({addresses.length})
        </button>
      </div>
      <div className="kpis">
        {(['critical', 'warning', 'info'] as Level[]).map((l) => (
          <Kpi
            key={l}
            icon={l === 'info' ? 'clock' : 'alert'}
            label={LEVEL_TITLE[l]}
            value={counts[l]}
            tone={l === 'critical' ? 'bad' : l === 'warning' ? 'warn' : 'info'}
            sub={
              l === 'critical'
                ? 'перегрузы, ЛВЖ, газы, просрочка'
                : l === 'warning'
                  ? 'тип ячейки, места, назначение зоны'
                  : 'нет движения 90+ дней'
            }
            onClick={() => setLevel(level === l ? null : l)}
          />
        ))}
        <Kpi
          icon="grid"
          label="Ячеек с нарушениями"
          value={m.worst.size}
          sub={`из ${m.stats.all.occupied.toLocaleString('ru-RU')} занятых`}
        />
        <Kpi icon="shield" label="Правил проверки" value={RULES.length} sub="нагрузка, ЛВЖ, газы, сроки, типы ячеек" />
      </div>
      <div className="control-grid">
        <section className="card">
          <header className="card-head">
            <div className="chips">
              <button className={`chip ${!kind ? 'active' : ''}`} onClick={() => setKind(null)}>
                Все правила
              </button>
              {[...byKind.entries()]
                .sort((a, b) => LEVEL_ORDER[VIOLATIONS[a[0]].level] - LEVEL_ORDER[VIOLATIONS[b[0]].level])
                .map(([k, n]) => (
                  <button
                    key={k}
                    className={`chip ${kind === k ? 'active' : ''}`}
                    onClick={() => setKind(kind === k ? null : k)}
                  >
                    <i className="dot" style={{ background: LEVEL_COLOR[VIOLATIONS[k].level] }} />
                    {VIOLATIONS[k].title}
                    <span className="chip-n">{n}</span>
                  </button>
                ))}
            </div>
          </header>
          <div className="row wrap">
            <select className="input auto" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Все помещения</option>
              {w.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <div className="gsearch inline">
              <Icon name="search" size={16} />
              <input placeholder="Адрес или текст" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <span className="muted small">Найдено: {list.length}</span>
          </div>
          <div className="table-wrap tall">
            <table className="table">
              <thead>
                <tr>
                  <th>Уровень</th>
                  <th>Нарушение</th>
                  <th>Место</th>
                  <th>Подробности</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 400).map((r, i) => {
                  const lvl = VIOLATIONS[r.v.kind].level;
                  return (
                    <tr
                      key={i}
                      onClick={() =>
                        r.c
                          ? st().openCell(r.v.address)
                          : r.rack && (st().select({ kind: 'rack', id: r.rack.id }), st().setSection('cells'))
                      }
                    >
                      <td>
                        <span className={`lvl ${lvl}`}>
                          <i style={{ background: LEVEL_COLOR[lvl] }} />
                          {LEVEL_TITLE[lvl]}
                        </span>
                      </td>
                      <td>
                        <b>{VIOLATIONS[r.v.kind].title}</b>
                      </td>
                      <td>
                        <b className="mono">{r.v.address}</b>
                        <div className="muted small">
                          {r.room?.name}
                          {r.zone ? ` › ${r.zone.code}` : ''}
                        </div>
                      </td>
                      <td className="small">{r.v.text}</td>
                      <td>
                        {r.c && (
                          <button
                            className="icon-btn small"
                            title="Показать на 3D"
                            onClick={(e) => {
                              e.stopPropagation();
                              st().showCell(r.v.address);
                            }}
                          >
                            <Icon name="cube" size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!list.length && <p className="muted pad">Нарушений не найдено</p>}
          </div>
        </section>
        <aside className="card rules">
          <header className="card-head">
            <h3>Правила контроля</h3>
          </header>
          {RULES.map((r) => (
            <button
              key={r.kind}
              className={`rule ${kind === r.kind ? 'active' : ''}`}
              onClick={() => setKind(kind === r.kind ? null : r.kind)}
            >
              <i style={{ background: LEVEL_COLOR[VIOLATIONS[r.kind].level] }} />
              <span className="grow">
                <b>{VIOLATIONS[r.kind].title}</b>
                <span>{r.text}</span>
              </span>
              <b className={byKind.get(r.kind) ? 'rule-n' : 'rule-n zero'}>{byKind.get(r.kind) ?? 0}</b>
            </button>
          ))}
          <p className="hint">
            Правила проверяются по каждому новому срезу из учётной системы. Свойства ячеек (тип, места, нагрузка,
            блокировка) задаются в конструкторе, свойства ТМЦ (ЛВЖ, класс газа, сроки) — приходят из каталога.
          </p>
        </aside>
      </div>
    </div>
  );
}
