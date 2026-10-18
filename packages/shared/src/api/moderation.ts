import type { UserSummary } from './users';

export const REPORT_REASONS = ['SPAM', 'HARASSMENT', 'NUDITY', 'VIOLENCE', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Distinct reporters needed before a video is hidden automatically, pending review. */
export const AUTO_HIDE_REPORT_THRESHOLD = 5;

export type ReportRequest = {
  reason: ReportReason;
  details?: string;
};

/** Open reports grouped by what was reported. */
export type ReportGroupDto = {
  target:
    | { type: 'video'; id: string; hidden: boolean }
    | { type: 'comment'; id: string; videoId: string };
  owner: UserSummary;
  reportCount: number;
  reasons: Partial<Record<ReportReason, number>>;
  latestDetails: string | null;
  firstReportedAt: string;
  lastReportedAt: string;
};

export type ResolveReportsRequest = { videoId: string } | { commentId: string };

export type DeleteAccountRequest = {
  /** Re-entered as confirmation. */
  password: string;
};

export type CreatorStats = {
  totals: { views: number; likes: number; comments: number; followers: number; videos: number };
  /** New followers per UTC day, oldest first, for the last 7 days including today. */
  followerGains: { date: string; count: number }[];
};
