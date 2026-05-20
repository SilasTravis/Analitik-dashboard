import { Box } from "@mui/material";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type Panel = { key: string; content: ReactNode };

type Props = {
  active: string;
  panels: Panel[];
  /** ms — keep in sync with the easing feel of the rest of the app */
  duration?: number;
};

/**
 * Cross-fades between panels while smoothly animating the container's
 * height to match the active one. Avoids the "tall flash" you get when
 * two panels share document flow.
 */
export function PanelSwitcher({ active, panels, duration = 220 }: Props) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const [height, setHeight] = useState<number | "auto">("auto");
  const [measured, setMeasured] = useState(false);

  useLayoutEffect(() => {
    const node = refs.current[active];
    if (!node) return;
    setHeight(node.getBoundingClientRect().height);
    setMeasured(true);
  }, [active]);

  useEffect(() => {
    const node = refs.current[active];
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (typeof h === "number") setHeight(h);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [active]);

  return (
    <Box
      sx={{
        position: "relative",
        height: measured ? height : "auto",
        transition: `height ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        overflow: "hidden",
      }}
    >
      {panels.map((p) => {
        const isActive = p.key === active;
        return (
          <Box
            key={p.key}
            ref={(el: HTMLDivElement | null) => {
              refs.current[p.key] = el;
            }}
            aria-hidden={!isActive}
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              opacity: isActive ? 1 : 0,
              transform: isActive ? "translateY(0)" : "translateY(4px)",
              pointerEvents: isActive ? "auto" : "none",
              transition: `opacity ${duration}ms ease, transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            }}
          >
            {p.content}
          </Box>
        );
      })}
    </Box>
  );
}
