import { REPORT_REASONS, type ReportReason, type UserSummary } from '@app/shared';
import { notify, showSheet } from './ActionSheet';
import { errorMessage } from './States';

const REASON_LABELS: Record<ReportReason, string> = {
  SPAM: 'Spam or scam',
  HARASSMENT: 'Harassment or bullying',
  NUDITY: 'Nudity or sexual content',
  VIOLENCE: 'Violence or dangerous acts',
  OTHER: 'Something else',
};

const REASON_LABELS_IN_ORDER = REPORT_REASONS.map((r) => [r, REASON_LABELS[r]] as const);

/** Reason picker, then the report itself. Reporting twice is harmless (the API keeps one). */
export function openReportSheet(
  what: 'video' | 'comment',
  send: (r: ReportReason) => Promise<void>,
) {
  showSheet({
    title: `Why are you reporting this ${what}?`,
    options: REASON_LABELS_IN_ORDER.map(([reason, label]) => ({
      label,
      onPress: () =>
        send(reason).then(
          () => notify('Thanks for letting us know', 'Our team will review it.'),
          (err) => notify('Could not send report', errorMessage(err)),
        ),
    })),
  });
}

export function confirmBlock(user: UserSummary, block: () => Promise<unknown>) {
  showSheet({
    title: `Block @${user.username}?`,
    message:
      'You won’t see each other’s videos or comments, and neither of you can follow the other.',
    options: [
      {
        label: 'Block',
        destructive: true,
        onPress: () =>
          block().then(
            () =>
              notify(`@${user.username} is blocked`, 'You can unblock them from their profile.'),
            (err) => notify('Could not block', errorMessage(err)),
          ),
      },
    ],
  });
}

export function confirmDestructive(title: string, label: string, run: () => Promise<unknown>) {
  showSheet({
    title,
    options: [
      {
        label,
        destructive: true,
        onPress: () => run().catch((err) => notify('Something went wrong', errorMessage(err))),
      },
    ],
  });
}
