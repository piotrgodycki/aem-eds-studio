import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { studioHome } from "./paths.js";

/**
 * Devices paired to reach the studio over the network (STUDIO-135). A device
 * pairs once with a one-time code and then sends its own token; the studio
 * keeps only the token's hash, so the file alone lets nobody in.
 */

export interface Device {
	id: string;
	name: string;
	pairedAt: string;
	lastSeenAt?: string;
}
interface StoredDevice extends Device {
	tokenHash: string;
}

/** The port the network listener uses: fixed, so a paired phone finds it again. */
export const networkPort = () => Number.parseInt(process.env.STUDIO_NETWORK_PORT ?? "4610", 10);
/** The cookie a paired browser sends its token in. */
export const DEVICE_COOKIE = "studio_device";
/** How long a pairing code works. */
const CODE_TTL_MS = 5 * 60_000;
/** Seen-at times are written at most this often, not on every request. */
const SEEN_EVERY_MS = 60_000;

const file = () => path.join(studioHome(), "devices.json");
const hash = (token: string) => createHash("sha256").update(token).digest();

let cache: StoredDevice[] | null = null;

async function load(): Promise<StoredDevice[]> {
	if (cache) return cache;
	try {
		cache = existsSync(file())
			? (JSON.parse(await readFile(file(), "utf-8")) as StoredDevice[])
			: [];
	} catch {
		cache = [];
	}
	return cache;
}

async function save(devices: StoredDevice[]) {
	cache = devices;
	await mkdir(studioHome(), { recursive: true });
	const tmp = `${file()}.${process.pid}.tmp`;
	await writeFile(tmp, `${JSON.stringify(devices, null, 2)}\n`, { mode: 0o600 });
	await rename(tmp, file());
}

export async function listDevices(): Promise<Device[]> {
	return (await load()).map(({ tokenHash, ...d }) => d);
}

export async function revokeDevice(id: string): Promise<boolean> {
	const devices = await load();
	const next = devices.filter((d) => d.id !== id);
	if (next.length === devices.length) return false;
	await save(next);
	return true;
}

/** The paired device a token belongs to, compared in constant time. */
export async function deviceFor(token: string | undefined): Promise<Device | undefined> {
	if (!token) return undefined;
	const given = hash(token);
	const d = (await load()).find((x) => timingSafeEqual(Buffer.from(x.tokenHash, "hex"), given));
	if (!d) return undefined;
	const now = Date.now();
	if (!d.lastSeenAt || now - Date.parse(d.lastSeenAt) > SEEN_EVERY_MS) {
		d.lastSeenAt = new Date(now).toISOString();
		await save(await load());
	}
	const { tokenHash, ...device } = d;
	return device;
}

/** One-time codes waiting to be used, kept in memory only: a restart voids them. */
const codes = new Map<string, number>();

export function createPairCode(): { code: string; expiresAt: string } {
	const now = Date.now();
	for (const [c, until] of codes) if (until < now) codes.delete(c);
	const code = randomBytes(16).toString("base64url");
	codes.set(code, now + CODE_TTL_MS);
	return { code, expiresAt: new Date(now + CODE_TTL_MS).toISOString() };
}

/** Use a pairing code: a new device and its token, or null when the code is wrong, used or old. */
export async function pairDevice(
	code: unknown,
	name: unknown,
): Promise<{ device: Device; token: string } | null> {
	if (typeof code !== "string") return null;
	const until = codes.get(code);
	codes.delete(code);
	if (!until || until < Date.now()) return null;
	const token = randomBytes(32).toString("base64url");
	const device: StoredDevice = {
		id: randomUUID(),
		name: typeof name === "string" && name.trim() ? name.trim().slice(0, 60) : "A device",
		pairedAt: new Date().toISOString(),
		tokenHash: hash(token).toString("hex"),
	};
	await save([...(await load()), device]);
	const { tokenHash, ...shown } = device;
	return { device: shown, token };
}

/** The addresses another device may reach this computer at: its LAN and tailnet IPv4s. */
export function networkAddresses(): string[] {
	return Object.values(os.networkInterfaces())
		.flat()
		.filter((a) => a && a.family === "IPv4" && !a.internal)
		.map((a) => (a as os.NetworkInterfaceInfo).address);
}
