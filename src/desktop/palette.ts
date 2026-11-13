/**
 * The agents palette on the desktop: a small frameless window, always on top,
 * in the corner chosen in Settings. The page inside (?palette) tells it its
 * size; nothing to show means a hidden window. It stays while the main window
 * is closed, so you see an agent finish without the app open.
 */

import path from "node:path";
import { BrowserWindow, ipcMain, Menu, screen } from "electron";
import { readSettings, updateSettings } from "../server/settings.js";

const MARGIN = 16;
/** A hash route of the studio's own page, e.g. #/p/<id>/agents/<job>. */
const HASH = /^#\/[\w\-./%]*$/;

export interface Palette {
	window: () => BrowserWindow | null;
}

export function startPalette(opts: {
	url: string;
	/** Bring the main window up (opening it again if it was closed), at a route. */
	openStudio: (hash?: string) => void;
	/** The palette is hidden (nothing to show, or off): the app may quit if its window is closed. */
	onEmpty: () => void;
	quit: () => void;
}): Palette {
	const win = new BrowserWindow({
		width: 1,
		height: 1,
		show: false,
		frame: false,
		transparent: true,
		resizable: false,
		movable: false,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		skipTaskbar: true,
		hasShadow: false,
		alwaysOnTop: true,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			preload: path.join(import.meta.dirname, "preload.cjs"),
		},
	});
	win.setAlwaysOnTop(true, "floating");
	win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	const origin = new URL(opts.url).origin;
	const fromPalette = (e: Electron.IpcMainEvent) => e.sender === win.webContents;

	ipcMain.on("studio:palette-fit", async (e, width: unknown, height: unknown) => {
		if (!fromPalette(e) || win.isDestroyed()) return;
		const corner = (await readSettings()).desktopPalette ?? "bottom-right";
		const w = Math.min(Math.round(Number(width)) || 0, 420);
		const h = Math.min(Math.round(Number(height)) || 0, 480);
		if (corner === "off" || !w || !h) {
			win.hide();
			opts.onEmpty();
			return;
		}
		const area = screen.getPrimaryDisplay().workArea;
		const x = corner.endsWith("left") ? area.x + MARGIN : area.x + area.width - w - MARGIN;
		const y = corner.startsWith("top") ? area.y + MARGIN : area.y + area.height - h - MARGIN;
		const b = win.getBounds();
		if (b.x !== x || b.y !== y || b.width !== w || b.height !== h)
			win.setBounds({ x, y, width: w, height: h });
		if (!win.isVisible()) win.showInactive();
	});
	ipcMain.on("studio:palette-open", (e, hash: unknown) => {
		if (!fromPalette(e)) return;
		opts.openStudio(typeof hash === "string" && HASH.test(hash) ? hash : undefined);
	});
	win.webContents.on("context-menu", () =>
		Menu.buildFromTemplate([
			{ label: "Open AEM EDS Studio", click: () => opts.openStudio() },
			{
				label: "Hide this palette",
				click: async () => {
					await updateSettings({ desktopPalette: "off" });
					win.hide();
				},
			},
			{ type: "separator" },
			{ label: "Quit", click: opts.quit },
		]).popup({ window: win }),
	);
	// Nothing leaves the palette's window: its links go through palette-open.
	win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	win.webContents.on("will-navigate", (event, url) => {
		if (new URL(url).origin !== origin) event.preventDefault();
	});
	void win.loadURL(`${opts.url}?palette`);
	return { window: () => (win.isDestroyed() ? null : win) };
}
