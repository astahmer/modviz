import { expect, test } from "vitest";
import type { VizNode } from "../mod/types";
import {
	buildTreemapModel,
	collectTreemapModules,
	getTreemapAncestors,
	layoutTreemap,
} from "~/utils/treemap";

const createNode = (overrides: Partial<VizNode> & Pick<VizNode, "path">): VizNode => ({
	name: overrides.path.split("/").at(-1) ?? overrides.path,
	path: overrides.path,
	type: overrides.type ?? "file",
	package: overrides.package,
	cluster: overrides.cluster,
	imports: overrides.imports ?? [],
	exports: overrides.exports ?? [],
	unusedExports: overrides.unusedExports ?? [],
	importees: overrides.importees ?? [],
	importedBy: overrides.importedBy ?? [],
	isBarrelFile: overrides.isBarrelFile ?? false,
	chain: overrides.chain ?? [],
});

test("buildTreemapModel keeps module ids stable for workspace drilldown", () => {
	const nodes = [
		createNode({
			path: "src/routes/treemap.tsx",
			cluster: "ui",
			importees: ["src/utils/treemap.ts"],
			importedBy: ["src/router.tsx"],
		}),
		createNode({
			path: "src/utils/treemap.ts",
			cluster: "ui",
			importees: [],
			importedBy: ["src/routes/treemap.tsx"],
		}),
	];
	const model = buildTreemapModel(
		nodes,
		new Set(["module-graph-viz"]),
		new Map([["ui", "#2563eb"]]),
	);

	const routeModule = model.nodesById.get("module:src/routes/treemap.tsx");
	expect(routeModule?.sourcePath).toBe("src/routes/treemap.tsx");
	expect(routeModule?.size).toBe(2);

	const routesFolder = model.nodesById.get("folder:workspace/src/routes");
	expect(routesFolder?.moduleCount).toBe(1);

	const ancestors = routeModule
		? getTreemapAncestors(routeModule, model.nodesById).map((node) => node.label)
		: [];
	expect(ancestors).toEqual(["All Modules", "Workspace", "src", "routes", "treemap.tsx"]);
});

test("buildTreemapModel groups external modules by package", () => {
	const nodes = [
		createNode({
			path: "node_modules/@tanstack/react-router/dist/esm/index.js",
			package: {
				name: "@tanstack/react-router",
				path: "node_modules/@tanstack/react-router",
			},
			importees: [],
			importedBy: ["src/routes/treemap.tsx"],
		}),
	];
	const model = buildTreemapModel(nodes, new Set(["module-graph-viz"]), new Map());

	const packageNode = model.nodesById.get("package:external/@tanstack/react-router");
	expect(packageNode?.moduleCount).toBe(1);
	expect(collectTreemapModules(packageNode!).map((node) => node.sourcePath)).toEqual([
		"node_modules/@tanstack/react-router/dist/esm/index.js",
	]);
});

test("layoutTreemap partitions immediate children without losing area", () => {
	const nodes = [
		createNode({ path: "src/a.ts", importees: ["src/b.ts"], importedBy: ["src/index.ts"] }),
		createNode({ path: "src/b.ts", importees: [], importedBy: ["src/a.ts"] }),
		createNode({ path: "src/c.ts", importees: ["src/a.ts", "src/b.ts"], importedBy: [] }),
	];
	const model = buildTreemapModel(nodes, new Set(["module-graph-viz"]), new Map());
	const workspaceNode = model.nodesById.get("scope:workspace");
	const rectangles = layoutTreemap(workspaceNode?.children ?? [], 0, 0, 1000, 600);

	expect(rectangles.length).toBeGreaterThan(0);
	const totalArea = rectangles.reduce((sum, rect) => sum + rect.width * rect.height, 0);
	expect(totalArea).toBeCloseTo(1000 * 600, 5);
});
