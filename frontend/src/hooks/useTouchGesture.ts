import { useState, useEffect, useCallback } from 'react';

export interface TouchGestureHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
}

const SWIPE_THRESHOLD = 50;

export function useTouchGesture(
  onSwipeLeft?: () => void,
  onSwipeRight?: () => void,
  onTap?: () => void,
) {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    setTouchStart({ x: t.clientX, y: t.clientY });
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx > 0 && onSwipeRight) onSwipeRight();
      else if (dx < 0 && onSwipeLeft) onSwipeLeft();
    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && onTap) {
      onTap();
    }
    setTouchStart(null);
  }, [touchStart, onSwipeLeft, onSwipeRight, onTap]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart) return;
    const t = e.touches[0];
    const dy = t.clientY - touchStart.y;
    if (Math.abs(dy) > SWIPE_THRESHOLD * 2) {
      setTouchStart(null);
    }
  }, [touchStart]);

  return { onTouchStart, onTouchEnd, onTouchMove };
}

export function useIdleTimer(onIdle: () => void, timeout = 30000) {
  const [idle, setIdle] = useState(false);
  const timerRef = useCallback(() => {
    let handle: ReturnType<typeof setTimeout>;
    const reset = () => {
      setIdle(false);
      clearTimeout(handle);
      handle = setTimeout(() => {
        setIdle(true);
        onIdle();
      }, timeout);
    };
    const events = ['touchstart', 'touchmove', 'touchend', 'mousemove', 'keydown', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(handle);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [onIdle, timeout]);
  useEffect(timerRef, [timerRef]);
  return idle;
}

export function useVolumeControl(initialVolume = 0.8) {
  const [volume, setVolume] = useState(initialVolume);
  const [muted, setMuted] = useState(false);

  const toggleMute = useCallback(() => {
    setMuted((m) => !m);
  }, []);

  const effectiveVolume = muted ? 0 : volume;

  useEffect(() => {
    const videos = document.querySelectorAll('video');
    videos.forEach((v) => {
      v.volume = effectiveVolume;
    });
  }, [effectiveVolume]);

  return { volume, setVolume, muted, toggleMute, effectiveVolume };
}
