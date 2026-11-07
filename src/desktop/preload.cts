// The one bridge between the studio's page and the desktop app. Sandboxed
// preloads run as CommonJS, hence .cts (built to preload.cjs).
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("studioDesktop", {
	/** Opens the system's folder picker; resolves to the chosen path, or null. */
	pickFolder: (): Promise<string | null> => ipcRenderer.invoke("studio:pick-folder"),
});
