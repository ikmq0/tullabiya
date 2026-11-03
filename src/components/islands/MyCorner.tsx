import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { t, L } from '~/i18n';
import { accent, EMPTY_FAVORITES, SECTIONS, type Lang, type Localized } from '~/lib/model';
import { getApi } from '~/lib/api';
import { $favorites, $profile, $sheet, $stamps, hydrate, resetAll, saveFavorites, togglePinnedSection } from '~/lib/store';
import { STAMP_IDS } from '~/lib/stamps';
import { Avatar } from './ProfileChip';
import { Star } from './Onboarding';
import ArchiveWall from './ArchiveWall';
import MyNotes from './MyNotes';
import MySubmissions from './MySubmissions';
import { useMounted } from '~/lib/useMounted';

interface Props {
  lang: Lang;
  issue: number;
  issues: number[];
  units: { id: string; name: Localized }[];
  stories: Record<string, { title: string; url: string }>;
}

/** The octagon stamp, filled in your color. */
function StampMark({ on, size = 28 }: { on: boolean; size?: number }) {
  return (
    <svg class="stamp-mark" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M8.5 2h7l6.5 6.5v7L15.5 22h-7L2 15.5v-7z" fill={on ? 'var(--me, var(--turq))' : 'none'} stroke="currentColor" stroke-width={on ? 0 : 1.8} stroke-linejoin="round" />
      {on && <path d="M7.5 12.2l3 3 6-6.4" fill="none" stroke="var(--me-ink, var(--ink))" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />}
    </svg>
  );
}

/** Everything the reader owns, on one page: profile, pins, stamps, saved, fingerprints, submissions, data. */
export default function MyCorner({ lang, issue, issues, units, stories }: Props) {
  const profileStore = useStore($profile);
  const favsStore = useStore($favorites);
  const mounted = useMounted();
  const profile = mounted ? profileStore : null;
  const favs = mounted ? favsStore : EMPTY_FAVORITES;
  const stampsStore = useStore($stamps);
  const stamps = mounted ? stampsStore : [];
  const [saved, setSaved] = useState<string[]>([]);
  const [resetDone, setResetDone] = useState(false);
  useEffect(() => {
    hydrate(issue);
    getApi().getSaved().then(setSaved);
  }, [issue]);

  async function exportData() {
    const json = await getApi().exportAll();
    const a = Object.assign(document.createElement('a'), { href: 'data:application/json;charset=utf-8,' + encodeURIComponent(json), download: 'tullabiya-data.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  async function reset() {
    if (!confirm(t(lang, 'my.resetConfirm'))) return;
    await resetAll();
    setSaved([]);
    setResetDone(true);
  }
  const toggleUnit = async (id: string) => {
    const units = favs.units.includes(id) ? favs.units.filter((u) => u !== id) : [...favs.units, id];
    await saveFavorites({ ...favs, units });
  };

  return (
    <div class="my">
      <section class="my-block" aria-labelledby="my-profile">
        <h2 id="my-profile">{t(lang, 'my.profile')}</h2>
        <div class="my-profile">
          <Avatar profile={profile} size={64} />
          <div>
            <p class="my-name">{profile ? profile.name : t(lang, 'profile.anon')}</p>
            {profile && <p class="pop-sub">{t(lang, 'my.color', { color: L(accent(profile.color).name, lang) })}</p>}
          </div>
          <button type="button" class="btn sm" onClick={() => $sheet.set('onboarding')}>{profile ? t(lang, 'profile.edit') : t(lang, 'profile.anon')}</button>
        </div>
      </section>

      <section class="my-block" aria-labelledby="my-pins">
        <h2 id="my-pins">{t(lang, 'my.pins')}</h2>
        <div class="chips" style={{ marginBlockStart: 0 }}>
          {SECTIONS.map((s) => {
            const on = favs.sections.includes(s.id);
            return (
              <button key={s.id} type="button" class="chip pin" aria-pressed={on} onClick={() => void togglePinnedSection(s.id)}>
                <Star on={on} />
                {L(s.name, lang)}
              </button>
            );
          })}
        </div>
      </section>

      <section class="my-block" aria-labelledby="my-stamps-title" id="my-stamps">
        <h2 id="my-stamps-title">{t(lang, 'my.stamps')}</h2>
        <p class="pop-sub">{t(lang, 'my.stampsLead', { k: stamps.length, n: STAMP_IDS.length })}</p>
        <ul class="stamp-grid">
          {STAMP_IDS.map((id) => {
            const on = stamps.some((s) => s.id === id);
            return (
              <li key={id} class="stamp" data-id={id} data-on={on ? 'true' : 'false'}>
                <StampMark on={on} size={44} />
                <div>
                  <b>{t(lang, `stamp.${id}.name`)}</b>
                  <small>{t(lang, `stamp.${id}.hint`)}</small>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section class="my-block" aria-labelledby="my-units">
        <h2 id="my-units">{t(lang, 'my.units')}</h2>
        <div class="chips" style={{ marginBlockStart: 0 }}>
          {units.map((u) => {
            const on = favs.units.includes(u.id);
            return (
              <button key={u.id} type="button" class="chip pin" aria-pressed={on} onClick={() => toggleUnit(u.id)}>
                <Star on={on} />
                {L(u.name, lang)}
              </button>
            );
          })}
        </div>
      </section>

      <section class="my-block" aria-labelledby="my-saved">
        <h2 id="my-saved">{t(lang, 'my.saved')}</h2>
        {saved.length === 0 ? (
          <p class="empty" data-saved-empty>{t(lang, 'my.savedEmpty')}</p>
        ) : (
          <ul class="my-list" data-saved={saved.length}>
            {saved.map((id) => (
              <li key={id}>
                <a href={stories[id]?.url ?? '#'}>{stories[id]?.title ?? id}</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="my-block" aria-labelledby="my-notes-title" id="my-notes">
        <h2 id="my-notes-title">{t(lang, 'notes.title')}</h2>
        <MyNotes lang={lang} />
      </section>

      <section class="my-block" aria-labelledby="my-fp">
        <h2 id="my-fp">{t(lang, 'my.fingerprints')}</h2>
        <ArchiveWall lang={lang} issues={issues} currentIssue={issue} />
      </section>

      <section class="my-block" aria-labelledby="my-subs">
        <h2 id="my-subs">{t(lang, 'my.submissions')}</h2>
        <MySubmissions lang={lang} />
      </section>

      <section class="my-block" aria-labelledby="my-notif">
        <h2 id="my-notif">{t(lang, 'my.notifications')}</h2>
        <p class="pop-sub">{t(lang, 'my.notifPreview')}</p>
        <ul class="my-list">
          <li><a href="https://whatsapp.com/channel/" rel="noopener">{t(lang, 'my.notif.whatsapp')}</a></li>
          <li><a href="https://x.com/" rel="noopener">{t(lang, 'my.notif.x')}</a></li>
          <li><a href="#main">{t(lang, 'my.notif.email')}</a></li>
        </ul>
      </section>

      <section class="my-block" aria-labelledby="my-data">
        <h2 id="my-data">{t(lang, 'my.export')}</h2>
        <div class="act-row">
          <button type="button" class="btn sm" onClick={exportData}>{t(lang, 'my.export')}</button>
          <button type="button" class="btn sm ghost" onClick={reset}>{t(lang, 'my.reset')}</button>
          <span class="note" aria-live="polite" data-reset-note>{resetDone ? t(lang, 'my.resetDone') : ''}</span>
        </div>
      </section>
    </div>
  );
}
