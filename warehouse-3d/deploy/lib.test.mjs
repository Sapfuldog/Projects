import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crc32, unzip, zipDir } from './lib.mjs';

const dirs = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sklad-zip-'));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('zip для готового пакета и обновления', () => {
  it('папка с русскими именами туда и обратно, комментарий — коммит', () => {
    const src = tmp();
    fs.mkdirSync(path.join(src, 'deploy', 'windows'), { recursive: true });
    fs.writeFileSync(path.join(src, 'Запустить Склад 3D.cmd'), '@"%~dp0deploy\\windows\\start.cmd" %*\r\n');
    fs.writeFileSync(path.join(src, 'deploy', 'windows', 'start.cmd'), 'x'.repeat(5000));
    fs.writeFileSync(path.join(src, 'пусто.txt'), '');
    const out = tmp();
    const sha = 'a'.repeat(40);
    expect(unzip(zipDir(src, 'sklad-3d-0.1.0', sha), out)).toBe(sha);
    const read = (...p) => fs.readFileSync(path.join(out, 'sklad-3d-0.1.0', ...p), 'utf8');
    expect(read('Запустить Склад 3D.cmd')).toBe('@"%~dp0deploy\\windows\\start.cmd" %*\r\n');
    expect(read('deploy', 'windows', 'start.cmd')).toBe('x'.repeat(5000));
    expect(read('пусто.txt')).toBe('');
  });

  it('архив с путём за пределы папки не распаковывается', () => {
    const src = tmp();
    fs.writeFileSync(path.join(src, 'a.txt'), 'a');
    const buf = zipDir(src, 'pkg');
    // имя «pkg/a.txt» той же длины → «../a.txt» в локальном заголовке и в каталоге
    const evil = Buffer.from(buf.toString('latin1').replaceAll('pkg/a.txt', '../aa.txt'), 'latin1');
    expect(() => unzip(evil, tmp())).toThrow(/недопустимый путь/);
    expect(() => unzip(Buffer.from('не архив'), tmp())).toThrow(/не zip/);
  });

  it('crc32 совпадает с эталоном', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });
});
