// Тестовый «WMS» для проверки подключения по REST.
//   npm run mock-wms            → http://localhost:8787
// 1) В приложении: Настройки → Подключение → REST API,
//    «URL для отправки структуры» = http://localhost:8787/api/locations → «Отправить структуру».
// 2) URL = http://localhost:8787/api/stock, путь к массиву = items → «Загрузить сейчас» или автообновление.
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 8787);
let locations = [];
const skus = ['TV-55U', 'MON-27Q', 'NB-PRO15', 'SP-X12', 'CB-USBC', 'MS-W2', 'KB-MX', 'A4-500x5'];

function stock() {
  return locations
    .filter((l) => !l.blocked && Math.random() < 0.6)
    .map((l) => {
      const fill = Math.round((0.2 + Math.random() * 0.8) * 100) / 100;
      return {
        address: l.address,
        fill,
        weight: Math.round((l.maxLoad || 500) * fill * (0.3 + Math.random() * 0.6)),
        sku: skus[Math.floor(Math.random() * skus.length)],
        qty: Math.round(fill * 40),
      };
    });
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
        console.log(`Получена структура «${body.warehouse?.name}»: ${locations.length} ячеек`);
        send(res, 200, { ok: true, received: locations.length });
      } catch (e) {
        send(res, 400, { error: String(e) });
      }
    });
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/stock')) return send(res, 200, { items: stock(), generatedAt: new Date().toISOString() });
  send(res, 404, { error: 'not found', routes: ['POST /api/locations', 'GET /api/stock'] });
}).listen(PORT, () => console.log(`Тестовый WMS: http://localhost:${PORT}  (POST /api/locations, GET /api/stock)`));
