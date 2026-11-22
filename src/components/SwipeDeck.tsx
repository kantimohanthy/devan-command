"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { setJobStatus } from "@/app/actions";
import type { Job } from "@/lib/types";

/** Tinder-style deck over "to apply" jobs. Right = move to In progress (prepare & apply), left = skip. */
export default function SwipeDeck({ jobs }: { jobs: Job[] }) {
  const [queue, setQueue] = useState(jobs);
  const [, start] = useTransition();
  const top = queue[0];

  const decide = (job: Job, dir: "left" | "right") => {
    setQueue((q) => q.filter((j) => j.id !== job.id));
    start(() => setJobStatus(job.id, dir === "right" ? "in_progress" : "skipped"));
    if (dir === "right" && job.url) window.open(job.url, "_blank", "noopener,noreferrer");
  };

  if (!top) {
    return (
      <div className="card flex h-72 items-center justify-center p-6 text-center text-mist">
        Deck clear. DEVAN will deal new cards as it finds jobs.
      </div>
    );
  }

  return (
    <div className="relative h-80">
      <AnimatePresence>
        {queue.slice(0, 3).reverse().map((job, i, arr) => (
          <Card key={job.id} job={job} depth={arr.length - 1 - i} onDecide={decide} />
        ))}
      </AnimatePresence>
      <div className="absolute -bottom-14 left-0 right-0 flex justify-center gap-4">
        <button onClick={() => decide(top, "left")} className="press rounded-full border border-line px-6 py-2 text-mist hover:border-maroon">
          ← Skip
        </button>
        <button onClick={() => decide(top, "right")} className="press rounded-full bg-volt px-6 py-2 font-semibold text-void">
          Apply →
        </button>
      </div>
    </div>
  );
}

function Card({ job, depth, onDecide }: { job: Job; depth: number; onDecide: (j: Job, d: "left" | "right") => void }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const applyGlow = useTransform(x, [0, 140], [0, 1]);
  const skipGlow = useTransform(x, [-140, 0], [1, 0]);
  return (
    <motion.div
      className="card absolute inset-0 flex cursor-grab flex-col justify-between p-6 active:cursor-grabbing"
      style={{ x, rotate, zIndex: 10 - depth }}
      initial={{ scale: 0.95, y: 12, opacity: 0 }}
      animate={{ scale: 1 - depth * 0.04, y: depth * 10, opacity: 1 }}
      exit={{ x: x.get() >= 0 ? 400 : -400, opacity: 0, transition: { duration: 0.25 } }}
      drag={depth === 0 ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 120) onDecide(job, "right");
        else if (info.offset.x < -120) onDecide(job, "left");
      }}
    >
      <motion.div style={{ opacity: applyGlow }} className="pointer-events-none absolute inset-0 rounded-[1.25rem] ring-2 ring-volt" />
      <motion.div style={{ opacity: skipGlow }} className="pointer-events-none absolute inset-0 rounded-[1.25rem] ring-2 ring-maroon" />
      <div>
        <p className="text-xs uppercase tracking-widest text-sky">{job.mode}{job.contract ? ` · ${job.contract}` : ""}</p>
        <h3 className="mt-3 text-2xl font-semibold leading-tight">{job.title}</h3>
        <p className="mt-2 text-mist">{job.company}</p>
        {job.location && <p className="text-sm text-mist">{job.location}</p>}
      </div>
      <p className="text-xs text-mist">{job.posted ? `Posted ${job.posted}` : "Date unknown"} · drag right to apply, left to skip</p>
    </motion.div>
  );
}
