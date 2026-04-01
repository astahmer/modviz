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
		totalFiles: 11,
		generatedAt: "2026-04-01T00:00:00.000Z",
		nodeModulesCount: 4,
		packages: [
			{
				name: "@weliihq/core",
				path: "packages/core",
			},
		],
	},
	imports: [],
	nodes: [
		baseNode({
			name: "main.ts",
			path: "src/main.ts",
			type: "entry",
			importees: ["src/shared/api.ts", "packages/core/src/index.ts"],
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
			importees: ["node_modules/lodash-es/omit.js"],
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
			path: "packages/core/src/index.ts",
			importees: [
				"packages/core/src/helper.ts",
				"node_modules/lodash-es/index.js",
			],
			importedBy: ["src/main.ts"],
			chain: [["src/main.ts", "packages/core/src/index.ts"]],
		}),
		baseNode({
			name: "helper.ts",
			path: "packages/core/src/helper.ts",
			importedBy: ["packages/core/src/index.ts"],
			chain: [
				[
					"src/main.ts",
					"packages/core/src/index.ts",
					"packages/core/src/helper.ts",
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
			importedBy: [
				"packages/core/src/index.ts",
				"src/features/foo/index.ts",
				"src/features/bar/index.ts",
			],
			chain: [
				[
					"src/main.ts",
					"packages/core/src/index.ts",
					"node_modules/lodash-es/index.js",
				],
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
		baseNode({
			name: "omit.js",
			path: "node_modules/lodash-es/omit.js",
			type: "external",
			importedBy: ["src/features/foo/foo.ts"],
			chain: [
				[
					"src/main.ts",
					"src/shared/api.ts",
					"src/features/foo/index.ts",
					"src/features/foo/foo.ts",
					"node_modules/lodash-es/omit.js",
				],
			],
		}),
	],
};

test("buildModvizLlmOutput highlights barrel impact and multiple origins", () => {
	const report = buildModvizLlmOutput(outputFixture);

	expect(report.format).toBe("modviz-llm-v1");
	expect(report.summary.barrelFiles).toBe(2);
	expect(report.summary.externalDependencies).toBe(3);
	expect(report.summary.externalPackages).toBe(2);
	expect(report.summary.nodesWithMultipleOrigins).toBe(1);

	const lodash = report.externalDependencies.find(
		(dependency) => dependency.packageName === "lodash-es",
	);
	expect(lodash).toMatchObject({
		displayPath: "lodash-es (node_modules/lodash-es/index.js)",
		directImporterCount: 3,
		directImporters: [
			"packages/core/src/index.ts",
			"src/features/bar/index.ts",
			"src/features/foo/index.ts",
		],
		barrelSources: ["src/features/bar/index.ts", "src/features/foo/index.ts"],
	});
	expect(lodash?.introducedThrough).toEqual([
		{
			path: "packages/core/src/index.ts",
			originChains: [
				[
					"src/main.ts",
					"packages/core/src/index.ts",
					"node_modules/lodash-es/index.js",
				],
			],
		},
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
		displayPath: "src/features/foo/index.ts",
		impact: {
			reachableModulesCount: 3,
			reachableNodeModulesCount: 2,
		},
	});
	expect(fooBarrel?.nodeModulesIntroduced).toHaveLength(2);

	const lodashPackage = report.externalPackages.find(
		(pkg) => pkg.packageName === "lodash-es",
	);
	expect(lodashPackage).toMatchObject({
		sourceCount: 4,
		sourceGroupCount: 4,
		sources: [
			"packages/core/src/index.ts",
			"src/features/bar/index.ts",
			"src/features/foo/foo.ts",
			"src/features/foo/index.ts",
		],
		barrelSources: ["src/features/bar/index.ts", "src/features/foo/index.ts"],
		sourceGroups: [
			{
				kind: "workspace-package",
				label: "@weliihq/core",
				paths: ["packages/core/src/index.ts"],
			},
			{
				kind: "file",
				label: "src/features/bar/index.ts",
				paths: ["src/features/bar/index.ts"],
			},
			{
				kind: "file",
				label: "src/features/foo/foo.ts",
				paths: ["src/features/foo/foo.ts"],
			},
			{
				kind: "file",
				label: "src/features/foo/index.ts",
				paths: ["src/features/foo/index.ts"],
			},
		],
	});

	const coreHotspot = report.hotspots.find(
		(hotspot) => hotspot.path === "packages/core/src/index.ts",
	);
	expect(coreHotspot).toMatchObject({
		displayPath: "@weliihq/core (packages/core/src/index.ts)",
		topExternalPackages: ["lodash-es"],
	});
});

test("renderModvizLlmMarkdown summarizes multi-source packages", () => {
	const markdown = renderModvizLlmMarkdown(buildModvizLlmOutput(outputFixture));

	expect(markdown).toContain("# modviz LLM report");
	expect(markdown).toContain("## Import triggers to audit");
	expect(markdown).toContain(
		"@weliihq/core (packages/core/src/index.ts) (internal) reaches 2 modules, including 1 node_modules modules",
	);
	expect(markdown).toContain("Pulls in: lodash-es");
	expect(markdown).toContain("## node_modules with multiple sources");
	expect(markdown).toContain(
		"lodash-es is introduced by 4 sources: @weliihq/core, src/features/bar/index.ts, src/features/foo/foo.ts, src/features/foo/index.ts",
	);
	expect(markdown).not.toContain("Pulls in: lodash-es, lodash-es");
});

test("inferLlmOutputPaths derives companion filenames from the base output", () => {
	expect(inferLlmOutputPaths("reports/modviz.json")).toEqual({
		json: "reports/modviz.llm.json",
		markdown: "reports/modviz.llm.md",
	});
});
