/**
 * The description of the pull request an accepted draft opens: one to three
 * sentences on top, the test URLs right under them, then the rest of the
 * agent's English text (eds draft describe) and the screenshots.
 */

export interface Shot {
	width: number;
	url: string;
}

/** An EDS host: the branch, repository and owner, lowercased, anything else a dash. */
const edsHost = (branch: string, repo: string) => {
	const [owner, name] = repo.split("/");
	const part = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
	return `https://${part(branch)}--${part(name)}--${part(owner)}.aem.live/`;
};

export function pullBody(o: {
	repo: string;
	/** The branch the pull request goes into, e.g. main. */
	base: string;
	branch: string;
	name: string;
	version: number;
	/** The agent's description; without one, a plain sentence. */
	description?: string;
	shots?: Shot[];
}): string {
	const { summary, rest } = splitSummary(o.description ?? "");
	const parts = [
		summary || `The block \`${o.name}\`, accepted at v${o.version} after review in AEM EDS Studio.`,
		// As the aem-boilerplate pull request template lists them: AEM PSI Check runs PageSpeed Insights on these.
		[
			"Test URLs:",
			"",
			`- Before: ${edsHost(o.base, o.repo)}`,
			`- After: ${edsHost(o.branch, o.repo)}`,
		].join("\n"),
	];
	if (rest) parts.push(rest);
	if (o.shots?.length)
		parts.push(
			[
				"## Screenshots",
				"",
				"| Width | Screenshot |",
				"| --- | --- |",
				...o.shots.map((s) => `| ${s.width}px | ![${o.name} at ${s.width}px](${s.url}) |`),
			].join("\n"),
		);
	return parts.join("\n\n");
}

const SUMMARY_SENTENCES = 3;

/**
 * The agent's text split for the top of the pull request: the first one to
 * three sentences of its first plain paragraph (headings and lists don't
 * count), and what's left, with a heading that lost all its text dropped.
 */
export function splitSummary(text: string): { summary: string; rest: string } {
	const blocks = text.trim().split(/\n\s*\n/);
	const plain = (b: string) => b.trim() !== "" && !/^\s*(#|[-*+] |\d+\. |\||```)/.test(b);
	let at = -1;
	let lead = "";
	for (const [i, b] of blocks.entries()) {
		// A heading glued to its first line ("## Summary\nA hero…") still leads to that line.
		const lines = b.split("\n");
		const body = /^#/.test(lines[0]) ? lines.slice(1).join(" ") : b;
		if (plain(body)) {
			at = i;
			lead = /^#/.test(lines[0]) ? lines[0] : "";
			blocks[i] = body;
			break;
		}
	}
	if (at < 0) return { summary: "", rest: text.trim() };
	const sentences = blocks[at]
		.replace(/\s+/g, " ")
		.trim()
		.split(/(?<=[.!?])\s+/);
	const summary = sentences.slice(0, SUMMARY_SENTENCES).join(" ");
	const left = sentences.slice(SUMMARY_SENTENCES).join(" ");
	const restBlocks = [
		...blocks.slice(0, at),
		...(left ? [lead ? `${lead}\n${left}` : left] : []),
		...blocks.slice(at + 1),
	];
	// A heading left with nothing under it (the summary's own, like "## Summary") goes.
	const kept = restBlocks.filter(
		(b, i) =>
			!(
				/^#+ [^\n]*$/.test(b.trim()) &&
				(i === restBlocks.length - 1 || /^#/.test(restBlocks[i + 1].trim()))
			),
	);
	return { summary, rest: kept.join("\n\n").trim() };
}
