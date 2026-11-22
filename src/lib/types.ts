export type JobStatus = "to_apply" | "in_progress" | "applied" | "interview" | "offer" | "rejected" | "skipped";

export type JobSourceLink = {
  source_slug: string;
  external_id: string;
  discovery_url: string | null;
  official_url: string | null;
  first_seen: string;
  last_seen: string;
};

export type SponsorCheck = {
  matched_name: string | null;
  town: string | null;
  rating: string | null;
  route: string | null;
  register_file: string | null;
  confidence: "exact" | "probable" | "none";
  needs_review: boolean;
  candidates: { name: string; town: string }[] | null;
  checked_at: string;
};

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
  official_url?: string | null;
  shortlisted?: boolean | null;
  italy_status?: "confirmed" | "possible" | "excluded" | "unknown" | null;
  eligibility?: {
    office?: string;
    remoteCountries?: string[] | null;
    officeLocation?: string | null;
    timezone?: string | null;
    relocation?: string | null;
    sponsorship?: string | null;
    sponsorStance?: string;
    evidence?: string[];
  } | null;
  compensation?: string | null;
  sponsorship?: string | null;
  experience_level?: string | null;
  employment_type?: string | null;
  description_excerpt?: string | null;
  listing_expires_at?: string | null;
  first_seen?: string | null;
  last_checked?: string | null;
  source_status?: string | null;
  sources?: string[];
  links?: JobSourceLink[];
  sponsorCheck?: SponsorCheck | null;
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

export const ITALY_LABEL = {
  confirmed: { text: "Confirmed open from Italy", tone: "border-volt/60 text-volt" },
  possible: { text: "Possibly open from Italy", tone: "border-sky/60 text-sky" },
  excluded: { text: "Not open from Italy", tone: "border-maroon text-[#ff9aa8]" },
  unknown: { text: "Italy eligibility unknown", tone: "border-line text-mist" },
} as const;
