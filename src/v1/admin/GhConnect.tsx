import { useState } from 'preact/hooks';
import { REPO, checkAccess, getToken, setToken } from './gh';

// Подключение сохранения: владелец вставляет ключ GitHub (fine-grained token на один репозиторий,
// права Contents: Read and write + Actions: Read). Ключ хранится только в этом браузере.
export default function GhConnect({ onClose, onConnected }: { onClose: () => void; onConnected: (ok: boolean) => void }) {
  const [t, setT] = useState(getToken());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true); setErr('');
    setToken(t.trim());
    try {
      await checkAccess();
      onConnected(true);
    } catch (e: any) {
      setToken('');
      setErr(e.message.includes('401') ? 'Ключ не подошёл или истёк срок' : e.message);
    }
    setBusy(false);
  };

  return (
    <div class="ed" role="dialog" aria-modal="true" aria-label="Подключить сохранение">
      <div class="ed__bg" onClick={onClose} />
      <form class="ed__panel ed__panel--narrow" onSubmit={submit}>
        <header class="ed__head"><div><p class="muted" style="margin:0;font-size:12px">Админка → сохранение</p><h2>Подключить сохранение</h2></div><button type="button" class="btn" onClick={onClose}>Закрыть</button></header>
        <div class="ed__body">
          <ol class="steps">
            <li><b>Создайте ключ GitHub</b>
              <p style="margin:0">Откройте <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → Settings → Fine-grained tokens</a>, выберите репозиторий <code>{REPO}</code> и дайте права <b>Contents: Read and write</b> и <b>Actions: Read</b>. Срок – на ваше усмотрение.</p>
            </li>
            <li><b>Вставьте ключ</b>
              <label class="f"><span>Ключ (начинается с github_pat_)</span><input type="password" value={t} onInput={(e) => setT((e.target as HTMLInputElement).value)} autoComplete="off" /></label>
              {err && <p class="form-err" style="color:#b0333f;margin:6px 0 0">{err}</p>}
              <p class="muted" style="margin:8px 0 0;font-size:12.5px">Ключ хранится только в этом браузере. Сохранённые товары и каталоги попадают в репозиторий, и сайт пересобирается сам за 1–2 минуты.</p>
            </li>
          </ol>
        </div>
        <footer class="ed__foot">
          {getToken() ? <button type="button" class="btn ghost" style="color:#b0333f" onClick={() => { setToken(''); onConnected(false); }}>Отключить</button> : <span />}
          <button class="btn primary" type="submit" disabled={busy || !t.trim()}>{busy ? 'Проверяем…' : 'Подключить'}</button>
        </footer>
      </form>
    </div>
  );
}
