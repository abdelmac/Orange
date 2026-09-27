"use client";
import { useEffect, useRef, useState } from "react";

/** Only a deliberate gesture starting at the left edge can open navigation. */
export function sidebarGesture(
  start: { x: number; y: number; time: number },
  end: { x: number; y: number; time: number },
  open: boolean,
) {
  const dx = end.x - start.x,
    dy = Math.abs(end.y - start.y);
  if (end.time - start.time > 900 || dy > 45 || Math.abs(dx) < 75 || Math.abs(dx) < dy * 2)
    return null;
  if (!open && start.x <= 26 && dx > 0) return true;
  if (open && dx < 0) return false;
  return null;
}
function horizontalControl(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;
  if (
    target.closest(
      "input,textarea,select,[contenteditable=true],[data-no-swipe],.table-wrap,.table-scroll",
    )
  )
    return true;
  for (
    let node: HTMLElement | null = target;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const overflow = getComputedStyle(node).overflowX;
    if (node.scrollWidth > node.clientWidth + 2 && (overflow === "auto" || overflow === "scroll"))
      return true;
  }
  return false;
}
export function useSidebarGesture(open: boolean, setOpen: (value: boolean) => void) {
  const [compact, setCompact] = useState(false);
  const aside = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = matchMedia("(max-width: 1020px)");
    const update = () => {
      setCompact(media.matches);
      if (!media.matches) setOpen(false);
    };
    const frame = requestAnimationFrame(update);
    media.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener("change", update);
    };
  }, [setOpen]);
  useEffect(() => {
    if (!compact) return;
    let start: { x: number; y: number; time: number } | null = null;
    const begin = (event: TouchEvent) => {
      if (event.touches.length !== 1 || horizontalControl(event.target)) {
        start = null;
        return;
      }
      const point = event.touches[0];
      start =
        open || point.clientX <= 26
          ? { x: point.clientX, y: point.clientY, time: performance.now() }
          : null;
    };
    const move = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) return;
      const point = event.touches[0];
      if (Math.abs(point.clientY - start.y) > 45) {
        start = null;
        return;
      }
      const result = sidebarGesture(
        start,
        { x: point.clientX, y: point.clientY, time: performance.now() },
        open,
      );
      if (result !== null) {
        if (event.cancelable) event.preventDefault();
        start = null;
        setOpen(result);
      }
    };
    const finish = () => {
      start = null;
    };
    document.addEventListener("touchstart", begin, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", finish);
    document.addEventListener("touchcancel", finish);
    return () => {
      document.removeEventListener("touchstart", begin);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", finish);
      document.removeEventListener("touchcancel", finish);
    };
  }, [compact, open, setOpen]);
  useEffect(() => {
    if (!open || !compact) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    aside.current?.querySelector<HTMLElement>("button,a,select")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab") return;
      const elements = [
        ...(aside.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not(:disabled),select,input",
        ) ?? []),
      ].filter((el) => el.getClientRects().length);
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [open, compact, setOpen]);
  return { aside, compact };
}
