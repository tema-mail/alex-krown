// Сохранение админки магазина «Вариант 1» в репозиторий GitHub (образец – админка Elite Rose):
// данные каталога лежат в src/data/v1/*.json,
// после коммита GitHub Actions пересобирает сайт (~1 минута). Ключ доступа хранится только в браузере владельца.
export const REPO = 'tema-mail/alex-krown';
export const BRANCH = 'main';
export const PRODUCTS_PATH = 'src/data/v1/products.json';
export const SECTIONS_PATH = 'src/data/v1/sections.json';
/* фото товаров: WebP 960 и 480 px, как у перенесённых (scripts/v1-data.mjs) – сжимаются прямо в браузере */
export const IMG_DIR = 'public/v1/img';
const KEY = 'ak_admin_gh_token';

export const getToken = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setToken = (t: string) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} };

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  // no-store: иначе браузер отдаёт из кэша старый «последний коммит», и следующее сохранение не проходит.
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    cache: 'no-store',
    ...init,
    headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

const b64utf8 = (s: string) => { const bytes = new TextEncoder().encode(s); let bin = ''; bytes.forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin); };
const utf8b64 = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

/** Проверка ключа на деле: читаем репозиторий и пробуем записать пустой объект (на сайт он не попадает).
 *  permissions.push в ответе GitHub – права аккаунта, а не ключа, поэтому одной его проверки мало. */
export async function checkAccess(): Promise<void> {
  await api('');
  try {
    await api('/git/blobs', { method: 'POST', body: JSON.stringify({ content: '', encoding: 'utf-8' }) });
  } catch (e: any) {
    if (String(e.message).includes('403')) throw new Error('У ключа нет права записи: в настройках ключа у Contents выберите «Read and write» (Edit → Permissions → Repositories → Contents) и нажмите Update');
    throw e;
  }
}

/** Понятный текст ошибки GitHub для владельца. */
export function humanError(e: any): string {
  const m = String(e?.message ?? e);
  if (m.includes('401')) return 'Ключ не подошёл или истёк срок – подключите новый';
  if (m.includes('403') && m.includes('not accessible')) return 'У ключа нет права записи: в настройках ключа у Contents выберите «Read and write» и нажмите Update';
  if (m.includes('403')) return 'GitHub отказал в доступе – проверьте права ключа';
  return m;
}

/** Свежий JSON из ветки main (а не из собранного сайта – он отстаёт на время сборки). */
export async function readJson<T>(path: string): Promise<T> {
  const r = await api<{ content: string }>(`/contents/${path}?ref=${BRANCH}&t=${Date.now()}`);
  return JSON.parse(utf8b64(r.content));
}

export interface FileChange { path: string; text?: string; base64?: string }

/** Все изменения – одним коммитом (Git Data API), чтобы сайт пересобирался один раз. */
export async function commit(files: FileChange[], message: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ref = await api<{ object: { sha: string } }>(`/git/ref/heads/${BRANCH}`);
    const head = await api<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);
    const tree = [];
    for (const f of files) {
      const blob = await api<{ sha: string }>('/git/blobs', { method: 'POST', body: JSON.stringify({ content: f.base64 ?? b64utf8(f.text ?? ''), encoding: 'base64' }) });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const t = await api<{ sha: string }>('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
    const c = await api<{ sha: string }>('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: t.sha, parents: [ref.object.sha] }) });
    try {
      await api(`/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
      return c.sha;
    } catch (e) {
      if (attempt === 1) throw e; // ветку успели сдвинуть – пробуем ещё раз поверх свежей
    }
  }
  throw new Error('Не удалось сохранить');
}

/** Статус сборки сайта, запущенной конкретным коммитом (пока её нет – null). */
export async function buildOf(sha: string): Promise<{ status: string; conclusion: string | null; url: string } | null> {
  const r = await api<{ workflow_runs: { status: string; conclusion: string | null; html_url: string; head_sha: string }[] }>(`/actions/runs?branch=${BRANCH}&per_page=10`);
  const run = r.workflow_runs.find((x) => x.head_sha === sha);
  return run ? { status: run.status, conclusion: run.conclusion, url: run.html_url } : null;
}

/** Фото → WebP нужной ширины (canvas) в base64; Safari без WebP-кодировщика – понятная ошибка. */
export async function toWebp(f: File, width: number): Promise<{ base64: string; w: number; h: number }> {
  const bmp = await createImageBitmap(f);
  const w = Math.min(width, bmp.width);
  const h = Math.round((bmp.height * w) / bmp.width);
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  const blob: Blob = await new Promise((ok) => c.toBlob((b) => ok(b!), 'image/webp', 0.8));
  if (blob.type !== 'image/webp') throw new Error('Этот браузер не умеет сохранять WebP – загрузите фото из Chrome');
  const base64 = await new Promise<string>((ok) => {
    const rd = new FileReader();
    rd.onload = () => ok(String(rd.result).split(',')[1]);
    rd.readAsDataURL(blob);
  });
  return { base64, w, h };
}

/** Файл → base64 без префикса data:. */
export const fileToBase64 = (f: File) => new Promise<string>((ok, fail) => {
  const rd = new FileReader();
  rd.onload = () => ok(String(rd.result).split(',')[1]);
  rd.onerror = fail;
  rd.readAsDataURL(f);
});

const MAP: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const slugify = (s: string) => s.toLowerCase().split('').map((c) => MAP[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
