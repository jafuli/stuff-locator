// Retrieves a real password-recovery link from the local Supabase stack's
// own email-testing relay (Mailpit, see supabase/config.toml's
// [local_smtp]) — the same "no way to fake Supabase Auth" stance
// supabase-test-client.ts already takes, applied to the one extra hop this
// flow adds (an actual emailed link, not just a signed-in session).
//
// Mailpit's web UI/API port is fixed at 54324 in supabase/config.toml —
// same local stack, same fixed local ports as everywhere else this app's
// tooling assumes (the dev server's own 3000, Supabase's own 54321), so
// this isn't read from an env var.
const MAILPIT_URL = "http://127.0.0.1:54324";

interface MailpitMessageSummary {
  ID: string;
}

interface MailpitSearchResponse {
  messages: MailpitMessageSummary[];
}

interface MailpitMessageDetail {
  Text: string;
}

/**
 * Polls Mailpit for the most recent message sent to `email` and extracts
 * the first http(s) link from its plain-text body. Supabase's local stack
 * queues the email synchronously as part of handling the API request that
 * triggers it, but delivery into Mailpit's own store is a separate step —
 * a short poll (rather than a single immediate read) absorbs that gap
 * without hardcoding a fixed sleep.
 */
export async function fetchLatestLinkForEmail(email: string, maxAttempts = 20): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const searchResponse = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    if (searchResponse.ok) {
      const searchResult = (await searchResponse.json()) as MailpitSearchResponse;
      // .at(0), not [0]: TS types plain index access on an array as always
      // defined (this repo doesn't enable noUncheckedIndexedAccess), which
      // would make the `if (latest)` check below look redundant to the
      // type checker even though an empty `messages` array is the whole
      // point of polling here. .at(0) is correctly typed as possibly
      // `undefined` regardless.
      const latest = searchResult.messages.at(0);
      if (latest) {
        const messageResponse = await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`);
        const message = (await messageResponse.json()) as MailpitMessageDetail;
        const match = /https?:\/\/\S+/.exec(message.Text);
        if (match) {
          return match[0];
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `No email with a link arrived for ${email} within ${String(maxAttempts)} attempts — is the local ` +
      "Supabase stack's Mailpit relay running (npm run supabase:start)?",
  );
}
