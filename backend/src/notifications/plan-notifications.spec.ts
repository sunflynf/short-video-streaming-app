import { planNotifications } from './plan-notifications.js';

const summary = (plans: ReturnType<typeof planNotifications>) =>
  plans.map((p) => `${p.type}->${p.recipientId}`);

describe('planNotifications', () => {
  it('notifies the followed user', () => {
    expect(
      summary(planNotifications({ kind: 'follow', followerId: 'a', followingId: 'b' })),
    ).toEqual(['FOLLOW->b']);
  });

  it('notifies the video author of a like, deduped', () => {
    const plans = planNotifications({ kind: 'like', actorId: 'a', videoId: 'v', authorId: 'b' });
    expect(plans).toEqual([
      { recipientId: 'b', actorId: 'a', type: 'LIKE', videoId: 'v', dedupe: true },
    ]);
  });

  it.each([
    ['comment on someone else’s video', undefined, 'b', ['COMMENT->b']],
    ['comment on your own video', undefined, 'a', []],
    ['reply to a third person on b’s video', 'c', 'b', ['REPLY->c', 'COMMENT->b']],
    ['reply to the video author', 'b', 'b', ['REPLY->b']],
    ['reply to yourself on b’s video', 'a', 'b', ['COMMENT->b']],
    ['reply to c on your own video', 'c', 'a', ['REPLY->c']],
  ])('%s', (_name, parentAuthorId, videoAuthorId, expected) => {
    const plans = planNotifications({
      kind: 'comment',
      actorId: 'a',
      videoId: 'v',
      videoAuthorId: videoAuthorId as string,
      commentId: 'c1',
      ...(parentAuthorId && { parentAuthorId: parentAuthorId as string }),
    });
    expect(summary(plans)).toEqual(expected);
    expect(plans.every((p) => p.commentId === 'c1' && !p.dedupe)).toBe(true);
  });

  it('never notifies someone about their own follow or like', () => {
    expect(planNotifications({ kind: 'follow', followerId: 'a', followingId: 'a' })).toEqual([]);
    expect(planNotifications({ kind: 'like', actorId: 'a', videoId: 'v', authorId: 'a' })).toEqual(
      [],
    );
  });
});
