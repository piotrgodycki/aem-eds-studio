import { useEffect, useRef, useState } from "react";
import { api, type Job } from "./api.js";
import { href } from "./router.js";

/** Every project's running and queued jobs, in the header. */
export function JobsPill() {
	const [jobs, setJobs] = useState<Job[]>([]);
	const [open, setOpen] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		let live = true;
		const tick = () =>
			api.allJobs().then(
				(j) => live && setJobs(j),
				() => {},
			);
		void tick();
		const t = setInterval(tick, 3000);
		return () => {
			live = false;
			clearInterval(t);
		};
	}, []);
	useEffect(() => {
		const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
		document.addEventListener("click", close);
		return () => document.removeEventListener("click", close);
	}, []);
	if (!jobs.length) return null;
	const running = jobs.filter((j) => j.status === "running").length;
	const queued = jobs.length - running;
	return (
		<div className="jobs-pill" ref={box}>
			<button
				type="button"
				className="pill"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
			>
				<span className="dot dot-running" />
				<span className="side-text">
					{running} running{queued ? ` · ${queued} queued` : ""}
				</span>
			</button>
			{open && (
				<ul className="jobs-menu">
					{jobs.map((j) => (
						<li key={j.id}>
							<a
								href={
									j.block && j.projectId
										? href.draft(j.projectId, j.block)
										: href.project(j.projectId ?? "")
								}
							>
								<span className={`dot ${j.status === "running" ? "dot-running" : ""}`} />
								<span>
									<b>{j.project}</b> · {j.kind}
									{j.block ? ` ${j.block}` : ""}
									{j.status === "queued" && (
										<span className="muted small"> · waiting: {j.waitingFor}</span>
									)}
								</span>
							</a>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
