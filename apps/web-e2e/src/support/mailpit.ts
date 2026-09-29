import { expect } from '@playwright/test';

const MAILPIT = 'http://localhost:8025/api/v1';

interface MessageSummary {
  ID: string;
}

/**
 * Waits for an e-mail to `to` with a link to `/{path}/{token}` and returns that path,
 * e.g. `/zaproszenie/abc`, to open against the app's baseURL.
 */
export async function linkSentTo(
  to: string,
  path: 'zaproszenie' | 'reset-hasla',
): Promise<string> {
  const pattern = new RegExp(`https?://[^/\\s]+(/${path}/[\\w-]+)`);
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${to}"`);
        const search = (await (
          await fetch(`${MAILPIT}/search?query=${query}`)
        ).json()) as { messages: MessageSummary[] };
        for (const { ID } of search.messages) {
          const message = (await (
            await fetch(`${MAILPIT}/message/${ID}`)
          ).json()) as { Text: string };
          link = pattern.exec(message.Text)?.[1];
          if (link) return link;
        }
        return undefined;
      },
      { message: `an e-mail to ${to} with a /${path}/ link`, timeout: 15_000 },
    )
    .toBeTruthy();
  return link as string;
}
