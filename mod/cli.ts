import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ModvizOutput, VizExport, VizImport, VizNode } from "./types.ts";
import {
	buildModvizLlmOutput,
	inferLlmOutputPaths,
	renderModvizLlmMarkdown,
} from "./llm-output.ts";
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
	ignoreDynamic: args.includes("--ignore-dynamic"),
	serve: args.includes("--serve"),
	help: args.includes("--help") || args.includes("-h"),
	llm: args.includes("--llm"),
	moduleLexer: args
		.find((arg) => arg.startsWith("--module-lexer="))
		?.split("=")[1],
};

if (flags.help || (!entryFile && !flags.serve)) {
	console.log(`
modviz - Module dependency graph visualizer and import analysis CLI

Usage:
	modviz <entryFile>                              Generate graph JSON for the UI
	modviz <entryFile> --ui                         Generate graph JSON and launch the web UI
	modviz <entryFile> --llm                        Generate UI JSON plus LLM-focused JSON and Markdown reports
	modviz --serve [dataFile]                       Launch the web UI with existing graph data
	modviz <entryFile> --ui --port=4000             Use a custom port

Options:
	--output-file=<file>   Base JSON output path for the UI graph (default: ./modviz.json)
	--port=<port>          Port for the web server (default: 3000)
	--ui                   Launch the browser UI after generating the graph
	--serve                Launch the UI server using an existing graph JSON file
	--llm                  Also emit <output>.llm.json and <output>.llm.md focused on import origins and barrel-file impact
	--node-modules         Keep node_modules in the analyzed graph instead of excluding them
	--ignore-dynamic       Ignore dynamic imports
	--module-lexer=<mode>  Choose import parser: rs or es (default: rs)
	--help, -h             Show this help message

Examples:
  modviz src/index.ts
	modviz src/index.ts --ui --port=4000
	modviz src/index.ts --llm --node-modules
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
	exclude: flags.nodeModules
		? undefined
		: [(importee) => importee.includes("node_modules")],
	ignoreDynamicImport: flags.ignoreDynamic,
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

if (flags.llm) {
	const llmOutput = buildModvizLlmOutput(webGraphData);
	const llmOutputPaths = inferLlmOutputPaths(flags.outputFile);

	writeFileSync(llmOutputPaths.json, JSON.stringify(llmOutput, null, 2));
	writeFileSync(llmOutputPaths.markdown, renderModvizLlmMarkdown(llmOutput));

	console.log(
		`🧠 LLM reports saved to: ${llmOutputPaths.json} and ${llmOutputPaths.markdown}`,
	);
}

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
