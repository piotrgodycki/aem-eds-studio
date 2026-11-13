import { mkdtemp, readFile } from "node:fs/promises";
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
	opts: { body?: unknown; cookie?: string; origin?: string; host?: string } = {},
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
			},
			body: opts.body === undefined || method === "GET" ? undefined : JSON.stringify(opts.body),
		}),
		where === "network" ? { remote: true } : {},
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
