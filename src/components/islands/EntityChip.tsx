import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { L, t } from '~/i18n';
import { $favorites, ensureFavorites, saveFavorites } from '~/lib/store';
import Star from './Star';
import type { Lang } from '~/lib/model';
import { resolveHref, type EntityAction, type EntityKind } from '~/lib/entities';
import type { IcsEvent } from '~/lib/ics';
import { buildIcs, icsFileName } from '~/lib/ics';
import { googleUrl, outlookUrl } from '~/lib/calendarLinks';
import { usePopover } from '~/lib/popover';

interface Props {
  lang: Lang;
  kind: EntityKind;
  id: string;
  name: string;
  sub?: string;
  actions: EntityAction[];
  event?: IcsEvent;
  /** Visual variant: inline text chip (default) or a small button. */
  variant?: 'inline' | 'button';
}

const ICONS: Record<string, string> = {
  email: 'M3 6h18v12H3zM3 7l9 6 9-6',
  relay: 'M4 5h16v11H9l-5 4z',
  calendar: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  remind: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  register: 'M5 12l5 5L20 7',
  open: 'M7 17L17 7M9 7h8v8',
  google: 'M4 5h16v15H4zM4 10h16',
  outlook: 'M4 5h16v15H4zM8 14h3v3H8z',
};
const Icon = ({ k }: { k: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
    <path d={ICONS[k] ?? ICONS.open} />
  </svg>
);

function download(ev: IcsEvent, lang: Lang) {
  // A data URL: tiny, needs no revocation, and never cancels mid-save.
  const url = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(buildIcs([ev], lang));
  const a = Object.assign(document.createElement('a'), { href: url, download: icsFileName(ev) });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** A name in an article that opens a small dialog of real actions. */
export default function EntityChip({ lang, kind, id, name, sub, actions, event, variant = 'inline' }: Props) {
  const pop = usePopover();
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const favs = useStore($favorites);
  const following = kind === 'unit' && favs.units.includes(id);
  useEffect(() => {
    if (kind === 'unit') void ensureFavorites();
  }, [kind]);
  const follow = () => saveFavorites({ ...favs, units: following ? favs.units.filter((u) => u !== id) : [...favs.units, id] });
  const titleId = `chip-${kind}-${id}`;
  const flip = (k: string) => setToggles((s) => ({ ...s, [k]: !s[k] }));

  return (
    <span class="pop-wrap chip-wrap" ref={pop.wrap as never}>
      <button
        type="button"
        class={variant === 'button' ? 'btn sm' : 'chip'}
        ref={pop.trigger}
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        onClick={pop.toggle}
      >
        {name}
      </button>
      <div class={pop.panelClass} ref={pop.panel} data-open={pop.open} role="dialog" aria-labelledby={titleId} aria-modal="false">
        <div class="pop-head">
          <p class="pop-title" id={titleId}>{name}</p>
          {sub && <p class="pop-sub">{sub}</p>}
        </div>
        <ul class="menu">
          {kind === 'unit' && (
            <li>
              <button type="button" class="menu-item follow" aria-pressed={following} onClick={follow}>
                <Star on={following} />
                {following ? t(lang, 'foryou.following') : t(lang, 'foryou.follow')}
              </button>
            </li>
          )}
          {actions.map((a) => {
            const label = L(a.label, lang);
            if (a.id === 'calendar' && event) {
              return (
                <>
                  <li key="ics">
                    <button type="button" class="menu-item" onClick={() => { download(event, lang); setTimeout(() => pop.close(true), 60); }}>
                      <Icon k="calendar" />{t(lang, 'cal.apple')}
                    </button>
                  </li>
                  <li key="g">
                    <a class="menu-item" href={googleUrl(event, lang)} target="_blank" rel="noopener" onClick={() => pop.close()}>
                      <Icon k="google" />{t(lang, 'cal.google')}
                    </a>
                  </li>
                  <li key="o">
                    <a class="menu-item" href={outlookUrl(event, lang)} target="_blank" rel="noopener" onClick={() => pop.close()}>
                      <Icon k="outlook" />{t(lang, 'cal.outlook')}
                    </a>
                  </li>
                </>
              );
            }
            if (a.href) {
              const href = resolveHref(a.href, lang);
              const external = /^(https?:|mailto:)/.test(href);
              return (
                <li key={a.id}>
                  <a class="menu-item" href={href} target={external && !href.startsWith('mailto:') ? '_blank' : undefined} rel={external ? 'noopener' : undefined} onClick={() => pop.close()}>
                    <Icon k={a.id} />{label}
                  </a>
                </li>
              );
            }
            if (a.id === 'relay') {
              return (
                <li key={a.id}>
                  <a class="menu-item" href={`mailto:dsa-mag@kfupm.edu.sa?subject=${encodeURIComponent(lang === 'ar' ? `رسالة إلى ${name}` : `Message for ${name}`)}`} onClick={() => pop.close()}>
                    <Icon k="relay" />{label}
                  </a>
                </li>
              );
            }
            const on = !!toggles[a.id];
            const doneLabel = a.id === 'remind' ? t(lang, 'month.reminded') : a.id === 'register' ? t(lang, 'opp.registered') : label;
            return (
              <li key={a.id}>
                <button type="button" class="menu-item" aria-pressed={on} onClick={() => flip(a.id)}>
                  <Icon k={a.id} />{on ? doneLabel : label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </span>
  );
}
