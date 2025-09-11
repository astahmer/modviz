import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
// import { devtools } from "@tanstack/devtools-vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const srcDir = path.join(__dirname, "./src");

export default defineConfig({
	server: {
		port: 3000,
	},
	plugins: [
		tsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
		tanstackStart({
			customViteReactPlugin: true,
			spa: { enabled: true },
			tsr: {
				srcDirectory: srcDir,
			},
		}),
		viteReact(),
		tailwindcss(),
	],
});
