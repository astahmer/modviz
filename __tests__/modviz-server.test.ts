import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { ModvizOutput } from "../mod/types";
import { resolveProjectTitle } from "~/utils/modviz-server";

const tempDirs: string[] = [];

afterEach(() => {
	for (const tempDir of tempDirs.splice(0)) {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

const createGraph = (basePath: string, entrypoints: string[]): ModvizOutput => ({
	metadata: {
		entrypoints,
		basePath,
		totalFiles: 1,
		generatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
		nodeModulesCount: 0,
		packages: [
			{
				name: "fallback-package",
				path: ".",
			},
		],
	},
	nodes: [],
	imports: [],
});

test("resolveProjectTitle reads the closest package.json from the first entrypoint", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "modviz-server-test-"));
	tempDirs.push(tempDir);

	const packageRoot = path.join(tempDir, "apps", "web");
	const entrypointDir = path.join(packageRoot, "src");
	mkdirSync(entrypointDir, { recursive: true });
	writeFileSync(
		path.join(packageRoot, "package.json"),
		JSON.stringify({ name: "workspace-web" }),
	);
	writeFileSync(path.join(entrypointDir, "main.ts"), "export {}\n");

	const graph = createGraph(tempDir, ["apps/web/src/main.ts"]);

	expect(resolveProjectTitle(graph)).toBe("workspace-web");
});

test("resolveProjectTitle prefers title over name when available", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "modviz-server-test-"));
	tempDirs.push(tempDir);

	const packageRoot = path.join(tempDir, "packages", "dashboard");
	const entrypointDir = path.join(packageRoot, "src");
	mkdirSync(entrypointDir, { recursive: true });
	writeFileSync(
		path.join(packageRoot, "package.json"),
		JSON.stringify({ name: "dashboard-app", title: "Dashboard" }),
	);
	writeFileSync(path.join(entrypointDir, "index.ts"), "export {}\n");

	const graph = createGraph(tempDir, ["packages/dashboard/src/index.ts"]);

	expect(resolveProjectTitle(graph)).toBe("Dashboard");
});
