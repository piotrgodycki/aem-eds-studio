import { githubToken } from "./github.js";

/**
 * The work board: the project's GitHub issues and pull requests sorted by who
 * acts next. Built from one GraphQL query; the sorting is a pure function so it
 * can be tested without GitHub.
 */

export type Column = "prepared" | "progress" | "review" | "qa" | "done";

export interface Card {
	kind: "issue" | "pr";
	number: number;
	title: string;
	url: string;
	column: Column;
	author: string;
	/** Who acts next: reviewers for dev review, assignees otherwise. */
	next: string[];
	labels: Array<{ name: string; color: string }>;
	updatedAt: string;
	/** PRs only. */
	ci?: "success" | "failure" | "pending" | null;
	changesRequested?: boolean;
	qaPassed?: boolean;
	/** EDS preview of the PR's branch: https://<branch>--<repo>--<owner>.aem.page/ */
	preview?: string;
	/** The first image in the PR description (QA needs one). */
	screenshot?: string | null;
	/** Issues this PR closes. */
	closes?: number[];
}

export interface Board {
	repo: string;
	cards: Card[];
	fetchedAt: string;
}

const QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    open: pullRequests(first: 50, states: [OPEN], orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { ...pr isDraft reviewDecision headRefName body
        reviewRequests(first: 5) { nodes { requestedReviewer { ... on User { login } ... on Team { name } } } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }
    }
    merged: pullRequests(first: 30, states: [MERGED], orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { ...pr mergedAt }
    }
    issues(first: 50, states: [OPEN], orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { number title url updatedAt author { login } labels(first: 10) { nodes { name color } } assignees(first: 5) { nodes { login } } }
    }
    closed: issues(first: 30, states: [CLOSED], orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { number title url updatedAt closedAt stateReason author { login } labels(first: 10) { nodes { name color } } }
    }
  }
}
fragment pr on PullRequest {
  number title url updatedAt author { login }
  labels(first: 10) { nodes { name color } }
  assignees(first: 5) { nodes { login } }
  closingIssuesReferences(first: 5) { nodes { number } }
}`;

interface Nodes<T> {
	nodes: T[];
}
interface RawLabel {
	name: string;
	color: string;
}
interface RawPr {
	number: number;
	title: string;
	url: string;
	updatedAt: string;
	author: { login: string } | null;
	labels: Nodes<RawLabel>;
	assignees: Nodes<{ login: string }>;
	closingIssuesReferences: Nodes<{ number: number }>;
	isDraft?: boolean;
	reviewDecision?: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
	headRefName?: string;
	body?: string;
	reviewRequests?: Nodes<{ requestedReviewer: { login?: string; name?: string } | null }>;
	commits?: Nodes<{ commit: { statusCheckRollup: { state: string } | null } }>;
	mergedAt?: string;
}
interface RawIssue {
	number: number;
	title: string;
	url: string;
	updatedAt: string;
	closedAt?: string;
	stateReason?: string | null;
	author: { login: string } | null;
	labels: Nodes<RawLabel>;
	assignees?: Nodes<{ login: string }>;
}
export interface RawRepo {
	open: Nodes<RawPr>;
	merged: Nodes<RawPr>;
	issues: Nodes<RawIssue>;
	closed: Nodes<RawIssue>;
}

const DONE_DAYS = 14;
const QA_LABELS = ["qa", "ready-for-qa", "needs-qa"];
const QA_PASSED = ["qa-passed", "qa-ok"];

const has = (labels: RawLabel[], names: string[]) =>
	labels.some((l) => names.includes(l.name.toLowerCase()));

/** The first image in a PR description: Markdown ![…](url) or <img src="…">. */
export function firstImage(body: string | undefined): string | null {
	if (!body) return null;
	const md = body.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
	const html = body.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
	const at = (m: RegExpMatchArray | null) => m?.index ?? Number.POSITIVE_INFINITY;
	const pick = at(md) <= at(html) ? md : html;
	return pick?.[1] ?? null;
}

/** EDS preview host for a branch (non-alphanumerics become "-", as aem.live does). */
export function previewUrl(repo: string, branch: string): string {
	const [owner, name] = repo.toLowerCase().split("/");
	const b = branch
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return `https://${b}--${name}--${owner}.aem.page/`;
}

const ciState = (pr: RawPr): Card["ci"] => {
	const s = pr.commits?.nodes[0]?.commit.statusCheckRollup?.state;
	if (!s) return null;
	if (s === "SUCCESS") return "success";
	if (s === "FAILURE" || s === "ERROR") return "failure";
	return "pending";
};

/** Sort the repository's work into the board's columns. */
export function buildBoard(repo: string, raw: RawRepo, now = new Date()): Board {
	const cards: Card[] = [];
	const recent = (iso?: string) =>
		!!iso && now.getTime() - new Date(iso).getTime() <= DONE_DAYS * 86_400_000;
	const linked = new Set<number>();

	for (const pr of raw.open.nodes) {
		const labels = pr.labels.nodes;
		for (const i of pr.closingIssuesReferences.nodes) linked.add(i.number);
		const qaPassed = has(labels, QA_PASSED);
		const forQa = qaPassed || has(labels, QA_LABELS) || pr.reviewDecision === "APPROVED";
		const column: Column = pr.isDraft ? "progress" : forQa ? "qa" : "review";
		const reviewers = (pr.reviewRequests?.nodes ?? [])
			.map((r) => r.requestedReviewer?.login ?? r.requestedReviewer?.name)
			.filter((x): x is string => !!x);
		const assignees = pr.assignees.nodes.map((a) => a.login);
		cards.push({
			kind: "pr",
			number: pr.number,
			title: pr.title,
			url: pr.url,
			column,
			author: pr.author?.login ?? "ghost",
			next: column === "review" ? (reviewers.length ? reviewers : assignees) : assignees,
			labels,
			updatedAt: pr.updatedAt,
			ci: ciState(pr),
			changesRequested: pr.reviewDecision === "CHANGES_REQUESTED",
			qaPassed,
			preview: pr.headRefName ? previewUrl(repo, pr.headRefName) : undefined,
			screenshot: firstImage(pr.body),
			closes: pr.closingIssuesReferences.nodes.map((i) => i.number),
		});
	}

	for (const pr of raw.merged.nodes) {
		for (const i of pr.closingIssuesReferences.nodes) linked.add(i.number);
		if (!recent(pr.mergedAt)) continue;
		cards.push({
			kind: "pr",
			number: pr.number,
			title: pr.title,
			url: pr.url,
			column: "done",
			author: pr.author?.login ?? "ghost",
			next: [],
			labels: pr.labels.nodes,
			updatedAt: pr.mergedAt ?? pr.updatedAt,
			closes: pr.closingIssuesReferences.nodes.map((i) => i.number),
		});
	}

	for (const is of raw.issues.nodes) {
		if (linked.has(is.number)) continue; // shown through its PR
		cards.push({
			kind: "issue",
			number: is.number,
			title: is.title,
			url: is.url,
			column: "prepared",
			author: is.author?.login ?? "ghost",
			next: (is.assignees?.nodes ?? []).map((a) => a.login),
			labels: is.labels.nodes,
			updatedAt: is.updatedAt,
		});
	}

	for (const is of raw.closed.nodes) {
		if (linked.has(is.number) || !recent(is.closedAt) || is.stateReason === "NOT_PLANNED") continue;
		cards.push({
			kind: "issue",
			number: is.number,
			title: is.title,
			url: is.url,
			column: "done",
			author: is.author?.login ?? "ghost",
			next: [],
			labels: is.labels.nodes,
			updatedAt: is.closedAt ?? is.updatedAt,
		});
	}

	cards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return { repo, cards, fetchedAt: now.toISOString() };
}

export class NotConnected extends Error {}

export async function fetchBoard(repo: string): Promise<Board> {
	const token = await githubToken();
	if (!token)
		throw new NotConnected(
			"Connect GitHub to see the board: run gh auth login or set GITHUB_TOKEN.",
		);
	const [owner, name] = repo.split("/");
	const res = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
			"user-agent": "aem-eds-studio",
		},
		body: JSON.stringify({ query: QUERY, variables: { owner, name } }),
	});
	const json = (await res.json()) as {
		data?: { repository: RawRepo | null };
		errors?: Array<{ message: string }>;
	};
	if (!res.ok || json.errors?.length || !json.data?.repository)
		throw new Error(`GitHub: ${json.errors?.[0]?.message ?? res.statusText}`);
	return buildBoard(repo, json.data.repository);
}
