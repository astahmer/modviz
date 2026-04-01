import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = path.resolve(__dirname, "..");

const openBrowser = async (url: string) => {
	const platform = process.platform;
	const command =
		platform === "darwin"
			? "open"
			: platform === "win32"
				? "cmd"
				: "xdg-open";
	const args =
		platform === "win32" ? ["/c", "start", "", url] : [url];

	spawn(command, args, {
		detached: true,
		stdio: "ignore",
	}).unref();
};

const runCommand = (command: string, args: string[], cwd: string) =>
	new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env: process.env,
			stdio: "inherit",
		});

		child.once("error", reject);
		child.once("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
		});
	});

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
	await runCommand("pnpm", ["vite", "build"], packageRoot);

	const serverEntry = path.join(packageRoot, ".output/server/index.mjs");
	if (!existsSync(serverEntry)) {
		throw new Error(`Expected production server bundle at ${serverEntry}`);
	}

	const child = spawn(process.execPath, [serverEntry], {
		cwd: packageRoot,
		env: {
			...process.env,
			MODVIZ_PATH: options.outputPath,
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
