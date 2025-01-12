import o from 'ospec';
import * as cp from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';
import { FileHandle } from 'fs/promises';
import { TarFileHeader, TarReader } from '../tar';
import { TarIndex } from '../tar.index';
import { MemorySource } from './cotar.test';
import { Cotar } from '../cotar';

o.spec('TarReader', () => {
  // Create a Tar file of the built source
  o.before(() => {
    cp.execSync(`tar cf ${tarFilePath} tar.test.*`, { cwd: __dirname });
  });
  const tarFilePath = path.join(__dirname, 'test.tar');

  let fd: FileHandle | null;
  const headBuffer = Buffer.alloc(512);
  async function readBytes(offset: number, count: number): Promise<Buffer | null> {
    if (fd == null) throw new Error('File is closed');
    const res = await fd.read(headBuffer, 0, count, offset);
    if (res.bytesRead < count) return null;
    return headBuffer;
  }
  o.beforeEach(async () => {
    fd = await fs.open(tarFilePath, 'r');
  });
  o.afterEach(() => fd?.close());

  o('should iterate files', async () => {
    const files: TarFileHeader[] = [];
    for await (const file of TarReader.iterate(readBytes)) files.push(file);
    o(files.map((c) => c.header.path)).deepEquals(['tar.test.d.ts', 'tar.test.d.ts.map', 'tar.test.js']);
  });

  o('should index files', async () => {
    const index: TarIndex = [];
    for await (const ctx of TarReader.iterate(readBytes)) index.push([ctx.header.path, ctx.offset, ctx.header.size]);

    const source = new MemorySource('Tar', await fs.readFile(tarFilePath));

    const tar = new Cotar(source, index);

    tar.init();
    const buf = await tar.get('tar.test.js');
    o(buf).notEquals(null);
    const text = Buffer.from(buf!).toString();
    o(text.slice(0, 12)).deepEquals('"use strict"');
  });
});
