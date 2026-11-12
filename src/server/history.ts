import { execFile } from "node:child_process";

export interface Commit {
	hash: string;
	author: string;
	date: string;
	subject: string;
	/** A block accepted in the studio (`eds draft accept` writes "feat(blocks): …"). */
	accepted: boolean;
}

const SEP = "\x1f";

/** The project's latest commits on its current branch; none when it isn't a git repository. */
export function projectHistory(dir: string, limit = 50): Promise<Commit[]> {
	return new Promise((resolve) => {
		execFile(
			"git",
			["log", "-n", String(limit), `--format=%h${SEP}%an${SEP}%aI${SEP}%s`],
			{ cwd: dir, maxBuffer: 1024 * 1024 },
			(err, stdout) => resolve(err ? [] : parseLog(stdout)),
		);
	});
}

export function parseLog(out: string): Commit[] {
	return out
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [hash, author, date, subject = ""] = line.split(SEP);
			return { hash, author, date, subject, accepted: /^feat\(blocks\): /.test(subject) };
		});
}
