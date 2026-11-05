// Types de la base RankPilot. Lovable/Supabase peuvent régénérer ce fichier : gardez les tables seo_*.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type SeoProject = {
  id: string;
  user_id: string;
  name: string;
  domain: string;
  created_at: string;
};
export type SeoAudit = {
  id: string;
  project_id: string;
  user_id: string;
  status: "running" | "completed" | "failed";
  max_pages: number;
  pages_crawled: number;
  health_score: number | null;
  issue_counts: Record<string, number>;
  site_info: Json;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};
export type SeoAuditPage = {
  id: string;
  audit_id: string;
  user_id: string;
  url: string;
  crawled: boolean;
  status_code: number | null;
  depth: number;
  title: string | null;
  meta_description: string | null;
  h1_count: number | null;
  word_count: number | null;
  canonical: string | null;
  noindex: boolean | null;
  response_ms: number | null;
  internal_links: Json;
  data: Json;
};
export type SeoAuditIssue = {
  id: string;
  audit_id: string;
  user_id: string;
  url: string;
  code: string;
  severity: "critical" | "warning" | "notice";
  detail: string | null;
};

export type SeoKeyword = {
  id: string;
  user_id: string;
  project_id: string | null;
  keyword: string;
  intent: string;
  cluster: string | null;
  notes: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      seo_projects: Table<
        SeoProject,
        Pick<SeoProject, "name" | "domain" | "user_id"> & Partial<SeoProject>
      >;
      seo_audits: Table<SeoAudit, Pick<SeoAudit, "project_id" | "user_id"> & Partial<SeoAudit>>;
      seo_audit_pages: Table<
        SeoAuditPage,
        Pick<SeoAuditPage, "audit_id" | "user_id" | "url"> & Partial<SeoAuditPage>
      >;
      seo_keywords: Table<
        SeoKeyword,
        Pick<SeoKeyword, "user_id" | "keyword"> & Partial<SeoKeyword>
      >;
      seo_audit_issues: Table<
        SeoAuditIssue,
        Pick<SeoAuditIssue, "audit_id" | "user_id" | "url" | "code" | "severity"> &
          Partial<SeoAuditIssue>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
