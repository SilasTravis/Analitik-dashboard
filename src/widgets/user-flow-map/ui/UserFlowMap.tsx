import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Typography,
  useTheme,
  Paper,
  Fade,
} from "@mui/material";
import { useFlowMap } from "../model/use-flow-map";

interface NodePosition {
  x: number;
  y: number;
  label: string;
  color: string;
  hasLeftPort: boolean;
  hasRightPort: boolean;
}

const CARD_WIDTH = 160;
const CARD_HEIGHT = 80;

const NODE_POSITIONS: Record<string, NodePosition> = {
  home: { x: 140, y: 180, label: "Home Page", color: "#6366f1", hasLeftPort: false, hasRightPort: true }, // Indigo
  search: { x: 140, y: 390, label: "Search Results", color: "#06b6d4", hasLeftPort: false, hasRightPort: true }, // Cyan
  other: { x: 380, y: 285, label: "Other Pages", color: "#64748b", hasLeftPort: true, hasRightPort: true }, // Slate
  product_category: { x: 380, y: 140, label: "Category Pages", color: "#3b82f6", hasLeftPort: true, hasRightPort: true }, // Blue
  product_view: { x: 620, y: 340, label: "Product Views", color: "#8b5cf6", hasLeftPort: true, hasRightPort: true }, // Purple
  basket: { x: 620, y: 170, label: "Shopping Basket", color: "#ec4899", hasLeftPort: true, hasRightPort: true }, // Pink
  checkout: { x: 840, y: 340, label: "Checkout Page", color: "#f43f5e", hasLeftPort: true, hasRightPort: true }, // Rose
  Exit: { x: 920, y: 200, label: "Exited Sessions", color: "#ef4444", hasLeftPort: true, hasRightPort: false }, // Red
};

interface TooltipData {
  sourceLabel: string;
  targetLabel: string;
  volume: number;
  pctOfSource: number;
  x: number;
  y: number;
}

export function UserFlowMap() {
  const theme = useTheme();
  const { data, isLoading, error } = useFlowMap();
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Maintain draggable node positions in state
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    const initial: Record<string, { x: number; y: number }> = {};
    Object.entries(NODE_POSITIONS).forEach(([id, pos]) => {
      initial[id] = { x: pos.x, y: pos.y };
    });
    return initial;
  });

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const dragInfo = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    mouseX: number;
    mouseY: number;
  } | null>(null);

  // Mouse drag handler on nodes
  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0) return; // Only allow left-click drag
    e.preventDefault();

    dragInfo.current = {
      nodeId: id,
      startX: positions[id].x,
      startY: positions[id].y,
      mouseX: e.clientX,
      mouseY: e.clientY,
    };
    setActiveDragId(id);
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!dragInfo.current || !svgRef.current) return;

      const { nodeId, startX, startY, mouseX, mouseY } = dragInfo.current;
      const rect = svgRef.current.getBoundingClientRect();

      const dx = e.clientX - mouseX;
      const dy = e.clientY - mouseY;

      // Map pixel delta to SVG viewBox coordinate system (1000x500)
      const svgDx = dx * (1000 / rect.width);
      const svgDy = dy * (500 / rect.height);

      let newX = startX + svgDx;
      let newY = startY + svgDy;

      // Constrain within viewBox bounds with padding
      newX = Math.max(CARD_WIDTH / 2 + 15, Math.min(1000 - CARD_WIDTH / 2 - 15, newX));
      newY = Math.max(CARD_HEIGHT / 2 + 15, Math.min(500 - CARD_HEIGHT / 2 - 15, newY));

      setPositions((prev) => ({
        ...prev,
        [nodeId]: { x: newX, y: newY },
      }));
    };

    const handleGlobalMouseUp = () => {
      dragInfo.current = null;
      setActiveDragId(null);
    };

    if (activeDragId) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [activeDragId]);

  if (isLoading) {
    return (
      <Card sx={{ height: 580, minHeight: 580, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CircularProgress />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card sx={{ height: 580, minHeight: 580, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography color="error">Failed to load user flow map.</Typography>
      </Card>
    );
  }

  // Map and aggregate links to our visual nodes
  const rawLinks = data.links.map((link) => {
    const source = NODE_POSITIONS[link.source] ? link.source : "other";
    const target = NODE_POSITIONS[link.target] ? link.target : "other";
    return { source, target, volume: link.volume };
  });

  const aggregatedLinks: Record<string, number> = {};
  rawLinks.forEach((link) => {
    if (link.source === link.target) return; // skip self-loops
    const key = `${link.source}->${link.target}`;
    aggregatedLinks[key] = (aggregatedLinks[key] || 0) + link.volume;
  });

  const links = Object.entries(aggregatedLinks).map(([key, volume]) => {
    const [source, target] = key.split("->");
    return { source, target, volume };
  });

  // Calculate Node Totals (incoming and outgoing volume)
  const nodeSourceTotals: Record<string, number> = {};
  const nodeTargetTotals: Record<string, number> = {};
  
  links.forEach((l) => {
    nodeSourceTotals[l.source] = (nodeSourceTotals[l.source] || 0) + l.volume;
    nodeTargetTotals[l.target] = (nodeTargetTotals[l.target] || 0) + l.volume;
  });

  // Find max volume to scale link thickness
  const maxVolume = Math.max(...links.map((l) => l.volume), 1);

  // Tooltip handler
  const handleMouseMove = (
    e: React.MouseEvent,
    source: string,
    target: string,
    volume: number
  ) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + 15;
    const y = e.clientY - rect.top + 15;

    const sourceTotal = nodeSourceTotals[source] || 1;
    const pctOfSource = (volume / sourceTotal) * 100;

    setTooltip({
      sourceLabel: NODE_POSITIONS[source]?.label || source,
      targetLabel: NODE_POSITIONS[target]?.label || target,
      volume,
      pctOfSource,
      x,
      y,
    });
  };

  const isDarkMode = theme.palette.mode === "dark";

  return (
    <Card
      ref={containerRef}
      sx={{
        position: "relative",
        height: 580,
        minHeight: 580,
        flexShrink: 0,
        background: theme.palette.background.paper,
        backdropFilter: "blur(20px)",
        border: `1px solid ${theme.palette.divider}`,
        overflow: "hidden",
      }}
    >
      <CardContent sx={{ height: "100%", p: 0, position: "relative" }}>
        <Box sx={{ p: 3, position: "absolute", top: 0, left: 0, zIndex: 10 }}>
          <Typography variant="h6" fontWeight={700}>
            User Flow Map
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Visualizing visitor journeys across key milestones. Drag cards around to customize flow diagram.
          </Typography>
        </Box>

        {/* Unified SVG Layer for Nodes & Links */}
        <svg
          ref={svgRef}
          viewBox="0 0 1000 500"
          width="100%"
          height="100%"
          style={{ position: "absolute", top: 0, left: 0, display: "block" }}
        >
          <defs>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Custom arrowhead marker */}
            <marker
              id="arrowhead"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={isDarkMode ? "#64748b" : "#94a3b8"} />
            </marker>
            
            {/* Gradients for flows */}
            {links.map((link) => {
              const srcColor = NODE_POSITIONS[link.source]?.color || "#ccc";
              const dstColor = NODE_POSITIONS[link.target]?.color || "#ccc";
              return (
                <linearGradient
                  key={`grad-${link.source}-${link.target}`}
                  id={`grad-${link.source}-${link.target}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor={srcColor} stopOpacity={0.65} />
                  <stop offset="100%" stopColor={dstColor} stopOpacity={0.65} />
                </linearGradient>
              );
            })}
          </defs>

          {/* Render links first (so they draw behind cards) */}
          {links.map((link) => {
            const start = positions[link.source];
            const end = positions[link.target];
            if (!start || !end) return null;

            // Connect exactly from source right edge to target left edge
            const x1 = start.x + (CARD_WIDTH / 2);
            const y1 = start.y;
            const x2 = end.x - (CARD_WIDTH / 2);
            const y2 = end.y;

            const controlOffset = Math.max(60, Math.abs(x2 - x1) * 0.45);
            const d = `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;

            const linkKey = `${link.source}->${link.target}`;
            const isHovered = hoveredLink === linkKey;
            const isAnyHovered = hoveredLink !== null;

            // Dynamic thickness
            const strokeWidth = Math.max(1.5, Math.min(22, (link.volume / maxVolume) * 16));

            return (
              <g key={linkKey}>
                {/* Glow highlight underlay */}
                {isHovered && (
                  <path
                    d={d}
                    fill="none"
                    stroke={NODE_POSITIONS[link.source]?.color || "#ccc"}
                    strokeWidth={strokeWidth + 6}
                    strokeOpacity={0.3}
                    filter="url(#glow)"
                    style={{ pointerEvents: "none" }}
                  />
                )}

                {/* Primary path */}
                <path
                  d={d}
                  fill="none"
                  stroke={`url(#grad-${link.source}-${link.target})`}
                  strokeWidth={strokeWidth}
                  strokeOpacity={isHovered ? 0.95 : isAnyHovered ? 0.15 : 0.55}
                  markerEnd="url(#arrowhead)"
                  style={{
                    cursor: "pointer",
                    transition: "stroke-opacity 150ms ease, stroke-width 150ms ease",
                  }}
                  onMouseEnter={() => setHoveredLink(linkKey)}
                  onMouseLeave={() => {
                    setHoveredLink(null);
                    setTooltip(null);
                  }}
                  onMouseMove={(e) => handleMouseMove(e, link.source, link.target, link.volume)}
                />
              </g>
            );
          })}

          {/* Render HTML Nodes via foreignObject */}
          {Object.entries(NODE_POSITIONS).map(([id, node]) => {
            const outgoing = nodeSourceTotals[id] || 0;
            const incoming = nodeTargetTotals[id] || 0;
            const nodeTotal = id === "Exit" ? incoming : Math.max(outgoing, incoming);

            if (nodeTotal === 0) return null;

            const nodePos = positions[id] || node;
            const cardX = nodePos.x - CARD_WIDTH / 2;
            const cardY = nodePos.y - CARD_HEIGHT / 2;
            const isDraggingThisNode = activeDragId === id;

            return (
              <g key={id}>
                {/* FigJam Card Node */}
                <foreignObject
                  x={cardX}
                  y={cardY}
                  width={CARD_WIDTH}
                  height={CARD_HEIGHT}
                  style={{ pointerEvents: "auto" }}
                >
                  <div
                    onMouseDown={(e) => handleMouseDown(e, id)}
                    style={{
                      width: "100%",
                      height: "100%",
                      boxSizing: "border-box",
                      borderRadius: "10px",
                      border: isDraggingThisNode
                        ? `2px solid ${node.color}`
                        : isDarkMode
                          ? "1px solid rgba(255, 255, 255, 0.08)"
                          : "1px solid rgba(0, 0, 0, 0.08)",
                      background: isDarkMode ? "#1e293b" : "#ffffff",
                      boxShadow: isDraggingThisNode
                        ? "0 12px 28px rgba(0, 0, 0, 0.2)"
                        : "0 4px 14px rgba(0, 0, 0, 0.06)",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      fontFamily: "Inter, sans-serif",
                      cursor: isDraggingThisNode ? "grabbing" : "grab",
                      userSelect: "none",
                    }}
                  >
                    {/* Top color tag */}
                    <div style={{ height: "4px", backgroundColor: node.color, width: "100%" }} />
                    
                    {/* Content */}
                    <div style={{ padding: "8px 12px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: isDarkMode ? "#cbd5e1" : "#1e293b",
                          fontSize: "11px",
                          lineHeight: 1.2,
                          marginBottom: "4px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {node.label}
                      </div>
                      <div
                        style={{
                          fontWeight: 800,
                          color: node.color,
                          fontSize: "14px",
                          lineHeight: 1,
                        }}
                      >
                        {nodeTotal.toLocaleString()}
                      </div>
                      <div
                        style={{
                          fontSize: "8px",
                          marginTop: "2px",
                          color: isDarkMode ? "#94a3b8" : "#64748b",
                        }}
                      >
                        {id === "Exit" ? "exited sessions" : "total sessions"}
                      </div>
                    </div>
                  </div>
                </foreignObject>

                {/* Left input port */}
                {node.hasLeftPort && (
                  <circle
                    cx={nodePos.x - CARD_WIDTH / 2}
                    cy={nodePos.y}
                    r={4}
                    fill={node.color}
                    stroke={isDarkMode ? "#1e293b" : "#ffffff"}
                    strokeWidth={1.5}
                    style={{ pointerEvents: "none" }}
                  />
                )}

                {/* Right output port */}
                {node.hasRightPort && (
                  <circle
                    cx={nodePos.x + CARD_WIDTH / 2}
                    cy={nodePos.y}
                    r={4}
                    fill={node.color}
                    stroke={isDarkMode ? "#1e293b" : "#ffffff"}
                    strokeWidth={1.5}
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        <Fade in={tooltip !== null} timeout={150}>
          <Paper
            elevation={4}
            sx={{
              position: "absolute",
              left: tooltip?.x || 0,
              top: tooltip?.y || 0,
              zIndex: 100,
              p: 1.5,
              borderRadius: 2,
              background: "#ffffff",
              border: "1px solid rgba(0, 0, 0, 0.1)",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.12)",
              color: "#0f172a",
              pointerEvents: "none",
              maxWidth: 220,
            }}
          >
            {tooltip && (
              <Box>
                <Typography variant="caption" sx={{ color: "rgba(15, 23, 42, 0.6)", fontWeight: 600, display: "block" }}>
                  Flow Transition
                </Typography>
                <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5, color: "#0f172a", whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.3 }}>
                  {tooltip.sourceLabel} → {tooltip.targetLabel}
                </Typography>
                <Typography variant="body2" sx={{ color: "#4f46e5", fontWeight: 700 }}>
                  {tooltip.volume.toLocaleString()} sessions
                </Typography>
                <Typography variant="caption" sx={{ color: "#16a34a", fontWeight: 600, display: "block", mt: 0.2 }}>
                  {tooltip.pctOfSource.toFixed(1)}% of source traffic
                </Typography>
              </Box>
            )}
          </Paper>
        </Fade>
      </CardContent>
    </Card>
  );
}
