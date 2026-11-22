"use client";

import { useEffect, useRef } from "react";

/**
 * DEVAN's orb: a breathing, glowing sphere that leans toward the pointer and
 * pulses when `active` (e.g. while DEVAN is thinking or listening).
 * Canvas-based, one rAF loop, paused when the tab is hidden, static under reduced motion.
 */
export default function Orb({ size = 220, active = false }: { size?: number; active?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;
    let tx = 0, ty = 0, px = 0, py = 0;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
      ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
    };
    window.addEventListener("pointermove", onMove);

    const particles = Array.from({ length: 70 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 0.25 + Math.random() * 0.2,
      s: 0.002 + Math.random() * 0.006,
      z: Math.random(),
    }));

    const draw = () => {
      t += activeRef.current ? 0.035 : 0.012;
      px += (tx - px) * 0.05;
      py += (ty - py) * 0.05;
      const c = size / 2;
      const breathe = 1 + Math.sin(t) * (activeRef.current ? 0.06 : 0.025);
      const R = size * 0.28 * breathe;
      const cx = c + px * size * 0.06;
      const cy = c + py * size * 0.06;
      ctx.clearRect(0, 0, size, size);

      // outer glow
      const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.9);
      glow.addColorStop(0, "rgba(142,197,255,0.55)");
      glow.addColorStop(0.45, "rgba(142,197,255,0.12)");
      glow.addColorStop(1, "rgba(142,197,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.9, 0, Math.PI * 2); ctx.fill();

      // core sphere with a moving highlight
      const hx = cx - R * 0.35 + Math.cos(t * 0.7) * R * 0.1;
      const hy = cy - R * 0.35 + Math.sin(t * 0.9) * R * 0.1;
      const core = ctx.createRadialGradient(hx, hy, R * 0.05, cx, cy, R);
      core.addColorStop(0, "rgba(255,255,255,0.95)");
      core.addColorStop(0.35, "rgba(142,197,255,0.9)");
      core.addColorStop(1, "rgba(20,40,80,0.95)");
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // orbiting motes
      for (const p of particles) {
        p.a += p.s * (activeRef.current ? 3 : 1);
        const rr = size * p.r * breathe;
        const x = cx + Math.cos(p.a) * rr;
        const y = cy + Math.sin(p.a) * rr * 0.55;
        ctx.fillStyle = p.z > 0.85 ? "rgba(230,255,58,0.9)" : `rgba(142,197,255,${0.25 + p.z * 0.5})`;
        ctx.beginPath(); ctx.arc(x, y, 0.6 + p.z * 1.4, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVis);
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [size]);

  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />;
}
