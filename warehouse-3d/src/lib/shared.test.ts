import { describe, expect, it } from 'vitest';
import { mergeRemote } from './shared';

const remote = (model: Record<string, unknown> | null) => ({ version: 7, model: model as never });
const model = { warehouses: [{ id: 'w-srv' }], tareTypes: [{ id: 't-eur' }], consumers: [] };

describe('общая модель с сервера при запуске', () => {
  it('склады, тара и кладовые — с сервера; срезы, выбор и вид — из браузера', () => {
    const local = JSON.stringify({
      state: { warehouses: [{ id: 'w-local' }], inventory: { 'w-local': {} }, currentId: 'w-local', theme: 'light' },
      version: 3,
    });
    const merged = JSON.parse(mergeRemote(local, remote(model), 3)!);
    expect(merged.version).toBe(3);
    expect(merged.state.warehouses).toEqual([{ id: 'w-srv' }]);
    expect(merged.state.tareTypes).toEqual([{ id: 't-eur' }]);
    expect(merged.state.inventory).toEqual({ 'w-local': {} });
    expect(merged.state.theme).toBe('light');
  });

  it('сохранение старой версии в браузере не затирает модель сервера', () => {
    const old = JSON.stringify({
      state: { warehouses: [{ id: 'v2' }], theme: 'dark', user: { name: 'Кладовщик' } },
      version: 2,
    });
    const merged = JSON.parse(mergeRemote(old, remote(model), 3)!);
    expect(merged.version).toBe(3);
    expect(merged.state).toEqual({ theme: 'dark', user: { name: 'Кладовщик' }, ...model });
  });

  it('первый вход: в браузере пусто или повреждено', () => {
    expect(JSON.parse(mergeRemote(null, remote(model), 3)!).state.warehouses).toEqual([{ id: 'w-srv' }]);
    expect(JSON.parse(mergeRemote('{испорчено', remote(model), 3)!).state.consumers).toEqual([]);
  });

  it('на сервере ещё пусто — остаётся то, что в браузере', () => {
    const local = JSON.stringify({ state: { warehouses: [{ id: 'w-local' }] }, version: 3 });
    expect(mergeRemote(local, remote(null), 3)).toBe(local);
  });
});
