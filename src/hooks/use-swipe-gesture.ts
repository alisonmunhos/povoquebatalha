// Gesto de arrastar do card de triagem, em Pointer Events puros (sem dependência nova).
// Decide o eixo nos primeiros pixels para não competir com rolagem interna,
// e devolve o deslocamento pra animar via transform.
import { useCallback, useRef, useState } from "react";

export type SwipeDirection = "left" | "right" | "down";

const AXIS_LOCK_PX = 10;
const DISTANCE_RATIO = 0.28; // 28% da largura do card
const VELOCITY_PX_MS = 0.5;

export function useSwipeGesture({
  onCommit,
  disabled,
}: {
  onCommit: (dir: SwipeDirection) => void;
  disabled?: boolean;
}) {
  const [delta, setDelta] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  const width = useRef(320);

  const reset = useCallback(() => {
    start.current = null;
    axis.current = null;
    setDragging(false);
    setDelta({ x: 0, y: 0 });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled) return;
      // Não sequestra o gesto quando começa em algo clicável/rolável.
      const target = e.target as HTMLElement;
      if (target.closest("[data-no-swipe]")) return;
      width.current = e.currentTarget.getBoundingClientRect().width || 320;
      start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      axis.current = null;
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [disabled],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!axis.current) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      axis.current = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    }
    if (axis.current === "x") setDelta({ x: dx, y: 0 });
    else setDelta({ x: 0, y: Math.max(0, dy) }); // só pra baixo
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const dt = Math.max(1, performance.now() - s.t);
      const threshold = width.current * DISTANCE_RATIO;

      let dir: SwipeDirection | null = null;
      if (axis.current === "x") {
        const fast = Math.abs(dx) / dt > VELOCITY_PX_MS;
        if (Math.abs(dx) > threshold || (fast && Math.abs(dx) > 40)) dir = dx > 0 ? "right" : "left";
      } else if (axis.current === "y") {
        const fast = dy / dt > VELOCITY_PX_MS;
        if (dy > threshold || (fast && dy > 40)) dir = "down";
      }

      reset();
      if (dir) {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate?.(10);
          } catch {
            /* ignore */
          }
        }
        onCommit(dir);
      }
    },
    [onCommit, reset],
  );

  const hint: SwipeDirection | null =
    !dragging || (Math.abs(delta.x) < 24 && delta.y < 24)
      ? null
      : Math.abs(delta.x) >= delta.y
        ? delta.x > 0
          ? "right"
          : "left"
        : "down";

  return {
    delta,
    dragging,
    hint,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: reset,
    },
  };
}
