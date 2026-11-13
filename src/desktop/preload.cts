// The one bridge between the studio's page and the desktop app. Sandboxed
// preloads run as CommonJS, hence .cts (built to preload.cjs).
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("studioDesktop", {
	/** Opens the system's folder picker; resolves to the chosen path, or null. */
	pickFolder: (): Promise<string | null> => ipcRenderer.invoke("studio:pick-folder"),
	/** The agents palette's own window (src/desktop/palette.ts). */
	palette: {
		fit: (width: number, height: number) => ipcRenderer.send("studio:palette-fit", width, height),
		open: (hash: string) => ipcRenderer.send("studio:palette-open", hash),
	},
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
