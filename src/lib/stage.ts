// Direct manipulation for the page viewer and the photo viewer: the content follows the finger, the mouse or
// the trackpad, written straight to `style.transform`, never through a render. The math lives in gesture.ts.
import {
  clamp, clampPan, DOUBLE_TAP_MS, isDoubleTap, MAX_ZOOM, MIN_ZOOM, rubberBand, softPinch, TAP_ZOOM, turnDecision, wantsTurnFromWheel, wheelZoomFactor, zoomAbout,
  type Point, type Size, type View,
} from './gesture';

export interface StageCallbacks {
  canTurn(dir: 1 | -1): boolean;
  /** Neighbors must be in the DOM (true) or may leave it (false). */
  onLive(on: boolean): void;
  /** The slide has landed: show the new page, then call `landed()` before the next paint. */
  onTurn(dir: 1 | -1): void;
  onTap?(target: Element): void;
  /** Zoom settled, at the end of a gesture or a button press. */
  onView?(z: number): void;
  /** Input arrived: anything scheduled for a settled view is out of date. */
  onMoving?(): void;
  /** Nothing has moved for a moment: the place to paint at full quality. */
  onSettled?(view: View): void;
  onMarkStart?(p: Point, target: Element): void;
  onMarkMove?(p: Point): void;
  onMarkEnd?(p: Point | null): void;
  /** A downward drag at fit size: progress 0 to 1 while dragging. */
  onDismissDrag?(progress: number): void;
  onDismiss?(): void;
}

export interface StageOptions {
  /** A drag to the right moves forward. */
  rtl: boolean;
  zoom: boolean;
  /** The element that zooms; it changes with the page. */
  content(): HTMLElement | null;
  /** The zoom limit, when the content sets its own. */
  maxZoom?(): number;
  /** Drag down at fit size to dismiss. */
  dismissDown?: boolean;
  /** A tap on this target needs no wait for a possible double tap. */
  instantTap?(target: Element, isMouse: boolean): boolean;
}

export interface Stage {
  /** Slides to the next or previous page, as a swipe would. */
  turn(dir: 1 | -1): boolean;
  /** Resets after the page changed. Safe to call any time. */
  landed(): void;
  zoomBy(delta: number): void;
  resetZoom(): void;
  /** Moves smoothly to a view computed from the current sizes, at 1x. */
  moveTo(compute: (content: Size, stage: Size) => View): void;
  setMarking(on: boolean): void;
  zoom(): number;
  view(): View;
  destroy(): void;
}

type Mode = 'idle' | 'pending' | 'swipe' | 'pan' | 'pinch' | 'mark' | 'dismiss';

const SETTLE_MS = 260;
const ZOOM_MS = 220;
const FOCUS_MS = 480;
const SLOP = 8;
const SETTLE_IDLE_MS = 150;
/** A deliberate drag past the edge of a zoomed page turns it, once this far past. */
const EDGE_TURN_PX = 48;
const TOUCH_TAP_WAIT = 240;
const MOUSE_TAP_WAIT = 200;
const FALLBACK_EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = () => getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() || FALLBACK_EASE;
const slide = (x: number, y = 0) => (x || y ? `translate3d(${x}px, ${y}px, 0)` : '');

export function createStage(stage: HTMLElement, track: HTMLElement, cb: StageCallbacks, opts: StageOptions): Stage {
  const pointers = new Map<number, Point>();
  const forwardSign = opts.rtl ? 1 : -1;
  const limit = () => opts.maxZoom?.() ?? MAX_ZOOM;
  let mode: Mode = 'idle';
  let marking = false;
  let view: View = { z: 1, x: 0, y: 0 };
  let trackX = 0;
  let trackY = 0;
  let settling: Animation | null = null;
  let viewAnim: Animation | null = null;
  let start = { x: 0, y: 0, t: 0, base: 0, view };
  let last = { x: 0, y: 0, t: 0 };
  let vx = 0;
  let vy = 0;
  let target: Element = stage;
  let pinchFrom = { m: { x: 0, y: 0 }, d: 1, view };
  let prevTap: { x: number; y: number; t: number } | null = null;
  let tapTimer = 0;
  let glide = 0;
  let wheelFrame = 0;
  let wheelIdle = 0;
  let wheelFocal: Point = { x: 0, y: 0 };
  let wheelFactor = 1;
  let wheelPan = { x: 0, y: 0 };
  let swipeSum = 0;
  let swipeUntil = 0;
  let settleTimer = 0;
  /** Which way a drag may carry on into a page turn: the edge the zoomed page was already at when it began. */
  let edgeDir = 0;

  const placed = (v: View) => (v.x || v.y || v.z !== 1 ? `translate(${v.x}px, ${v.y}px)${v.z !== 1 ? ` scale(${v.z})` : ''}` : '');
  const size = (): { content: Size; stage: Size } => {
    const c = opts.content();
    return { content: { w: c?.offsetWidth ?? 0, h: c?.offsetHeight ?? 0 }, stage: { w: stage.clientWidth, h: stage.clientHeight } };
  };
  const bounded = (v: View) => {
    const { content, stage: box } = size();
    return clampPan(v, content, box, limit());
  };
  const fromCenter = (p: Point): Point => {
    const r = stage.getBoundingClientRect();
    return { x: p.x - (r.left + r.width / 2), y: p.y - (r.top + r.height / 2) };
  };
  const hint = (el: HTMLElement | null, on: boolean) => {
    if (el) el.style.willChange = on ? 'transform' : '';
  };
  function writeView(v: View) {
    view = v;
    const c = opts.content();
    if (c) c.style.transform = placed(v);
    if (v.z > 1) stage.dataset.zoomed = 'true';
    else delete stage.dataset.zoomed;
  }
  function writeTrack(x: number, y = 0) {
    trackX = x;
    trackY = y;
    track.style.transform = slide(x, y);
  }
  function capture(id: number) {
    try {
      stage.setPointerCapture(id);
    } catch {}
  }
  function dragging(on: boolean) {
    if (on) stage.dataset.dragging = 'true';
    else delete stage.dataset.dragging;
  }

  function settleSoon() {
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => cb.onSettled?.(view), SETTLE_IDLE_MS);
  }
  function moving() {
    clearTimeout(settleTimer);
    cb.onMoving?.();
  }

  function stopGlide() {
    if (glide) cancelAnimationFrame(glide);
    glide = 0;
  }

  /** Stops whatever is moving and leaves the content exactly where it is on screen. */
  function interrupt() {
    stopGlide();
    if (settling) {
      const m = new DOMMatrixReadOnly(getComputedStyle(track).transform);
      settling.cancel();
      settling = null;
      writeTrack(m.m41, m.m42);
    }
    if (viewAnim) {
      const c = opts.content();
      if (c) {
        const m = new DOMMatrixReadOnly(getComputedStyle(c).transform);
        viewAnim.cancel();
        viewAnim = null;
        hint(c, false);
        writeView({ z: m.a, x: m.m41, y: m.m42 });
      }
    }
  }

  function settle(toX: number, toY: number, dir: 1 | -1 | 0, after?: () => void) {
    const done = () => {
      settling = null;
      hint(track, false);
      if (after) after();
      else if (dir) cb.onTurn(dir);
      else {
        writeTrack(0);
        cb.onLive(false);
      }
    };
    const from = slide(trackX, trackY) || 'none';
    const dist = Math.hypot(toX - trackX, toY - trackY);
    writeTrack(toX, toY);
    if (calm() || dist === 0) return done();
    hint(track, true);
    const w = Math.max(1, track.clientWidth);
    settling = track.animate([{ transform: from }, { transform: slide(toX, toY) || 'none' }], { duration: clamp((SETTLE_MS * dist) / w, 120, SETTLE_MS), easing: ease() });
    settling.onfinish = done;
  }

  function animateView(to: View, duration = ZOOM_MS) {
    const from = view;
    const c = opts.content();
    viewAnim?.cancel();
    viewAnim = null;
    const before = placed(from) || 'none';
    writeView(to);
    cb.onView?.(to.z);
    if (!c || calm()) return settleSoon();
    hint(c, true);
    const a = c.animate([{ transform: before }, { transform: placed(to) || 'none' }], { duration, easing: ease() });
    viewAnim = a;
    a.onfinish = () => {
      if (viewAnim === a) viewAnim = null;
      hint(c, false);
      settleSoon();
    };
  }

  /** The brief coast after a pan flick, stopping softly at the edges. */
  function coast(speedX: number, speedY: number) {
    let sx = speedX;
    let sy = speedY;
    let t0 = performance.now();
    const step = (now: number) => {
      const dt = Math.min(32, now - t0);
      t0 = now;
      sx *= Math.pow(0.95, dt / 16);
      sy *= Math.pow(0.95, dt / 16);
      const next = bounded({ z: view.z, x: view.x + sx * dt, y: view.y + sy * dt });
      if (next.x === view.x) sx = 0;
      if (next.y === view.y) sy = 0;
      writeView(next);
      if (Math.hypot(sx, sy) < 0.02) {
        glide = 0;
        settleSoon();
        return;
      }
      glide = requestAnimationFrame(step);
    };
    glide = requestAnimationFrame(step);
  }

  function endSwipe() {
    const w = Math.max(1, track.clientWidth);
    const dir = turnDecision({ dx: trackX, vx, width: w, forwardSign, canForward: cb.canTurn(1), canBack: cb.canTurn(-1) });
    settle(dir ? dir * forwardSign * w : 0, 0, dir);
  }

  function track2(e: PointerEvent) {
    const now = e.timeStamp;
    if (now > last.t) {
      vx = (e.clientX - last.x) / (now - last.t);
      vy = (e.clientY - last.y) / (now - last.t);
      last = { x: e.clientX, y: e.clientY, t: now };
    }
  }

  function onDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moving();
    if (pointers.size === 1) {
      const wasSettling = !!settling;
      interrupt();
      const edge = bounded({ z: view.z, x: 1e9, y: view.y }).x;
      edgeDir = view.z > 1 ? (Math.abs(view.x - edge) < 2 ? 1 : Math.abs(view.x + edge) < 2 ? -1 : 0) : 0;
      target = (e.target as Element) ?? stage;
      start = { x: e.clientX, y: e.clientY, t: Date.now(), base: trackX, view };
      last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      vx = 0;
      vy = 0;
      if (marking) {
        mode = 'mark';
        capture(e.pointerId);
        cb.onMarkStart?.({ x: e.clientX, y: e.clientY }, target);
      } else if (wasSettling && trackX !== 0) {
        // Caught mid-slide: the finger carries on from where the page is.
        mode = 'swipe';
        capture(e.pointerId);
        hint(track, true);
      } else {
        mode = 'pending';
      }
    } else if (pointers.size === 2 && opts.zoom) {
      if (mode === 'mark') cb.onMarkEnd?.(null);
      if (mode === 'swipe') settle(0, 0, 0);
      interrupt();
      const [a, b] = [...pointers.values()];
      pinchFrom = { m: fromCenter({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), d: Math.hypot(a.x - b.x, a.y - b.y), view };
      mode = 'pinch';
      hint(opts.content(), true);
    }
  }

  function onMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'mark') return cb.onMarkMove?.({ x: e.clientX, y: e.clientY });
    if (mode === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      writeView(softPinch(pinchFrom.view, pinchFrom.m, pinchFrom.d, fromCenter({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), Math.hypot(a.x - b.x, a.y - b.y), limit()));
      return;
    }
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (mode === 'pending') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return;
      if (view.z > 1) {
        mode = 'pan';
        hint(opts.content(), true);
      } else if (Math.abs(dx) > Math.abs(dy)) {
        mode = 'swipe';
        hint(track, true);
        cb.onLive(true);
      } else if (opts.dismissDown && dy > 0) {
        mode = 'dismiss';
        hint(track, true);
      } else {
        mode = 'idle'; // Vertical: on a scrolling page the browser takes it.
        return;
      }
      capture(e.pointerId);
      dragging(true);
    }
    if (mode === 'pan') {
      const raw = { z: view.z, x: start.view.x + dx, y: start.view.y + dy };
      const inside = bounded(raw);
      // Already at the page's edge and still going: the drag becomes a page turn.
      const over = raw.x - inside.x;
      if (edgeDir && over * edgeDir > EDGE_TURN_PX && Math.abs(dx) > Math.abs(dy)) {
        const dir: 1 | -1 = (over > 0 ? 1 : -1) === forwardSign ? 1 : -1;
        if (cb.canTurn(dir)) {
          writeView(inside);
          mode = 'swipe';
          start = { ...start, x: e.clientX, base: 0 };
          last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
          vx = 0;
          hint(opts.content(), false);
          hint(track, true);
          cb.onLive(true);
          return;
        }
      }
      // Past an edge it gives a little and comes back on release.
      writeView({ z: view.z, x: inside.x + rubberBand(raw.x - inside.x, stage.clientWidth) * 0.5, y: inside.y + rubberBand(raw.y - inside.y, stage.clientHeight) * 0.5 });
      track2(e);
    } else if (mode === 'swipe') {
      const raw = start.base + dx;
      const dir = (raw > 0 ? 1 : -1) === forwardSign ? 1 : -1;
      writeTrack(raw !== 0 && !cb.canTurn(dir) ? rubberBand(raw, track.clientWidth) : raw);
      track2(e);
    } else if (mode === 'dismiss') {
      const y = Math.max(0, dy);
      writeTrack(0, y);
      cb.onDismissDrag?.(clamp(y / (stage.clientHeight * 0.5), 0, 1));
      track2(e);
    }
  }

  function onUp(e: PointerEvent) {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size === 0) dragging(false);
    if (mode === 'pinch') {
      if (pointers.size === 1) {
        // One finger stays down: it pans from here.
        const [p] = [...pointers.values()];
        start = { x: p.x, y: p.y, t: Date.now(), base: 0, view };
        last = { x: p.x, y: p.y, t: e.timeStamp };
        vx = 0;
        vy = 0;
        mode = 'pan';
      } else if (pointers.size === 0) {
        endPan(false);
      }
      return;
    }
    if (mode === 'mark') {
      mode = 'idle';
      cb.onMarkEnd?.({ x: e.clientX, y: e.clientY });
      return;
    }
    if (mode === 'pan') {
      if (e.timeStamp - last.t > 80) {
        vx = 0;
        vy = 0;
      }
      endPan(true);
      return;
    }
    if (mode === 'swipe') {
      mode = 'idle';
      // A finger that stopped before lifting has no speed left.
      if (e.timeStamp - last.t > 80) vx = 0;
      endSwipe();
      return;
    }
    if (mode === 'dismiss') {
      mode = 'idle';
      if (e.timeStamp - last.t > 80) vy = 0;
      if (trackY > stage.clientHeight * 0.18 || vy > 0.5) cb.onDismiss?.();
      else {
        cb.onDismissDrag?.(0);
        settle(0, 0, 0, () => writeTrack(0));
      }
      return;
    }
    if (mode === 'pending') {
      mode = 'idle';
      tap(e, target);
    }
  }

  /** A pan or pinch is over: back inside the limits with a soft bounce if it went past them, else a coast. */
  function endPan(mayCoast: boolean) {
    mode = 'idle';
    const c = opts.content();
    hint(c, false);
    const inside = bounded(view);
    const past = inside.z !== view.z || Math.abs(inside.x - view.x) > 0.5 || Math.abs(inside.y - view.y) > 0.5;
    if (past) return animateView(inside);
    writeView(inside);
    cb.onView?.(view.z);
    if (mayCoast && !calm() && Math.hypot(vx, vy) > 0.25) coast(vx, vy);
    else settleSoon();
  }

  function tap(e: PointerEvent, on: Element) {
    const now = { x: e.clientX, y: e.clientY, t: Date.now() };
    const isMouse = e.pointerType === 'mouse';
    if (opts.instantTap?.(on, isMouse)) {
      clearTimeout(tapTimer);
      prevTap = null;
      cb.onTap?.(on);
      return;
    }
    if (opts.zoom && isDoubleTap(prevTap, now)) {
      clearTimeout(tapTimer);
      prevTap = null;
      const { content, stage: box } = size();
      animateView(view.z > 1 ? { z: 1, x: 0, y: 0 } : zoomAbout(view, Math.min(TAP_ZOOM, limit()), fromCenter(now), content, box, limit()));
      return;
    }
    prevTap = now;
    clearTimeout(tapTimer);
    // Waits to be sure it is not the first half of a double tap.
    const wait = !opts.zoom ? 0 : isMouse ? MOUSE_TAP_WAIT : TOUCH_TAP_WAIT;
    tapTimer = window.setTimeout(() => cb.onTap?.(on), Math.min(wait, DOUBLE_TAP_MS));
  }

  function onCancel(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) dragging(false);
    if (mode === 'mark') cb.onMarkEnd?.(null);
    if (mode === 'swipe') settle(0, 0, 0);
    if (mode === 'dismiss') {
      cb.onDismissDrag?.(0);
      settle(0, 0, 0, () => writeTrack(0));
    }
    if ((mode === 'pinch' || mode === 'pan') && pointers.size === 0) return endPan(false);
    if (pointers.size === 0) mode = 'idle';
  }

  // With touch-action: pan-y the browser would still take two fingers for a scroll; this keeps them ours.
  function onTouch(e: TouchEvent) {
    if (opts.zoom && e.cancelable && (e.touches.length >= 2 || mode === 'pinch')) e.preventDefault();
  }
  const noGesture = (e: Event) => opts.zoom && e.preventDefault();

  /** Trackpad pinch and Ctrl+wheel zoom about the cursor; while zoomed, a plain wheel pans; at 1x, only a
   *  deliberate sideways swipe turns a page. Everything lands once per frame. */
  function onWheel(e: WheelEvent) {
    if (!opts.zoom) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage.clientHeight : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.ctrlKey) {
      e.preventDefault();
      interrupt();
      wheelFactor *= wheelZoomFactor(dy);
      wheelFocal = fromCenter({ x: e.clientX, y: e.clientY });
    } else if (view.z > 1) {
      e.preventDefault();
      interrupt();
      wheelPan = { x: wheelPan.x - dx, y: wheelPan.y - dy };
    } else {
      const decision = wantsTurnFromWheel(swipeSum, dx, dy, Date.now(), swipeUntil);
      swipeSum = decision.sum;
      if (decision.fire) {
        swipeUntil = Date.now() + 700;
        // The content moves opposite to the scroll, as a finger on it would.
        const dir: 1 | -1 = (-dx > 0 ? 1 : -1) === forwardSign ? 1 : -1;
        if (cb.canTurn(dir) && !settling) {
          cb.onLive(true);
          requestAnimationFrame(() => settle(dir * forwardSign * Math.max(1, track.clientWidth), 0, dir));
        }
      }
      return;
    }
    if (!wheelFrame) {
      wheelFrame = requestAnimationFrame(() => {
        wheelFrame = 0;
        const { content, stage: box } = size();
        if (wheelFactor !== 1) {
          writeView(zoomAbout(view, view.z * wheelFactor, wheelFocal, content, box, limit()));
          wheelFactor = 1;
        }
        if (wheelPan.x || wheelPan.y) {
          writeView(clampPan({ z: view.z, x: view.x + wheelPan.x, y: view.y + wheelPan.y }, content, box, limit()));
          wheelPan = { x: 0, y: 0 };
        }
      });
    }
    moving();
    clearTimeout(wheelIdle);
    wheelIdle = window.setTimeout(() => {
      cb.onView?.(view.z);
      cb.onSettled?.(view);
    }, SETTLE_IDLE_MS);
  }

  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onCancel);
  stage.addEventListener('touchstart', onTouch, { passive: false });
  stage.addEventListener('touchmove', onTouch, { passive: false });
  stage.addEventListener('gesturestart', noGesture); // Safari's own pinch.
  stage.addEventListener('wheel', onWheel, { passive: false });

  return {
    turn(dir) {
      if (settling || !cb.canTurn(dir)) return false;
      if (calm()) {
        cb.onTurn(dir);
        return true;
      }
      cb.onLive(true);
      requestAnimationFrame(() => settle(dir * forwardSign * Math.max(1, track.clientWidth), 0, dir));
      return true;
    },
    landed() {
      settling?.cancel();
      settling = null;
      viewAnim?.cancel();
      viewAnim = null;
      stopGlide();
      hint(track, false);
      writeTrack(0);
      view = { z: 1, x: 0, y: 0 };
      const c = opts.content();
      if (c) {
        c.style.transform = '';
        hint(c, false);
      }
      delete stage.dataset.zoomed;
      cb.onView?.(1);
      moving();
      settleSoon();
    },
    zoomBy(delta) {
      moving();
      interrupt();
      const { content, stage: box } = size();
      animateView(zoomAbout(view, clamp(view.z + delta, MIN_ZOOM, limit()), { x: 0, y: 0 }, content, box, limit()));
    },
    resetZoom() {
      moving();
      interrupt();
      animateView({ z: 1, x: 0, y: 0 });
    },
    moveTo(compute) {
      moving();
      interrupt();
      const { content, stage: box } = size();
      animateView(compute(content, box), FOCUS_MS);
    },
    setMarking(on) {
      marking = on;
      if (on) stage.dataset.marking = 'true';
      else delete stage.dataset.marking;
    },
    zoom: () => view.z,
    view: () => view,
    destroy() {
      clearTimeout(tapTimer);
      clearTimeout(wheelIdle);
      clearTimeout(settleTimer);
      if (wheelFrame) cancelAnimationFrame(wheelFrame);
      stopGlide();
      settling?.cancel();
      viewAnim?.cancel();
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onCancel);
      stage.removeEventListener('touchstart', onTouch);
      stage.removeEventListener('touchmove', onTouch);
      stage.removeEventListener('gesturestart', noGesture);
      stage.removeEventListener('wheel', onWheel);
    },
  };
}
