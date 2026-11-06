/** One set of 24px line icons for the whole app (1.75 stroke, round caps), like the site's. */
const PATHS = {
	back: "M19 12H5M11 18l-6-6 6-6",
	maximize: "M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5",
	minimize: "M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3",
	external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
	github:
		"M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
	folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
	plus: "M12 5v14M5 12h14",
	check: "M5 12.5l4.5 4.5L19 7.5",
	trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
	send: "M5 12h14M13 6l6 6-6 6",
	branch:
		"M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
	design: "M12 3l9 9-9 9-9-9z",
	sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18",
	stop: "M7 7h10v10H7z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon(props: { name: IconName; size?: number; className?: string; label?: string }) {
	const size = props.size ?? 16;
	return (
		<svg
			className={`icon ${props.className ?? ""}`}
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
			strokeLinecap="round"
			strokeLinejoin="round"
			role={props.label ? "img" : undefined}
			aria-label={props.label}
			aria-hidden={props.label ? undefined : true}
		>
			<path d={PATHS[props.name]} />
		</svg>
	);
}

/** The aem-eds-kit lockup: the >_ tile and the mono wordmark (site/styles.css .lockup). */
export function Lockup(props: { href: string; name?: string }) {
	return (
		<a className="lockup" href={props.href}>
			<span className="mark" aria-hidden="true">
				<span className="mark-gt">&gt;</span>
				<span className="mark-cur">_</span>
			</span>
			<span className="wordmark">{props.name ?? "aem-eds-studio"}</span>
		</a>
	);
}
