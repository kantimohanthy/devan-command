// A listing as one source describes it, before matching against DEVAN's jobs.
export type Listing = {
  sourceSlug: string;
  externalId: string; // stable id inside that source
  title: string;
  company: string;
  discoveryUrl: string | null; // where DEVAN found it (board page)
  officialUrl: string | null; // employer requisition / application link
  locationText: string | null; // original wording
  countryRestrictions: string[] | null; // explicit list from structured data; [] = source says worldwide
  timezoneText: string | null;
  remote: boolean | null;
  employmentType: string | null;
  seniority: string | null;
  salaryText: string | null; // original wording, never inferred
  descriptionText: string; // plain text, untrusted
  postedAt: string | null;
  expiresAt: string | null;
  original: Record<string, unknown>; // trimmed original fields for evidence
};

export type ItalyStatus = "confirmed" | "possible" | "excluded" | "unknown";

export type Eligibility = {
  italy: ItalyStatus;
  office: "remote" | "hybrid" | "onsite" | "unknown";
  remoteCountries: string[] | null;
  officeLocation: string | null;
  timezone: string | null;
  relocation: string | null;
  sponsorship: string | null;
  evidence: string[];
};

export type AdapterResult = {
  listings: Listing[];
  complete: boolean; // true only when the source's full current list was read
  fetched: number;
  filteredOut: number;
  message?: string;
};
