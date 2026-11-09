// The one bridge between the studio's page and the desktop app. Sandboxed
// preloads run as CommonJS, hence .cts (built to preload.cjs).
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("studioDesktop", {
	/** Opens the system's folder picker; resolves to the chosen path, or null. */
	pickFolder: (): Promise<string | null> => ipcRenderer.invoke("studio:pick-folder"),
	/** Opens a terminal running the agent's own sign-in (claude, codex). */
	/** App updates (src/desktop/updates.ts). */
	update: {
		state: () => ipcRenderer.invoke("studio:update-state"),
		check: () => ipcRenderer.invoke("studio:update-check"),
		install: () => ipcRenderer.invoke("studio:update-install"),
		onChange: (fn: (state: unknown) => void) => {
			const listener = (_e: unknown, state: unknown) => fn(state);
			ipcRenderer.on("studio:update", listener);
			return () => {
				ipcRenderer.removeListener("studio:update", listener);
			};
		},
	},
});
