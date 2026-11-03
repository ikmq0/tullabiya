import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { t, tp, L } from '~/i18n';
import { accent, EMPTY_FAVORITES, SECTIONS, type Lang, type Localized } from '~/lib/model';
import { getApi } from '~/lib/api';
import { $favorites, $profile, $sheet, $stamps, hydrate, resetAll, saveFavorites, togglePinnedSection } from '~/lib/store';
import { LEVELS, TRACKS, levelOf, nextTier, stampId } from '~/lib/stamps';
import { StampMark } from './StampToast';
import { Avatar } from './ProfileChip';
import { Star } from './Onboarding';
import ArchiveWall from './ArchiveWall';
import MySubmissions from './MySubmissions';
import { useMounted } from '~/lib/useMounted';

interface Props {
  lang: Lang;
  issue: number;
  issues: number[];
  units: { id: string; name: Localized }[];
  stories: Record<string, { title: string; url: string }>;
}

/** Everything the reader owns, on one page: profile, pins, saved, fingerprints, submissions, data. */
export default function MyCorner({ lang, issue, issues, units, stories }: Props) {
  const profileStore = useStore($profile);
  const favsStore = useStore($favorites);
  const mounted = useMounted();
  const profile = mounted ? profileStore : null;
  const favs = mounted ? favsStore : EMPTY_FAVORITES;
  const stampsStore = useStore($stamps);
  const stamps = mounted ? stampsStore : [];
  const [counts, setCounts] = useState<Partial<Record<string, number>>>({});
  const [saved, setSaved] = useState<string[]>([]);
  const [resetDone, setResetDone] = useState(false);
  useEffect(() => {
    hydrate(issue);
    getApi().getSaved().then(setSaved);
    getApi().getCounts().then(setCounts);
  }, [issue, stamps.length]);

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
        {(() => {
          const { level, next } = levelOf(stamps.length);
          return (
            <div class="level" data-level={level}>
              <p class="level-name">{t(lang, 'my.level', { k: level, name: t(lang, `level.${level}`) })}</p>
              <p class="pop-sub">{next === null ? t(lang, 'my.levelTop') : tp(lang, 'my.levelNext', next - stamps.length)}</p>
              <div class="pbars" aria-hidden="true">
                {LEVELS.map((_, i) => (
                  <i key={i} class={`fast-bar${i < level ? ' on' : ''}`} />
                ))}
              </div>
            </div>
          );
        })()}
        <p class="pop-sub">{t(lang, 'my.stampsLead')}</p>
        <ul class="tracks">
          {TRACKS.map((track) => {
            const count = counts[track.id] ?? 0;
            const upcoming = nextTier(track, count);
            return (
              <li key={track.id} class="track" data-track={track.id}>
                <div class="track-head">
                  <b>{t(lang, `track.${track.id}.name`)}</b>
                  <span class="pop-sub">{upcoming === null ? t(lang, 'track.allDone') : t(lang, 'track.progress', { k: count, n: upcoming })}</span>
                </div>
                <ul class="stamp-row">
                  {track.tiers.map((n, i) => {
                    const id = stampId(track.id, n);
                    const on = stamps.some((s) => s.id === id);
                    const top = i === track.tiers.length - 1;
                    const notYet = track.id === 'issues' && n > issues.length;
                    return (
                      <li key={id} class="stamp" data-id={id} data-on={on ? 'true' : 'false'} data-top={top ? 'true' : undefined}>
                        <StampMark on={on} size={44} label={n} />
                        <div>
                          <b>{tp(lang, `track.${track.id}.tier`, n)}</b>
                          {top && <small class="reward">{t(lang, 'stamp.reward')}</small>}
                          {notYet && <small>{t(lang, 'stamp.notYet', { n: issues.length })}</small>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
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
