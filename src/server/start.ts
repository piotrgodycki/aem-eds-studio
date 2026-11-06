import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { stopAll } from "./jobs.js";

export interface RunningStudio {
	url: string;
	port: number;
	/** Stop running jobs and the server. */
	close: () => Promise<void>;
}

/** Start the studio server on 127.0.0.1 (port 0 = any free port). Shared by the CLI and the desktop app. */
export function startStudio(opts: { port: number }): Promise<RunningStudio> {
	const app = createApp();
	return new Promise((resolve, reject) => {
		const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: opts.port }, (info) => {
			const port = (info as AddressInfo).port;
			resolve({
				url: `http://127.0.0.1:${port}/`,
				port,
				close: () =>
					new Promise<void>((done) => {
						stopAll();
						server.close(() => done());
					}),
			});
		});
		server.once("error", reject);
	});
}
