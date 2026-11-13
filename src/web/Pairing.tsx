import qrcode from "qrcode-generator";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, type Device, type NetworkAccess } from "./api.js";
import { Icon, Lockup } from "./Icon.js";
import { href } from "./router.js";

/**
 * Reaching the studio from a phone or another computer (STUDIO-135): the
 * computer turns Network access on and shows a one-time QR code; the other
 * device opens it and pairs. Settings and sign-ins stay on the computer.
 */

/** The paired device the page runs on, or null on the computer itself. */
export const PairedDevice = createContext<Device | null>(null);
/** On a paired device, what only the computer may do is left out of the page. */
export const useOnComputer = () => useContext(PairedDevice) === null;

/** A QR code drawn as SVG squares, so no image or HTML string goes into the page. */
function QrCode(props: { text: string; size?: number }) {
	const qr = qrcode(0, "M");
	qr.addData(props.text);
	qr.make();
	const n = qr.getModuleCount();
	const cells: string[] = [];
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push(`M${c} ${r}h1v1h-1z`);
	return (
		<svg
			className="qr"
			viewBox={`-2 -2 ${n + 4} ${n + 4}`}
			width={props.size ?? 200}
			height={props.size ?? 200}
			role="img"
			aria-label="QR code with the pairing link"
		>
			<rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
			<path d={cells.join("")} fill="#0d0d0c" />
		</svg>
	);
}

/** Tailscale gives each device an address in 100.64.0.0/10. */
const isTailnet = (address: string) => {
	const [a, b] = address.split(".").map(Number);
	return a === 100 && b >= 64 && b < 128;
};
const addressOf = (link: string) => new URL(link).hostname;

function timeLeft(until: string, now: number): string {
	const s = Math.max(0, Math.round((Date.parse(until) - now) / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The one-time code for a new device: a QR code per address, and how long it still works. */
function PairCode(props: { onDone: () => void }) {
	const [code, setCode] = useState<{ expiresAt: string; links: string[] } | null>(null);
	const [pick, setPick] = useState(0);
	const [now, setNow] = useState(Date.now());
	const [error, setError] = useState("");
	const fresh = useCallback(() => {
		setError("");
		api.pairCode().then(setCode, (e: Error) => setError(e.message));
	}, []);
	useEffect(fresh, [fresh]);
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, []);

	if (error) return <p className="error small">{error}</p>;
	if (!code) return <p className="muted small">Making a code…</p>;
	if (!code.links.length)
		return (
			<p className="muted small">
				This computer has no network address another device could reach. Connect it to Wi-Fi or
				Tailscale and try again.
			</p>
		);
	const link = code.links[Math.min(pick, code.links.length - 1)];
	const expired = Date.parse(code.expiresAt) <= now;
	return (
		<div className="pair-code">
			<div className={`qr-frame${expired ? " expired" : ""}`}>
				<QrCode text={link} />
				{expired && (
					<button type="button" className="btn btn-accent btn-sm" onClick={fresh}>
						New code
					</button>
				)}
			</div>
			<div className="stack pair-steps">
				<strong>Scan it with the other device</strong>
				<span className="muted small">
					Or open the link there. It works once,{" "}
					{expired ? "and has expired" : `for ${timeLeft(code.expiresAt, now)} more`}. Show it only
					to your own devices.
				</span>
				{code.links.length > 1 && (
					<div className="row pair-addresses">
						{code.links.map((l, i) => (
							<button
								key={l}
								type="button"
								aria-pressed={i === pick}
								className={`chip${i === pick ? " on" : ""}`}
								onClick={() => setPick(i)}
							>
								{isTailnet(addressOf(l)) ? "Tailscale" : "Wi-Fi / LAN"} · {addressOf(l)}
							</button>
						))}
					</div>
				)}
				<code className="pair-link">{link}</code>
				<div className="row">
					<button
						type="button"
						className="btn btn-outline btn-sm"
						onClick={() => void navigator.clipboard?.writeText(link)}
					>
						Copy link
					</button>
					<button type="button" className="btn btn-ghost btn-sm" onClick={props.onDone}>
						Done
					</button>
				</div>
			</div>
		</div>
	);
}

function DeviceRow(props: { device: Device; onRevoke: () => void }) {
	const { device } = props;
	const seen = device.lastSeenAt ?? device.pairedAt;
	return (
		<li className="device-row">
			<Icon name="tablet" size={16} />
			<span className="stack">
				<strong>{device.name}</strong>
				<span className="muted small">
					Paired {new Date(device.pairedAt).toLocaleDateString()} · last seen{" "}
					{new Date(seen).toLocaleString()}
				</span>
			</span>
			<button
				type="button"
				className="btn btn-ghost btn-danger btn-sm push-right"
				onClick={() => {
					if (confirm(`Revoke ${device.name}? It loses access at once.`)) props.onRevoke();
				}}
			>
				Revoke
			</button>
		</li>
	);
}

/** Settings → Network access, on the computer: the switch, pairing and the paired devices. */
export function NetworkSection(props: { on: boolean }) {
	const [state, setState] = useState<NetworkAccess | null>(null);
	const [pairing, setPairing] = useState(false);
	const load = useCallback(() => api.network().then(setState, () => {}), []);
	useEffect(() => {
		void load();
	}, [load]);

	return (
		<>
			{props.on && state && (
				<>
					<p className="muted small">
						Listening on port {state.port}
						{state.addresses.length ? ` at ${state.addresses.join(", ")}` : ""}. Only paired devices
						get in, and they can read, chat and start or change drafts. Settings, sign-ins and
						accepting into the repository stay on this computer.
					</p>
					{pairing ? (
						<PairCode
							onDone={() => {
								setPairing(false);
								void load();
							}}
						/>
					) : (
						<div className="row">
							<button
								type="button"
								className="btn btn-outline btn-sm"
								onClick={() => setPairing(true)}
							>
								<Icon name="plus" size={14} /> Pair a device
							</button>
						</div>
					)}
				</>
			)}
			{state && state.devices.length > 0 && (
				<ul className="device-list" aria-label="Paired devices">
					{state.devices.map((d) => (
						<DeviceRow
							key={d.id}
							device={d}
							onRevoke={() => void api.revokeDevice(d.id).then(load)}
						/>
					))}
				</ul>
			)}
		</>
	);
}

/** A name for this device from its browser, for the computer's devices list. */
function guessName(): string {
	const ua = navigator.userAgent;
	if (/iPhone/.test(ua)) return "iPhone";
	if (/iPad/.test(ua)) return "iPad";
	if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
	if (/Mac/.test(ua)) return "Mac";
	if (/Windows/.test(ua)) return "Windows PC";
	return "Browser";
}

function PairShell(props: { children: React.ReactNode }) {
	return (
		<main className="pair-screen">
			<div className="panel pair-panel">
				<Lockup href={href.projects()} />
				{props.children}
			</div>
		</main>
	);
}

/** On the other device: the page the QR code opens, which pairs it. */
export function PairScreen(props: { code: string }) {
	const [name, setName] = useState(guessName);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const pair = async () => {
		setBusy(true);
		setError("");
		try {
			await api.pair(props.code, name);
			// A fresh start, so every part of the page loads as the paired device.
			location.replace(`${location.pathname}${href.projects()}`);
			location.reload();
		} catch (e) {
			setError((e as Error).message);
			setBusy(false);
		}
	};
	return (
		<PairShell>
			<h1 className="pair-title">Pair this device</h1>
			<p className="muted">
				It can then follow the chat, write in it and review drafts on the studio running on your
				computer. Settings and sign-ins stay there.
			</p>
			<label className="field">
				<span>Name it, so you know it on the computer</span>
				<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
			</label>
			<button
				type="button"
				className="btn btn-accent"
				disabled={busy || !name.trim()}
				onClick={() => void pair()}
			>
				{busy ? <span className="spinner spinner-ink" aria-hidden="true" /> : null} Pair
			</button>
			{error && (
				<p className="msg-error small">
					{error} Make a new code on the computer: Settings → Network access → Pair a device.
				</p>
			)}
		</PairShell>
	);
}

/** On a device that isn't paired (or was revoked): how to pair it. */
export function Unpaired() {
	return (
		<PairShell>
			<h1 className="pair-title">This device isn't paired</h1>
			<ol className="pair-how">
				<li>On the computer running AEM EDS Studio, open Settings.</li>
				<li>
					Under <strong>Network access</strong>, choose <strong>Pair a device</strong>.
				</li>
				<li>Scan the QR code with this device, or open the link it shows.</li>
			</ol>
		</PairShell>
	);
}
