import { readFileSync } from "node:fs";
import path from "node:path";
import { type BrowserWindow, app, shell } from "electron";
import electronUpdater from "electron-updater";
import { downloadUrl, isSignedBuild, updatesInPlace } from "./release.js";

const { autoUpdater } = electronUpdater;

/** What the page shows about updates. */
export interface UpdateState {
	state: "idle" | "checking" | "none" | "available" | "downloading" | "ready" | "error";
	version?: string;
	percent?: number;
	/** False on an unsigned macOS build: Squirrel.Mac only installs signed apps, so the page links the new .dmg. */
	inPlace: boolean;
	error?: string;
}

const EVERY = 4 * 3600_000;

/**
 * Checks the latest published GitHub release at start and every few hours,
 * downloads it in the background, and installs it on restart (or on quit).
 */
export function startUpdates(getWin: () => BrowserWindow | null) {
	let pkg = "";
	try {
		pkg = readFileSync(path.join(app.getAppPath(), "package.json"), "utf-8");
	} catch {}
	let current: UpdateState = {
		state: "idle",
		inPlace: updatesInPlace(process.platform, isSignedBuild(pkg)),
	};
	const set = (next: Partial<UpdateState>) => {
		current = { ...current, ...next };
		getWin()?.webContents.send("studio:update", current);
	};

	if (!app.isPackaged) return { state: () => current, check: async () => {}, install: () => {} };

	autoUpdater.autoDownload = current.inPlace;
	autoUpdater.autoInstallOnAppQuit = current.inPlace;
	autoUpdater.on("checking-for-update", () => set({ state: "checking", error: undefined }));
	autoUpdater.on("update-not-available", () => set({ state: "none" }));
	autoUpdater.on("update-available", (info) =>
		set({ state: current.inPlace ? "downloading" : "available", version: info.version }),
	);
	autoUpdater.on("download-progress", (p) =>
		set({ state: "downloading", percent: Math.round(p.percent) }),
	);
	autoUpdater.on("update-downloaded", (info) => set({ state: "ready", version: info.version }));
	autoUpdater.on("error", (err) => {
		console.error("update:", err);
		set({ state: "error", error: err.message });
	});

	const check = async () => {
		if (current.state === "downloading" || current.state === "ready") return;
		await autoUpdater.checkForUpdates().catch(() => {});
	};
	setTimeout(check, 10_000);
	setInterval(check, EVERY).unref();

	return {
		state: () => current,
		check,
		install: () => {
			if (current.state === "ready") autoUpdater.quitAndInstall();
			else if (current.state === "available")
				void shell.openExternal(downloadUrl(process.platform, process.arch));
		},
	};
}
