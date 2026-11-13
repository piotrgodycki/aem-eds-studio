import { useEffect, useRef, useState } from "react";
import { api, desktop } from "./api.js";

type Level = "info" | "warn" | "error";
type Line = Awaited<ReturnType<typeof api.logs>>[number];

/**
 * Settings → Logs: the studio's own log (server, desktop app and page errors),
 * the latest lines read again every few seconds, newest at the bottom.
 */
export function StudioLogs() {
	const [level, setLevel] = useState<Level>("info");
	const [lines, setLines] = useState<Line[] | null>(null);
	const [error, setError] = useState("");
	const [copied, setCopied] = useState(false);
	const box = useRef<HTMLPreElement>(null);

	useEffect(() => {
		let on = true;
		const read = () =>
			api.logs(level).then(
				(l) => on && setLines(l),
				(e: Error) => on && setError(e.message),
			);
		void read();
		const t = setInterval(read, 3000);
		return () => {
			on = false;
			clearInterval(t);
		};
	}, [level]);
	const count = lines?.length ?? 0;
	useEffect(() => {
		if (count) box.current?.scrollTo({ top: box.current.scrollHeight });
	}, [count]);

	const text = (lines ?? [])
		.map((l) => `${l.at.slice(11, 19)} ${l.level.toUpperCase().padEnd(5)} ${l.message}`)
		.join("\n");
	return (
		<div className="stack">
			<p className="muted small">
				What the studio did since it started, and what went wrong: agent runs, GitHub, updates,
				errors. Tokens are masked. Older lines are in the log files.
			</p>
			<div className="row logs-bar">
				<select
					aria-label="Which lines"
					value={level}
					onChange={(e) => setLevel(e.target.value as Level)}
				>
					<option value="info">Everything</option>
					<option value="warn">Warnings and errors</option>
					<option value="error">Errors</option>
				</select>
				<button
					type="button"
					className="btn btn-outline btn-sm"
					disabled={!count}
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(text);
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						} catch {}
					}}
				>
					{copied ? "Copied" : "Copy"}
				</button>
				{desktop?.showLogs && (
					<button
						type="button"
						className="btn btn-ghost btn-sm"
						onClick={() => void desktop?.showLogs?.()}
					>
						Show log files
					</button>
				)}
			</div>
			{error && <p className="error small">{error}</p>}
			<pre className="studio-log" ref={box}>
				{lines === null
					? "Reading…"
					: count
						? (lines ?? []).map((l) => (
								<span key={l.id} className={`lv-${l.level}`}>
									<span className="muted">{l.at.slice(11, 19)}</span> {l.message}
									{"\n"}
								</span>
							))
						: "Nothing yet."}
			</pre>
		</div>
	);
}
