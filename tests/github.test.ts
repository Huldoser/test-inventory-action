import { describe, expect, it } from 'vitest';
import { GitHub } from '../src/github.ts';
import { MARKER } from '../src/render.ts';

/** A fake GitHub API: answers each request from the routes given, and records them. */
function fakeGitHub(routes: Partial<Record<string, (body: unknown) => [number, unknown]>>) {
  const calls: { method: string; path: string; body: unknown; authorization: string | null }[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    const { pathname, search } = new URL(url);
    const body = init.body === undefined ? undefined : (JSON.parse(init.body as string) as unknown);
    const key = `${init.method as string} ${pathname}${search}`;
    calls.push({
      method: init.method as string,
      path: `${pathname}${search}`,
      body,
      authorization: new Headers(init.headers).get('authorization'),
    });
    const route = routes[key];
    const [status, answer] = route ? route(body) : [404, { message: 'Not Found' }];
    return Promise.resolve(new Response(JSON.stringify(answer), { status }));
  }) as typeof fetch;
  return { github: new GitHub('ghs_EXAMPLE', 'https://api.github.com/', fetchImpl), calls };
}

const COMMENTS = '/repos/trading-desk/strategy-engine/issues/42/comments';

describe('the comment on the pull request', () => {
  it('reads the commit a pull request is at, with the token', async () => {
    const { github, calls } = fakeGitHub({
      'GET /repos/trading-desk/strategy-engine/pulls/42': () => [200, { head: { sha: 'abc123' } }],
    });
    expect(await github.headOf('trading-desk/strategy-engine', 42)).toBe('abc123');
    expect(calls[0].authorization).toBe('Bearer ghs_EXAMPLE');
  });

  it('creates the comment, then updates it, leaves it when unchanged, and writes none when there is nothing to show', async () => {
    const created = fakeGitHub({
      [`GET ${COMMENTS}?per_page=100&page=1`]: () => [200, [{ id: 1, body: 'LGTM' }]],
      [`POST ${COMMENTS}`]: () => [201, {}],
    });
    expect(await created.github.upsertComment('trading-desk/strategy-engine', 42, `${MARKER}\nreport`, false)).toBe(
      'created',
    );
    expect(created.calls.at(-1)).toMatchObject({ method: 'POST', path: COMMENTS, body: { body: `${MARKER}\nreport` } });
    const skipped = fakeGitHub({ [`GET ${COMMENTS}?per_page=100&page=1`]: () => [200, []] });
    expect(await skipped.github.upsertComment('trading-desk/strategy-engine', 42, `${MARKER}\nquiet`, true)).toBe(
      'skipped',
    );

    const page = Array.from({ length: 100 }, (_, index) => ({ id: index + 10, body: `review ${index}` }));
    const existing = fakeGitHub({
      [`GET ${COMMENTS}?per_page=100&page=1`]: () => [200, page],
      [`GET ${COMMENTS}?per_page=100&page=2`]: () => [200, [{ id: 7, body: `${MARKER}\nold report` }]],
      'PATCH /repos/trading-desk/strategy-engine/issues/comments/7': () => [200, {}],
    });
    expect(await existing.github.upsertComment('trading-desk/strategy-engine', 42, `${MARKER}\nnew report`, true)).toBe(
      'updated',
    );
    expect(existing.calls.at(-1)).toMatchObject({ method: 'PATCH', body: { body: `${MARKER}\nnew report` } });
    expect(
      await existing.github.upsertComment('trading-desk/strategy-engine', 42, `${MARKER}\nold report`, false),
    ).toBe('unchanged');
  });

  it('says what GitHub answered when it refuses a request', async () => {
    const { github } = fakeGitHub({
      'GET /repos/trading-desk/strategy-engine/pulls/42': () => [
        403,
        { message: 'Resource not accessible by integration' },
      ],
    });
    await expect(github.headOf('trading-desk/strategy-engine', 42)).rejects.toThrow(
      'GitHub answered GET /repos/trading-desk/strategy-engine/pulls/42 with 403: {"message":"Resource not accessible by integration"}',
    );
  });
});
