import { MARKER } from './render.ts';

/** The REST API calls the comment step makes, with the token it is given. */
export class GitHub {
  private readonly token: string;
  private readonly apiUrl: string;
  private readonly fetch: typeof fetch;

  constructor(token: string, apiUrl: string, fetchImpl: typeof fetch = fetch) {
    this.token = token;
    this.apiUrl = apiUrl.replace(/\/+$/, '');
    this.fetch = fetchImpl;
  }

  async request(method: 'GET' | 'POST' | 'PATCH', route: string, body?: unknown): Promise<unknown> {
    const response = await this.fetch(`${this.apiUrl}${route}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.token}`,
        'x-github-api-version': '2022-11-28',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `GitHub answered ${method} ${route} with ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }
    return response.json();
  }

  /** The commit a pull request's head is at now. */
  async headOf(repository: string, number: number): Promise<string> {
    const pull = (await this.request('GET', `/repos/${repository}/pulls/${number}`)) as { head: { sha: string } };
    return pull.head.sha;
  }

  /**
   * Writes the report as the action's one comment on the pull request: updates the comment it wrote before, found by
   * its marker, or creates one. With nothing to show and no earlier comment, it writes none.
   */
  async upsertComment(
    repository: string,
    number: number,
    body: string,
    quiet: boolean,
  ): Promise<'created' | 'updated' | 'unchanged' | 'skipped'> {
    let existing: { id: number; body: string } | undefined;
    for (let page = 1; existing === undefined; page++) {
      const comments = (await this.request(
        'GET',
        `/repos/${repository}/issues/${number}/comments?per_page=100&page=${page}`,
      )) as { id: number; body?: string }[];
      const found = comments.find((comment) => comment.body?.startsWith(MARKER));
      if (found) existing = { id: found.id, body: found.body as string };
      if (comments.length < 100) break;
    }
    if (!existing) {
      if (quiet) return 'skipped';
      await this.request('POST', `/repos/${repository}/issues/${number}/comments`, { body });
      return 'created';
    }
    if (existing.body === body) return 'unchanged';
    await this.request('PATCH', `/repos/${repository}/issues/comments/${existing.id}`, { body });
    return 'updated';
  }
}
