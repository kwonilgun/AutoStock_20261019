"use client";

import { useRef, type PointerEvent } from "react";
import { formatNumber, formatReturn } from "@/lib/format";
import type { SeriesPoint } from "@/lib/engine/history";

const WIDTH = 360;
const HEIGHT = 208;
export const CUMULATIVE = "#4e5968";

function axisWon(value: number): string {
  const abs = Math.abs(Math.round(value));
  const sign = value < 0 ? "-" : "";
  if (abs >= 100_000_000) {
    const eok = Math.round((abs / 100_000_000) * 10) / 10;
    return `${sign}${eok}억`;
  }
  if (abs >= 10_000) return `${sign}${formatNumber(Math.round(abs / 10_000))}만`;
  return `${sign}${formatNumber(abs)}`;
}

function pointerToSvgX(svg: SVGSVGElement, clientX: number, clientY: number, fallbackWidth: number): number {
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    const bounds = svg.getBoundingClientRect();
    return bounds.width === 0 ? 0 : ((clientX - bounds.left) / bounds.width) * fallbackWidth;
  }
  const inverse = ctm.inverse();
  return inverse.a * clientX + inverse.c * clientY + inverse.e;
}

function nearestIndex(x: number, xs: number[]): number {
  if (xs.length === 0) return -1;
  const last = xs.length - 1;
  if (x >= xs[last]) return last;
  if (xs.length === 1 || x <= xs[0]) return 0;
  const lastGap = xs[last] - xs[last - 1];
  if (x >= xs[last] - Math.max(lastGap * 0.62, 24)) return last;
  let nearest = 0;
  let best = Infinity;
  for (let index = 0; index < xs.length; index += 1) {
    const distance = Math.abs(xs[index] - x);
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  }
  return nearest;
}

function smoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return "";
  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let index = 0; index < coords.length - 1; index += 1) {
    const previous = coords[index - 1] ?? coords[index];
    const current = coords[index];
    const next = coords[index + 1];
    const after = coords[index + 2] ?? next;
    const control1x = current.x + (next.x - previous.x) / 6;
    const control1y = current.y + (next.y - previous.y) / 6;
    const control2x = next.x - (after.x - current.x) / 6;
    const control2y = next.y - (after.y - current.y) / 6;
    path += ` C ${control1x} ${control1y}, ${control2x} ${control2y}, ${next.x} ${next.y}`;
  }
  return path;
}

export function AssetLine({
  points,
  color,
  activeKey,
  onHover,
}: {
  points: SeriesPoint[];
  color: string;
  activeKey: string | null;
  onHover: (key: string | null) => void;
}) {
  const plot = { left: 72, right: 32, top: 16, bottom: 32 };
  const values = points.map((point) => point.totalKrw);
  const low = values.length > 0 ? Math.min(...values) : 0;
  const high = values.length > 0 ? Math.max(...values) : 1;
  const pad = low === high ? Math.max(Math.abs(high) * 0.08, 1) : (high - low) * 0.22;
  const yMin = low - pad;
  const yMax = high + pad;
  const yOf = (value: number) => plot.top + (1 - (value - yMin) / (yMax - yMin)) * (HEIGHT - plot.bottom - plot.top);
  const xOf = (index: number) => {
    if (points.length <= 1) return plot.left + (WIDTH - plot.right - plot.left) * 0.82;
    return plot.left + (index / (points.length - 1)) * (WIDTH - plot.right - plot.left);
  };
  const coords = points.map((point, index) => ({ x: xOf(index), y: yOf(point.totalKrw), point }));
  const line = points.length > 1 ? smoothPath(coords) : "";
  const floor = HEIGHT - plot.bottom;
  const area = line ? `${line} L ${coords[coords.length - 1].x} ${floor} L ${coords[0].x} ${floor} Z` : "";
  const ticks = [yMax, (yMax + yMin) / 2, yMin];
  const labels = labelIndexes(points.length);
  const hoveredKey = useRef<string | null>(null);

  function hoverAt(event: PointerEvent<SVGSVGElement>) {
    if (coords.length === 0) return;
    const x = pointerToSvgX(event.currentTarget, event.clientX, event.clientY, WIDTH);
    const index = nearestIndex(x, coords.map((coord) => coord.x));
    if (index < 0) return;
    const key = coords[index].point.key;
    if (hoveredKey.current === key) return;
    hoveredKey.current = key;
    onHover(key);
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-52 w-full touch-none"
      role="img"
      aria-label="자산 변화 그래프"
      onPointerDown={hoverAt}
      onPointerMove={hoverAt}
      onPointerLeave={() => {
        hoveredKey.current = null;
        onHover(null);
      }}
    >
      <defs>
        <linearGradient id="assetArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={plot.left} x2={WIDTH - plot.right} y1={yOf(tick)} y2={yOf(tick)} stroke="#f2f4f6" strokeWidth="1" />
          <text x={plot.left - 8} y={yOf(tick) + 4} textAnchor="end" fontSize="11" fill="#8b95a1">
            {axisWon(tick)}
          </text>
        </g>
      ))}
      {points.length === 1 ? (
        <>
          <path
            d={`M ${plot.left} ${coords[0].y} L ${coords[0].x} ${coords[0].y} L ${coords[0].x} ${floor} L ${plot.left} ${floor} Z`}
            fill="url(#assetArea)"
          />
          <line
            x1={plot.left}
            x2={coords[0].x}
            y1={coords[0].y}
            y2={coords[0].y}
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </>
      ) : null}
      {area ? <path d={area} fill="url(#assetArea)" /> : null}
      {line ? <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" /> : null}
      {coords.map((coord) => {
        const hovered = coord.point.key === activeKey;
        const latest = activeKey == null && coord === coords[coords.length - 1];
        return (
          <g key={coord.point.key}>
            {hovered ? <line x1={coord.x} x2={coord.x} y1={plot.top} y2={floor} stroke="#e5e8eb" strokeWidth="1" /> : null}
            <circle cx={coord.x} cy={coord.y} r={hovered || latest ? 5.5 : 3.5} fill={color} stroke="#ffffff" strokeWidth="2" />
          </g>
        );
      })}
      {labels.map((index) => (
        <text
          key={points[index].key}
          x={xOf(index)}
          y={HEIGHT - 8}
          textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
          fontSize="12"
          fill="#8b95a1"
        >
          {points[index].axisLabel}
        </text>
      ))}
    </svg>
  );
}

const BAR_HEIGHT = 144;
const RETURN_AMPLITUDE = 1.5;

export function ReturnBars({
  points,
  activeKey,
  onHover,
}: {
  points: SeriesPoint[];
  activeKey: string | null;
  onHover: (key: string | null) => void;
}) {
  const height = BAR_HEIGHT;
  const plot = { left: 58, right: 32, top: 14, bottom: 30 };
  const inner = height - plot.top - plot.bottom;
  const floor = height - plot.bottom;
  const rates = points.map((point) => point.returnRate ?? 0);
  const cumulative = points.map((point) => point.cumulativeRate ?? 0);
  const rawMin = Math.min(0, ...rates, ...cumulative);
  const rawMax = Math.max(0, ...rates, ...cumulative);
  const rawSpan = Math.max(rawMax - rawMin, 0.01);
  const symmetricSpan = 2 * Math.max(Math.abs(rawMin), rawMax, 0.01);
  const span = Math.max(rawSpan, symmetricSpan / RETURN_AMPLITUDE);
  const extra = span - rawSpan;
  const yMin = rawMin - extra / 2;
  const yMax = rawMax + extra / 2;
  const yOf = (rate: number) => plot.top + 2 + (1 - (rate - yMin) / (yMax - yMin)) * (inner - 4);
  const zero = yOf(0);
  const xOf = (index: number) => {
    if (points.length <= 1) return plot.left + (WIDTH - plot.right - plot.left) * 0.82;
    return plot.left + (index / (points.length - 1)) * (WIDTH - plot.right - plot.left);
  };
  const spacing =
    points.length > 1 ? (WIDTH - plot.right - plot.left) / (points.length - 1) : WIDTH - plot.right - plot.left;
  const barWidth = Math.min(22, Math.max(4, spacing * 0.46));
  const labels = labelIndexes(points.length);
  const coords = points.map((point, index) => ({ x: xOf(index), point }));
  const hoveredKey = useRef<string | null>(null);
  const cumulativeLine = points.flatMap((point, index) =>
    point.cumulativeRate == null ? [] : [{ key: point.key, x: xOf(index), y: yOf(point.cumulativeRate) }],
  );

  function hoverAt(event: PointerEvent<SVGSVGElement>) {
    if (coords.length === 0) return;
    const x = pointerToSvgX(event.currentTarget, event.clientX, event.clientY, WIDTH);
    const index = nearestIndex(
      x,
      coords.map((coord) => coord.x),
    );
    if (index < 0) return;
    const key = coords[index].point.key;
    if (hoveredKey.current === key) return;
    hoveredKey.current = key;
    onHover(key);
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="h-36 w-full touch-none"
      role="img"
      aria-label="수익률 그래프"
      onPointerDown={hoverAt}
      onPointerMove={hoverAt}
      onPointerLeave={() => {
        hoveredKey.current = null;
        onHover(null);
      }}
    >
      <text x={plot.left - 8} y={yOf(yMax) + 4} textAnchor="end" fontSize="11" fill="#8b95a1">
        {formatReturn(yMax)}
      </text>
      <text x={plot.left - 8} y={zero + 4} textAnchor="end" fontSize="11" fill="#8b95a1">
        0%
      </text>
      <text x={plot.left - 8} y={yOf(yMin) + 4} textAnchor="end" fontSize="11" fill="#8b95a1">
        {formatReturn(yMin)}
      </text>
      <line x1={plot.left} x2={WIDTH - plot.right} y1={zero} y2={zero} stroke="#e5e8eb" strokeWidth="1" />
      {coords.map((coord) => {
        const hovered = coord.point.key === activeKey;
        if (!hovered) return null;
        return (
          <line
            key={`guide-${coord.point.key}`}
            x1={coord.x}
            x2={coord.x}
            y1={plot.top}
            y2={floor}
            stroke="#e5e8eb"
            strokeWidth="1"
          />
        );
      })}
      {points.map((point, index) => {
        if (point.returnRate == null) return null;
        const rate = point.returnRate;
        const x = xOf(index) - barWidth / 2;
        const y = rate >= 0 ? yOf(rate) : zero;
        const barHeight = Math.max(Math.abs(yOf(rate) - zero), 3);
        const color = rate > 0 ? "#f04452" : rate < 0 ? "#3182f6" : "#d1d6db";
        const active = point.key === activeKey;
        return (
          <rect
            key={point.key}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx="6"
            fill={color}
            opacity={active || activeKey == null ? 1 : 0.45}
          />
        );
      })}
      {cumulativeLine.length > 1 ? (
        <polyline
          points={cumulativeLine.map((coord) => `${coord.x},${coord.y}`).join(" ")}
          fill="none"
          stroke={CUMULATIVE}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          pointerEvents="none"
        />
      ) : null}
      {cumulativeLine.map((coord) => (
        <circle
          key={coord.key}
          cx={coord.x}
          cy={coord.y}
          r={coord.key === activeKey ? 4.5 : 3}
          fill={CUMULATIVE}
          stroke="#ffffff"
          strokeWidth="1.5"
          pointerEvents="none"
        />
      ))}
      {labels.map((index) => (
        <text
          key={points[index].key}
          x={xOf(index)}
          y={height - 10}
          textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
          fontSize="12"
          fill="#8b95a1"
        >
          {points[index].axisLabel}
        </text>
      ))}
    </svg>
  );
}

function labelIndexes(count: number): number[] {
  if (count <= 1) return count === 1 ? [0] : [];
  if (count === 2) return [0, 1];
  return [0, Math.floor((count - 1) / 2), count - 1];
}
