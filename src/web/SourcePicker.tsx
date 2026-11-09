import type { SourceChoice } from "./api.js";

export type Provider = "figma" | "framer" | "stitch" | "web";

/** Where a design link points (the same rule as the server and `eds`). */
export function providerOf(link: string): Provider | null {
	let host = "";
	try {
		host = new URL(link.trim()).hostname;
	} catch {
		return null;
	}
	if (/(^|\.)figma\.com$/.test(host)) return "figma";
	if (/(^|\.)framer\.(com|app|website|ai)$/.test(host)) return "framer";
	if (/(^|\.)stitch\.withgoogle\.com$/.test(host)) return "stitch";
	return "web";
}

const NAMES: Record<Provider, string> = {
	figma: "Figma",
	framer: "Framer",
	stitch: "Stitch",
	web: "Web page",
};

function Seg<T extends string>(props: {
	label: string;
	value: T;
	options: Array<{ value: T; label: string; disabled?: boolean; title?: string }>;
	onChange: (v: T) => void;
}) {
	return (
		<fieldset className="seg">
			<legend className="sr-only">{props.label}</legend>
			{props.options.map((o) => (
				<button
					key={o.value}
					type="button"
					aria-pressed={props.value === o.value}
					className={props.value === o.value ? "on" : ""}
					disabled={o.disabled}
					title={o.title}
					onClick={() => props.onChange(o.value)}
				>
					{o.label}
				</button>
			))}
		</fieldset>
	);
}

function Check(props: {
	label: string;
	hint: string;
	on: boolean;
	onChange: (on: boolean) => void;
}) {
	return (
		<label className="check">
			<input
				type="checkbox"
				checked={props.on}
				onChange={(e) => props.onChange(e.target.checked)}
			/>
			<span>
				{props.label} <span className="muted">· {props.hint}</span>
			</span>
		</label>
	);
}

/**
 * How the design is read, by where the link points: Figma through REST (a
 * Figma token) or the agent's MCP; Framer, Stitch and other pages scraped as
 * public pages or with a signed-in session.
 */
export function SourcePicker(props: {
	link: string;
	value: SourceChoice;
	onChange: (v: SourceChoice) => void;
	figmaToken: boolean;
}) {
	const provider = providerOf(props.link);
	if (!provider) return null;
	const v = props.value;
	const set = (patch: Partial<SourceChoice>) => props.onChange({ ...v, ...patch });
	const read = v.read ?? (props.figmaToken ? "rest" : "mcp");
	return (
		<div className="field source-picker">
			<span>
				Read the design <span className="tag">{NAMES[provider]}</span>
			</span>
			{provider === "figma" ? (
				<>
					<Seg
						label="Read Figma through"
						value={read}
						onChange={(r) => set({ read: r })}
						options={[
							{
								value: "rest",
								label: "REST",
								disabled: !props.figmaToken,
								title: props.figmaToken ? undefined : "Add a Figma token in Settings",
							},
							{ value: "mcp", label: "MCP" },
						]}
					/>
					<p className="muted small">
						{read === "rest" ? "Your Figma token, no MCP calls." : "Your agent's Figma MCP."}
					</p>
					{read === "mcp" && (
						<Check
							label="Screenshot check"
							hint="+1 MCP call"
							on={!!v.screenshot}
							onChange={(on) => set({ screenshot: on })}
						/>
					)}
				</>
			) : (
				<>
					<Seg
						label="Page access"
						value={v.signedIn ? "signed" : "public"}
						onChange={(a) => set({ signedIn: a === "signed" })}
						options={[
							{ value: "public", label: "Public" },
							{ value: "signed", label: "Signed in" },
						]}
					/>
					<p className="muted small">
						{v.signedIn ? "Sign in once; the session is kept." : "As anyone sees it."}
					</p>
				</>
			)}
			<Check
				label="Fetch again"
				hint="skip the cache"
				on={!!v.refresh}
				onChange={(on) => set({ refresh: on })}
			/>
		</div>
	);
}
