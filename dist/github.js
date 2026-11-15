import { MARKER } from "./render.js";
/** The REST API calls the action makes, with the token it is given. */
export class GitHub {
    token;
    apiUrl;
    fetch;
    constructor(token, apiUrl, fetchImpl = fetch) {
        this.token = token;
        this.apiUrl = apiUrl.replace(/\/+$/, '');
        this.fetch = fetchImpl;
    }
    async request(method, route, body) {
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
            throw new Error(`GitHub answered ${method} ${route} with ${response.status}: ${(await response.text()).slice(0, 300)}`);
        }
        return response.json();
    }
    /** The commit where `head` last met the branch `base`. */
    async mergeBase(repository, base, head) {
        const branch = base.split('/').map(encodeURIComponent).join('/');
        const comparison = (await this.request('GET', `/repos/${repository}/compare/${branch}...${head}?per_page=1`));
        return comparison.merge_base_commit.sha;
    }
    /** The commit a pull request's head is at now. */
    async headOf(repository, number) {
        const pull = (await this.request('GET', `/repos/${repository}/pulls/${number}`));
        return pull.head.sha;
    }
    /**
     * Writes the report as the action's one comment on the pull request: updates the comment it wrote before, found by
     * its marker, or creates one. With nothing to show and no earlier comment, it writes none.
     */
    async upsertComment(repository, number, body, quiet) {
        let existing;
        for (let page = 1; existing === undefined; page++) {
            const comments = (await this.request('GET', `/repos/${repository}/issues/${number}/comments?per_page=100&page=${page}`));
            // Anyone can write the marker; only a bot's comment, such as the workflow token's, is the action's own.
            const found = comments.find((comment) => comment.user?.type === 'Bot' && comment.body?.startsWith(MARKER));
            if (found)
                existing = { id: found.id, body: found.body };
            if (comments.length < 100)
                break;
        }
        if (!existing) {
            if (quiet)
                return 'skipped';
            await this.request('POST', `/repos/${repository}/issues/${number}/comments`, { body });
            return 'created';
        }
        if (existing.body === body)
            return 'unchanged';
        await this.request('PATCH', `/repos/${repository}/issues/comments/${existing.id}`, { body });
        return 'updated';
    }
}
