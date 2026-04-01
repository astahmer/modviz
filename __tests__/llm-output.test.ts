import { expect, test } from "vitest";
import {
	buildModvizLlmOutput,
	inferLlmOutputPaths,
	renderModvizLlmMarkdown,
} from "../mod/llm-output.ts";
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

const outputFixture: ModvizOutput = {
	metadata: {
		entrypoints: ["src/main.ts"],
		basePath: "/repo",
		totalFiles: 8,
		generatedAt: "2026-04-01T00:00:00.000Z",
		nodeModulesCount: 2,
		packages: [],
	},
	imports: [],
	nodes: [
		baseNode({
			name: "main.ts",
			path: "src/main.ts",
			type: "entry",
			importees: ["src/shared/api.ts"],
			chain: [["src/main.ts"]],
		}),
		baseNode({
			name: "api.ts",
			path: "src/shared/api.ts",
			importees: [
				"src/features/foo/index.ts",
				"src/features/bar/index.ts",
				"node_modules/date-fns/index.js",
			],
			importedBy: ["src/main.ts"],
			chain: [["src/main.ts", "src/shared/api.ts"]],
		}),
		baseNode({
			name: "index.ts",
			path: "src/features/foo/index.ts",
			type: "barrel",
			importees: ["src/features/foo/foo.ts", "node_modules/lodash-es/index.js"],
			importedBy: ["src/shared/api.ts"],
			isBarrelFile: true,
			chain: [
				["src/main.ts", "src/shared/api.ts", "src/features/foo/index.ts"],
			],
		}),
		baseNode({
			name: "foo.ts",
			path: "src/features/foo/foo.ts",
			importedBy: ["src/features/foo/index.ts"],
			chain: [
				[
					"src/main.ts",
					"src/shared/api.ts",
					"src/features/foo/index.ts",
					"src/features/foo/foo.ts",
				],
			],
		}),
		baseNode({
			name: "index.ts",
			path: "src/features/bar/index.ts",
			type: "barrel",
			importees: ["src/features/bar/bar.ts", "node_modules/lodash-es/index.js"],
			importedBy: ["src/shared/api.ts"],
			isBarrelFile: true,
			chain: [
				["src/main.ts", "src/shared/api.ts", "src/features/bar/index.ts"],
			],
		}),
		baseNode({
			name: "bar.ts",
			path: "src/features/bar/bar.ts",
			importedBy: ["src/features/bar/index.ts"],
			chain: [
				[
					"src/main.ts",
					"src/shared/api.ts",
					"src/features/bar/index.ts",
					"src/features/bar/bar.ts",
				],
			],
		}),
		baseNode({
			name: "date-fns",
			path: "node_modules/date-fns/index.js",
			type: "external",
			importedBy: ["src/shared/api.ts"],
			chain: [
				["src/main.ts", "src/shared/api.ts", "node_modules/date-fns/index.js"],
			],
		}),
		baseNode({
			name: "lodash-es",
			path: "node_modules/lodash-es/index.js",
			type: "external",
			importedBy: ["src/features/foo/index.ts", "src/features/bar/index.ts"],
			chain: [
				[
					"src/main.ts",
					"src/shared/api.ts",
					"src/features/foo/index.ts",
					"node_modules/lodash-es/index.js",
				],
				[
					"src/main.ts",
					"src/shared/api.ts",
					"src/features/bar/index.ts",
					"node_modules/lodash-es/index.js",
				],
			],
		}),
	],
};

test("buildModvizLlmOutput highlights barrel impact and multiple origins", () => {
	const report = buildModvizLlmOutput(outputFixture);

	expect(report.format).toBe("modviz-llm-v1");
	expect(report.summary.barrelFiles).toBe(2);
	expect(report.summary.externalDependencies).toBe(2);
	expect(report.summary.externalPackages).toBe(2);
	expect(report.summary.nodesWithMultipleOrigins).toBe(1);

	const lodash = report.externalDependencies.find(
		(dependency) => dependency.packageName === "lodash-es",
	);
	expect(lodash).toMatchObject({
		directImporterCount: 2,
		directImporters: ["src/features/bar/index.ts", "src/features/foo/index.ts"],
		barrelSources: ["src/features/bar/index.ts", "src/features/foo/index.ts"],
	});
	expect(lodash?.introducedThrough).toEqual([
		{
			path: "src/features/bar/index.ts",
			originChains: [
				[
					"src/main.ts",
					"src/shared/api.ts",
					"src/features/bar/index.ts",
					"node_modules/lodash-es/index.js",
				],
			],
		},
		{
			path: "src/features/foo/index.ts",
			originChains: [
				[
					"src/main.ts",
					"src/shared/api.ts",
					"src/features/foo/index.ts",
					"node_modules/lodash-es/index.js",
				],
			],
		},
	]);

	const fooBarrel = report.barrelFiles.find(
		(barrelFile) => barrelFile.path === "src/features/foo/index.ts",
	);
	expect(fooBarrel).toMatchObject({
		impact: {
			reachableModulesCount: 2,
			reachableNodeModulesCount: 1,
		},
	});
	expect(fooBarrel?.nodeModulesIntroduced).toEqual([
		{
			path: "node_modules/lodash-es/index.js",
			packageName: "lodash-es",
			chainsFromBarrel: [
				["src/features/foo/index.ts", "node_modules/lodash-es/index.js"],
			],
		},
	]);

	const lodashPackage = report.externalPackages.find(
		(pkg) => pkg.packageName === "lodash-es",
	);
	expect(lodashPackage).toMatchObject({
		sourceCount: 2,
		sources: ["src/features/bar/index.ts", "src/features/foo/index.ts"],
		barrelSources: ["src/features/bar/index.ts", "src/features/foo/index.ts"],
	});
});

test("renderModvizLlmMarkdown summarizes multi-source packages", () => {
	const markdown = renderModvizLlmMarkdown(buildModvizLlmOutput(outputFixture));

	expect(markdown).toContain("# modviz LLM report");
	expect(markdown).toContain("## node_modules with multiple sources");
	expect(markdown).toContain(
		"lodash-es is introduced by 2 sources: src/features/bar/index.ts, src/features/foo/index.ts",
	);
});

test("inferLlmOutputPaths derives companion filenames from the base output", () => {
	expect(inferLlmOutputPaths("reports/modviz.json")).toEqual({
		json: "reports/modviz.llm.json",
		markdown: "reports/modviz.llm.md",
	});
});
