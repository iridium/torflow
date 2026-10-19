// Small fetch helpers with retries; everything the pipeline downloads is public.
import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

const UA = 'torflow-pipeline (+https://github.com/unchartedsoftware/torflow)';

export class NotFound extends Error {}

async function request(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      if (res.status === 404) throw new NotFound(`404 ${url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return res;
    } catch (err) {
      if (err instanceof NotFound || i >= tries) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (i - 1)));
    }
  }
}

export async function fetchText(url) {
  return (await request(url)).text();
}

/** Streams `url` to `dest` (atomically), gunzipping when `gunzip` is set. */
export async function download(url, dest, { gunzip = false } = {}) {
  await mkdir(dirname(dest), { recursive: true });
  const res = await request(url);
  const tmp = `${dest}.part`;
  const body = Readable.fromWeb(res.body);
  if (gunzip) await pipeline(body, createGunzip(), createWriteStream(tmp));
  else await pipeline(body, createWriteStream(tmp));
  await rename(tmp, dest);
  return dest;
}

export async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}
