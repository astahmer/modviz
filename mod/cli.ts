import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { ModvizOutput, VizExport, VizImport, VizNode } from "./types.ts";
import {
	buildCliHelpText,
	buildSnapshotList,
	buildCliSummary,
	parseCliArgs,
	validateCliArgs,
} from "./cli-options.ts";
import { generateAiAnalysis } from "./llm-analysis.ts";
import {
	listSnapshotHistory,
	loadSnapshotGraph,
	saveSnapshotToHistory,
} from "./snapshot-history.ts";
import {
	buildModvizLlmOutput,
	inferLlmOutputPaths,
	resolveModvizFocus,
	renderModvizLlmDrilldown,
	renderModvizLlmMarkdown,
} from "./llm-output.ts";
import {
	buildNodeTraceReport,
	buildPackageTraceReport,
	renderTraceReport,
} from "../shared/modviz-trace.ts";
import {
	buildModvizGraphComparison,
	renderModvizGraphComparison,
} from "../shared/modviz-compare.ts";
import {
	createModuleGraph,
	type Module,
	type Plugin,
} from "/Users/astahmer/dev/open-source/module-graph/dist/index.js";
import { barrelFile } from "/Users/astahmer/dev/open-source/module-graph/dist//plugins/barrel-file.js";
import { exports } from "/Users/astahmer/dev/open-source/module-graph/dist//plugins/exports.js";
import { imports } from "/Users/astahmer/dev/open-source/module-graph/dist//plugins/imports.js";
import {
	unusedExports,
	type Export,
	type Import,
} from "/Users/astahmer/dev/open-source/module-graph/dist//plugins/unused-exports.js";
import { findWorkspaces } from "find-workspaces";
import { sanitizeFileImportSuffixPlugin } from "./module-graph-plugins.ts";

type ModuleGraphInstance = Awaited<ReturnType<typeof createModuleGraph>>;

const args = process.argv.slice(2);
const parsedArgs = parseCliArgs(args);
const { command, entryFile, flags, serveDataFile } = parsedArgs;
const validationError = validateCliArgs(parsedArgs);

if (validationError) {
	console.error(`Error: ${validationError}`);
	process.exit(1);
}

if (flags.historyDir) {
	process.env.MODVIZ_HISTORY_DIR = path.resolve(flags.historyDir);
}

if (flags.help || (command === "analyze" && !entryFile && !flags.serve)) {
	console.log(buildCliHelpText());
	process.exit(0);
}

if (command === "serve" || flags.serve) {
	await launchWebUI(flags.port, serveDataFile ?? flags.graphFile, flags.open);
	process.exit(0);
}

if (command === "report") {
	const reportGraph = loadGraphForReport(flags);
	if (flags.listSnapshots) {
		console.log(buildSnapshotList(listSnapshotHistory()));
	}
	if (flags.summary) {
		console.log(buildCliSummary(reportGraph));
	}
	if (flags.packageQuery) {
		console.log(
			renderTraceReport(buildPackageTraceReport(reportGraph, flags.packageQuery), flags.limit),
		);
	}
	if (flags.nodeQuery) {
		console.log(renderTraceReport(buildNodeTraceReport(reportGraph, flags.nodeQuery), flags.limit));
	}
	process.exit(0);
}

if (command === "diff") {
	const [baselineTarget, currentTarget] = parsedArgs.positionals ?? [];
	if (!baselineTarget || !currentTarget) {
		console.error("Error: Diff command requires <baseline> and <current> graph targets");
		process.exit(1);
	}

	const baselineGraph = loadGraphTarget(baselineTarget);
	const currentGraph = loadGraphTarget(currentTarget);
	const comparison = buildModvizGraphComparison(baselineGraph, currentGraph);
	console.log(renderModvizGraphComparison(comparison, { limit: flags.limit }));
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
const entryFileForGraph = normalizeRelativePath(path.relative(basePath, entryFileAbsolute));
const workspaceList = (workspaces ?? []).map((workspace) => ({
	relativePath: path.relative(basePath, workspace.location),
	absolutePath: workspace.location,
	name: workspace.package.name,
	imports: workspace.package.imports,
}));

const replaceImportTypeToImport = (source: string) => source.replace(/import type/g, "import");
const replaceImportTypeToImportPlugin: Plugin = {
	name: "replace-import-type-to-import",
	transformSource: ({ source }) => replaceImportTypeToImport(source),
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

const moduleGraph = await withProgress("Analyzing dependency graph", () =>
	createModuleGraph(entryFileForGraph, {
		basePath,
		// TODO configurable flag to allow this
		exclude: flags.nodeModules ? undefined : [(importee) => importee.includes("node_modules")],
		ignoreDynamicImport: flags.ignoreDynamic,
		plugins: [
			sanitizeFileImportSuffixPlugin,
			imports,
			exports,
			unusedExports,
			barrelFile({
				amountOfExportsToConsiderModuleAsBarrel: flags.barrelThreshold,
			}),
			replaceImportTypeToImportPlugin,
			clusterizePlugin,
		],
	}),
);

const packages = workspaceList.map((workspace) => ({
	name: workspace.name,
	path: normalizeRelativePath(workspace.relativePath),
}));
const webGraphData = await withProgress("Preparing graph payload", () =>
	processModuleGraphForWeb(
		moduleGraph,
		entryFileForGraph,
		packages,
		basePath,
		Number.isFinite(flags.limit) ? flags.limit : 5,
	),
);
const pathFilteredGraph = applyPathFilters(webGraphData, flags.include, flags.exclude);

const focusOptions = {
	packageName: flags.packageQuery,
	nodeQuery: flags.nodeQuery,
	limit: Number.isFinite(flags.limit) ? flags.limit : 20,
};
const shouldResolveFocus = Boolean(focusOptions.packageName || focusOptions.nodeQuery);
const shouldBuildLlmReport =
	flags.llm || flags.llmAnalyze || Boolean(flags.packageQuery) || Boolean(flags.nodeQuery);
const fullLlmOutput =
	shouldResolveFocus || shouldBuildLlmReport ? buildModvizLlmOutput(pathFilteredGraph) : undefined;
const focusResolution =
	shouldResolveFocus && fullLlmOutput ? resolveModvizFocus(fullLlmOutput, focusOptions) : undefined;
const outputGraphData =
	shouldResolveFocus && focusResolution
		? applyGraphFocus(pathFilteredGraph, focusResolution, focusOptions)
		: pathFilteredGraph;

writeFileSync(flags.outputFile, JSON.stringify(outputGraphData, null, 2));
console.log(
	`💾 Graph data saved to: ${flags.outputFile} (${outputGraphData.nodes.length} nodes out of ${outputGraphData.imports.length} imports)`,
);

if (flags.summary) {
	console.log(buildCliSummary(outputGraphData));
}

if (focusResolution && shouldResolveFocus) {
	if (
		focusResolution.matchedPackageNames.length === 0 &&
		focusResolution.matchedNodePaths.length === 0
	) {
		console.warn("⚠️  No focus match found; wrote the full graph output instead.");
	} else {
		console.log(`🎯 Applied focus filter (${outputGraphData.nodes.length} nodes kept)`);
	}
}
if (shouldBuildLlmReport) {
	const llmOutput = await withProgress("Building LLM companion report", () =>
		buildModvizLlmOutput(outputGraphData),
	);
	const focusedDrilldown =
		flags.packageQuery || flags.nodeQuery
			? renderModvizLlmDrilldown(llmOutput, {
					packageName: flags.packageQuery,
					nodeQuery: flags.nodeQuery,
					limit: Number.isFinite(flags.limit) ? flags.limit : 20,
				})
			: undefined;
	const llmOutputPaths = inferLlmOutputPaths(flags.outputFile);
	const commandHints = buildLlmCommandHints(entryFileAbsolute, flags);
	const llmMarkdown = renderModvizLlmMarkdown(llmOutput, {
		focus: shouldResolveFocus ? focusOptions : undefined,
		commandHints,
		focusedDrilldown,
	});

	if (flags.llm || flags.llmAnalyze) {
		writeFileSync(llmOutputPaths.json, JSON.stringify(llmOutput, null, 2));
		writeFileSync(llmOutputPaths.markdown, llmMarkdown);

		console.log(`🧠 LLM reports saved to: ${llmOutputPaths.json} and ${llmOutputPaths.markdown}`);
	}

	if (flags.llmAnalyze) {
		const analysis = await withProgress("Generating AI analysis", () =>
			generateAiAnalysis({
				baseUrl: flags.llmBaseUrl,
				markdown: llmMarkdown,
				model: flags.llmModel,
				outputFile: flags.outputFile,
			}),
		);
		console.log(`🤖 AI analysis saved to: ${analysis.analysisPath} (model: ${analysis.modelName})`);
	}

	if (flags.packageQuery || flags.nodeQuery) {
		console.log(focusedDrilldown);
	}

	if (flags.snapshotName) {
		const snapshot = saveSnapshotToHistory({
			graph: outputGraphData,
			llm: flags.llm || flags.llmAnalyze ? llmOutput : undefined,
			snapshotName: flags.snapshotName,
		});
		if (snapshot) {
			console.log(`🗂️  Saved named snapshot: ${snapshot.id}`);
		}
	}
} else if (flags.snapshotName) {
	const snapshot = saveSnapshotToHistory({
		graph: outputGraphData,
		snapshotName: flags.snapshotName,
	});
	if (snapshot) {
		console.log(`🗂️  Saved named snapshot: ${snapshot.id}`);
	}
}

if (flags.ui) {
	await launchWebUI(flags.port, flags.outputFile, flags.open);
}

function formatDuration(milliseconds: number) {
	if (milliseconds < 1000) {
		return `${milliseconds}ms`;
	}

	return `${(milliseconds / 1000).toFixed(1)}s`;
}

async function withProgress<T>(label: string, work: () => Promise<T> | T) {
	const start = Date.now();
	let spinnerWorker: Worker | undefined;

	if (process.stdout.isTTY) {
		process.stdout.write(`⏳ ${label}\n`);
		spinnerWorker = new Worker(
			`
				const { parentPort, workerData } = require("node:worker_threads");
				const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
				const start = Date.now();
				let frameIndex = 0;
				const formatDuration = (milliseconds) => milliseconds < 1000 ? \
						numberToString(milliseconds) + "ms" : numberToString((milliseconds / 1000).toFixed(1)) + "s";
				function numberToString(value) { return String(value); }
				const interval = setInterval(() => {
					const frame = frames[frameIndex % frames.length];
					frameIndex += 1;
					process.stdout.write(\`\\r\${frame} \${workerData.label} (\${formatDuration(Date.now() - start)})\`);
				}, 80);
				parentPort.on("message", () => {
					clearInterval(interval);
					process.exit(0);
				});
			`,
			{ eval: true, workerData: { label } },
		);
	} else {
		console.log(`⏳ ${label}`);
	}

	try {
		const result = await work();
		if (spinnerWorker) {
			spinnerWorker.postMessage("stop");
			await spinnerWorker.terminate().catch(() => undefined);
			process.stdout.write(`\r✅ ${label} (${formatDuration(Date.now() - start)})\n`);
		} else {
			console.log(`✅ ${label} (${formatDuration(Date.now() - start)})`);
		}
		return result;
	} catch (error) {
		if (spinnerWorker) {
			spinnerWorker.postMessage("stop");
			await spinnerWorker.terminate().catch(() => undefined);
			process.stdout.write(`\r❌ ${label} failed after ${formatDuration(Date.now() - start)}\n`);
		} else {
			console.error(`❌ ${label} failed after ${formatDuration(Date.now() - start)}`);
		}
		throw error;
	}
}

function processModuleGraphForWeb(
	moduleGraph: ModuleGraphInstance,
	entryFile: string,
	workspaces: Array<{
		path: string;
		name: string;
	}>,
	basePath: string,
	maxChainsPerNode: number,
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
			package: workspaces.find((workspace) => filePath.startsWith(workspace.path)),
			cluster: module.cluster,
			imports,
			exports,
			unusedExports,
			importees: Array.from(importees),
			importedBy: module.importedBy,
			isBarrelFile: module.isBarrelFile || false,
			chain: moduleGraph.findImportChains(filePath, { maxChains: maxChainsPerNode }),
		};
		nodeList.push(node);

		importees.forEach((importee) => {
			edgeList.add(`${filePath}->${importee}`);
		});
	}

	const uniqueModules = moduleGraph.getUniqueModules();

	return {
		metadata: {
			entrypoints: moduleGraph.entrypoints.map((entrypoint) => normalizeRelativePath(entrypoint)),
			basePath: basePath,
			totalFiles: moduleGraph.getUniqueModules().length,
			generatedAt: new Date().toISOString(),
			nodeModulesCount: nodeList.filter((n) => n.path.includes("node_modules")).length,
			packages,
		},
		nodes: nodeList,
		imports: uniqueModules,
	};
}

function getNodeType(filePath: string, module: VizModule, entryPoint: string): string {
	if (filePath === entryPoint) return "entry";
	if (filePath.includes("node_modules")) return "external";
	if (module.isBarrelFile) return "barrel";
	return "internal";
}

async function launchWebUI(port: string | undefined, dataFile?: string, open = true) {
	const resolvedPort = port ? Number.parseInt(port, 10) : 3000;
	console.log(`🚀 Launching production web UI on port ${resolvedPort}...`);
	const { startProductionServer } = await import("./production-server.ts");
	await startProductionServer({
		open,
		outputPath: path.resolve(dataFile ?? flags.outputFile),
		port: resolvedPort,
	});
}

interface VizModule extends Module {
	cluster?: string;
	imports: Import[];
	exports: Export[];
	unusedExports?: Export[];
	importedBy: string[];
	isBarrelFile?: boolean;
}

function deriveAnalysisBasePath(
	entryFileAbsolute: string,
	workspaces: Array<{ location: string }>,
) {
	const workspaceLocations = workspaces.map((workspace) => workspace.location);
	if (workspaceLocations.length > 0) {
		return getCommonAncestorPath([path.dirname(entryFileAbsolute), ...workspaceLocations]);
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

function loadGraphForReport(flags: typeof parsedArgs.flags) {
	if (flags.snapshot) {
		return loadSnapshotGraph(flags.snapshot);
	}

	const graphFile = path.resolve(flags.graphFile ?? flags.outputFile);
	return loadGraphFile(graphFile);
}

function loadGraphTarget(target: string) {
	if (target.startsWith("snapshot:")) {
		return loadSnapshotGraph(target.slice("snapshot:".length));
	}

	return loadGraphFile(path.resolve(target));
}

function loadGraphFile(graphFile: string) {
	if (!existsSync(graphFile)) {
		console.error(`Error: Graph file "${graphFile}" does not exist`);
		process.exit(1);
	}

	return JSON.parse(readFileSync(graphFile, "utf-8")) as ModvizOutput;
}

function applyPathFilters(output: ModvizOutput, includeValue?: string, excludeValue?: string) {
	const includePatterns = splitGlobPatterns(includeValue);
	const excludePatterns = splitGlobPatterns(excludeValue);
	if (includePatterns.length === 0 && excludePatterns.length === 0) {
		return output;
	}

	const includeMatchers = includePatterns.map(createGlobMatcher);
	const excludeMatchers = excludePatterns.map(createGlobMatcher);
	const includedPaths = new Set(
		output.nodes
			.map((node) => node.path)
			.filter((nodePath) => {
				const included =
					includeMatchers.length === 0 || includeMatchers.some((matcher) => matcher(nodePath));
				const excluded = excludeMatchers.some((matcher) => matcher(nodePath));
				return included && !excluded;
			}),
	);

	if (includedPaths.size === output.nodes.length) {
		return output;
	}

	const filteredNodes = output.nodes
		.filter((node) => includedPaths.has(node.path))
		.map((node) => ({
			...node,
			importees: node.importees.filter((importee) => includedPaths.has(importee)),
			importedBy: node.importedBy.filter((importer) => includedPaths.has(importer)),
			chain: dedupeChains(
				node.chain
					.map((chain) => chain.filter((chainNode) => includedPaths.has(chainNode)))
					.filter((chain) => chain.length > 0),
			),
		}));

	const entrypoints = output.metadata.entrypoints.filter((entrypoint) =>
		includedPaths.has(entrypoint),
	);
	return {
		metadata: {
			...output.metadata,
			entrypoints:
				entrypoints.length > 0
					? entrypoints
					: filteredNodes[0]
						? [filteredNodes[0].path]
						: output.metadata.entrypoints,
			totalFiles: filteredNodes.length,
			nodeModulesCount: filteredNodes.filter((node) => node.path.includes("node_modules")).length,
		},
		nodes: filteredNodes,
		imports: Array.from(
			new Set(filteredNodes.flatMap((node) => [node.path, ...node.importees])),
		).sort((left, right) => left.localeCompare(right)),
	};
}

function splitGlobPatterns(value?: string) {
	return (value ?? "")
		.split(/[\n,]+/)
		.map((pattern) => pattern.trim())
		.filter(Boolean);
}

function createGlobMatcher(pattern: string) {
	const escaped = pattern
		.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
		.replace(/\*\*/g, "__DOUBLE_STAR__")
		.replace(/\*/g, "[^/]*")
		.replace(/__DOUBLE_STAR__/g, ".*");
	const regex = new RegExp(`^${escaped}$`);
	return (candidate: string) => regex.test(candidate);
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
			importees: node.importees.filter((importee) => includedPaths.has(importee)),
			importedBy: node.importedBy.filter((importer) => includedPaths.has(importer)),
			chain: dedupeChains(
				node.chain
					.map((chain) => chain.filter((chainNode) => includedPaths.has(chainNode)))
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
			nodeModulesCount: filteredNodes.filter((node) => node.path.includes("node_modules")).length,
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
		llmAnalyze: boolean;
		outputFile: string;
	},
) {
	const baseArgs = [
		"node",
		path.resolve(process.argv[1] ?? "mod/cli.ts"),
		entryFileAbsolute,
		flags.nodeModules ? "--node-modules" : undefined,
		flags.ignoreDynamic ? "--ignore-dynamic" : undefined,
		flags.llm || flags.llmAnalyze ? "--llm" : undefined,
		flags.outputFile !== "./modviz.json" ? `--output-file=${flags.outputFile}` : undefined,
	]
		.filter(Boolean)
		.join(" ");

	return {
		packageCommand: `${baseArgs} --package=<package-name> --limit=20`,
		nodeCommand: `${baseArgs} --node=<path-or-display-path> --limit=20`,
	};
}
