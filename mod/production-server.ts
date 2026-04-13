import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const packagedRuntimeRoot = path.join(packageRoot, "dist");

const openBrowser = async (url: string) => {
	const platform = process.platform;
	const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
	const args = platform === "win32" ? ["/c", "start", "", url] : [url];

	spawn(command, args, {
		detached: true,
		stdio: "ignore",
	}).unref();
};

const waitForServer = async (url: string, timeoutMs = 20000) => {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const response = await fetch(url, { method: "GET" });
			if (response.ok) {
				return;
			}
		} catch {
			// Keep polling until the server is reachable.
		}

		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	throw new Error(`Timed out waiting for the web UI server at ${url}`);
};

export async function startProductionServer(options: {
	open?: boolean;
	outputPath: string;
	port: number;
}) {
	const serverEntry = path.join(packagedRuntimeRoot, "server", "server.js");
	if (!existsSync(serverEntry)) {
		throw new Error(
			[
				`Expected packaged production runtime at ${serverEntry}.`,
				"Run `pnpm build` in the modviz package before launching the UI.",
			].join(" "),
		);
	}

	const historyDir = path.join(
		path.dirname(path.resolve(options.outputPath)),
		".modviz",
		"history",
	);

	const child = spawn(process.execPath, [serverEntry], {
		cwd: packagedRuntimeRoot,
		env: {
			...process.env,
			MODVIZ_PATH: options.outputPath,
			MODVIZ_HISTORY_DIR: process.env.MODVIZ_HISTORY_DIR ?? historyDir,
			PORT: String(options.port),
		},
		stdio: "inherit",
	});

	const shutdown = () => {
		child.kill("SIGTERM");
	};

	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);

	const url = `http://localhost:${options.port}`;
	await waitForServer(url);
	if (options.open !== false) {
		await openBrowser(url);
	}

	await new Promise<void>((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", () => resolve());
	});
}
