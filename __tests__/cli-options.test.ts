import { expect, test } from "vitest";
import {
	buildCliSummary,
	parseCliArgs,
	validateCliArgs,
} from "../mod/cli-options.ts";
import type { ModvizOutput, VizNode } from "../mod/types.ts";

const baseNode = (overrides: Partial<VizNode>): VizNode => ({
	name: "",
	path: "",
	type: "internal",
	imports: [],
	exports: [],
	unusedExports: [],
	importees: [],
	importedBy: [],
	isBarrelFile: false,
	chain: [],
	...overrides,
});

test("parseCliArgs separates entry files from serve data files", () => {
	const standard = parseCliArgs(["src/index.ts", "--ui", "--summary"]);
	expect(standard.entryFile).toBe("src/index.ts");
	expect(standard.serveDataFile).toBeUndefined();
	expect(standard.command).toBe("analyze");
	expect(standard.flags.ui).toBe(true);
	expect(standard.flags.summary).toBe(true);

	const serve = parseCliArgs(["serve", "./modviz.json", "--port=4010"]);
	expect(serve.entryFile).toBeUndefined();
	expect(serve.serveDataFile).toBe("./modviz.json");
	expect(serve.command).toBe("serve");
	expect(serve.flags.serve).toBe(true);
	expect(serve.flags.port).toBe("4010");
});

test("parseCliArgs supports report subcommand and named snapshot flags", () => {
	const report = parseCliArgs([
		"report",
		"--summary",
		"--snapshot=before-refactor",
		"--package=zod",
	]);

	expect(report.command).toBe("report");
	expect(report.flags.summary).toBe(true);
	expect(report.flags.snapshot).toBe("before-refactor");
	expect(report.flags.packageQuery).toBe("zod");
});

test("parseCliArgs supports space-separated option values and no-open", () => {
	const parsed = parseCliArgs([
		"analyze",
		"src/index.ts",
		"--port",
		"4010",
		"--output-file",
		"out/modviz.json",
		"--package",
		"@scope/pkg",
		"--no-open",
	]);

	expect(parsed.entryFile).toBe("src/index.ts");
	expect(parsed.flags.port).toBe("4010");
	expect(parsed.flags.outputFile).toBe("out/modviz.json");
	expect(parsed.flags.packageQuery).toBe("@scope/pkg");
	expect(parsed.flags.open).toBe(false);
});

test("validateCliArgs rejects invalid numeric options", () => {
	const invalidPort = parseCliArgs(["src/index.ts", "--port=nope"]);
	expect(validateCliArgs(invalidPort)).toBe("Invalid --port value: nope");

	const invalidLimit = parseCliArgs(["src/index.ts", "--limit=0"]);
	expect(validateCliArgs(invalidLimit)).toBe("Invalid --limit value: 0");

	const invalidReport = parseCliArgs(["report"]);
	expect(validateCliArgs(invalidReport)).toBe(
		"Report command requires --summary, --package, --node, or --list-snapshots.",
	);
});

test("buildCliSummary prints compact graph stats", () => {
	const output: ModvizOutput = {
		metadata: {
			entrypoints: ["src/main.ts"],
			basePath: "/repo",
			totalFiles: 3,
			generatedAt: "2026-04-01T00:00:00.000Z",
			nodeModulesCount: 1,
			packages: [{ name: "app", path: "apps/app" }],
		},
		imports: ["src/main.ts", "src/lib.ts"],
		nodes: [
			baseNode({
				name: "main.ts",
				path: "src/main.ts",
				type: "entry",
			}),
			baseNode({
				name: "lib.ts",
				path: "src/lib.ts",
				isBarrelFile: true,
			}),
			baseNode({
				name: "zod",
				path: "node_modules/zod/index.js",
				type: "external",
			}),
		],
	};

	const summary = buildCliSummary(output);

	expect(summary).toContain("Graph summary");
	expect(summary).toContain("- Nodes: 3 total (2 workspace, 1 external)");
	expect(summary).toContain("- External packages: 1");
	expect(summary).toContain("- Barrel files: 1");
});
