// Общие данные на сервере компании (server/server.mjs): структура складов, подключение к учётной системе,
// справочники тары и кладовых — одни для всех сотрудников. Срезы остатков, справочник ТМЦ из учётной системы
// и настройки вида у каждого пользователя свои (в браузере). Без сервера приложение работает как раньше.
import { create } from 'zustand';

export const SHARED_KEYS = ['warehouses', 'tareTypes', 'consumers'] as const;
export type SharedModel = Record<(typeof SHARED_KEYS)[number], unknown>;

export type ServerState = 'local' | 'saved' | 'saving' | 'offline' | 'password';

export interface ServerStatus {
  mode: 'local' | 'server';
  state: ServerState;
  /** Версия общей модели на сервере */
  version: number;
  savedAt?: string;
  /** Изменения на сервере закрыты паролем редактора */
  protected: boolean;
  /** Этот пользователь может сохранять изменения */
  canEdit: boolean;
}

export const useServer = create<ServerStatus>(() => ({
  mode: 'local',
  state: 'local',
  version: 0,
  protected: false,
  canEdit: true,
}));

interface Remote {
  version: number;
  savedAt?: string | null;
  protected?: boolean;
  model: SharedModel | null;
}

interface SyncHooks {
  /** Текущая общая модель из хранилища приложения */
  read: () => SharedModel;
  /** Применить модель, пришедшую с сервера */
  apply: (m: SharedModel) => void;
  /** Подписка на изменения общей модели */
  subscribe: (fn: () => void) => void;
  notify: (text: string, kind?: 'info' | 'error') => void;
}

const API = 'api/model';
const PASSWORD_KEY = 'sklad-3d-edit-password';
const SAVE_DELAY = 1200;
const POLL_EVERY = 10000;

let hooks: SyncHooks | undefined;
let known = 0;
let lastSynced = '';
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saving = false;
/** Пароль, если браузер не даёт сохранить его в localStorage */
let memPassword = '';

const pick = (s: Partial<Record<string, unknown>>): SharedModel => ({
  warehouses: s.warehouses,
  tareTypes: s.tareTypes,
  consumers: s.consumers,
});

const isRemote = (j: unknown): j is Remote =>
  !!j && typeof (j as Remote).version === 'number' && 'model' in (j as object);

async function getJson(url: string, timeout = 4000, headers?: Record<string, string>): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctl.signal, headers });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

export function getEditPassword(): string {
  try {
    return localStorage.getItem(PASSWORD_KEY) ?? memPassword;
  } catch {
    return memPassword;
  }
}

const authHeaders = (): Record<string, string> => {
  const p = getEditPassword();
  return p ? { 'X-Edit-Password': encodeURIComponent(p) } : {};
};

/**
 * Сохранённое в браузере состояние с общей моделью сервера поверх (сервер главнее).
 * Сохранение старой версии сбрасывается до темы и пользователя, как при обычной миграции.
 */
export function mergeRemote(local: string | null, remote: Remote, version: number): string | null {
  if (!remote.model) return local;
  let parsed: { state: Record<string, unknown>; version?: number };
  try {
    parsed = local ? JSON.parse(local) : { state: {} };
  } catch {
    parsed = { state: {} };
  }
  if (!parsed.state || (parsed.version ?? 0) < version)
    parsed.state = { theme: parsed.state?.theme, user: parsed.state?.user };
  for (const k of SHARED_KEYS) if (remote.model[k] !== undefined) parsed.state[k] = remote.model[k];
  return JSON.stringify({ ...parsed, version });
}

/** Чтение состояния при запуске; если приложение открыто с сервера компании — с общей моделью. */
export async function loadWithServer(local: Promise<string | null>, version: number): Promise<string | null> {
  const remote = await getJson(API, 2500);
  // Открыто без сервера (файлом, артефактом, в режиме разработки) — только сохранённое в браузере, без спешки:
  // иначе медленный IndexedDB приняли бы за пустой и записали демо поверх данных
  if (!isRemote(remote)) return local;
  // С сервера модель складов придёт в любом случае; из браузера — срезы и настройки вида, если успели прочитаться
  const l = await withTimeout(local, 2500, null);
  known = remote.version;
  lastSynced = remote.model ? JSON.stringify(pick(remote.model)) : '';
  useServer.setState({
    mode: 'server',
    state: 'saved',
    version: remote.version,
    savedAt: remote.savedAt ?? undefined,
    protected: !!remote.protected,
    canEdit: !remote.protected,
  });
  if (remote.protected) void checkAccess();
  return mergeRemote(l, remote, version);
}

/** Запустить обмен с сервером после загрузки состояния. */
export function startSync(h: SyncHooks) {
  if (useServer.getState().mode !== 'server' || hooks) return;
  hooks = h;
  h.subscribe(schedule);
  schedule(); // пустой сервер получит модель из этого браузера
  setInterval(poll, POLL_EVERY);
  window.addEventListener('focus', () => void poll());
}

function schedule() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save(), SAVE_DELAY);
}

/** Сохранить изменения на сервер сейчас (например, после ввода пароля). */
export function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  void save();
}

async function save() {
  saveTimer = undefined;
  if (!hooks || saving) return;
  const model = hooks.read();
  const json = JSON.stringify(model);
  if (json === lastSynced) return;
  const prev = useServer.getState().state;
  saving = true;
  useServer.setState({ state: 'saving' });
  try {
    const r = await fetch(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ baseVersion: known, model }),
    });
    if (r.ok) {
      const j = (await r.json()) as { version: number; savedAt?: string };
      known = j.version;
      lastSynced = json;
      useServer.setState({ state: 'saved', version: j.version, savedAt: j.savedAt, canEdit: true });
    } else if (r.status === 409) {
      if (!(await pull())) throw new Error('нет связи');
      hooks.notify(
        'Склады изменили на другом рабочем месте. Загружена актуальная версия — повторите последние изменения.',
        'error',
      );
    } else if (r.status === 401 || r.status === 403) {
      // Без пароля — только просмотр: вернуть версию с сервера, чтобы не расходиться с остальными
      await pull();
      useServer.setState({ state: 'password', protected: true, canEdit: false });
      hooks.notify(
        'Изменения не сохранены: нужен пароль редактора (Настройки → Объекты). Показана версия с сервера.',
        'error',
      );
    } else throw new Error(`HTTP ${r.status}`);
  } catch {
    useServer.setState({ state: 'offline' });
    if (prev !== 'offline') hooks.notify('Нет связи с сервером: изменения сохранятся, когда связь появится', 'error');
    saveTimer = setTimeout(() => void save(), POLL_EVERY);
  } finally {
    saving = false;
  }
  // Пока шла запись, могли появиться новые изменения
  if (useServer.getState().state === 'saved' && JSON.stringify(hooks.read()) !== lastSynced) schedule();
}

/** Загрузить модель с сервера и применить её. */
async function pull(): Promise<boolean> {
  const remote = await getJson(API, 15000);
  if (!hooks || !isRemote(remote) || !remote.model) return false;
  known = remote.version;
  lastSynced = JSON.stringify(pick(remote.model));
  hooks.apply(remote.model);
  useServer.setState({
    state: 'saved',
    version: remote.version,
    savedAt: remote.savedAt ?? undefined,
    protected: !!remote.protected,
  });
  return true;
}

/** Проверка, не изменили ли модель другие; несохранённые свои изменения не затираются. */
async function poll() {
  if (!hooks || saving || saveTimer) return;
  const v = await getJson(`${API}/version`);
  if (!v || typeof (v as Remote).version !== 'number') {
    if (useServer.getState().state !== 'offline') useServer.setState({ state: 'offline' });
    return;
  }
  if (useServer.getState().state === 'offline') useServer.setState({ state: 'saved' });
  if ((v as Remote).version !== known && !saving && !saveTimer) await pull();
}

/** Проверить пароль редактора на сервере. */
export async function checkAccess(): Promise<boolean> {
  const j = (await getJson(`${API}/access`, 4000, authHeaders())) as { canEdit?: boolean } | null;
  const ok = !!j?.canEdit;
  useServer.setState((s) => ({ canEdit: ok, state: ok && s.state === 'password' ? 'saved' : s.state }));
  return ok;
}

/** Запомнить пароль редактора в этом браузере, проверить его и отправить несохранённые изменения. */
export async function setEditPassword(p: string): Promise<boolean> {
  memPassword = p;
  try {
    if (p) localStorage.setItem(PASSWORD_KEY, p);
    else localStorage.removeItem(PASSWORD_KEY);
  } catch {
    /* браузер не даёт сохранить — пароль действует до перезагрузки */
  }
  const ok = await checkAccess();
  if (ok) saveNow();
  return ok;
}
