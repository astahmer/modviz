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

const digraphPlugin: Plugin = {
	name: "digraph-plugin",
	end(moduleGraph) {
		let digraph = "digraph {\n";
		for (const [parent, importees] of moduleGraph.graph) {
			digraph += `  "${parent}" -> ${[...importees].map((p) => `"${p}"`).join(",")}\n`;
		}
		digraph += "}";

		// @ts-expect-error
		moduleGraph.digraph = digraph;
	},
};

const moduleGraph = await createModuleGraph(entryFile, {
	exclude: [(importee) => importee.includes("node_modules")],
	plugins: [
		typescript(),
		imports,
		exports,
		unusedExports,
		barrelFile({
			amountOfExportsToConsiderModuleAsBarrel: 3,
		}),
		// digraphPlugin,
	],
});

// Convert module graph to web-friendly format
const webGraphData = processModuleGraphForWeb(moduleGraph, entryFile);

// Write the processed data
writeFileSync(flags.outputFile, JSON.stringify(webGraphData, null, 2));
console.log(`📊 Graph data saved to: ${flags.outputFile}`);

if (!flags.noUi) {
	await launchWebUI(flags.port, flags.outputFile);
}

// Process module graph into web-friendly format
function processModuleGraphForWeb(
	moduleGraph: ModuleGraph,
	entryPoint: string,
) {
	const nodeList: GraphNode[] = [];
	const edgeList: GraphEdge[] = [];

	for (const [filePath, importees] of moduleGraph.graph) {
		// console.log(parent, importees);

		const module = moduleGraph.modules.get(filePath)!;
		const imports = (module.imports ?? []) as Import[];
		const exports = (module.exports ?? []) as Export[];
		const unusedExports = (module.unusedExports ?? []) as Export[];
		const seen = new Set<string>();

		// Create node
		nodeList.push({
			label: getFileLabel(filePath),
			path: filePath,
			type: getNodeType(filePath, module, entryPoint),
			imports: Array.from(importees),
			// importedSymbols: Array.from(new Set(imports.map((imp) => imp.name))),
			// imports: Array.from(new Set(imports.map((imp) => imp.module))),
			importedBy: module.importedBy,
			exports: Array.from(
				new Set(exports.map((exp) => exp.declaration.module).filter(Boolean)),
			),
			isBarrelFile: module.isBarrelFile || false,
			chain: findImportChains(moduleGraph, (path) => path === filePath),
			// unusedExports: Array.from(
			// 	new Set(unusedExports.map((exp) => exp.name).filter(Boolean)),
			// ),
			// mod: { imports, exports },
		});

		importees.forEach((importee) => {
			edgeList.push({
				source: filePath,
				target: importee,
				type: "import",
			});
		});
	}

	const uniqueModules = moduleGraph.getUniqueModules();

	return {
		metadata: {
			entryPoint,
			totalFiles: moduleGraph.getUniqueModules().length,
			generatedAt: new Date().toISOString(),
			nodeModulesCount: nodeList.filter((n) => n.path.includes("node_modules"))
				.length,
		},
		nodes: nodeList,
		// edges: edgeList,
		imports: uniqueModules,
		edges: [],
	};
}

function getFileLabel(filePath: string): string {
	const parts = filePath.split("/");
	return parts[parts.length - 1];
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
	const { startServer: createServer } = await import("./server/dev-server.ts");
	await createServer(port ? Number.parseInt(port) : undefined, dataFile);
}

interface Import {
	name: string;
	declaration: string;
	kind: string;
	module: string;
	isTypeOnly: boolean;
	attributes?: any[];
}

interface Export {
	kind: string;
	name: string;
	declaration: { name: string; module: string };
}

interface GraphNode {
	label: string;
	path: string;
	type: string;
	imports: string[];
	importedBy: string[];
	exports: string[];
	isBarrelFile: any;
	unusedExports: string[];
}

interface GraphEdge {
	source: string;
	target: string;
	type: string;
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
