export type AdvisorySeverity = "critical" | "high" | "medium" | "low" | "unknown";

export type AdvisoryItem = {
  id: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
  source: string;
  severity: AdvisorySeverity;
  matchedKeywords: string[];
  stackRelevant: boolean;
};

export type AdvisoriesResult = {
  fetchedAt: string;
  items: AdvisoryItem[];
  stackItems: AdvisoryItem[];
  errors: string[];
  sources: { id: string; label: string; url: string }[];
};
