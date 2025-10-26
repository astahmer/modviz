import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ModvizOutput, VizExport, VizImport, VizNode } from "./types.ts";
import {
	createModuleGraph,
	type Module,
	type Plugin,
} from "/Users/astahmer/dev/open-source/module-graph/index.js";
import type { ModuleGraph } from "/Users/astahmer/dev/open-source/module-graph/ModuleGraph.js";
import { barrelFile } from "/Users/astahmer/dev/open-source/module-graph/plugins/barrel-file.js";
import { exports } from "/Users/astahmer/dev/open-source/module-graph/plugins/exports.js";
import { imports } from "/Users/astahmer/dev/open-source/module-graph/plugins/imports.js";
import {
	unusedExports,
	type Export,
	type Import,
} from "/Users/astahmer/dev/open-source/module-graph/plugins/unused-exports.js";
import { findWorkspaces } from "find-workspaces";

const args = process.argv.slice(2);
const entryFile = args.find((arg) => !arg.startsWith("--"));
const flags = {
	port: args.find((arg) => arg.startsWith("--port="))?.split("=")[1],
	ui: args.includes("--ui"),
	outputFile:
		args.find((arg) => arg.startsWith("--output-file="))?.split("=")[1] ??
		"./modviz.json",
	nodeModules: args.includes("--node-modules"),
	serve: args.includes("--serve"),
	help: args.includes("--help") || args.includes("-h"),
	moduleLexer: args
		.find((arg) => arg.startsWith("--module-lexer="))
		?.split("=")[1],
};

if (flags.help || (!entryFile && !flags.serve)) {
	console.log(`
modviz - Interactive Dependency Graph Visualizer

Usage:
  modviz <entryFile>                    Generate graph and launch web UI
  modviz <entryFile> --ui      Generate graph data only
  modviz --serve [dataFile]             Launch web UI with existing data
  modviz <entryFile> --port=4000        Use custom port

Options:
  --port=<port>     Port for web server (default: 3000)
  --ui     Generate JSON data only, don't launch UI
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

const basePath = process.cwd();
const workspaces = findWorkspaces(entryFile) ?? [];
const workspaceList = (workspaces ?? []).map((workspace) => ({
	relativePath: path.relative(basePath, workspace.location),
	absolutePath: workspace.location,
	name: workspace.package.name,
	imports: workspace.package.imports,
}));

const replaceImportTypeToImport = (source: string) =>
	source.replace(/import type/g, "import");
// Needed so rs-module-lexer will resolve the import (it would ignore type-only imports otherwise)
const replaceImportTypeToImportPlugin: Plugin = {
	name: "replace-import-type-to-import",
	transformSource: ({ source }) => {
		return replaceImportTypeToImport(source);
	},
};

const clusterizePlugin: Plugin = {
	name: "cluster-plugin",
	analyze(module) {
		const parts = module.path.split("/");
		const srcIndex = parts.indexOf("src");
		if (srcIndex !== -1 && parts.length > srcIndex + 1) {
			const cluster = parts[srcIndex + 1];
			if (path.extname(cluster) === "") {
				module.cluster = cluster;
			}
		}
	},
};

const moduleGraph = await createModuleGraph(entryFile, {
	// TODO configurable flag to allow this
	exclude:flags.nodeModules ? undefined : [(importee) => importee.includes("node_modules")],
	moduleLexer: (flags.moduleLexer as "rs" | "es" | undefined) ?? "rs",
	plugins: [
		imports,
		exports,
		unusedExports,
		barrelFile({
			amountOfExportsToConsiderModuleAsBarrel: 3, // TODO configurable
		}),
		replaceImportTypeToImportPlugin,
		clusterizePlugin,
	],
});

const packages = workspaceList.map((workspace) => ({
	name: workspace.name,
	path: workspace.relativePath,
}));
const webGraphData = processModuleGraphForWeb(moduleGraph, entryFile, packages);

writeFileSync(flags.outputFile, JSON.stringify(webGraphData, null, 2));
console.log(
	`💾 Graph data saved to: ${flags.outputFile} (${webGraphData.nodes.length} nodes out of ${webGraphData.imports.length} imports)`,
);

if (flags.ui) {
	await launchWebUI(flags.port, flags.outputFile);
}

function processModuleGraphForWeb(
	moduleGraph: ModuleGraph,
	entryFile: string,
	workspaces: Array<{
		path: string;
		name: string;
	}>,
): ModvizOutput {
	const nodeList: ModvizOutput["nodes"] = [];
	const edgeList = new Set<string>();

	for (const [filePath, importees] of moduleGraph.graph) {
		const module = moduleGraph.modules.get(filePath)! as VizModule;
		const imports = (module.imports ?? []) as VizImport[];
		const exports = (module.exports ?? []) as VizExport[];
		const unusedExports = (module.unusedExports ?? []) as VizExport[];

		const node: VizNode = {
			name: path.basename(filePath),
			path: filePath,
			type: getNodeType(filePath, module, entryFile),
			package: workspaces.find((workspace) =>
				filePath.startsWith(workspace.path),
			),
			cluster: module.cluster,
			imports,
			exports,
			unusedExports,
			importees: Array.from(importees),
			importedBy: module.importedBy,
			isBarrelFile: module.isBarrelFile || false,
			chain: moduleGraph.findImportChains(filePath),
		};
		nodeList.push(node);

		importees.forEach((importee) => {
			edgeList.add(`${filePath}->${importee}`);
		});
	}

	const uniqueModules = moduleGraph.getUniqueModules();

	return {
		metadata: {
			entrypoints: moduleGraph.entrypoints.map((entrypoint) =>
				path.relative(basePath, entrypoint),
			),
			basePath: basePath,
			totalFiles: moduleGraph.getUniqueModules().length,
			generatedAt: new Date().toISOString(),
			nodeModulesCount: nodeList.filter((n) => n.path.includes("node_modules"))
				.length,
			packages,
		},
		nodes: nodeList,
		imports: uniqueModules,
	};
}

function getNodeType(
	filePath: string,
	module: VizModule,
	entryPoint: string,
): string {
	if (filePath === entryPoint) return "entry";
	if (filePath.includes("node_modules")) return "external";
	if (module.isBarrelFile) return "barrel";
	return "internal";
}

async function launchWebUI(port: string | undefined, dataFile?: string) {
	console.log(`🚀 Launching web UI...`);
	const { startServer } = await import("./vite-dev-server.ts");
	await startServer({
		port: port ? Number.parseInt(port) : undefined,
		outputPath: path.resolve(dataFile ?? flags.outputFile),
	});
}

interface VizModule extends Module {
	cluster?: string;
	imports: Import[];
	exports: Export[];
}
