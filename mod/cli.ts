import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ModvizOutput, VizExport, VizImport, VizNode } from "./types.ts";
import {
	buildModvizLlmOutput,
	inferLlmOutputPaths,
	resolveModvizFocus,
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
	packageQuery: args
		.find(
			(arg) => arg.startsWith("--package="),
		)
		?.split("=")[1],
	nodeQuery: args
		.find((arg) => arg.startsWith("--node="))
		?.split("=")[1],
	limit: Number.parseInt(
		args
			.find(
				(arg) => arg.startsWith("--limit="),
			)
			?.split("=")[1] ?? "20",
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
	modviz <entryFile> --package=zod                Focus outputs on one external package and print a drilldown
	modviz <entryFile> --node=src/foo.ts            Focus outputs on one node and print a drilldown
	modviz --serve [dataFile]                       Launch the web UI with existing graph data
	modviz <entryFile> --ui --port=4000             Use a custom port

Options:
	--output-file=<file>   Base JSON output path for the UI graph (default: ./modviz.json)
	--port=<port>          Port for the web server (default: 3000)
	--ui                   Launch the browser UI after generating the graph
	--serve                Launch the UI server using an existing graph JSON file
	--llm                  Also emit <output>.llm.json and <output>.llm.md focused on import origins and barrel-file impact
	--package=<name>       Focus outputs and drilldowns on one external package
	--node=<path>          Focus outputs and drilldowns on one node path or display path
	--limit=<n>            Limit printed list output in focused drilldowns (default: 20)
	--node-modules         Keep node_modules in the analyzed graph instead of excluding them
	--ignore-dynamic       Ignore dynamic imports
	--module-lexer=<mode>  Choose import parser: rs or es (default: rs)
	--help, -h             Show this help message

Examples:
  modviz src/index.ts
	modviz src/index.ts --ui --port=4000
	modviz src/index.ts --llm --node-modules
	modviz src/index.ts --node-modules --package=googleapis
	modviz src/index.ts --node-modules --node=src/adapter-rest/register-app-routes.ts
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

const focusOptions = {
	packageName: flags.packageQuery,
	nodeQuery: flags.nodeQuery,
	limit: Number.isFinite(flags.limit) ? flags.limit : 20,
};
const shouldResolveFocus = Boolean(
	focusOptions.packageName || focusOptions.nodeQuery,
);
const fullLlmOutput =
	shouldResolveFocus || flags.llm
		? buildModvizLlmOutput(webGraphData)
		: undefined;
const focusResolution =
	shouldResolveFocus && fullLlmOutput
		? resolveModvizFocus(fullLlmOutput, focusOptions)
		: undefined;
const outputGraphData =
	shouldResolveFocus && focusResolution
		? applyGraphFocus(webGraphData, focusResolution, focusOptions)
		: webGraphData;

writeFileSync(flags.outputFile, JSON.stringify(outputGraphData, null, 2));
console.log(
	`💾 Graph data saved to: ${flags.outputFile} (${outputGraphData.nodes.length} nodes out of ${outputGraphData.imports.length} imports)`,
);

if (focusResolution && shouldResolveFocus) {
	if (
		focusResolution.matchedPackageNames.length === 0 &&
		focusResolution.matchedNodePaths.length === 0
	) {
		console.warn(
			"⚠️  No focus match found; wrote the full graph output instead.",
		);
	} else {
		console.log(
			`🎯 Applied focus filter (${outputGraphData.nodes.length} nodes kept)`,
		);
	}
}

const shouldBuildLlmReport =
	flags.llm || Boolean(flags.packageQuery) || Boolean(flags.nodeQuery);

if (shouldBuildLlmReport) {
	const llmOutput = buildModvizLlmOutput(outputGraphData);
	const focusedDrilldown =
		flags.packageQuery || flags.nodeQuery
			? renderModvizLlmDrilldown(llmOutput, {
					packageName: flags.packageQuery,
					nodeQuery: flags.nodeQuery,
					limit: Number.isFinite(flags.limit) ? flags.limit : 20,
				})
			: undefined;

	if (flags.llm) {
		const llmOutputPaths = inferLlmOutputPaths(flags.outputFile);
		const commandHints = buildLlmCommandHints(entryFileAbsolute, flags);

		writeFileSync(llmOutputPaths.json, JSON.stringify(llmOutput, null, 2));
		writeFileSync(
			llmOutputPaths.markdown,
			renderModvizLlmMarkdown(llmOutput, {
				focus: shouldResolveFocus ? focusOptions : undefined,
				commandHints,
				focusedDrilldown,
			}),
		);

		console.log(
			`🧠 LLM reports saved to: ${llmOutputPaths.json} and ${llmOutputPaths.markdown}`,
		);
	}

	if (flags.packageQuery || flags.nodeQuery) {
		console.log(focusedDrilldown);
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

function applyGraphFocus(
	output: ModvizOutput,
	focusResolution: {
		matchedPackageNames: string[];
		matchedNodePaths: string[];
		includedPaths: string[];
	},
	focusOptions: {
		packageName?: string;
		nodeQuery?: string;
	},
): ModvizOutput {
	if (
		focusResolution.matchedPackageNames.length === 0 &&
		focusResolution.matchedNodePaths.length === 0
	) {
		return output;
	}

	const includedPaths = new Set(focusResolution.includedPaths);
	for (const nodePath of focusResolution.matchedNodePaths) {
		includeReachablePaths(nodePath, output, includedPaths);
	}

	const filteredNodes = output.nodes
		.filter((node) => includedPaths.has(node.path))
		.map((node) => ({
			...node,
			importees: node.importees.filter((importee) =>
				includedPaths.has(importee),
			),
			importedBy: node.importedBy.filter((importer) =>
				includedPaths.has(importer),
			),
			chain: dedupeChains(
				node.chain
					.map((chain) =>
						chain.filter((chainNode) => includedPaths.has(chainNode)),
					)
					.filter((chain) => chain.length > 0),
			),
		}));

	const filteredImports = Array.from(
		new Set(filteredNodes.flatMap((node) => [node.path, ...node.importees])),
	).sort((left, right) => left.localeCompare(right));

	return {
		metadata: {
			...output.metadata,
			totalFiles: filteredNodes.length,
			nodeModulesCount: filteredNodes.filter((node) =>
				node.path.includes("node_modules"),
			).length,
			focus: {
				packageName: focusOptions.packageName,
				nodeQuery: focusOptions.nodeQuery,
				matchedPackageNames: focusResolution.matchedPackageNames,
				matchedNodePaths: focusResolution.matchedNodePaths,
			},
		},
		nodes: filteredNodes,
		imports: filteredImports,
	};
}

function includeReachablePaths(
	startPath: string,
	output: ModvizOutput,
	includedPaths: Set<string>,
) {
	const nodeMap = new Map(output.nodes.map((node) => [node.path, node]));
	const stack = [startPath];
	const visited = new Set<string>();

	while (stack.length > 0) {
		const currentPath = stack.pop();
		if (!currentPath || visited.has(currentPath)) {
			continue;
		}

		visited.add(currentPath);
		includedPaths.add(currentPath);
		const node = nodeMap.get(currentPath);
		if (!node) {
			continue;
		}

		for (const importee of node.importees) {
			if (!includedPaths.has(importee)) {
				stack.push(importee);
			}
		}
	}
}

function dedupeChains(chains: string[][]) {
	const seen = new Set<string>();
	const deduped: string[][] = [];

	for (const chain of chains) {
		const key = chain.join("\u0000");
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		deduped.push(chain);
	}

	return deduped;
}

function buildLlmCommandHints(
	entryFileAbsolute: string,
	flags: {
		nodeModules: boolean;
		ignoreDynamic: boolean;
		llm: boolean;
		moduleLexer?: string;
		outputFile: string;
	},
) {
	const baseArgs = [
		"node",
		path.resolve(process.argv[1] ?? "mod/cli.ts"),
		entryFileAbsolute,
		flags.nodeModules ? "--node-modules" : undefined,
		flags.ignoreDynamic ? "--ignore-dynamic" : undefined,
		flags.llm ? "--llm" : undefined,
		flags.outputFile !== "./modviz.json"
			? `--output-file=${flags.outputFile}`
			: undefined,
		flags.moduleLexer ? `--module-lexer=${flags.moduleLexer}` : undefined,
	]
		.filter(Boolean)
		.join(" ");

	return {
		packageCommand: `${baseArgs} --package=<package-name> --limit=20`,
		nodeCommand: `${baseArgs} --node=<path-or-display-path> --limit=20`,
	};
}
