import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
// import { devtools } from "@tanstack/devtools-vite";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	server: {
		port: 3628,
	},
	plugins: [
		tanstackStart({
			spa: { enabled: true },
			srcDirectory: "src",
		}),
		viteReact(),
		tailwindcss(),
	],
});
