import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
// The site's typefaces, bundled so the desktop app works offline.
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/geist-mono/700.css";
import "./styles.css";

const root = document.getElementById("root");
if (root)
	createRoot(root).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
