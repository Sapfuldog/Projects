let counter = 0;

/** Короткий уникальный идентификатор. */
export const uid = (prefix = '') =>
  `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
