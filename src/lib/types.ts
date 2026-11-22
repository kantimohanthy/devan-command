export type JobStatus = "to_apply" | "in_progress" | "applied" | "interview" | "offer" | "rejected" | "skipped";

export type Job = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  mode: "onsite" | "hybrid" | "remote";
  contract: string | null;
  url: string | null;
  posted: string | null;
  status: JobStatus;
  applied_at: string | null;
};

export type Note = { id: string; body: string; created_at: string };
export type Notification = { id: string; kind: string; title: string; body: string | null; created_at: string; read_at: string | null };

export const STATUS_LABEL: Record<JobStatus, string> = {
  to_apply: "To apply",
  in_progress: "In progress",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  skipped: "Skipped",
};
