// Shared behaviour for trigger-anchored popovers: outside tap, Escape, focus return, edge flip.
import { useEffect, useRef, useState } from 'preact/hooks';

export function usePopover() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<{ end: boolean; up: boolean }>({ end: false, up: false });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    // keep the panel inside the viewport
    const p = panel.current;
    if (p) {
      const r = p.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      setEdge({ end: r.right > vw - 8 || r.left < 8, up: r.bottom > vh - 8 && r.height < r.top });
      const first = p.querySelector<HTMLElement>('a, button, input, textarea');
      first?.focus({ preventScroll: true });
    }
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const toggle = () => setOpen((o) => !o);
  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const panelClass = `popover${edge.end ? ' pop-end' : ''}${edge.up ? ' up' : ''}`;
  return { open, toggle, close, wrap, trigger, panel, panelClass };
}
