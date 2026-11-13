import { useEffect, useRef, useState } from "react";
import { isLive, jobTitle } from "./Agents.js";
import { api, desktop, type Job } from "./api.js";
import { Icon } from "./Icon.js";
import { href } from "./router.js";

/**
 * Working agents at a glance, across projects: a small palette that opens to
 * list them, and says when one finished. In the app it sits in the bottom-right
 * corner; the desktop app also shows it in its own window on the desktop
 * (`onDesktop`), which stays while the main window is closed.
 */
export function AgentsPalette(props: { onDesktop?: boolean }) {
	const jobs = useAllJobs();
	const [open, setOpen] = useState(false);
	const [dismissed, setDismissed] = useState<Set<string>>(new Set());
	const box = useRef<HTMLDivElement>(null);
	const shown = jobs.filter((j) => isLive(j) || !dismissed.has(j.id));
	const live = shown.filter(isLive);
	const finished = shown.filter((j) => !isLive(j));

	useFitWindow(box, props.onDesktop ? shown.length : -1);
	const bottom = useAboveComposer(!props.onDesktop);
	if (!shown.length) return null;

	const go = (hash: string) => {
		if (props.onDesktop) desktop?.palette?.open(hash);
		else window.location.hash = hash;
	};
	const latest = finished[0];
	const summary = live.length
		? `${live.length} ${live.length === 1 ? "agent" : "agents"} working`
		: latest.status === "done"
			? "All done"
			: latest.status === "failed"
				? "Failed"
				: "Stopped";
	const now = live[0] ?? latest;
	const detail = `${jobTitle(now)} · ${now.project}`;
	// Working: the mark turns like the logo. Done: a green check. Failed or stopped: red.
	const state = live.length ? "working" : latest.status === "done" ? "done" : "failed";

	return (
		<div
			className={`palette${props.onDesktop ? " palette-desktop" : ""}`}
			ref={box}
			style={bottom ? { bottom } : undefined}
		>
			{open && (
				<div className="palette-panel">
					<ul className="palette-list">
						{shown.map((j) => (
							<li key={j.id}>
								<button
									type="button"
									className="palette-job"
									onClick={() => go(href.agents(j.projectId ?? "", j.id))}
								>
									<span className={`dot dot-${j.status}`} />
									<span className="palette-what">
										<strong>{jobTitle(j)}</strong>
										<span className="muted small">
											{j.project} · {isLive(j) ? since(j.startedAt) : j.status}
										</span>
									</span>
								</button>
								{!isLive(j) && (
									<button
										type="button"
										className="icon-btn icon-btn-sm"
										aria-label="Dismiss"
										title="Dismiss"
										onClick={() => setDismissed((d) => new Set(d).add(j.id))}
									>
										<Icon name="check" size={13} />
									</button>
								)}
							</li>
						))}
					</ul>
				</div>
			)}
			<button
				type="button"
				className="palette-pill"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
			>
				<span className={`palette-mark ${state}`} aria-hidden="true">
					<span className="mark-gt">&gt;</span>
					<span className="mark-cur">_</span>
					<span className="palette-badge">
						{state === "working" ? live.length : state === "done" ? "✓" : "!"}
					</span>
				</span>
				<span className="palette-text">
					<strong>{summary}</strong>
					<span className="muted small">{detail}</span>
				</span>
				<Icon name="chevron" size={13} />
			</button>
		</div>
	);
}

/**
 * The chat's message box spans the window's bottom: the palette sits just
 * above it there, so it never covers Send. Measured now and then, since the
 * box grows with its text and comes and goes with the tab.
 */
function useAboveComposer(on: boolean): number | undefined {
	const [bottom, setBottom] = useState<number>();
	useEffect(() => {
		if (!on) return;
		const measure = () => {
			const box = document.querySelector(".composer")?.getBoundingClientRect();
			setBottom(box ? Math.round(window.innerHeight - box.top + 12) : undefined);
		};
		measure();
		const t = setInterval(measure, 500);
		return () => clearInterval(t);
	}, [on]);
	return bottom;
}

/** How long ago a job started, short. */
function since(iso: string) {
	const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
	return m < 1 ? "just started" : m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
}

/** Every project's agent work that runs or ended in the last minutes, read every few seconds. */
function useAllJobs(): Job[] {
	const [jobs, setJobs] = useState<Job[]>([]);
	useEffect(() => {
		let on = true;
		const read = () =>
			api.allJobs().then(
				(list) => on && setJobs(list),
				() => {},
			);
		void read();
		const t = setInterval(read, 3000);
		return () => {
			on = false;
			clearInterval(t);
		};
	}, []);
	return jobs;
}

/**
 * On the desktop the palette's window is as big as the palette: the app keeps
 * it in its corner and hides it when there is nothing to show. `count` < 0
 * means the palette isn't in a window of its own.
 */
function useFitWindow(box: React.RefObject<HTMLDivElement | null>, count: number) {
	useEffect(() => {
		const fit = desktop?.palette?.fit;
		if (count < 0 || !fit) return;
		const el = box.current;
		if (!el) return void fit(0, 0);
		const report = () => {
			const r = el.getBoundingClientRect();
			fit(Math.ceil(r.width), Math.ceil(r.height));
		};
		report();
		const ro = new ResizeObserver(report);
		ro.observe(el);
		// Also now and then, so a palette turned off in Settings goes away.
		const t = setInterval(report, 3000);
		return () => {
			ro.disconnect();
			clearInterval(t);
		};
	}, [box, count]);
}
