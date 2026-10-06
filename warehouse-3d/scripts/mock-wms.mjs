// Тестовая «учётная система» (1С/WMS) для проверки обмена по REST.
//   npm run mock-wms            → http://localhost:8787
// 1) В приложении: Настройки → Учётная система → REST API.
//    «Выгрузить структуру» = http://localhost:8787/api/locations → «Отправить структуру».
// 2) Адрес API = http://localhost:8787/api/stock, путь к массиву = items → «Получить срез сейчас».
// Срез: строка = ТМЦ (партия) в ячейке; пустая тара — строка без артикула.
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 8787);
let locations = [];

const ITEMS = {
  pallet: [
    { sku: 'ФЛ-АН348', name: 'Флюс АН-348А', group: 'Сварочные материалы', unit: 'кг', per: 1000, kg: 1 },
    {
      sku: 'АРМ-ЗД-100',
      name: 'Задвижка клиновая Ду100 Ру16',
      group: 'Трубопроводная арматура',
      unit: 'шт',
      per: 12,
      kg: 45,
    },
  ],
  box: [
    { sku: 'ЭЛ-УОНИ-4', name: 'Электроды УОНИ-13/55 ø4 мм', group: 'Сварочные материалы', unit: 'кг', per: 120, kg: 1 },
    { sku: 'МТ-Б-М12×60', name: 'Болт М12×60 кл. 8.8 оцинк.', group: 'Метизы и крепёж', unit: 'кг', per: 100, kg: 1 },
  ],
  shelf: [{ sku: 'ИН-УШМ-125', name: 'Шлифмашина угловая 125 мм', group: 'Инструмент', unit: 'шт', per: 6, kg: 2.4 }],
  cantilever: [
    { sku: 'ТР-57×4', name: 'Труба 57×4, сталь 20', group: 'Металлопрокат', unit: 'т', per: 2, kg: 1000, heat: true },
  ],
  floor: [
    {
      sku: 'ЛС-A-10',
      name: 'Лист судовой 10 мм, кат. A, 1500×6000',
      group: 'Металлопрокат',
      unit: 'т',
      per: 12,
      kg: 1000,
      heat: true,
    },
  ],
  cylinder: [
    {
      sku: 'ГАЗ-О2-40',
      name: 'Кислород технический, баллон 40 л',
      group: 'Технические газы',
      unit: 'бал.',
      per: 8,
      kg: 75,
      tare: 'Б40-О₂',
    },
  ],
};

const rnd = (n) => Math.floor(Math.random() * n);
const day = 86400000;

function stock() {
  const rows = [];
  for (const l of locations) {
    if (l.blocked || Math.random() > 0.6) continue;
    const list = ITEMS[l.type] ?? ITEMS.box;
    const it = list[rnd(list.length)];
    const qty = Math.max(
      1,
      Math.round(it.per * (0.3 + Math.random() * 0.7) * (it.unit === 'т' ? 1000 : 1)) / (it.unit === 'т' ? 1000 : 1),
    );
    rows.push({
      address: l.address,
      sku: it.sku,
      name: it.name,
      group: it.group,
      unit: it.unit,
      qty,
      batch: `П-${10000 + rnd(89999)}`,
      heat: it.heat ? `2Т-${10000 + rnd(89999)}` : '',
      weight: Math.round(qty * it.kg),
      tare: it.tare ?? '',
      tareCount: it.tare ? qty : '',
      lastMove: new Date(Date.now() - rnd(120) * day).toISOString(),
    });
    // Пустые баллоны рядом с полными
    if (l.type === 'cylinder' && Math.random() < 0.5)
      rows.push({ address: l.address, tare: 'Б40-О₂', tareCount: 1 + rnd(2) });
  }
  return rows;
}

const send = (res, code, body) => {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'POST' && req.url.startsWith('/api/locations')) {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        const body = JSON.parse(data);
        locations = body.cells ?? [];
        console.log(`Получена структура «${body.warehouse?.name}»: ${locations.length} мест хранения`);
        send(res, 200, { ok: true, received: locations.length });
      } catch (e) {
        send(res, 400, { error: String(e) });
      }
    });
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/stock'))
    return send(res, 200, { items: stock(), generatedAt: new Date().toISOString() });
  send(res, 404, { error: 'not found', routes: ['POST /api/locations', 'GET /api/stock'] });
}).listen(PORT, () =>
  console.log(`Тестовая учётная система: http://localhost:${PORT}  (POST /api/locations, GET /api/stock)`),
);
