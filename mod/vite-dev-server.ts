import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = path.join(__dirname, "..");
console.log({ viteConfig: path.join(root, "./web/vite.config.ts") });

export async function startServer(userPort: number | undefined) {
	const server = await createServer({
		// any valid user config options, plus `mode` and `configFile`
		configFile: path.join(root, "./web/vite.config.ts"),
		root,
		server: {
			port: userPort,
			open: true,
		},
	});
	await server.listen();

	server.printUrls();
	server.bindCLIShortcuts({ print: true });
}
