import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AgentsPalette } from "./AgentsPalette.js";
import { App } from "./App.js";
// The site's typefaces, bundled so the desktop app works offline.
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/geist-mono/700.css";
import "./styles.css";

// The desktop app opens the agents palette alone, in its own window, as ?palette.
const paletteWindow = new URLSearchParams(window.location.search).has("palette");
if (paletteWindow) document.documentElement.classList.add("palette-window");

const root = document.getElementById("root");
if (root)
	createRoot(root).render(
		<StrictMode>{paletteWindow ? <AgentsPalette onDesktop /> : <App />}</StrictMode>,
	);
