import { useState } from 'preact/hooks';
import { t, tp } from '~/i18n';
import type { Lang } from '~/lib/model';

interface Props {
  lang: Lang;
  /** YouTube video id. */
  id: string;
  title: string;
  minutes?: number;
}

/** A video that costs nothing until it is wanted: the poster frame cut at 5° with a play slab; the
 *  player (youtube-nocookie) loads on tap and starts at once. */
export default function LiteVideo({ lang, id, title, minutes }: Props) {
  const [playing, setPlaying] = useState(false);
  const label = minutes ? `${t(lang, 'video.play')} · ${tp(lang, 'video.minutes', minutes)}` : t(lang, 'video.play');

  if (playing) {
    return (
      <div class="video fast-photo is-playing">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&hl=${lang}`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <div class="video fast-photo">
      <img
        src={`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`}
        onError={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          if (!img.src.includes('hqdefault')) img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        }}
        alt={title}
        width={1280}
        height={720}
        loading="lazy"
      />
      <button type="button" class="play fast-label" onClick={() => setPlaying(true)} aria-label={`${t(lang, 'video.play')}: ${title}`}>
        <svg class="play-mark" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
        {label}
      </button>
    </div>
  );
}
