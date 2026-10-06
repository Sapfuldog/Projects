import type { Equipment, EquipmentType } from '../types';
import { uid } from './id';

export type PaletteGroup = 'building' | 'equipment' | 'other';

export interface EquipmentSpec {
  title: string;
  group: PaletteGroup;
  length: number;
  width: number;
  height: number;
  color: string;
  hint: string;
}

/** Каталог объектов конструктора с размерами по умолчанию (м). */
export const EQUIPMENT: Record<EquipmentType, EquipmentSpec> = {
  wall: {
    title: 'Стена',
    group: 'building',
    length: 6,
    width: 0.25,
    height: 8,
    color: '#9aa4b2',
    hint: 'Капитальная стена',
  },
  partition: {
    title: 'Перегородка',
    group: 'building',
    length: 4,
    width: 0.1,
    height: 3,
    color: '#cbd5e1',
    hint: 'Лёгкая перегородка',
  },
  door: {
    title: 'Дверь',
    group: 'building',
    length: 1,
    width: 0.15,
    height: 2.1,
    color: '#64748b',
    hint: 'Проход для людей',
  },
  gate: {
    title: 'Ворота',
    group: 'building',
    length: 3.5,
    width: 0.3,
    height: 4,
    color: '#94a3b8',
    hint: 'Секционные ворота',
  },
  column: {
    title: 'Колонна',
    group: 'building',
    length: 0.5,
    width: 0.5,
    height: 10,
    color: '#9aa4b2',
    hint: 'Колонна каркаса',
  },
  dock: {
    title: 'Погрузочная рампа',
    group: 'equipment',
    length: 3.5,
    width: 3,
    height: 1.2,
    color: '#475569',
    hint: 'Док с уравнительной платформой',
  },
  conveyor: {
    title: 'Конвейер',
    group: 'equipment',
    length: 8,
    width: 0.8,
    height: 0.9,
    color: '#64748b',
    hint: 'Роликовый конвейер',
  },
  forklift: {
    title: 'Погрузчик',
    group: 'equipment',
    length: 2.4,
    width: 1.2,
    height: 2.2,
    color: '#f59e0b',
    hint: 'Вилочный погрузчик',
  },
  truck: {
    title: 'Грузовик',
    group: 'equipment',
    length: 13,
    width: 2.5,
    height: 4,
    color: '#e2e8f0',
    hint: 'Фура у рампы',
  },
  workzone: {
    title: 'Рабочая зона',
    group: 'other',
    length: 4,
    width: 3,
    height: 0.9,
    color: '#22c55e',
    hint: 'Столы упаковки / комплектации',
  },
  office: {
    title: 'Офис',
    group: 'other',
    length: 6,
    width: 4,
    height: 3,
    color: '#38bdf8',
    hint: 'Офис / диспетчерская',
  },
  toilet: {
    title: 'Санузел',
    group: 'other',
    length: 3,
    width: 2.5,
    height: 3,
    color: '#a78bfa',
    hint: 'Бытовое помещение',
  },
  counter: {
    title: 'Окно выдачи',
    group: 'other',
    length: 2.4,
    width: 0.8,
    height: 1.1,
    color: '#0ea5e9',
    hint: 'Стойка выдачи ТМЦ кладовым производства',
  },
  worker: {
    title: 'Сотрудник',
    group: 'other',
    length: 0.5,
    width: 0.35,
    height: 1.75,
    color: '#f97316',
    hint: 'Кладовщик, водитель погрузчика',
  },
  tree: {
    title: 'Дерево',
    group: 'other',
    length: 3,
    width: 3,
    height: 6,
    color: '#3f9b4f',
    hint: 'Озеленение территории',
  },
};

export function newEquipment(type: EquipmentType, x: number, y: number, rotation = 0, index = 1): Equipment {
  const s = EQUIPMENT[type];
  return {
    id: uid('e'),
    type,
    name: `${s.title} ${index}`,
    x,
    y,
    rotation,
    length: s.length,
    width: s.width,
    height: s.height,
    color: s.color,
    active: type === 'dock' || type === 'forklift' || type === 'counter' ? true : undefined,
  };
}
