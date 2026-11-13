import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AgentsPalette } from "./AgentsPalette.js";
import { App } from "./App.js";
import { api } from "./api.js";
// The site's typefaces, bundled so the desktop app works offline.
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/geist-mono/700.css";
import "./styles.css";

// An error in the page goes to the studio's log (Settings → Logs), a few at most,
// so a loop of the same error can't flood it.
let reported = 0;
const report = (message: string) => {
	if (reported++ < 20) void api.reportError(message).catch(() => {});
};
window.addEventListener("error", (e) =>
	report(`${e.message} at ${e.filename}:${e.lineno}${e.error?.stack ? `\n${e.error.stack}` : ""}`),
);
window.addEventListener("unhandledrejection", (e) =>
	report(
		`Unhandled: ${e.reason instanceof Error ? (e.reason.stack ?? e.reason.message) : String(e.reason)}`,
	),
);

// The desktop app opens the agents palette alone, in its own window, as ?palette.
const paletteWindow = new URLSearchParams(window.location.search).has("palette");
if (paletteWindow) document.documentElement.classList.add("palette-window");

const root = document.getElementById("root");
if (root)
	createRoot(root).render(
		<StrictMode>{paletteWindow ? <AgentsPalette onDesktop /> : <App />}</StrictMode>,
	);
