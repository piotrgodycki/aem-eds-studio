/** One set of 24px line icons for the whole app (1.75 stroke, round caps), like the site's. */
const PATHS = {
	paperclip: "M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7",
	quote: "M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6",
	history: "M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2",
	chat: "M4 5h16v11H9l-5 4z",
	back: "M19 12H5M11 18l-6-6 6-6",
	globe:
		"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9M12 3C9.5 5.7 8.2 8.7 8.2 12s1.3 6.3 3.8 9",
	external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
	github:
		"M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
	folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
	plus: "M12 5v14M5 12h14",
	copy: "M9 9h11v11H9zM5 15V4h11",
	check: "M5 12.5l4.5 4.5L19 7.5",
	chevron: "M6 9l6 6 6-6",
	download: "M12 4v11M7 10l5 5 5-5M5 20h14",
	trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
	send: "M5 12h14M13 6l6 6-6 6",
	arrowUp: "M12 19V5M6 11l6-6 6 6",
	branch:
		"M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
	design: "M12 3l9 9-9 9-9-9z",
	sparkle:
		"M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7zM19 3v4M17 5h4",
	forward: "M5 12h14M13 6l6 6-6 6",
	stop: "M7 7h10v10H7z",
	desktop: "M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM9 20h6M12 16v4",
	tablet: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2",
	phone: "M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 19h2",
	devices: "M2 5h12v9H2zM5 18h6M8 14v4M16 8h6v12h-6zM18 17h2",
	panelOpen: "M4 4h16v16H4zM15 4v16M11 10l-2 2 2 2",
	panelClose: "M4 4h16v16H4zM15 4v16M9 10l2 2-2 2",
	menu: "M4 7h16M4 12h16M4 17h16",
	help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01",
	agent: "M4 6h16v12H4zM8 11l2 2-2 2M13 15h3",
	usage: "M4 20h16M7 16v-5M12 16V6M17 16v-8",
	settings:
		"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
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

/** The agent's mark beside its answers: the studio's >_, turning like the logo while it works. */
export function AgentMark(props: { working?: boolean }) {
	return (
		<span className={`msg-avatar${props.working ? " mark working" : ""}`} aria-hidden="true">
			<span className="mark-gt">&gt;</span>
			<span className="mark-cur">_</span>
		</span>
	);
}
