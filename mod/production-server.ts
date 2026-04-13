import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProductionRuntimePaths } from "./runtime-host.ts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const runtimePaths = resolveProductionRuntimePaths(import.meta.url);

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

const formatEarlyExit = (code: number | null, signal: NodeJS.Signals | null) => {
	const details = [code !== null ? `code ${code}` : null, signal ? `signal ${signal}` : null]
		.filter(Boolean)
		.join(", ");

	return `The web UI server exited before it became ready${details ? ` (${details})` : ""}.`;
};

export async function startProductionServer(options: {
	open?: boolean;
	outputPath: string;
	port: number;
}) {
	if (!existsSync(runtimePaths.runtimeServerEntry)) {
		throw new Error(
			[
				`Expected packaged production runtime at ${runtimePaths.runtimeServerEntry}.`,
				"Run `pnpm build` in the modviz package before launching the UI.",
			].join(" "),
		);
	}

	const runtimeHostEntry = existsSync(runtimePaths.runtimeHostBuildEntry)
		? runtimePaths.runtimeHostBuildEntry
		: runtimePaths.runtimeHostSourceEntry;
	if (!existsSync(runtimeHostEntry)) {
		throw new Error(
			[
				`Expected a runtime host entry at ${runtimePaths.runtimeHostBuildEntry} or ${runtimePaths.runtimeHostSourceEntry}.`,
				"Run `pnpm build` in the modviz package before launching the UI.",
			].join(" "),
		);
	}

	const historyDir = path.join(
		path.dirname(path.resolve(options.outputPath)),
		".modviz",
		"history",
	);

	const child = spawn(process.execPath, [runtimeHostEntry], {
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
	let onEarlyError: ((error: Error) => void) | undefined;
	let onEarlyExit: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
	const childFailure = new Promise<never>((_, reject) => {
		onEarlyError = (error) => reject(error);
		onEarlyExit = (code, signal) => reject(new Error(formatEarlyExit(code, signal)));
		child.once("error", onEarlyError);
		child.once("exit", onEarlyExit);
	});

	try {
		await Promise.race([waitForServer(url), childFailure]);
	} finally {
		if (onEarlyError) {
			child.off("error", onEarlyError);
		}
		if (onEarlyExit) {
			child.off("exit", onEarlyExit);
		}
	}

	if (options.open !== false) {
		await openBrowser(url);
	}

	await new Promise<void>((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code, signal) => {
			if (code === 0 || signal === "SIGINT" || signal === "SIGTERM") {
				resolve();
				return;
			}

			reject(new Error(formatEarlyExit(code, signal)));
		});
	});
}
