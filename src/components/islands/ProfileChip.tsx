import { useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { t, L } from '~/i18n';
import { accent, SECTION_IDS, type Lang, type Profile } from '~/lib/model';
import { displayName, initial, dirFor } from '~/lib/name';
import { $profile, $sheet, hydrate, saveProfile, saveFavorites } from '~/lib/store';
import { usePopover } from '~/lib/popover';
import { useMounted } from '~/lib/useMounted';
import { getApi } from '~/lib/api';

interface Props {
  lang: Lang;
  issue: number;
}

/** Sample students for the `?demo=1` panel; names, colleges and reading history are invented.
 *  `read` lights those issues on the archive wall; `started` leaves one half-done. */
export const PERSONAS: { profile: Profile; pins: ('news' | 'guest' | 'experience' | 'contributions' | 'last')[]; units: string[]; read: number[]; started: number[] }[] = [
  { profile: { name: 'عبدالله', color: 'orange', address: 'm' }, pins: ['guest', 'contributions'], units: ['srt', 'sac'], read: [17, 18, 19, 20], started: [16] },
  { profile: { name: 'ريم', color: 'aqua', address: 'f' }, pins: ['experience', 'news'], units: ['dsa', 'fawzan'], read: [20], started: [19] },
  { profile: { name: 'Fahad', color: 'navy', address: 'm' }, pins: ['contributions'], units: ['sports'], read: [], started: [20] },
];

export function Avatar({ profile, size = 40 }: { profile: Profile | null; size?: number }) {
  const c = profile ? accent(profile.color) : null;
  const style = c ? { background: c.color, color: c.ink === 'ink' ? 'var(--ink)' : 'var(--beige)', inlineSize: size, blockSize: size } : { inlineSize: size, blockSize: size };
  if (profile?.avatar) return <img class="av" src={profile.avatar} alt="" width={size} height={size} style={{ inlineSize: size, blockSize: size }} />;
  return (
    <span class="av" style={style} aria-hidden="true">
      {profile ? (
        initial(profile.name)
      ) : (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
          <path d="M8.5 3h7l5 5v7l-5 5h-7l-5-5V8z" />
          <circle cx="12" cy="10" r="2.6" />
          <path d="M7.5 17.5c1.1-2.2 2.7-3.3 4.5-3.3s3.4 1.1 4.5 3.3" />
        </svg>
      )}
    </span>
  );
}

export default function ProfileChip({ lang, issue }: Props) {
  const profileStore = useStore($profile);
  const mounted = useMounted();
  const profile = mounted ? profileStore : null;
  const pop = usePopover();
  useEffect(() => void hydrate(issue), [issue]);
  const demo = typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1';
  const name = profile ? displayName(profile.name) : t(lang, 'profile.anon');

  return (
    <div class="pop-wrap" ref={pop.wrap}>
      <button type="button" class="me-chip" ref={pop.trigger} aria-haspopup="dialog" aria-expanded={pop.open} aria-label={t(lang, 'profile.open')} onClick={pop.toggle}>
        <Avatar profile={profile} />
        <span class="nm" dir={profile ? dirFor(profile.name) : undefined}>{name}</span>
      </button>
      <div class={pop.panelClass + ' pop-end'} ref={pop.panel} data-open={pop.open} role="dialog" aria-label={t(lang, 'profile.open')}>
        {profile && (
          <div class="pop-head">
            <p class="pop-title" dir={dirFor(profile.name)}>{profile.name}</p>
          </div>
        )}
        <ul class="menu">
          <li>
            <button type="button" class="menu-item" onClick={() => { pop.close(); $sheet.set('onboarding'); }}>
              {profile ? t(lang, 'profile.edit') : t(lang, 'profile.anon')}
            </button>
          </li>
          <li>
            <a class="menu-item" href={`/${lang}/my/`}>{t(lang, 'nav.my')}</a>
          </li>
          {demo && (
            <li>
              <p class="pop-sub" style={{ padding: '8px 12px 2px' }}>{t(lang, 'demo.title')}</p>
              <ul class="menu">
                {PERSONAS.map((p) => (
                  <li key={p.profile.name}>
                    <button
                      type="button"
                      class="menu-item"
                      aria-pressed={profile?.name === p.profile.name}
                      onClick={async () => {
                        await saveProfile(p.profile);
                        await saveFavorites({ sections: p.pins, units: p.units });
                        const api = getApi();
                        for (const n of p.read) await api.markProgress(n, { sectionsRead: [...SECTION_IDS], voted: true, huntAttempted: true });
                        for (const n of p.started) await api.markProgress(n, { sectionsRead: [SECTION_IDS[0]] });
                        pop.close(true);
                      }}
                    >
                      <Avatar profile={p.profile} size={28} />
                      <span dir={dirFor(p.profile.name)}>{p.profile.name}</span>
                      <span class="pop-sub">{L(accent(p.profile.color).name, lang)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
