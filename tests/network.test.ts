import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Network access (STUDIO-141): paired devices reach the studio on a second
// listener, and may do only what DEVICE_ROUTES allows.

let home: string;
let app: ReturnType<typeof import("../src/server/app.js").createApp>;

const LOCAL = "127.0.0.1:4600";
const PHONE = "192.168.1.20:4610";

async function call(
	where: "local" | "network",
	method: string,
	url: string,
	opts: {
		body?: unknown;
		cookie?: string;
		origin?: string;
		host?: string;
		/** The peer's address and the proxy's headers, for a request through `tailscale serve`. */
		peer?: string;
		forwarded?: { host: string; proto: string };
	} = {},
) {
	const host = opts.host ?? (where === "local" ? LOCAL : PHONE);
	const res = await app.fetch(
		new Request(`http://${host}${url}`, {
			method,
			headers: {
				host,
				...(opts.body === undefined ? {} : { "content-type": "application/json" }),
				...(opts.cookie ? { cookie: opts.cookie } : {}),
				...(opts.origin ? { origin: opts.origin } : {}),
				...(opts.forwarded
					? { "x-forwarded-host": opts.forwarded.host, "x-forwarded-proto": opts.forwarded.proto }
					: {}),
			},
			body: opts.body === undefined || method === "GET" ? undefined : JSON.stringify(opts.body),
		}),
		where === "network"
			? { remote: true, incoming: { socket: { remoteAddress: opts.peer ?? "192.168.1.20" } } }
			: {},
	);
	const text = await res.text();
	let json: Record<string, unknown> = {};
	try {
		json = JSON.parse(text);
	} catch {}
	return { status: res.status, json, headers: res.headers };
}

/** Pair a device the way a phone does: a code from the computer, traded on the network listener. */
async function pair(name = "Piotr's phone") {
	const { json } = await call("local", "POST", "/api/network/pair-code", { body: {} });
	const paired = await call("network", "POST", "/api/pair", { body: { code: json.code, name } });
	const setCookie = paired.headers.get("set-cookie") ?? "";
	return { ...paired, setCookie, cookie: setCookie.split(";")[0], code: String(json.code) };
}

beforeAll(async () => {
	home = await mkdtemp(path.join(os.tmpdir(), "studio-network-"));
	process.env.AEM_EDS_STUDIO_HOME = home;
	app = (await import("../src/server/app.js")).createApp({ webDir: undefined });
});

describe("network access", () => {
	it("pairs a device with a one-time code and keeps only the token's hash", async () => {
		const p = await pair();
		expect(p.status).toBe(200);
		expect(p.json.device).toMatchObject({ name: "Piotr's phone" });
		expect(p.setCookie).toMatch(/^studio_device=[\w-]{40,};/);
		expect(p.setCookie).toContain("HttpOnly");
		expect(p.setCookie).toContain("SameSite=Strict");

		// The code works once.
		const again = await call("network", "POST", "/api/pair", { body: { code: p.code } });
		expect(again.status).toBe(403);
		expect((await call("network", "POST", "/api/pair", { body: { code: "guess" } })).status).toBe(
			403,
		);

		const stored = await readFile(path.join(home, "devices.json"), "utf-8");
		expect(stored).not.toContain(p.cookie.split("=")[1]);
		expect(stored).toMatch(/"tokenHash": "[0-9a-f]{64}"/);
	});

	it("lets a paired device read and chat, and nothing more", async () => {
		const { cookie } = await pair();
		const as = (method: string, url: string, body?: unknown) =>
			call("network", method, url, { cookie, body, origin: `http://${PHONE}` });

		expect((await call("network", "GET", "/api/projects")).status).toBe(401);
		expect((await as("GET", "/api/projects")).status).toBe(200);
		expect((await as("GET", "/api/settings")).status).toBe(200);
		expect((await as("GET", "/api/device")).json.device).toMatchObject({ name: "Piotr's phone" });
		expect((await call("local", "GET", "/api/device")).json).toEqual({ device: null });

		for (const [method, url] of [
			["PATCH", "/api/settings"],
			["PUT", "/api/settings/figma"],
			["PUT", "/api/github/token"],
			["POST", "/api/github/connect"],
			["POST", "/api/agents/claude/login"],
			["POST", "/api/projects"],
			["DELETE", "/api/projects/p1"],
			["GET", "/api/projects/p1/export"],
			["POST", "/api/projects/p1/drafts/hero/accept"],
			["POST", "/api/projects/p1/drafts/hero/discard"],
			["GET", "/api/network"],
			["POST", "/api/network/pair-code"],
			["DELETE", "/api/network/devices/x"],
		])
			expect([method, url, (await as(method, url, {})).status]).toEqual([method, url, 403]);
	});

	it("refuses another site's page, even with the device's cookie", async () => {
		const { cookie } = await pair();
		const r = await call("network", "POST", "/api/projects/p1/chats", {
			cookie,
			body: { text: "hi" },
			origin: "https://evil.example",
		});
		expect(r.status).toBe(403);
	});

	it("keeps the computer's own server local-only", async () => {
		expect((await call("local", "GET", "/api/projects", { host: PHONE })).status).toBe(403);
	});

	it("shuts a revoked device out", async () => {
		const p = await pair("Old tablet");
		const id = (p.json.device as { id: string }).id;
		const list = await call("local", "GET", "/api/network");
		expect(list.json).toMatchObject({ on: false, port: 4610 });
		expect((list.json.devices as Array<{ id: string }>).map((d) => d.id)).toContain(id);
		expect(JSON.stringify(list.json)).not.toContain("tokenHash");

		expect(
			(await call("local", "DELETE", `/api/network/devices/${id}`, { body: {} })).json,
		).toEqual({
			revoked: true,
		});
		expect((await call("network", "GET", "/api/projects", { cookie: p.cookie })).status).toBe(401);
	});
});

describe("the network listener", () => {
	let studio: Awaited<ReturnType<typeof import("../src/server/start.js").startStudio>>;
	let port: number;

	beforeAll(async () => {
		port = await new Promise<number>((resolve) => {
			const s = net.createServer().listen(0, "127.0.0.1", () => {
				const p = (s.address() as net.AddressInfo).port;
				s.close(() => resolve(p));
			});
		});
		process.env.STUDIO_NETWORK_PORT = String(port);
		const { startStudio } = await import("../src/server/start.js");
		studio = await startStudio({ port: 0 });
	});
	afterAll(() => studio.close());

	const settings = (networkAccess: boolean) =>
		fetch(`${studio.url}api/settings`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ networkAccess }),
		});

	it("starts with Network access and stops without it", async () => {
		const network = `http://127.0.0.1:${port}/api/projects`;
		await expect(fetch(network)).rejects.toThrow();
		expect((await settings(true)).status).toBe(200);
		expect((await fetch(network)).status).toBe(401);
		expect((await settings(false)).status).toBe(200);
		await expect(fetch(network)).rejects.toThrow();
	});
});

describe("through Tailscale", () => {
	const TS = "studio.tail1234.ts.net";
	let log: string;

	beforeAll(async () => {
		// A stand-in for Tailscale's CLI on PATH: it reports a tailnet with HTTPS
		// and keeps whether `serve` is on in a file.
		const bin = await mkdtemp(path.join(os.tmpdir(), "fake-tailscale-"));
		log = path.join(bin, "calls.log");
		const on = path.join(bin, "serving");
		await writeFile(
			path.join(bin, "tailscale"),
			`#!/bin/sh
echo "$@" >> "${log}"
case "$*" in
  "status --json") echo '{"BackendState":"Running","CertDomains":["${TS}"]}' ;;
  "serve status --json") if [ -f "${on}" ]; then echo '{"Web":{"${TS}:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:4610"}}}}}'; else echo '{}'; fi ;;
  *"--https=443 off") rm -f "${on}" ;;
  *"--https=443 http"*) touch "${on}" ;;
esac
`,
		);
		await chmod(path.join(bin, "tailscale"), 0o755);
		process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
		delete process.env.STUDIO_NETWORK_PORT; // the listener test above moved it
	});

	it("turns on HTTPS through tailscale serve and pairs over it first", async () => {
		const before = await call("local", "GET", "/api/network");
		expect(before.json.tailscale).toEqual({ running: true, httpsName: TS, serving: false });

		const on = await call("local", "POST", "/api/network/tailscale", { body: { on: true } });
		expect(on.json).toEqual({ running: true, httpsName: TS, serving: true });
		expect(await readFile(log, "utf-8")).toContain("serve --bg --https=443 http://127.0.0.1:4610");

		const { json } = await call("local", "POST", "/api/network/pair-code", { body: {} });
		expect((json.links as string[])[0]).toBe(`https://${TS}/#/pair/${json.code}`);

		// A device can't switch it: that stays on the computer.
		const { cookie } = await pair();
		const r = await call("network", "POST", "/api/network/tailscale", {
			cookie,
			body: { on: false },
		});
		expect(r.status).toBe(403);

		await call("local", "POST", "/api/network/tailscale", { body: { on: false } });
		expect((await call("local", "GET", "/api/network")).json.tailscale).toMatchObject({
			serving: false,
		});
	});

	it("believes the proxy's headers only from this computer", async () => {
		const { json } = await call("local", "POST", "/api/network/pair-code", { body: {} });
		const viaProxy = await call("network", "POST", "/api/pair", {
			host: "127.0.0.1:4610",
			peer: "127.0.0.1",
			origin: `https://${TS}`,
			forwarded: { host: TS, proto: "https" },
			body: { code: json.code, name: "Phone over Tailscale" },
		});
		expect(viaProxy.status).toBe(200);
		expect(viaProxy.headers.get("set-cookie")).toContain("Secure");

		// The same headers from another machine on the network are ignored.
		const second = await call("local", "POST", "/api/network/pair-code", { body: {} });
		const spoofed = await call("network", "POST", "/api/pair", {
			peer: "192.168.1.20",
			origin: `https://${TS}`,
			forwarded: { host: TS, proto: "https" },
			body: { code: second.json.code },
		});
		expect(spoofed.status).toBe(403);
	});
});
