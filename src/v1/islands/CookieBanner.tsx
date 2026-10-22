import { useEffect, useRef, useState } from 'preact/hooks';

const STORAGE_KEY = 'ak-cookie-consent';

/**
 * Согласие на cookie – перенос острова EV SIBIR (src/components/islands/CookieBanner.tsx): 152-ФЗ ст. 9, Метрика
 * с Вебвизором ставит аналитические cookie. Окно крупное (на телефоне – половина экрана снизу, на компьютере – по
 * центру), «Отказаться» – маленькой ссылкой: согласие добровольное. 'accepted' включает Метрику (layouts/V1.astro,
 * window.akInitMetrika), 'declined' – нет. Окно есть только там, где стоит счётчик (боевой домен).
 */
export default function CookieBanner({ policyHref }: { policyHref: string }) {
  const [visible, setVisible] = useState(false);
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage недоступен (приватный режим) – окно не показываем, счётчик не грузится
    }
  }, []);

  useEffect(() => {
    if (visible) acceptRef.current?.focus();
  }, [visible]);

  const decide = (value: 'accepted' | 'declined') => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* без хранилища – решение до конца визита */
    }
    if (value === 'accepted') (window as unknown as { akInitMetrika?: () => void }).akInitMetrika?.();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div class="cookie-backdrop">
      <div class="cookie-banner" role="dialog" aria-modal="true" aria-labelledby="cookie-title">
        <p class="cookie-banner__title" id="cookie-title">Мы используем cookie</p>
        <p class="cookie-banner__text">
          Cookie и Яндекс Метрика помогают понять, какие вещи и страницы интересны, и делать магазин удобнее. Подробнее – в{' '}
          <a href={policyHref} target="_blank" rel="noopener">политике конфиденциальности</a>.
        </p>
        <button ref={acceptRef} class="btn btn--solid cookie-banner__accept" type="button" onClick={() => decide('accepted')}>
          Принимаю
        </button>
        <button class="cookie-banner__decline" type="button" onClick={() => decide('declined')}>
          Отказаться
        </button>
      </div>
    </div>
  );
}
