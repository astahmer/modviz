import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = path.join(__dirname, "..");

export async function startServer(options: {
	port: number | undefined;
	outputPath: string;
}) {
	const server = await createServer({
		// any valid user config options, plus `mode` and `configFile`
		// configFile: path.join(root, "./vite.config.ts"),
		root,
		define: {
			"import.meta.env.modvizPath": JSON.stringify(options.outputPath),
		},
		server: {
			port: options.port,
			open: true,
			// hmr: false,
			// watch: null,
			// ws: false,
		},
	});
	await server.listen();

	server.printUrls();
	// server.bindCLIShortcuts({ print: true });
}
