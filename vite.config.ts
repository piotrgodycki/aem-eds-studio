import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The UI is built into dist/web and served by the studio server. In development
// (`npm run dev:web`), API calls go to the server started with `npm run dev:server`.
export default defineConfig({
	root: "src/web",
	plugins: [react()],
	build: { outDir: "../../dist/web", emptyOutDir: true },
	server: { proxy: { "/api": "http://127.0.0.1:4600" } },
});
