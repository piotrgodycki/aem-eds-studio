/**
 * The description of the pull request an accepted draft opens: the agent's
 * English text (eds draft describe), the screenshots, and the test URLs.
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
	const parts = [
		o.description?.trim() ||
			`The block \`${o.name}\`, accepted at v${o.version} after review in AEM EDS Studio.`,
	];
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
	// As the aem-boilerplate pull request template lists them: AEM PSI Check runs PageSpeed Insights on these.
	parts.push(
		[
			"Test URLs:",
			`- Before: ${edsHost(o.base, o.repo)}`,
			`- After: ${edsHost(o.branch, o.repo)}`,
		].join("\n"),
	);
	return parts.join("\n\n");
}
