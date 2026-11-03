import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { t, L } from '~/i18n';
import { ACCENTS, accent, SECTIONS, type AccentId, type Address, type Lang, type Localized, type SectionId } from '~/lib/model';
import { resizeAvatar, initial } from '~/lib/name';
import { $favorites, $profile, $sheet, dismissOnboarding, hydrate, saveFavorites, saveProfile } from '~/lib/store';
import Star from './Star';

export { Star };

interface Props {
  lang: Lang;
  issue: number;
  /** Publishers the reader can follow, in the order the page lists them. */
  units: { id: string; name: Localized }[];
}

/** A bottom sheet, opened on purpose (or once by the nudge after the first read): name, photo, your
 *  color, publishers to follow, sections to pin, how to be addressed. 420ms drawer curve in, faster out. */
export default function Onboarding({ lang, issue, units }: Props) {
  const sheet = useStore($sheet);
  const profile = useStore($profile);
  const favs = useStore($favorites);
  const open = sheet === 'onboarding';
  const [name, setName] = useState('');
  const [color, setColor] = useState<AccentId>('orange');
  const [addr, setAddr] = useState<Address>('neutral');
  const [pins, setPins] = useState<SectionId[]>([]);
  const [follows, setFollows] = useState<string[]>([]);
  const [avatar, setAvatar] = useState<string | undefined>();
  const [err, setErr] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => void hydrate(issue), [issue]);

  useEffect(() => {
    if (!open) return;
    setName(profile?.name ?? '');
    setColor(profile?.color ?? 'orange');
    setAddr(profile?.address ?? 'neutral');
    setPins(favs.sections);
    setFollows(favs.units);
    setAvatar(profile?.avatar);
    setErr(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => firstField.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') later();
      if (e.key === 'Tab' && panel.current) {
        const f = Array.from(panel.current.querySelectorAll<HTMLElement>('input, button, [tabindex="0"]')).filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function later() {
    dismissOnboarding();
    $sheet.set(null);
  }

  async function save(e: Event) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setErr(t(lang, 'onboarding.nameRequired'));
      firstField.current?.focus();
      return;
    }
    await saveProfile({ name: clean, color, address: addr, avatar });
    await saveFavorites({ sections: pins, units: follows });
    dismissOnboarding();
    $sheet.set(null);
  }

  async function onPhoto(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      setAvatar(await resizeAvatar(file));
      setErr(null);
    } catch {
      setErr(t(lang, 'onboarding.photoError'));
    }
    input.value = '';
  }

  const togglePin = (id: SectionId) =>
    setPins((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 5 ? p : [...p, id]));
  const toggleFollow = (id: string) => setFollows((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]));
  const hue = accent(color);

  return (
    <div class="sheet-root" data-open={open} aria-hidden={!open}>
      <div class="sheet-backdrop" onClick={later} />
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ob-title" ref={panel}>
        <form onSubmit={save} class="sheet-form">
          <div class="sheet-grip" aria-hidden="true" />
          <h2 id="ob-title" class="sheet-title">{t(lang, 'onboarding.title')}</h2>
          <p class="sheet-lead">{t(lang, 'onboarding.lead')}</p>

          <label class="sheet-label" for="ob-name">{t(lang, 'onboarding.name')}</label>
          <input id="ob-name" ref={firstField} class="field" type="text" autocomplete="given-name" maxLength={60} placeholder={t(lang, 'onboarding.namePlaceholder')} value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} aria-invalid={!!err && !name.trim()} aria-describedby={err ? 'ob-err' : undefined} />

          <fieldset class="sheet-fieldset">
            <legend class="sheet-label">{t(lang, 'onboarding.color')}</legend>
            <div class="hue-grid">
              {ACCENTS.map((c) => (
                <label key={c.id} class="hue-opt" style={{ '--c': c.color, '--ci': c.ink === 'ink' ? 'var(--ink)' : 'var(--beige)' } as never}>
                  <input type="radio" name="color" value={c.id} checked={color === c.id} onChange={() => setColor(c.id)} />
                  <span class="hue-swatch" aria-hidden="true" />
                  <span>{L(c.name, lang)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset class="sheet-fieldset">
            <legend class="sheet-label">{t(lang, 'onboarding.units')}</legend>
            <p class="pop-sub">{t(lang, 'onboarding.unitsHint')}</p>
            <div class="chips">
              {units.map((u) => (
                <button key={u.id} type="button" class="chip pin" aria-pressed={follows.includes(u.id)} onClick={() => toggleFollow(u.id)}>
                  <Star on={follows.includes(u.id)} />
                  {L(u.name, lang)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset class="sheet-fieldset">
            <legend class="sheet-label">{t(lang, 'onboarding.sections')}</legend>
            <div class="chips">
              {SECTIONS.map((s) => (
                <button key={s.id} type="button" class="chip pin" aria-pressed={pins.includes(s.id)} onClick={() => togglePin(s.id)}>
                  <Star on={pins.includes(s.id)} />
                  {L(s.name, lang)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset class="sheet-fieldset">
            <legend class="sheet-label">{t(lang, 'onboarding.address')}</legend>
            <div class="seg" role="radiogroup">
              {(['neutral', 'm', 'f'] as Address[]).map((a) => (
                <label key={a} class="seg-opt">
                  <input type="radio" name="address" value={a} checked={addr === a} onChange={() => setAddr(a)} />
                  <span>{t(lang, `onboarding.addr.${a === 'neutral' ? 'n' : a}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div class="sheet-photo">
            <span class="av av-lg" aria-hidden="true" style={avatar ? undefined : { background: hue.color, color: hue.ink === 'ink' ? 'var(--ink)' : 'var(--beige)' }}>
              {avatar ? <img src={avatar} alt="" width={64} height={64} /> : initial(name)}
            </span>
            <div>
              <label class="btn sm ghost" for="ob-photo">{avatar ? t(lang, 'onboarding.photoChange') : t(lang, 'onboarding.photo')}</label>
              <input id="ob-photo" type="file" accept="image/*" class="sr" onChange={onPhoto} />
              {avatar && <button type="button" class="btn sm ghost" onClick={() => setAvatar(undefined)}>{t(lang, 'onboarding.photoRemove')}</button>}
              <p class="pop-sub">{t(lang, 'onboarding.photoHint')}</p>
            </div>
          </div>

          {err && <p id="ob-err" class="form-err" role="alert">{err}</p>}

          <div class="sheet-actions">
            <button type="submit" class="btn">{t(lang, 'onboarding.save')}</button>
            <button type="button" class="btn ghost" onClick={later}>{profile ? t(lang, 'onboarding.close') : t(lang, 'onboarding.skip')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
