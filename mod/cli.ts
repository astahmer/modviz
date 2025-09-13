import { existsSync, writeFileSync } from "node:fs";
import {
	createModuleGraph,
	type Module,
	type Plugin,
} from "@thepassle/module-graph";
import type { ModuleGraph } from "@thepassle/module-graph/ModuleGraph.js";
import { barrelFile } from "@thepassle/module-graph/plugins/barrel-file.js";
import { exports } from "@thepassle/module-graph/plugins/exports.js";
import { imports } from "@thepassle/module-graph/plugins/imports.js";
import { typescript } from "@thepassle/module-graph/plugins/typescript.js";
import { unusedExports } from "@thepassle/module-graph/plugins/unused-exports.js";
import path from "node:path";
import type { ModvizOutput, VizExport, VizImport, VizNode } from "./types.ts";
// import { parse } from "tsconfck";
import { findWorkspaces, type Workspace } from "find-workspaces";

// Parse command line arguments
const args = process.argv.slice(2);
const entryFile = args.find((arg) => !arg.startsWith("--"));
const flags = {
	port: args.find((arg) => arg.startsWith("--port="))?.split("=")[1],
	noUi: args.includes("--no-ui"),
	outputFile:
		args.find((arg) => arg.startsWith("--output-file="))?.split("=")[1] ??
		"./modviz.json",
	serve: args.includes("--serve"),
	help: args.includes("--help") || args.includes("-h"),
};

if (flags.help || (!entryFile && !flags.serve)) {
	console.log(`
modviz - Interactive Dependency Graph Visualizer

Usage:
  modviz <entryFile>                    Generate graph and launch web UI
  modviz <entryFile> --no-ui      Generate graph data only
  modviz --serve [dataFile]             Launch web UI with existing data
  modviz <entryFile> --port=4000        Use custom port

Options:
  --port=<port>     Port for web server (default: 3000)
  --no-ui     Generate JSON data only, don't launch UI
  --serve           Launch UI server (optionally with existing data file)
  --help, -h        Show this help message

Examples:
  modviz src/index.ts
  modviz src/index.ts --port=4000
  modviz --serve ./modviz.json
	`);
	process.exit(0);
}

// If serving existing data
if (flags.serve) {
	const dataFile = args.find((arg) => !arg.startsWith("--") && arg !== "serve");
	await launchWebUI(flags.port, dataFile);
	process.exit(0);
}

if (!entryFile) {
	console.error("Error: Entry file is required when not using --serve");
	process.exit(1);
}

if (!existsSync(entryFile)) {
	console.error(`Error: Entry file "${entryFile}" does not exist`);
	process.exit(1);
}

console.log(`🔍 Analyzing dependency graph for: ${entryFile}`);

// const tsconfig = await parse(entryFile);
const workspaces = findWorkspaces(entryFile) ?? [];

const moduleGraph = await createModuleGraph(entryFile, {
	exclude: [(importee) => importee.includes("node_modules")], // TODO configurable flag to allow this
	plugins: [
		typescript(),
		imports,
		exports,
		unusedExports,
		barrelFile({
			amountOfExportsToConsiderModuleAsBarrel: 3, // TODO configurable
		}),
	],
});

const workspaceList = (workspaces ?? []).map((workspace) => ({
	path: path.relative(moduleGraph.basePath, workspace.location),
	name: workspace.package.name,
}));
const webGraphData = processModuleGraphForWeb(
	moduleGraph,
	entryFile,
	workspaceList,
);

writeFileSync(
	flags.outputFile,
	JSON.stringify(
		{
			...webGraphData,
			workspaces: workspaceList,
		},
		null,
		2,
	),
);
console.log(`📊 Graph data saved to: ${flags.outputFile}`);

if (!flags.noUi) {
	await launchWebUI(flags.port, flags.outputFile);
}

function processModuleGraphForWeb(
	moduleGraph: ModuleGraph,
	entryPoint: string,
	workspaces: Array<{ path: string; name: string }>,
): ModvizOutput {
	const nodeList: ModvizOutput["nodes"] = [];
	const edgeList = new Set<string>();

	for (const [filePath, importees] of moduleGraph.graph) {
		const module = moduleGraph.modules.get(filePath)!;
		const imports = (module.imports ?? []) as VizImport[];
		const exports = (module.exports ?? []) as VizExport[];
		const unusedExports = (module.unusedExports ?? []) as VizExport[];

		const node: VizNode = {
			name: path.basename(filePath),
			path: filePath,
			type: getNodeType(filePath, module, entryPoint),
			package: workspaces.find((workspace) =>
				filePath.startsWith(workspace.path),
			),
			imports,
			exports,
			unusedExports,
			importees: Array.from(importees),
			importedBy: module.importedBy,
			isBarrelFile: module.isBarrelFile || false,
			chain: findImportChains(moduleGraph, (path) => path === filePath),
		};
		nodeList.push(node);

		importees.forEach((importee) => {
			edgeList.add(`${filePath}->${importee}`);
		});
	}

	const uniqueModules = moduleGraph.getUniqueModules();

	return {
		metadata: {
			entryPoint,
			basePath: moduleGraph.basePath,
			totalFiles: moduleGraph.getUniqueModules().length,
			generatedAt: new Date().toISOString(),
			nodeModulesCount: nodeList.filter((n) => n.path.includes("node_modules"))
				.length,
			packages: workspaceList,
		},
		nodes: nodeList,
		// edges: Array.from(edgeList).map((edge) => {
		// 	const [source, target] = edge.split("->");
		// 	return { source, target };
		// }),
		imports: uniqueModules,
	};
}

function getNodeType(
	filePath: string,
	module: Module,
	entryPoint: string,
): string {
	if (filePath === entryPoint) return "entry";
	if (filePath.includes("node_modules")) return "external";
	if (module.isBarrelFile) return "barrel";
	return "internal";
}

async function launchWebUI(port: string | undefined, dataFile?: string) {
	console.log(`🚀 Launching web UI...`);
	// const { startServer: createServer } = await import("./server/dev-server.ts");
	// await createServer(port ? Number.parseInt(port) : undefined, dataFile);
	const { startServer } = await import("./vite-dev-server.ts");
	await startServer({
		port: port ? Number.parseInt(port) : undefined,
		outputPath: path.resolve(dataFile ?? flags.outputFile),
	});
}

function findImportChains(
	moduleGraph: ModuleGraph,
	targetModule: string | string[] | ((module: string) => boolean),
) {
	/**
	 * @type {string[][]}
	 */
	const chains: string[][] = [];
	const seen = new Set<string>();

	/**
	 * @param {string} module
	 * @param {string[]} path
	 * @returns
	 */
	const dfs = (module: string, path: string[]) => {
		const condition =
			typeof targetModule === "function"
				? targetModule(module)
				: module === targetModule;

		if (seen.has(module)) return;
		seen.add(module);

		if (condition) {
			chains.push(path);
			return;
		}

		const dependencies = moduleGraph.graph.get(module);
		if (dependencies) {
			for (const dependency of dependencies) {
				dfs(dependency, [...path, dependency]);
			}
		}
	};

	for (const entrypoint of moduleGraph.entrypoints) {
		dfs(entrypoint, [entrypoint]);
	}

	return chains;
}
