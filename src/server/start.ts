import type { AddressInfo } from "node:net";
import { type ServerType, serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { networkPort } from "./devices.js";
import { stopAll } from "./jobs.js";
import { readSettings } from "./settings.js";

export interface RunningStudio {
	url: string;
	port: number;
	/** Stop running jobs and the server. */
	close: () => Promise<void>;
}

function closeServer(server: ServerType): Promise<void> {
	return new Promise<void>((done) => {
		server.close(() => done());
		// The page polls over keep-alive, so its connection never goes idle;
		// without this, close() waits for it forever.
		if ("closeAllConnections" in server) server.closeAllConnections();
	});
}

/**
 * Start the studio server on 127.0.0.1 (port 0 = any free port). Shared by the
 * CLI and the desktop app. With Network access on, the same app also listens
 * on every interface at networkPort(), for paired devices only.
 */
export function startStudio(opts: { port: number }): Promise<RunningStudio> {
	let network: ServerType | null = null;
	const app = createApp({
		onNetworkAccess: async (on) => {
			if (on && !network) network = await listenOnNetwork();
			if (!on && network) {
				await closeServer(network);
				network = null;
			}
		},
	});
	const listenOnNetwork = () =>
		new Promise<ServerType>((resolve, reject) => {
			const server = serve(
				{
					fetch: (req, env) => app.fetch(req, { ...env, remote: true }),
					hostname: "0.0.0.0",
					port: networkPort(),
				},
				() => resolve(server),
			);
			server.once("error", reject);
		});

	return new Promise((resolve, reject) => {
		const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: opts.port }, (info) => {
			const port = (info as AddressInfo).port;
			resolve({
				url: `http://127.0.0.1:${port}/`,
				port,
				close: async () => {
					stopAll();
					await Promise.all([closeServer(server), network && closeServer(network)]);
				},
			});
			void readSettings().then(async (s) => {
				if (!s.networkAccess) return;
				try {
					network = await listenOnNetwork();
				} catch (e) {
					console.error(
						`Network access: couldn't listen on port ${networkPort()}: ${(e as Error).message}`,
					);
				}
			});
		});
		server.once("error", reject);
	});
}
