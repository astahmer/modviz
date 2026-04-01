import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ModvizOutput, VizExport, VizImport, VizNode } from "./types.ts";
import {
	buildModvizLlmOutput,
	inferLlmOutputPaths,
	renderModvizLlmDrilldown,
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
	llmPackage: args
		.find((arg) => arg.startsWith("--llm-package="))
		?.split("=")[1],
	llmNode: args.find((arg) => arg.startsWith("--llm-node="))?.split("=")[1],
	llmLimit: Number.parseInt(
		args.find((arg) => arg.startsWith("--llm-limit="))?.split("=")[1] ?? "20",
		10,
	),
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
	modviz <entryFile> --llm-package=zod            Print a package drilldown with full sources and origin chains
	modviz <entryFile> --llm-node=src/foo.ts        Print a node drilldown with full importers and origin chains
	modviz --serve [dataFile]                       Launch the web UI with existing graph data
	modviz <entryFile> --ui --port=4000             Use a custom port

Options:
	--output-file=<file>   Base JSON output path for the UI graph (default: ./modviz.json)
	--port=<port>          Port for the web server (default: 3000)
	--ui                   Launch the browser UI after generating the graph
	--serve                Launch the UI server using an existing graph JSON file
	--llm                  Also emit <output>.llm.json and <output>.llm.md focused on import origins and barrel-file impact
	--llm-package=<name>   Print a focused drilldown for one external package from the LLM analysis
	--llm-node=<path>      Print a focused drilldown for one node path or display path from the LLM analysis
	--llm-limit=<n>        Limit list output in drilldowns (default: 20)
	--node-modules         Keep node_modules in the analyzed graph instead of excluding them
	--ignore-dynamic       Ignore dynamic imports
	--module-lexer=<mode>  Choose import parser: rs or es (default: rs)
	--help, -h             Show this help message

Examples:
  modviz src/index.ts
	modviz src/index.ts --ui --port=4000
	modviz src/index.ts --llm --node-modules
	modviz src/index.ts --node-modules --llm-package=googleapis
	modviz src/index.ts --node-modules --llm-node=src/adapter-rest/register-app-routes.ts
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

const entryFileAbsolute = path.resolve(entryFile);

if (!existsSync(entryFileAbsolute)) {
	console.error(`Error: Entry file "${entryFile}" does not exist`);
	process.exit(1);
}

console.log(`🔍 Analyzing dependency graph for: ${entryFileAbsolute}`);

const workspaces = findWorkspaces(entryFileAbsolute) ?? [];
const basePath = deriveAnalysisBasePath(entryFileAbsolute, workspaces);
const entryFileForGraph = normalizeRelativePath(
	path.relative(basePath, entryFileAbsolute),
);
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

const moduleGraph = await createModuleGraph(entryFileForGraph, {
	basePath,
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
	path: normalizeRelativePath(workspace.relativePath),
}));
const webGraphData = processModuleGraphForWeb(
	moduleGraph,
	entryFileForGraph,
	packages,
	basePath,
);

writeFileSync(flags.outputFile, JSON.stringify(webGraphData, null, 2));
console.log(
	`💾 Graph data saved to: ${flags.outputFile} (${webGraphData.nodes.length} nodes out of ${webGraphData.imports.length} imports)`,
);

const shouldBuildLlmReport =
	flags.llm || Boolean(flags.llmPackage) || Boolean(flags.llmNode);

if (shouldBuildLlmReport) {
	const llmOutput = buildModvizLlmOutput(webGraphData);

	if (flags.llm) {
		const llmOutputPaths = inferLlmOutputPaths(flags.outputFile);

		writeFileSync(llmOutputPaths.json, JSON.stringify(llmOutput, null, 2));
		writeFileSync(llmOutputPaths.markdown, renderModvizLlmMarkdown(llmOutput));

		console.log(
			`🧠 LLM reports saved to: ${llmOutputPaths.json} and ${llmOutputPaths.markdown}`,
		);
	}

	if (flags.llmPackage || flags.llmNode) {
		console.log(
			renderModvizLlmDrilldown(llmOutput, {
				packageName: flags.llmPackage,
				nodeQuery: flags.llmNode,
				limit: Number.isFinite(flags.llmLimit) ? flags.llmLimit : 20,
			}),
		);
	}
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
	basePath: string,
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
				normalizeRelativePath(entrypoint),
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

function deriveAnalysisBasePath(
	entryFileAbsolute: string,
	workspaces: Array<{ location: string }>,
) {
	const workspaceLocations = workspaces.map((workspace) => workspace.location);
	if (workspaceLocations.length > 0) {
		return getCommonAncestorPath([
			path.dirname(entryFileAbsolute),
			...workspaceLocations,
		]);
	}

	return findNearestPackageRoot(path.dirname(entryFileAbsolute));
}

function getCommonAncestorPath(paths: string[]) {
	const normalizedPaths = paths.map((currentPath) => path.resolve(currentPath));
	let commonPath = normalizedPaths[0] ?? process.cwd();

	for (const currentPath of normalizedPaths.slice(1)) {
		while (
			commonPath !== path.dirname(commonPath) &&
			!currentPath.startsWith(`${commonPath}${path.sep}`) &&
			currentPath !== commonPath
		) {
			commonPath = path.dirname(commonPath);
		}
	}

	return commonPath;
}

function findNearestPackageRoot(startDirectory: string) {
	let currentDirectory = path.resolve(startDirectory);

	while (true) {
		if (existsSync(path.join(currentDirectory, "package.json"))) {
			return currentDirectory;
		}

		const parentDirectory = path.dirname(currentDirectory);
		if (parentDirectory === currentDirectory) {
			return startDirectory;
		}

		currentDirectory = parentDirectory;
	}
}

function normalizeRelativePath(filePath: string) {
	return filePath.replace(/\\/g, "/");
}
