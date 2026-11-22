// Deterministic fit score for Ujwal's profile: ICT / network engineering student in Rome,
// Python + web systems, speech/ML research (DASER-Net), space tech; junior/intern level.
// Every point comes with a reason so the score can be inspected.

export type FitInput = {
  title: string;
  company?: string | null;
  location?: string | null;
  italy_status?: string | null;
  experience_level?: string | null;
  compensation?: string | null;
  description_excerpt?: string | null;
  first_seen?: string | null;
  posted?: string | null;
};

export type FitReason = { label: string; delta: number };
export type Fit = { score: number; reasons: FitReason[] };

const SKILLS: Array<[RegExp, string, number]> = [
  [/\b(network(ing)?|noc|sysadmin|system administrator|infrastructure|devops|sre|site reliability|cloud|linux)\b/i, "Networks / infra", 14],
  [/\b(python|backend|back-end|api|django|fastapi)\b/i, "Python / backend", 11],
  [/\b(machine learning|\bml\b|llm|ai\b|deep learning|speech|audio|nlp|emotion)\b/i, "AI / ML / speech", 12],
  [/\b(full-?stack|next\.?js|react|typescript|web developer|frontend|front-end)\b/i, "Web systems", 7],
  [/\b(space|satellite|aerospace|esa|orbital)\b/i, "Space tech", 7],
  [/\b(data engineer|data analyst|data scien|sql)\b/i, "Data", 5],
  [/\b(it support|help ?desk|technical support|service desk)\b/i, "IT support", 6],
];

export function fitScore(j: FitInput, now = Date.now()): Fit {
  const reasons: FitReason[] = [];
  const add = (label: string, delta: number) => reasons.push({ label, delta });
  const text = `${j.title} ${j.description_excerpt ?? ""}`;
  const loc = j.location ?? "";

  // Where: can he actually do it from Rome?
  const italy = j.italy_status ?? (/\b(rome|roma|italy|italia|milan|milano)\b/i.test(loc) ? "confirmed" : "unknown");
  if (italy === "confirmed") add("Open from Italy", 30);
  else if (italy === "possible") add("Maybe open from Italy", 14);
  else if (italy === "excluded") add("Not open from Italy", -45);
  else add("Location unclear", 6);

  // What: overlap with his skills (capped)
  let skill = 0;
  for (const [re, label, pts] of SKILLS) {
    if (re.test(text) && skill < 38) {
      const p = Math.min(pts, 38 - skill);
      skill += p;
      add(label, p);
    }
  }
  if (!skill) add("No skill overlap found", 0);

  // Level
  const lvl = `${j.experience_level ?? ""} ${j.title}`.toLowerCase();
  if (/\b(intern|internship|tirocin|graduate|new grad|entry|junior|jr\.?|trainee|apprentice)\b/.test(lvl)) add("Entry level", 16);
  else if (/\b(principal|staff|director|head of|vp|chief|lead)\b/.test(lvl)) add("Too senior", -25);
  else if (/\b(senior|sr\.?)\b/.test(lvl)) add("Senior role", -12);
  else add("Level not stated", 4);

  if (j.compensation) add("Pay stated", 5);
  if (/\b(unpaid|volunteer)\b/i.test(text)) add("Unpaid", -15);

  const seen = Date.parse(j.first_seen ?? j.posted ?? "");
  if (Number.isFinite(seen) && now - seen < 7 * 86400000) add("New this week", 5);

  const raw = reasons.reduce((s, r) => s + r.delta, 0);
  return { score: Math.max(0, Math.min(100, Math.round(raw))), reasons };
}

export function fitBand(score: number): "strong" | "good" | "weak" {
  return score >= 60 ? "strong" : score >= 40 ? "good" : "weak";
}
