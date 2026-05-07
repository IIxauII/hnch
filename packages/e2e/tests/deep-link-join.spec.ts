import { test, expect } from './fixtures/app.fixture';
import { BASE_URL, JOIN, ONBOARDING } from './fixtures/helpers';

test.describe('Deep-link join (/join?code=...)', () => {
  test('pre-fills code and joins when navigating via deep link', async ({ host, player }) => {
    const code = await host.createSession();

    // Player joins via deep link
    await player.joinViaDeepLink(code);

    // Both see each other
    await host.expectParticipantCount(2);
    await player.expectParticipantCount(2);
  });
});
