import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Droplets, Moon, Utensils, Activity, Dumbbell, Zap, Check, ChevronLeft,
  ChevronRight, Lock, CalendarDays, Trophy, Settings as SettingsIcon,
  Sun, Monitor, MoonStar, Scale, X, Sparkles, Flame,
} from "lucide-react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";

/* ============================================================================
   HEALTH CHALLENGE — DESIGN MOCKUP
   Companion to health-challenge-pwa-requirements-v1.2.md

   This is a VISUAL SPEC, not production code. It exists to lock the palette,
   type, spacing, and celebration feel before the real build starts.

   Deliberate differences from the spec, for the implementing agent:
   - No localStorage (unavailable in this preview). Theme + celebration level
     live in React state. In production both are localStorage, per §3.3/§11.1.
   - No API. Mock data is generated deterministically below.
   - Fonts loaded from Google. Production self-hosts them, per §12.
   - canvas-confetti is hand-rolled here so the escalation curve is tunable
     in one place. Production uses the library; keep the curve.

   WHAT IS BINDING: the theme tokens, the 12-color user palette, the type
   scale, the escalation curve in TIERS(), the read-only treatment, and the
   ribbon. Everything else is illustrative.
   ========================================================================== */

/* ---------------------------------- theme --------------------------------- */

const THEMES = {
  light: {
    paper: "#F1F2F0", surface: "#FFFFFF", surfaceAlt: "#F7F8F6",
    ink: "#16191C", muted: "#6C7278", hairline: "#DEE1DD",
    scrim: "rgba(16,18,20,0.45)",
  },
  dark: {
    paper: "#101214", surface: "#1A1D20", surfaceAlt: "#212528",
    ink: "#E8EBEC", muted: "#8A9196", hairline: "#2C3135",
    scrim: "rgba(0,0,0,0.6)",
  },
};

/* 16 claimable user colors, ordered around the hue wheel with two neutrals at
   the end for people who don't want a loud color. Unique per active person. §7
   `on` is the text/glyph color that meets AA against that swatch. */
const PALETTE = {
  tomato: { hex: "#E54D2E", on: "#FFFFFF" },
  orange: { hex: "#F76B15", on: "#FFFFFF" },
  amber:  { hex: "#FFB224", on: "#1A1A1A" },
  lime:   { hex: "#A8C81A", on: "#1A1A1A" },
  grass:  { hex: "#46A758", on: "#FFFFFF" },
  forest: { hex: "#2A6A45", on: "#FFFFFF" },
  teal:   { hex: "#12A594", on: "#FFFFFF" },
  cyan:   { hex: "#00A2C7", on: "#FFFFFF" },
  blue:   { hex: "#0090FF", on: "#FFFFFF" },
  indigo: { hex: "#3E63DD", on: "#FFFFFF" },
  violet: { hex: "#6E56CF", on: "#FFFFFF" },
  plum:   { hex: "#AB4ABA", on: "#FFFFFF" },
  pink:   { hex: "#D6409F", on: "#FFFFFF" },
  ruby:   { hex: "#E03A5C", on: "#FFFFFF" },
  brown:  { hex: "#AD7F58", on: "#FFFFFF" },
  slate:  { hex: "#7B8794", on: "#FFFFFF" },
};

const FONT_DISPLAY = "'Bricolage Grotesque', system-ui, sans-serif";
const FONT_BODY = "'Public Sans', system-ui, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

/* ------------------------------ color helpers ----------------------------- */

const hex2rgb = (h) => {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const rgb2hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
/** Mix two hex colors. t=0 returns a, t=1 returns b. */
const mix = (a, b, t) => {
  const [r1, g1, b1] = hex2rgb(a), [r2, g2, b2] = hex2rgb(b);
  return rgb2hex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
};
/** Tint ramp against the current surface — the --u-100..500 tokens in §7. */
const tint = (color, T, step) => mix(T.surface, color, step);
/** Someone-else's-page desaturation. §3.4 */
const desat = (color, T) => mix(color, T.muted, 0.72);

/* ----------------------------------- data --------------------------------- */

const MOCK_TODAY = "2026-09-24";

const RULES = [
  { key: "water",      label: "Water over 80 oz",     short: "Water",    icon: Droplets, category: "Hydration", points: 1 },
  { key: "sleep",      label: "Slept 7+ hours",       short: "Sleep",    icon: Moon,     category: "Sleep",     points: 1 },
  { key: "diet",       label: "Stuck to my diet",     short: "Diet",     icon: Utensils, category: "Nutrition", points: 1 },
  { key: "stretch",    label: "Stretched 10+ minutes",short: "Stretch",  icon: Activity, category: "Mobility",  points: 1 },
  { key: "exercise_1", label: "Exercise block 1",     short: "Ex 1",     icon: Dumbbell, category: "Movement",  points: 1 },
  { key: "exercise_2", label: "Exercise block 2",     short: "Ex 2",     icon: Zap,      category: "Movement",  points: 1 },
];

const CATEGORY_ORDER = ["Hydration", "Sleep", "Nutrition", "Mobility", "Movement"];

const PEOPLE = [
  { id: "p1", name: "Josh",  color: "blue",   emoji: "🪓", weight: true,  rate: 0.78 },
  { id: "p2", name: "Marie", color: "plum",   emoji: "🌿", weight: true,  rate: 0.84 },
  { id: "p3", name: "Caleb", color: "grass",  emoji: "🏃", weight: false, rate: 0.62 },
  { id: "p4", name: "Nora",  color: "amber",  emoji: "☀️", weight: true,  rate: 0.71 },
  { id: "p5", name: "Ben",   color: "tomato", emoji: "🔥", weight: false, rate: 0.45 },
  { id: "p6", name: "Ellie", color: "teal",   emoji: "🐬", weight: true,  rate: 0.88 },
  { id: "p7", name: "Sam",   color: "indigo", emoji: "🎧", weight: false, rate: 0.55 },
  { id: "p8", name: "Ruth",  color: "pink",   emoji: "🍓", weight: true,  rate: 0.67 },
];

const pad = (n) => String(n).padStart(2, "0");
const dstr = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return { y, m, d }; };
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
/** Day of week for a date string, computed without timezone drift. §6 */
const dow = (s) => { const { y, m, d } = parse(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const shiftDay = (s, delta) => {
  const { y, m, d } = parse(s);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return dstr(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const prettyDate = (s) => {
  const { y, m, d } = parse(s);
  const wd = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][dow(s)];
  return `${wd}, ${MONTHS[m - 1].slice(0, 3)} ${d}`;
};

const lcg = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

/** Deterministic September data so the mockup looks identical on every load. */
function buildLogs() {
  const logs = {};
  PEOPLE.forEach((p, pi) => {
    const rnd = lcg(9973 + pi * 7717);
    logs[p.id] = {};
    const last = parse(MOCK_TODAY).d;
    for (let d = 1; d <= last; d++) {
      if (rnd() > 0.93) continue; // an unlogged day
      const day = {};
      RULES.forEach((r, ri) => {
        const bias = r.key.startsWith("exercise") ? -0.16 : r.key === "stretch" ? -0.1 : 0.05;
        day[r.key] = rnd() < p.rate + bias + (ri === 0 ? 0.1 : 0) ? 1 : 0;
      });
      logs[p.id][dstr(2026, 9, d)] = day;
    }
  });
  return logs;
}

const dayPoints = (logs, pid, date) => {
  const d = logs[pid]?.[date];
  if (!d) return null; // null = never logged, distinct from a zero day. §8.4
  return RULES.reduce((s, r) => s + (d[r.key] || 0) * r.points, 0);
};
const maxPointsForDate = () => RULES.reduce((s, r) => s + r.points, 0); // §4.3

/* -------------------------------- confetti -------------------------------- */

/** The escalation curve. §11.1 — convex, so the bottom tiers are nearly free.
 *  ratio = pointsEarned / maxPointsForDate, so this survives rule changes. */
const TIERS = (ratio) => ({
  count: Math.round(5 + Math.pow(ratio, 2.2) * 46),
  spread: 28 + Math.pow(ratio, 1.6) * 62,
  velocity: 4.5 + Math.pow(ratio, 1.8) * 9,
  bursts: ratio >= 0.999 ? 3 : ratio > 0.8 ? 2 : 1,
  gold: ratio >= 0.999,
});

function ConfettiLayer({ engineRef, dark }) {
  const canvasRef = useRef(null);
  const parts = useRef([]);
  const raf = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr; canvas.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = () => {
      const r = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      parts.current = parts.current.filter((p) => p.life > 0);
      parts.current.forEach((p) => {
        p.vy += 0.14; p.vx *= 0.992; p.vy *= 0.992;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 1;
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 26);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      raf.current = requestAnimationFrame(loop);
    };
    // Pause entirely when the tab is hidden. §11.1
    const onVis = () => {
      if (document.hidden) { cancelAnimationFrame(raf.current); parts.current = []; }
      else raf.current = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVis);
    raf.current = requestAnimationFrame(loop);

    engineRef.current = (clientX, clientY, ratio, color) => {
      const r = canvas.getBoundingClientRect();
      const x = clientX - r.left, y = clientY - r.top;
      const t = TIERS(ratio);
      const palette = t.gold
        ? [color, "#FFFFFF", "#FFD34E", mix(color, "#FFFFFF", 0.5)]
        : [color, mix(color, "#FFFFFF", 0.35), mix(color, dark ? "#FFFFFF" : "#000000", 0.18)];
      for (let b = 0; b < t.bursts; b++) {
        setTimeout(() => {
          for (let i = 0; i < t.count; i++) {
            const spread = (t.spread * Math.PI) / 180;
            const a = -Math.PI / 2 + (Math.random() - 0.5) * spread;
            const v = t.velocity * (0.55 + Math.random() * 0.75);
            parts.current.push({
              x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
              w: 3 + Math.random() * 4, h: 5 + Math.random() * 5,
              rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35,
              life: 58 + Math.random() * 34,
              color: palette[(Math.random() * palette.length) | 0],
            });
          }
        }, b * 130);
      }
    };
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [engineRef, dark]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none", zIndex: 40 }} />;
}

/* ------------------------------- primitives ------------------------------- */

/** Pip meter — one segment per available point. §8.4 */
function Pips({ points, max, color, T, size = 4, gap = 2 }) {
  return (
    <div className="flex justify-center" style={{ gap }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: size, height: size, borderRadius: size,
          background: points !== null && i < points ? color : "transparent",
          border: points === null ? "none" : `1px solid ${points > i ? color : T.hairline}`,
          boxSizing: "border-box",
        }} />
      ))}
    </div>
  );
}

function Segmented({ options, value, onChange, T, small }) {
  return (
    <div className="flex rounded-full" style={{ background: T.surfaceAlt, padding: 3, border: `1px solid ${T.hairline}` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            className="flex-1 rounded-full transition"
            style={{
              padding: small ? "5px 10px" : "7px 12px",
              fontFamily: FONT_BODY, fontSize: small ? 11 : 12.5, fontWeight: 600,
              background: active ? T.surface : "transparent",
              color: active ? T.ink : T.muted,
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
              border: "none", cursor: "pointer", whiteSpace: "nowrap",
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionTitle({ children, T, kicker }) {
  return (
    <div className="flex items-baseline justify-between" style={{ marginBottom: 10 }}>
      <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em" }}>{children}</h3>
      {kicker && <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{kicker}</span>}
    </div>
  );
}

function Card({ children, T, style }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 16, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

/* --------------------------------- banner --------------------------------- */

function Banner({ person, T, isOwn, date, points, max, onPrev, onNext, isFuture }) {
  const base = PALETTE[person.color].hex;
  const bg = isOwn ? base : desat(base, T);
  const on = isOwn ? PALETTE[person.color].on : (T === THEMES.dark ? "#E8EBEC" : "#FFFFFF");
  return (
    <div style={{ position: "relative", background: bg, paddingTop: 18, paddingBottom: 14 }}>
      {/* Read-only stripe texture — never rely on color alone. §3.4 */}
      {!isOwn && (
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.10) 0 7px, transparent 7px 14px)`,
        }} />
      )}
      {isFuture && (
        <div className="absolute inset-0" style={{ border: `2px dashed ${on}`, opacity: 0.5, margin: 5, borderRadius: 10 }} />
      )}
      <div className="relative px-4">
        <div className="flex items-center justify-between">
          <div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, fontWeight: 600, color: on, opacity: 0.8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {isOwn ? "Your log" : (<span className="inline-flex items-center gap-1"><Lock size={11} /> Viewing {person.name}'s log</span>)}
            </div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 25, fontWeight: 700, color: on, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
              {prettyDate(date)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div style={{ fontFamily: FONT_MONO, fontSize: 20, fontWeight: 600, color: on }}>
              {points ?? 0}<span style={{ opacity: 0.6, fontSize: 14 }}>/{max}</span>
            </div>
            <div className="flex items-center justify-center rounded-full" style={{
              width: 34, height: 34, background: "rgba(255,255,255,0.22)", fontSize: 17,
            }}>{person.emoji}</div>
          </div>
        </div>
        <div className="flex items-center gap-1" style={{ marginTop: 12 }}>
          <NavBtn onClick={onPrev} on={on}><ChevronLeft size={16} /></NavBtn>
          <div className="flex-1 text-center" style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: on, opacity: 0.9 }}>
            {isFuture ? "Logging ahead" : date === MOCK_TODAY ? "Today" : "Earlier"}
          </div>
          <NavBtn onClick={onNext} on={on}><ChevronRight size={16} /></NavBtn>
        </div>
      </div>
    </div>
  );
}
const NavBtn = ({ children, onClick, on }) => (
  <button onClick={onClick} className="flex items-center justify-center rounded-full"
    style={{ width: 30, height: 30, background: "rgba(255,255,255,0.2)", color: on, border: "none", cursor: "pointer" }}>
    {children}
  </button>
);

/* ------------------------------- Today screen ----------------------------- */

function TodayScreen({ person, isOwn, T, dark, logs, setLogs, date, setDate, celebrate, onWeight, unlocked, setUnlocked }) {
  const color = PALETTE[person.color].hex;
  const max = maxPointsForDate();
  const day = logs[person.id]?.[date] || {};
  const points = RULES.reduce((s, r) => s + (day[r.key] || 0), 0);
  const editable = isOwn || unlocked;
  const isFuture = date > MOCK_TODAY;
  const loggedDays = Object.keys(logs[person.id] || {}).length;
  const complete = points === max;

  const toggle = (rule, e) => {
    if (!editable) return;
    const was = day[rule.key] || 0;
    const next = { ...(logs[person.id]?.[date] || {}), [rule.key]: was ? 0 : 1 };
    const newPoints = RULES.reduce((s, r) => s + (next[r.key] || 0), 0);
    setLogs((prev) => ({ ...prev, [person.id]: { ...prev[person.id], [date]: next } }));
    // Celebrate only on the way up, only on your own page. §11.1
    if (!was && isOwn) celebrate(e, newPoints / max, date, color);
  };

  return (
    <>
      <Banner person={person} T={T} isOwn={isOwn} date={date} points={points} max={max}
        onPrev={() => setDate(shiftDay(date, -1))} onNext={() => setDate(shiftDay(date, 1))} isFuture={isFuture} />

      {!isOwn && !unlocked && (
        <div className="px-4" style={{ paddingTop: 12 }}>
          <button onClick={() => setUnlocked(true)} className="w-full rounded-xl"
            style={{ padding: "11px 14px", background: T.surfaceAlt, border: `1px dashed ${T.hairline}`,
              color: T.muted, fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Log for {person.name}
          </button>
        </div>
      )}
      {!isOwn && unlocked && (
        <div style={{ background: "#FFB224", padding: "8px 16px", fontFamily: FONT_BODY, fontSize: 12, fontWeight: 700, color: "#1A1A1A" }}>
          Editing as {person.name} — not your log
        </div>
      )}

      <div className="px-4" style={{ paddingTop: 14, paddingBottom: 20 }}>
        <Card T={T}>
          {RULES.map((rule, i) => {
            const on = !!day[rule.key];
            const Icon = rule.icon;
            return (
              <button key={rule.key} onClick={(e) => toggle(rule, e)} disabled={!editable}
                className="w-full flex items-center gap-3 transition"
                style={{
                  height: 62, padding: "0 14px", border: "none",
                  borderTop: i === 0 ? "none" : `1px solid ${T.hairline}`,
                  background: on ? tint(color, T, 0.1) : "transparent",
                  cursor: editable ? "pointer" : "default", textAlign: "left",
                  opacity: editable ? 1 : 0.72,
                }}>
                <div className="flex items-center justify-center" style={{
                  width: 30, height: 30, borderRadius: 9,
                  background: on ? color : T.surfaceAlt,
                  color: on ? PALETTE[person.color].on : T.muted,
                  transition: "all 180ms cubic-bezier(.34,1.56,.64,1)",
                  transform: on ? "scale(1.04)" : "scale(1)",
                }}>
                  <Icon size={16} strokeWidth={2.2} />
                </div>
                <div className="flex-1 truncate" style={{
                  fontFamily: FONT_BODY, fontSize: 14.5, fontWeight: on ? 600 : 500,
                  color: on ? T.ink : mix(T.ink, T.muted, 0.35),
                }}>{rule.label}</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 600, color: on ? color : T.hairline, width: 22, textAlign: "right" }}>
                  {on ? "+1" : "—"}
                </div>
                <div className="flex items-center justify-center" style={{
                  width: 25, height: 25, borderRadius: 8,
                  border: `2px solid ${on ? color : T.hairline}`,
                  background: on ? color : "transparent",
                  transition: "all 180ms cubic-bezier(.34,1.56,.64,1)",
                }}>
                  {on && <Check size={14} strokeWidth={3.4} color={PALETTE[person.color].on} />}
                </div>
              </button>
            );
          })}
        </Card>

        {complete && isOwn && (
          <div className="flex items-center justify-between rounded-xl" style={{
            marginTop: 12, padding: "12px 14px", background: tint(color, T, 0.16),
            border: `1px solid ${tint(color, T, 0.35)}`,
          }}>
            <div className="flex items-center gap-2">
              <Flame size={17} color={color} />
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: 15.5, fontWeight: 700, color: T.ink }}>
                {max} / {max} — perfect day
              </span>
            </div>
          </div>
        )}

        {/* Weight — own page only, and never celebrated. §8.3 / §11.1 */}
        {person.weight && isOwn && (
          <button onClick={onWeight} className="w-full flex items-center gap-3 rounded-xl"
            style={{ marginTop: 12, padding: "13px 14px", background: T.surface,
              border: `1px solid ${T.hairline}`, cursor: "pointer" }}>
            <Scale size={17} color={T.muted} />
            <span className="flex-1 text-left" style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500, color: mix(T.ink, T.muted, 0.3) }}>
              Log today's weight
            </span>
            <ChevronRight size={16} color={T.muted} />
          </button>
        )}

        <div className="text-center" style={{ marginTop: 18, fontFamily: FONT_MONO, fontSize: 11, color: T.muted, letterSpacing: "0.04em" }}>
          {loggedDays} DAYS LOGGED IN SEPTEMBER
        </div>
      </div>
    </>
  );
}

/* ------------------------------ Calendar screen --------------------------- */

function CalendarScreen({ person, isOwn, T, logs, setDate, setScreen }) {
  const color = PALETTE[person.color].hex;
  const max = maxPointsForDate();
  const y = 2026, m = 9;
  const total = daysInMonth(y, m);
  const lead = dow(dstr(y, m, 1));
  const cells = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const monthPts = Object.entries(logs[person.id] || {}).reduce((s, [, d]) =>
    s + RULES.reduce((a, r) => a + (d[r.key] || 0), 0), 0);
  const logged = Object.keys(logs[person.id] || {}).length;

  return (
    <div className="px-4" style={{ paddingTop: 16, paddingBottom: 20 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 700, color: T.ink, letterSpacing: "-0.02em" }}>
          September
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center rounded-full" style={{ width: 26, height: 26, background: isOwn ? color : desat(color, T), fontSize: 13 }}>{person.emoji}</div>
          <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: T.ink }}>{person.name}</span>
        </div>
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.muted, marginBottom: 14, letterSpacing: "0.04em" }}>
        {monthPts} PTS · {logged} DAYS LOGGED
      </div>

      <Card T={T} style={{ padding: 10 }}>
        <div className="grid grid-cols-7" style={{ marginBottom: 6 }}>
          {DOW_LABELS.map((d, i) => (
            <div key={i} className="text-center" style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.muted, fontWeight: 600 }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7" style={{ gap: 3 }}>
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const ds = dstr(y, m, d);
            const pts = dayPoints(logs, person.id, ds);
            const future = ds > MOCK_TODAY;
            const isToday = ds === MOCK_TODAY;
            return (
              <button key={i} onClick={() => { setDate(ds); setScreen("today"); }}
                className="flex flex-col items-center justify-center rounded-lg"
                style={{
                  height: 44, cursor: "pointer", border: isToday ? `1.5px solid ${color}` : `1px solid ${pts !== null ? T.hairline : "transparent"}`,
                  background: pts !== null ? tint(color, T, 0.045 + (pts / max) * 0.12) : "transparent",
                  opacity: future ? 0.35 : 1,
                }}>
                <span style={{
                  fontFamily: FONT_MONO, fontSize: 11.5,
                  fontWeight: pts === max ? 700 : 500,
                  color: pts !== null ? T.ink : T.muted, marginBottom: 3,
                }}>{d}</span>
                <Pips points={future ? null : pts} max={max} color={color} T={T} size={3.5} gap={1.5} />
              </button>
            );
          })}
        </div>
      </Card>
      <p style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: T.muted, marginTop: 12, lineHeight: 1.5 }}>
        An outlined cell with hollow pips is a day logged at zero. A cell with no pips was never opened.
        That difference is the whole point of the treatment.
      </p>
    </div>
  );
}

/* ----------------------------- Standings screen --------------------------- */

function Ribbon({ logs, T, people }) {
  const max = maxPointsForDate();
  const days = parse(MOCK_TODAY).d;
  return (
    <Card T={T} style={{ padding: "12px 10px" }}>
      {people.map((p) => {
        const color = PALETTE[p.color].hex;
        return (
          <div key={p.id} className="flex items-center gap-2" style={{ marginBottom: 7 }}>
            <div className="flex items-center gap-1" style={{ width: 58, flexShrink: 0 }}>
              <span style={{ fontSize: 10 }}>{p.emoji}</span>
              <span className="truncate" style={{ fontFamily: FONT_BODY, fontSize: 10.5, fontWeight: 600, color: T.ink }}>{p.name}</span>
            </div>
            <div className="flex flex-1" style={{ gap: 1.5 }}>
              {Array.from({ length: days }).map((_, i) => {
                const ds = dstr(2026, 9, i + 1);
                const pts = dayPoints(logs, p.id, ds);
                return (
                  <div key={i} className="flex flex-col-reverse flex-1" style={{ gap: 1, height: 26 }}>
                    {Array.from({ length: max }).map((__, s) => (
                      <div key={s} style={{
                        flex: 1, borderRadius: 1,
                        background: pts !== null && s < pts ? color : (pts === null ? "transparent" : tint(color, T, 0.09)),
                        border: pts === null ? `0.5px solid ${T.hairline}` : "none",
                      }} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function StandingsScreen({ T, dark, logs, people, ownId, prizeMonthly }) {
  const [tab, setTab] = useState("month");
  const [selected, setSelected] = useState([ownId]);
  const max = maxPointsForDate();

  const totals = useMemo(() => people.map((p) => {
    const days = Object.entries(logs[p.id] || {});
    const pts = days.reduce((s, [, d]) => s + RULES.reduce((a, r) => a + (d[r.key] || 0), 0), 0);
    const byCat = {};
    CATEGORY_ORDER.forEach((c) => (byCat[c] = 0));
    days.forEach(([, d]) => RULES.forEach((r) => { byCat[r.category] += d[r.key] || 0; }));
    return { ...p, pts, byCat, days: days.length, avg: days.length ? pts / days.length : 0 };
  }).sort((a, b) => b.pts - a.pts), [logs, people]);

  const top = totals[0].pts;
  const tie = totals.filter((t) => t.pts === top).length > 1;

  /* Radar axes are COMPLETION RATE per rule, not raw points. Movement is worth
     two points a day and everything else one, so raw points would make Movement
     look dominant regardless of behavior. Percentages are comparable. §8.5 */
  const radarData = useMemo(() => RULES.map((r) => {
    const row = { rule: r.short };
    people.forEach((p) => {
      const days = Object.entries(logs[p.id] || {});
      const hit = days.reduce((s, [, d]) => s + (d[r.key] || 0), 0);
      row[p.id] = days.length ? Math.round((hit / days.length) * 100) : 0;
    });
    return row;
  }), [logs, people]);

  const toggleSel = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  /* Fills thin out as more people are layered so the shapes stay readable. */
  const fillOpacity = selected.length === 1 ? 0.32 : selected.length === 2 ? 0.2 : 0.1;

  return (
    <div className="px-4" style={{ paddingTop: 16, paddingBottom: 20 }}>
      <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 700, color: T.ink, letterSpacing: "-0.02em", marginBottom: 12 }}>
        Standings
      </h2>
      <Segmented T={T} value={tab} onChange={setTab} options={[
        { value: "month", label: "September" }, { value: "all", label: "All time" }, { value: "weight", label: "Weight" },
      ]} />

      {tab === "weight" ? (
        <div style={{ marginTop: 18 }}>
          <SectionTitle T={T} kicker={prizeMonthly.final}>Percent lost</SectionTitle>
          <Card T={T}>
            {people.filter((p) => p.weight).map((p, i, arr) => {
              const pct = [3.8, 2.9, 2.1, 0.7, -0.4][i] ?? 0;
              const color = PALETTE[p.color].hex;
              return (
                <div key={p.id} className="flex items-center gap-3" style={{
                  padding: "12px 14px", borderTop: i === 0 ? "none" : `1px solid ${T.hairline}`,
                }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.muted, width: 14 }}>{i + 1}</span>
                  <span style={{ fontSize: 14 }}>{p.emoji}</span>
                  <span className="flex-1" style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 600, color: T.ink }}>{p.name}</span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 600, color: pct >= 0 ? color : T.muted }}>
                    {pct >= 0 ? "" : ""}{pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </Card>
          <p style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: T.muted, marginTop: 10, lineHeight: 1.5 }}>
            Percentages only. Nobody's actual weight appears here, or anywhere outside their own page.
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 18 }}>
            <SectionTitle T={T} kicker={tab === "month" ? prizeMonthly.monthly : "6 months"}>Leaderboard</SectionTitle>
            <Card T={T}>
              {totals.map((p, i) => {
                const color = PALETTE[p.color].hex;
                const lead = p.pts === top;
                return (
                  <div key={p.id} className="flex items-center gap-2.5" style={{
                    padding: "11px 13px", borderTop: i === 0 ? "none" : `1px solid ${T.hairline}`,
                    background: lead ? tint(color, T, 0.09) : "transparent",
                  }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: lead ? color : T.muted, width: 18 }}>
                      {tie && lead ? "T1" : i + 1}
                    </span>
                    <span style={{ fontSize: 14 }}>{p.emoji}</span>
                    <div className="flex-1" style={{ minWidth: 0 }}>
                      <div className="truncate" style={{ fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: lead ? 700 : 600, color: T.ink }}>{p.name}</div>
                      <div className="rounded-full" style={{ height: 4, background: T.surfaceAlt, marginTop: 4, overflow: "hidden" }}>
                        <div style={{ width: `${(p.pts / top) * 100}%`, height: "100%", background: color, borderRadius: 4, transition: "width 600ms ease" }} />
                      </div>
                    </div>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 15, fontWeight: 600, color: T.ink }}>{p.pts}</span>
                  </div>
                );
              })}
            </Card>
            {tie && (
              <p style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: T.muted, marginTop: 8 }}>
                Tied — settle it as a family.
              </p>
            )}
          </div>

          <div style={{ marginTop: 22 }}>
            <SectionTitle T={T} kicker="signature">The ribbon</SectionTitle>
            <Ribbon logs={logs} T={T} people={people} />
            <p style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
              One column per day, six segments per column. Consistency and collapse are visible without
              reading a single number.
            </p>
          </div>

          <div style={{ marginTop: 22 }}>
            <SectionTitle T={T} kicker="% of days hit">Habit shape</SectionTitle>
            <Card T={T} style={{ padding: "6px 0 10px" }}>
              <ResponsiveContainer width="100%" height={232}>
                <RadarChart data={radarData} outerRadius="72%" margin={{ top: 12, right: 22, bottom: 6, left: 22 }}>
                  <PolarGrid stroke={T.hairline} />
                  <PolarAngleAxis dataKey="rule" tick={{ fontSize: 10.5, fill: T.muted, fontFamily: FONT_MONO }} />
                  <PolarRadiusAxis domain={[0, 100]} tickCount={5} axisLine={false}
                    tick={{ fontSize: 8.5, fill: mix(T.muted, T.surface, 0.45), fontFamily: FONT_MONO }} />
                  <Tooltip contentStyle={{
                    background: T.surface, border: `1px solid ${T.hairline}`, borderRadius: 10,
                    fontFamily: FONT_MONO, fontSize: 11, color: T.ink,
                  }} formatter={(v, n) => [`${v}%`, people.find((p) => p.id === n)?.name || n]} />
                  {selected.map((id) => {
                    const p = people.find((x) => x.id === id);
                    if (!p) return null;
                    const c = PALETTE[p.color].hex;
                    return (
                      <Radar key={id} dataKey={id} name={p.id} stroke={c} fill={c}
                        fillOpacity={fillOpacity} strokeWidth={2} isAnimationActive={false} />
                    );
                  })}
                </RadarChart>
              </ResponsiveContainer>
            </Card>

            <div className="flex flex-wrap" style={{ gap: 5, marginTop: 10 }}>
              {people.map((p) => {
                const on = selected.includes(p.id);
                const c = PALETTE[p.color].hex;
                return (
                  <button key={p.id} onClick={() => toggleSel(p.id)}
                    className="flex items-center gap-1.5 rounded-full transition"
                    style={{
                      padding: "5px 10px 5px 6px", cursor: "pointer",
                      background: on ? tint(c, T, 0.16) : "transparent",
                      border: `1px solid ${on ? c : T.hairline}`,
                      fontFamily: FONT_BODY, fontSize: 11.5, fontWeight: on ? 700 : 500,
                      color: on ? T.ink : T.muted,
                    }}>
                    <span className="flex items-center justify-center rounded-full" style={{
                      width: 15, height: 15, background: on ? c : "transparent",
                      border: on ? "none" : `1.5px solid ${T.hairline}`,
                    }}>
                      {on && <Check size={10} strokeWidth={3.6} color={PALETTE[p.color].on} />}
                    </span>
                    {p.emoji} {p.name}
                  </button>
                );
              })}
            </div>
            <p style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: T.muted, marginTop: 9, lineHeight: 1.5 }}>
              Each spoke is the share of logged days that habit was hit — not raw points, so Movement's
              two blocks don't distort the shape. You start on your own; add anyone to compare.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------ Device settings --------------------------- */

/** Take the last full grapheme so multi-codepoint emoji (skin tones, ZWJ
 *  sequences like 👨‍👩‍👧, flags) survive intact. Array.from would shred them. */
const lastGrapheme = (s) => {
  if (!s) return "";
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const parts = [...new Intl.Segmenter().segment(s)];
    return parts.length ? parts[parts.length - 1].segment : "";
  }
  const a = Array.from(s);
  return a.length ? a[a.length - 1] : "";
};

function IdentityEditor({ T, person, people, setPeople }) {
  const emojiRef = useRef(null);
  const taken = people.filter((p) => p.id !== person.id).map((p) => p.color);
  const update = (patch) => setPeople((ps) => ps.map((p) => (p.id === person.id ? { ...p, ...patch } : p)));
  const color = PALETTE[person.color].hex;

  return (
    <Card T={T}>
      {/* ---- emoji ---- */}
      <div style={{ padding: 14 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          Your emoji
        </div>
        <div className="flex items-center gap-3">
          <div onClick={() => emojiRef.current?.focus()}
            className="flex items-center justify-center rounded-full"
            style={{ width: 52, height: 52, background: color, cursor: "text", flexShrink: 0 }}>
            {/* A one-character text input. Focusing it opens the system keyboard;
                the person taps the emoji key. There is no web API to open the
                emoji panel directly, and a curated grid would only ever be a
                guess at what people want. */}
            <input
              ref={emojiRef}
              value={person.emoji}
              onChange={(e) => { const g = lastGrapheme(e.target.value); if (g) update({ emoji: g }); }}
              onFocus={(e) => e.target.select()}
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Your emoji"
              style={{
                width: 40, textAlign: "center", fontSize: 24, lineHeight: 1,
                background: "transparent", border: "none", outline: "none",
                caretColor: PALETTE[person.color].on, padding: 0,
              }}
            />
          </div>
          <p style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
            Tap the circle, then hit the emoji key on your keyboard. Anything goes — this is how
            people spot you in the ribbon.
          </p>
        </div>
      </div>

      <div style={{ height: 1, background: T.hairline }} />

      {/* ---- color ---- */}
      <div style={{ padding: 14 }}>
        <div className="flex items-baseline justify-between" style={{ marginBottom: 10 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Your color
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {person.color}
          </span>
        </div>
        <div className="grid grid-cols-8 justify-items-center" style={{ gap: 6 }}>
          {Object.entries(PALETTE).map(([key, val]) => {
            const isTaken = taken.includes(key);
            const isMine = person.color === key;
            const owner = people.find((p) => p.color === key && p.id !== person.id);
            return (
              <button key={key} disabled={isTaken} onClick={() => update({ color: key })}
                title={isTaken ? `Taken by ${owner?.name}` : key}
                aria-label={isTaken ? `${key}, taken by ${owner?.name}` : key}
                className="relative flex items-center justify-center rounded-full"
                style={{
                  width: 32, height: 32, cursor: isTaken ? "not-allowed" : "pointer",
                  background: val.hex,
                  opacity: isTaken ? 0.3 : 1,
                  border: isMine ? `2.5px solid ${T.ink}` : `1px solid ${T.hairline}`,
                  boxShadow: isMine ? `0 0 0 3px ${tint(val.hex, T, 0.28)}` : "none",
                  transition: "transform 140ms ease",
                  transform: isMine ? "scale(1.08)" : "scale(1)",
                  overflow: "hidden",
                }}>
                {isMine && <Check size={15} strokeWidth={3.6} color={val.on} />}
                {/* A strike, not an emoji. The grid stays a grid of colors. */}
                {isTaken && (
                  <span style={{
                    position: "absolute", width: "142%", height: 2,
                    background: T.ink, opacity: 0.55, transform: "rotate(-45deg)",
                  }} />
                )}
              </button>
            );
          })}
        </div>
        <p style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: T.muted, marginTop: 11, lineHeight: 1.5 }}>
          Struck-out colors are already taken — tap and hold to see by whom. Changing yours updates
          every screen at once: banner, calendar pips, ribbon, radar, and nav.
        </p>
      </div>
    </Card>
  );
}

function DeviceScreen({ T, celebration, setCelebration, themePref, setThemePref, reduced, onRecap, person, people, setPeople }) {
  return (
    <div className="px-4" style={{ paddingTop: 16, paddingBottom: 20 }}>
      <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 700, color: T.ink, letterSpacing: "-0.02em", marginBottom: 16 }}>
        This device
      </h2>

      <div style={{ marginBottom: 20 }}>
        <SectionTitle T={T}>Appearance</SectionTitle>
        <Segmented T={T} value={themePref} onChange={setThemePref} options={[
          { value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" },
        ]} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <SectionTitle T={T}>Celebrations</SectionTitle>
        <Segmented T={T} value={celebration} onChange={setCelebration} options={[
          { value: "full", label: "Full" }, { value: "subtle", label: "Subtle" }, { value: "off", label: "Off" },
        ]} />
        <p style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: T.muted, marginTop: 9, lineHeight: 1.5 }}>
          {reduced
            ? "Your system asks for reduced motion, so this started at Off."
            : "Each item you log raises the celebration a step. The last one is the big one."}
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <SectionTitle T={T} kicker="you">Identity</SectionTitle>
        <IdentityEditor T={T} person={person} people={people} setPeople={setPeople} />
      </div>

      <button onClick={onRecap} className="w-full rounded-xl flex items-center justify-center gap-2"
        style={{ padding: "12px", background: T.surfaceAlt, border: `1px solid ${T.hairline}`, cursor: "pointer",
          fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: T.ink }}>
        <Sparkles size={15} /> Preview the month recap
      </button>
      <p style={{ fontFamily: FONT_BODY, fontSize: 11, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
        In the real app this fires once, on the first of a new month.
      </p>
    </div>
  );
}

/* -------------------------------- overlays -------------------------------- */

function MonthRecap({ T, person, onClose, engineRef, celebration }) {
  const color = PALETTE[person.color].hex;
  useEffect(() => {
    if (celebration === "full" && engineRef.current) {
      setTimeout(() => engineRef.current(195, 300, 1, color), 260);
    }
  }, [celebration, engineRef, color]);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-8"
      style={{ background: T.paper, zIndex: 60 }}>
      <button onClick={onClose} className="absolute" style={{ top: 16, right: 16, background: "none", border: "none", cursor: "pointer" }}>
        <X size={20} color={T.muted} />
      </button>
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.14em", color: T.muted, textTransform: "uppercase" }}>
        September is done
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 76, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.04em", margin: "10px 0" }}>
        112
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 600, color: T.ink, textAlign: "center" }}>
        points last month
      </div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: T.muted, marginTop: 8, textAlign: "center" }}>
        Out of a possible 180, across 24 days logged.
      </div>
      <button onClick={onClose} className="rounded-full" style={{
        marginTop: 30, padding: "11px 28px", background: color, color: PALETTE[person.color].on,
        border: "none", cursor: "pointer", fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700,
      }}>
        On to October
      </button>
    </div>
  );
}

function WeightSheet({ T, person, onClose }) {
  const [w, setW] = useState(184.5);
  const color = PALETTE[person.color].hex;
  return (
    <div className="absolute inset-0 flex items-end" style={{ background: T.scrim, zIndex: 55 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full"
        style={{ background: T.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, color: T.ink }}>Weight for Sept 24</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color={T.muted} /></button>
        </div>
        <div className="flex items-center justify-center gap-4" style={{ marginBottom: 18 }}>
          <button onClick={() => setW((v) => +(v - 0.5).toFixed(1))} className="rounded-full" style={{ width: 42, height: 42, border: `1px solid ${T.hairline}`, background: T.surfaceAlt, color: T.ink, fontSize: 20, cursor: "pointer" }}>−</button>
          <div style={{ fontFamily: FONT_MONO, fontSize: 38, fontWeight: 600, color: T.ink, minWidth: 120, textAlign: "center" }}>{w.toFixed(1)}</div>
          <button onClick={() => setW((v) => +(v + 0.5).toFixed(1))} className="rounded-full" style={{ width: 42, height: 42, border: `1px solid ${T.hairline}`, background: T.surfaceAlt, color: T.ink, fontSize: 20, cursor: "pointer" }}>+</button>
        </div>
        <button onClick={onClose} className="w-full rounded-xl" style={{
          padding: 13, background: color, color: PALETTE[person.color].on, border: "none",
          cursor: "pointer", fontFamily: FONT_BODY, fontSize: 14.5, fontWeight: 700,
        }}>Save</button>
        <p style={{ fontFamily: FONT_BODY, fontSize: 11, color: T.muted, marginTop: 10, textAlign: "center" }}>
          No celebration fires here, in either direction.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------- shell --------------------------------- */

export default function App() {
  const [themePref, setThemePref] = useState("system");
  const [systemDark, setSystemDark] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [screen, setScreen] = useState("today");
  const [viewingId, setViewingId] = useState("p1");
  const [date, setDate] = useState(MOCK_TODAY);
  const [logs, setLogs] = useState(buildLogs);
  const [people, setPeople] = useState(PEOPLE);
  const [celebration, setCelebration] = useState("full");
  const [unlocked, setUnlocked] = useState(false);
  const [showWeight, setShowWeight] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [tiersFired, setTiersFired] = useState({});
  const engineRef = useRef(null);

  const OWN_ID = "p1";
  const person = people.find((p) => p.id === viewingId);
  const me = people.find((p) => p.id === OWN_ID);
  const isOwn = viewingId === OWN_ID;
  const dark = themePref === "system" ? systemDark : themePref === "dark";
  const T = dark ? THEMES.dark : THEMES.light;

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
    return () => { if (link.parentNode) document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystemDark(mq.matches);
    setReduced(rm.matches);
    if (rm.matches) setCelebration("off"); // §11.1 — OS already answered
    const a = (e) => setSystemDark(e.matches);
    const b = (e) => setReduced(e.matches);
    mq.addEventListener("change", a); rm.addEventListener("change", b);
    return () => { mq.removeEventListener("change", a); rm.removeEventListener("change", b); };
  }, []);

  useEffect(() => { setUnlocked(false); }, [viewingId]);

  /** Fire a tier at most once per logged date. §11.1 */
  const celebrate = useCallback((e, ratio, forDate, color) => {
    if (celebration === "off") return;
    if (celebration === "subtle" && ratio > 0.5) ratio = 0.5;
    const key = `${forDate}`;
    const already = tiersFired[key] || 0;
    if (ratio <= already) return;
    setTiersFired((p) => ({ ...p, [key]: ratio }));
    const r = e.currentTarget.getBoundingClientRect();
    engineRef.current?.(r.left + r.width - 34, r.top + r.height / 2, ratio, color);
  }, [celebration, tiersFired]);

  const NAV = [
    { key: "today", label: "Today", Icon: Check },
    { key: "calendar", label: "Calendar", Icon: CalendarDays },
    { key: "standings", label: "Standings", Icon: Trophy },
    { key: "device", label: "Device", Icon: SettingsIcon },
  ];

  return (
    <div className="w-full min-h-screen flex flex-col items-center" style={{
      background: dark ? "#08090A" : "#E4E6E3", fontFamily: FONT_BODY, padding: "20px 12px 40px",
      transition: "background 240ms ease",
    }}>
      {/* mockup chrome — not part of the app */}
      <div className="w-full max-w-sm" style={{ marginBottom: 14 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "0.12em", color: dark ? "#6E767C" : "#8A9096", textTransform: "uppercase" }}>
            Design mockup
          </span>
          <div className="flex" style={{ gap: 4 }}>
            {[["system", Monitor], ["light", Sun], ["dark", MoonStar]].map(([v, I]) => (
              <button key={v} onClick={() => setThemePref(v)} className="rounded-lg flex items-center justify-center"
                style={{
                  width: 30, height: 26, cursor: "pointer",
                  background: themePref === v ? (dark ? "#22262A" : "#FFFFFF") : "transparent",
                  border: `1px solid ${themePref === v ? (dark ? "#343A3F" : "#CDD1CD") : "transparent"}`,
                  color: themePref === v ? (dark ? "#E8EBEC" : "#16191C") : (dark ? "#6E767C" : "#8A9096"),
                }}>
                <I size={13} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap" style={{ gap: 5 }}>
          {people.slice(0, 4).map((p) => (
            <button key={p.id} onClick={() => { setViewingId(p.id); setScreen("today"); }}
              className="rounded-full flex items-center gap-1"
              style={{
                padding: "4px 10px", cursor: "pointer", fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600,
                background: viewingId === p.id ? PALETTE[p.color].hex : (dark ? "#191C1F" : "#F5F6F4"),
                color: viewingId === p.id ? PALETTE[p.color].on : (dark ? "#8A9196" : "#6C7278"),
                border: `1px solid ${viewingId === p.id ? PALETTE[p.color].hex : (dark ? "#2C3135" : "#D6DAD6")}`,
              }}>
              {p.emoji} {p.name}{p.id === OWN_ID ? " (you)" : ""}
            </button>
          ))}
        </div>
      </div>

      {/* phone */}
      <div className="w-full max-w-sm relative overflow-hidden flex flex-col" style={{
        background: T.paper, borderRadius: 26, height: 780,
        border: `1px solid ${dark ? "#2A2E32" : "#CDD1CD"}`,
        boxShadow: dark ? "0 20px 60px rgba(0,0,0,0.6)" : "0 20px 60px rgba(20,24,28,0.16)",
        transition: "background 240ms ease",
      }}>
        <div className="flex-1 overflow-y-auto">
          {screen === "today" && (
            <TodayScreen person={person} isOwn={isOwn} T={T} dark={dark} logs={logs} setLogs={setLogs}
              date={date} setDate={setDate} celebrate={celebrate} onWeight={() => setShowWeight(true)}
              unlocked={unlocked} setUnlocked={setUnlocked} />
          )}
          {screen === "calendar" && (
            <CalendarScreen person={person} isOwn={isOwn} T={T} logs={logs} setDate={setDate} setScreen={setScreen} />
          )}
          {screen === "standings" && (
            <StandingsScreen T={T} dark={dark} logs={logs} people={people} ownId={OWN_ID}
              prizeMonthly={{ monthly: "$25", final: "$50" }} />
          )}
          {screen === "device" && (
            <DeviceScreen T={T} celebration={celebration} setCelebration={setCelebration}
              themePref={themePref} setThemePref={setThemePref} reduced={reduced}
              onRecap={() => setShowRecap(true)} person={me} people={people} setPeople={setPeople} />
          )}
        </div>

        <div className="flex" style={{ background: T.surface, borderTop: `1px solid ${T.hairline}`, paddingBottom: 6 }}>
          {NAV.map(({ key, label, Icon }) => {
            const active = screen === key;
            const c = active ? PALETTE[me.color].hex : T.muted;
            return (
              <button key={key} onClick={() => setScreen(key)} className="flex-1 flex flex-col items-center"
                style={{ padding: "9px 0 5px", background: "none", border: "none", cursor: "pointer", color: c }}>
                <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                <span style={{ fontFamily: FONT_BODY, fontSize: 10, fontWeight: active ? 700 : 500, marginTop: 3 }}>{label}</span>
              </button>
            );
          })}
        </div>

        {showWeight && <WeightSheet T={T} person={person} onClose={() => setShowWeight(false)} />}
        {showRecap && (
          <MonthRecap T={T} person={me} onClose={() => setShowRecap(false)}
            engineRef={engineRef} celebration={celebration} />
        )}
        <ConfettiLayer engineRef={engineRef} dark={dark} />
      </div>

      <p className="max-w-sm text-center" style={{
        fontFamily: FONT_BODY, fontSize: 11.5, lineHeight: 1.6, marginTop: 16,
        color: dark ? "#6E767C" : "#7C8288",
      }}>
        Tap Josh's checkboxes one at a time to feel the escalation. Switch to Marie for the read-only
        treatment. On Device, change your color or emoji and watch it propagate to every screen.
      </p>
    </div>
  );
}
