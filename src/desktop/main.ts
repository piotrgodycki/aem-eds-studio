import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, session, shell } from "electron";
import { resolveEds } from "../server/eds.js";
import { setFigmaTokenStore } from "../server/figma-token.js";
import { setTokenStore } from "../server/github-auth.js";
import { listJobs, startJob, waitForJob } from "../server/jobs.js";
import { type RunningStudio, startStudio } from "../server/start.js";
import { adoptShellEnv } from "./env.js";
import { type Palette, startPalette } from "./palette.js";
import { allowPermission } from "./permissions.js";
import { keychainTokenStore } from "./token-store.js";
import { startUpdates } from "./updates.js";

// The bundled eds CLI runs with this app's own runtime (Electron acting as
// Node, see server/eds.ts), so Node doesn't have to be installed. Agents, git
// and gh come from the user's shell: its PATH and the agents' own settings.
adoptShellEnv();

/** STUDIO_SMOKE=<file>: start, write a status report, quit. Used by the release builds' smoke test. */
const smoke = process.env.STUDIO_SMOKE;

let studio: RunningStudio | undefined;
let win: BrowserWindow | null = null;
let palette: Palette | undefined;

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", () => showStudio());
	app.whenReady().then(start).catch(fail);
}

function fail(err: unknown) {
	console.error(err);
	if (smoke) writeFileSync(smoke, JSON.stringify({ ok: false, error: String(err) }));
	app.exit(1);
}

async function start() {
	// safeStorage works only once the app is ready.
	setTokenStore(keychainTokenStore("github"));
	setFigmaTokenStore(keychainTokenStore("figma"));
	try {
		studio = await startStudio({ port: 0 });
	} catch (err) {
		return fail(err);
	}
	const origin = new URL(studio.url).origin;
	session.defaultSession.setPermissionRequestHandler((_wc, permission, done, details) =>
		done(allowPermission(permission, details.requestingUrl, origin)),
	);
	session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
		allowPermission(permission, requestingOrigin, origin),
	);

	// Copy and paste: the Edit menu gives ⌘C / Ctrl+C, the right-click menu the rest.
	Menu.setApplicationMenu(
		Menu.buildFromTemplate([
			...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
			{ role: "editMenu" },
			{
				label: "View",
				submenu: [
					{ role: "reload" },
					{ type: "separator" },
					{ role: "resetZoom" },
					{ role: "zoomIn" },
					{ role: "zoomOut" },
					{ type: "separator" },
					{ role: "togglefullscreen" },
				],
			},
			{ role: "windowMenu" },
		]),
	);
	// The page's only bridge to the app (preload.cts); it answers the studio's own origin only.
	const fromStudio = (event: Electron.IpcMainInvokeEvent) =>
		!!win && new URL(event.senderFrame?.url ?? "about:blank").origin === origin;
	ipcMain.handle("studio:pick-folder", async (event) => {
		if (!win || !fromStudio(event)) return null;
		const r = await dialog.showOpenDialog(win, {
			title: "Choose an Edge Delivery project folder",
			buttonLabel: "Open project",
			properties: ["openDirectory"],
		});
		return r.canceled ? null : (r.filePaths[0] ?? null);
	});
	if (!smoke) {
		const updates = startUpdates(() => win);
		ipcMain.handle("studio:update-state", (e) => (fromStudio(e) ? updates.state() : null));
		ipcMain.handle("studio:update-check", (e) => (fromStudio(e) ? updates.check() : undefined));
		ipcMain.handle("studio:update-install", (e) => fromStudio(e) && updates.install());
	}
	await openWindow();
	if (!smoke)
		palette = startPalette({
			url: studio.url,
			openStudio: showStudio,
			onEmpty: quitIfClosed,
			quit: () => app.quit(),
		});

	if (smoke) {
		const status = await fetch(`${studio.url}api/status`, {
			headers: { host: new URL(studio.url).host },
		}).then((r) => r.json());
		const title = await win?.webContents.executeJavaScript("document.title");
		const eds = await resolveEds().then(
			(e) => ({ ok: true, version: e.version }),
			(e: Error) => ({ ok: false, error: e.message }),
		);
		// Run a real command, so a CLI that only answers --version doesn't pass.
		const dir = mkdtempSync(path.join(os.tmpdir(), "studio-smoke-"));
		writeFileSync(path.join(dir, "fstab.yaml"), "mountpoints: {}\n");
		const job = await waitForJob(
			(await startJob({ projectId: "smoke", cwd: dir, kind: "list", args: ["draft", "list"] })).id,
		);
		const list = { ok: job.events.some((e) => e.type === "drafts"), stderr: job.stderr.slice(-3) };
		const ok = eds.ok && list.ok && title === "aem-eds-studio";
		writeFileSync(smoke, JSON.stringify({ ok, title, eds, list, status }));
		await studio.close();
		app.exit(ok ? 0 : 1);
	}
}

/** The studio's main window, at a route of its page (e.g. #/p/<id>/agents/<job>). */
async function openWindow(hash = "") {
	if (!studio) return;
	const origin = new URL(studio.url).origin;
	const w = new BrowserWindow({
		width: 1360,
		height: 900,
		minWidth: 380,
		minHeight: 560,
		title: "AEM EDS Studio",
		backgroundColor: "#0d0d0c",
		show: !smoke,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			preload: path.join(import.meta.dirname, "preload.cjs"),
		},
	});
	// The studio's own pages stay in the window; everything else (a design
	// link, "open the preview in a new tab") goes to the system browser.
	w.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//.test(url)) void shell.openExternal(url);
		return { action: "deny" };
	});
	w.webContents.on("will-navigate", (event, url) => {
		if (new URL(url).origin !== origin) {
			event.preventDefault();
			if (/^https?:\/\//.test(url)) void shell.openExternal(url);
		}
	});
	w.webContents.on("context-menu", (_e, p) => {
		const items: Electron.MenuItemConstructorOptions[] = p.isEditable
			? [
					{ role: "cut" },
					{ role: "copy" },
					{ role: "paste" },
					{ type: "separator" },
					{ role: "selectAll" },
				]
			: [{ role: "copy", enabled: !!p.selectionText }, { role: "selectAll" }];
		if (p.linkURL && /^https?:/.test(p.linkURL))
			items.push(
				{ type: "separator" },
				{ label: "Copy link", click: () => clipboard.writeText(p.linkURL) },
			);
		Menu.buildFromTemplate(items).popup({ window: w });
	});

	w.on("closed", () => {
		win = null;
		quitIfClosed();
	});
	win = w;
	await w.loadURL(`${studio.url}${hash}`);
}

/** Bring the main window up, opening it again if it was closed. */
function showStudio(hash?: string) {
	if (!win) return void openWindow(hash);
	if (win.isMinimized()) win.restore();
	win.show();
	win.focus();
	if (hash) void win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`);
}

/**
 * With its window closed the app stays only while the agents palette has
 * something to show: an agent working, or one that just finished.
 */
function quitIfClosed() {
	if (win) return;
	const busy = listJobs().some((j) => j.status === "running" || j.status === "queued");
	if (!palette?.window()?.isVisible() && !busy) app.quit();
}

app.on("window-all-closed", () => app.quit());
// macOS: the Dock icon brings the window back.
app.on("activate", () => showStudio());
app.on("before-quit", () => {
	void studio?.close();
});
