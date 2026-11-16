import type { TokenStore } from "./github-auth.js";
import { InputError } from "./validate.js";

/**
 * Each site's RUM domain key (Adobe gives one per site), kept like the GitHub
 * token: in the system keychain (desktop app), one per project, never sent to
 * the page. eds gets it in EDS_RUM_DOMAINKEY, so it isn't on a command line.
 * EDS_RUM_DOMAINKEY from the environment still works, for the browser mode.
 */

let storeFor: ((name: string) => TokenStore) | null = null;
export function setRumKeyStores(make: ((name: string) => TokenStore) | null) {
	storeFor = make;
}

const store = (projectId: string) => storeFor?.(`rum-${projectId}`) ?? null;

export async function rumKey(projectId: string): Promise<string | undefined> {
	return (
		(await store(projectId)
			?.read()
			.catch(() => null)) ||
		process.env.EDS_RUM_DOMAINKEY ||
		undefined
	);
}

export async function rumKeyStatus(projectId: string) {
	return {
		saved: !!(await store(projectId)
			?.read()
			.catch(() => null)),
		env: !!process.env.EDS_RUM_DOMAINKEY,
		canSave: !!storeFor,
	};
}

export async function saveRumKey(projectId: string, key: unknown): Promise<void> {
	const s = store(projectId);
	if (!s) throw new InputError("Saving a key needs the desktop app; here, set EDS_RUM_DOMAINKEY.");
	if (typeof key !== "string" || !/^[\w-]{8,200}$/.test(key.trim()))
		throw new InputError("That doesn't look like a RUM domain key.");
	await s.write(key.trim());
}

export async function clearRumKey(projectId: string): Promise<void> {
	await store(projectId)?.clear();
}
