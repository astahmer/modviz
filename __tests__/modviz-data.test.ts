import { expect, test } from "vitest";
import type { ModvizOutput, VizNode } from "../mod/types";
import { buildModvizSummary, getExternalPackageName } from "~/utils/modviz-data";

const createNode = (path: string, packageName?: string): VizNode => ({
	name: path.split("/").at(-1) ?? path,
	path,
	type: "external",
	package: packageName
		? {
				name: packageName,
				path: packageName,
			}
		: undefined,
	cluster: undefined,
	imports: [],
	exports: [],
	unusedExports: [],
	importees: [],
	importedBy: [],
	isBarrelFile: false,
	chain: [],
});

const createGraph = (nodes: VizNode[]): ModvizOutput => ({
	metadata: {
		entrypoints: [],
		basePath: "/repo",
		totalFiles: nodes.length,
		generatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
		nodeModulesCount: 0,
		packages: [
			{
				name: "app",
				path: "apps/app",
			},
		],
	},
	nodes,
	imports: [],
});

test("getExternalPackageName handles relative node_modules paths", () => {
	expect(getExternalPackageName(createNode("node_modules/zod/index.js"))).toBe("zod");
	expect(getExternalPackageName(createNode("node_modules/date-fns/format.js"))).toBe("date-fns");
});

test("getExternalPackageName handles scoped packages", () => {
	expect(getExternalPackageName(createNode("node_modules/@tanstack/react-router/dist/index.js"))).toBe(
		"@tanstack/react-router",
	);
});

test("getExternalPackageName handles pnpm nested node_modules paths", () => {
	expect(
		getExternalPackageName(
			createNode("node_modules/.pnpm/lodash@4.17.21/node_modules/lodash/lodash.js"),
		),
	).toBe("lodash");
});

test("getExternalPackageName ignores bogus package metadata", () => {
	expect(
		getExternalPackageName(
			createNode("node_modules/lodash/lodash.js", "node_modules"),
		),
	).toBe("lodash");
	expect(
		getExternalPackageName(
			createNode("node_modules/lodash/lodash.js", "lodash"),
		),
	).toBe("lodash");
});

test("buildModvizSummary ranks hotspots by graph-derived transitive reach without llm", () => {
	const leaf = {
		...createNode("src/leaf.ts", "app"),
		name: "leaf.ts",
		type: "workspace",
		package: { name: "app", path: "apps/app" },
	};
	const branch = {
		...createNode("src/branch.ts", "app"),
		name: "branch.ts",
		type: "workspace",
		package: { name: "app", path: "apps/app" },
		importees: [leaf.path],
	};
	const root = {
		...createNode("src/root.ts", "app"),
		name: "root.ts",
		type: "workspace",
		package: { name: "app", path: "apps/app" },
		importees: [branch.path],
	};
	const wide = {
		...createNode("src/wide.ts", "app"),
		name: "wide.ts",
		type: "workspace",
		package: { name: "app", path: "apps/app" },
		importees: [branch.path, leaf.path],
	};

	branch.importedBy = [root.path, wide.path];
	leaf.importedBy = [branch.path, wide.path];

	const summary = buildModvizSummary(createGraph([root, wide, branch, leaf]), null);

	expect(summary.hotspots.map((item) => [item.path, item.value])).toEqual([
		[root.path, 2],
		[wide.path, 2],
		[branch.path, 1],
		[leaf.path, 0],
	]);
	expect(summary.topImporters.map((item) => [item.path, item.value])).toEqual([
		[wide.path, 2],
		[branch.path, 1],
		[root.path, 1],
		[leaf.path, 0],
	]);
	expect(summary.hotspots[0]?.description).toBe("2 transitive imports • 1 direct imports • 0 inbound imports");
});

test("buildModvizSummary excludes self from transitive reach in cycles", () => {
	const alpha = {
		...createNode("src/alpha.ts", "app"),
		name: "alpha.ts",
		type: "workspace",
		package: { name: "app", path: "apps/app" },
		importees: ["src/beta.ts"],
		importedBy: ["src/beta.ts"],
	};
	const beta = {
		...createNode("src/beta.ts", "app"),
		name: "beta.ts",
		type: "workspace",
		package: { name: "app", path: "apps/app" },
		importees: [alpha.path],
		importedBy: [alpha.path],
	};

	const summary = buildModvizSummary(createGraph([alpha, beta]), null);

	expect(summary.hotspots.map((item) => [item.path, item.value])).toEqual([
		[alpha.path, 1],
		[beta.path, 1],
	]);
});
