import type { TokenStore } from "./github-auth.js";
import { InputError } from "./validate.js";

/**
 * A project's own secrets (its RUM domain key, its DA token), kept like the
 * GitHub token: in the system keychain (desktop app), one per project, never
 * sent to the page. eds gets them in an environment variable, so they aren't on
 * a command line. The same variable set where the studio runs still works, for
 * the browser mode.
 */

let storeFor: ((name: string) => TokenStore) | null = null;
export function setProjectSecretStores(make: ((name: string) => TokenStore) | null) {
	storeFor = make;
}

function projectSecret(opts: { prefix: string; env: string; pattern: RegExp; what: string }) {
	const store = (projectId: string) => storeFor?.(`${opts.prefix}-${projectId}`) ?? null;
	const saved = async (projectId: string) =>
		(await store(projectId)
			?.read()
			.catch(() => null)) || undefined;
	return {
		get: async (projectId: string) =>
			(await saved(projectId)) || process.env[opts.env] || undefined,
		status: async (projectId: string) => ({
			saved: !!(await saved(projectId)),
			env: !!process.env[opts.env],
			canSave: !!storeFor,
		}),
		save: async (projectId: string, value: unknown) => {
			const s = store(projectId);
			if (!s) throw new InputError(`Saving it needs the desktop app. Here, set ${opts.env}.`);
			if (typeof value !== "string" || !opts.pattern.test(value.trim()))
				throw new InputError(`That doesn't look like ${opts.what}.`);
			await s.write(value.trim());
		},
		clear: async (projectId: string) => {
			await store(projectId)?.clear();
		},
	};
}

/** Each site's RUM domain key (Adobe gives one per site), for eds rum. */
export const rumKey = projectSecret({
	prefix: "rum",
	env: "EDS_RUM_DOMAINKEY",
	pattern: /^[\w-]{8,200}$/,
	what: "a RUM domain key",
});

/** The project's DA (da.live) token, for changing its pages from the chat (eds content). */
export const daToken = projectSecret({
	prefix: "da",
	env: "DA_TOKEN",
	pattern: /^[\w.-]{20,4000}$/,
	what: "a DA token",
});
