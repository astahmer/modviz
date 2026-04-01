import type { ModvizOutput, VizNode } from "./types.ts";

export type CliCommand = "analyze" | "serve" | "report";

export interface CliFlags {
	port?: string;
	ui: boolean;
	llmAnalyze: boolean;
	llmBaseUrl?: string;
	llmModel?: string;
	outputFile: string;
	nodeModules: boolean;
	ignoreDynamic: boolean;
	serve: boolean;
	help: boolean;
	llm: boolean;
	packageQuery?: string;
	nodeQuery?: string;
	limit: number;
	moduleLexer?: string;
	summary: boolean;
	graphFile?: string;
	snapshotName?: string;
	snapshot?: string;
	listSnapshots: boolean;
}

export interface ParsedCliArgs {
	command: CliCommand;
	entryFile?: string;
	serveDataFile?: string;
	flags: CliFlags;
}

const getOptionValue = (args: string[], name: string) =>
	args.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1];

export function parseCliArgs(args: string[]): ParsedCliArgs {
	const [firstArg, ...restArgs] = args;
	const command =
		firstArg === "analyze" || firstArg === "serve" || firstArg === "report"
			? firstArg
			: "analyze";
	const commandArgs = command === "analyze" && firstArg !== "analyze" ? args : restArgs;
	const positionalArgs = commandArgs.filter((arg) => !arg.startsWith("--"));
	const serve = args.includes("--serve");
	const effectiveServe = command === "serve" || serve;

	return {
		command,
		entryFile: effectiveServe || command === "report" ? undefined : positionalArgs[0],
		serveDataFile: effectiveServe ? positionalArgs[0] : undefined,
		flags: {
			port: getOptionValue(commandArgs, "--port"),
			ui: commandArgs.includes("--ui"),
			llmAnalyze: commandArgs.includes("--llm-analyze"),
			llmBaseUrl: getOptionValue(commandArgs, "--llm-base-url"),
			llmModel: getOptionValue(commandArgs, "--llm-model"),
			outputFile: getOptionValue(commandArgs, "--output-file") ?? "./modviz.json",
			nodeModules: commandArgs.includes("--node-modules"),
			ignoreDynamic: commandArgs.includes("--ignore-dynamic"),
			serve: effectiveServe,
			help: commandArgs.includes("--help") || commandArgs.includes("-h"),
			llm: commandArgs.includes("--llm"),
			packageQuery: getOptionValue(commandArgs, "--package"),
			nodeQuery: getOptionValue(commandArgs, "--node"),
			limit: Number.parseInt(getOptionValue(commandArgs, "--limit") ?? "20", 10),
			moduleLexer: getOptionValue(commandArgs, "--module-lexer"),
			summary: commandArgs.includes("--summary"),
			graphFile: getOptionValue(commandArgs, "--graph-file"),
			snapshotName: getOptionValue(commandArgs, "--snapshot-name"),
			snapshot: getOptionValue(commandArgs, "--snapshot"),
			listSnapshots: commandArgs.includes("--list-snapshots"),
		},
	};
}

export function validateCliArgs(parsedArgs: ParsedCliArgs) {
	const { command, entryFile, flags } = parsedArgs;

	if (command === "analyze" && !flags.serve && !entryFile && !flags.help) {
		return "Entry file is required when not using --serve.";
	}

	if (
		command === "report" &&
		!flags.summary &&
		!flags.packageQuery &&
		!flags.nodeQuery &&
		!flags.listSnapshots &&
		!flags.help
	) {
		return "Report command requires --summary, --package, --node, or --list-snapshots.";
	}

	if (flags.port && Number.isNaN(Number.parseInt(flags.port, 10))) {
		return `Invalid --port value: ${flags.port}`;
	}

	if (!Number.isFinite(flags.limit) || flags.limit < 1) {
		return `Invalid --limit value: ${flags.limit}`;
	}

	if (
		flags.moduleLexer &&
		flags.moduleLexer !== "rs" &&
		flags.moduleLexer !== "es"
	) {
		return `Invalid --module-lexer value: ${flags.moduleLexer}. Use rs or es.`;
	}

	return null;
}

export function buildCliHelpText() {
	return `
modviz - Module dependency graph visualizer and import analysis CLI

Usage:
	modviz analyze <entryFile>                      Generate graph JSON for the UI
	modviz serve [dataFile]                         Launch the web UI with existing graph data
	modviz report --summary                         Print a concise terminal summary from an existing graph file
	modviz report --package=zod                     Print origin traces for one external package
	modviz report --node=src/foo.ts                 Print origin traces for one node
	modviz report --list-snapshots                  Show named snapshot history
	modviz <entryFile>                              Legacy shorthand for analyze <entryFile>

Options:
	--output-file=<file>   Base JSON output path for the UI graph (default: ./modviz.json)
	--graph-file=<file>    Existing graph file used by report (default: ./modviz.json)
	--port=<port>          Port for the web server (default: 3000)
	--ui                   Launch the browser UI after generating the graph
	--serve                Launch the UI server using an existing graph JSON file
	--llm                  Also emit <output>.llm.json and <output>.llm.md focused on import origins and barrel-file impact
	--llm-analyze          Use the Vercel AI SDK to turn the structured LLM report into <output>.llm.ai.md
	--llm-model=<model>    Override the OpenAI-compatible model used by --llm-analyze
	--llm-base-url=<url>   Override the OpenAI-compatible base URL used by --llm-analyze
	--package=<name>       Focus outputs and drilldowns on one external package
	--node=<path>          Focus outputs and drilldowns on one node path or display path
	--limit=<n>            Limit printed list output in focused drilldowns (default: 20)
	--summary              Print a terminal summary of the generated graph
	--snapshot-name=<name> Save the generated snapshot into history under a named run
	--snapshot=<id>        Load a named history snapshot for report
	--list-snapshots       List available named snapshots
	--node-modules         Keep node_modules in the analyzed graph instead of excluding them
	--ignore-dynamic       Ignore dynamic imports
	--module-lexer=<mode>  Choose import parser: rs or es (default: rs)
	--help, -h             Show this help message

Examples:
	modviz analyze src/index.ts --ui --port=4000
	modviz analyze src/index.ts --llm --snapshot-name=before-refactor
	modviz analyze src/index.ts --node-modules --package=googleapis
	modviz serve ./modviz.json
	modviz report --summary
	modviz report --snapshot=2026-04-01t12-00-00-before-refactor --package=googleapis
	modviz report --list-snapshots
	`;
}

const getExternalPackageName = (node: VizNode) => {
	const segments = node.path.split(/[\\/]/).filter(Boolean);
	const nodeModulesIndex = segments.lastIndexOf("node_modules");
	if (nodeModulesIndex === -1) {
		return node.package?.name ?? "external";
	}

	const scopeOrName = segments[nodeModulesIndex + 1];
	const maybeName = segments[nodeModulesIndex + 2];
	if (!scopeOrName) {
		return "node_modules";
	}

	return scopeOrName.startsWith("@") && maybeName
		? `${scopeOrName}/${maybeName}`
		: scopeOrName;
};

export function buildCliSummary(output: ModvizOutput) {
	const workspaceNodes = output.nodes.filter((node) => node.type !== "external");
	const externalNodes = output.nodes.filter((node) => node.type === "external");
	const externalPackages = new Set(
		externalNodes.map((node) => getExternalPackageName(node)),
	);

	return [
		"",
		"Graph summary",
		`- Nodes: ${output.nodes.length} total (${workspaceNodes.length} workspace, ${externalNodes.length} external)`,
		`- Edges: ${output.imports.length}`,
		`- Workspace packages: ${output.metadata.packages.length}`,
		`- External packages: ${externalPackages.size}`,
		`- Barrel files: ${output.nodes.filter((node) => node.isBarrelFile).length}`,
		`- Entrypoints: ${output.metadata.entrypoints.join(", ") || "none"}`,
	].join("\n");
}

export function buildSnapshotList(history: Array<{ id: string; totalNodes: number; generatedAt: string | null }>) {
	if (history.length === 0) {
		return "No named snapshots found.\n";
	}

	return `${history
		.map(
			(snapshot) =>
				`- ${snapshot.id} (${snapshot.totalNodes} nodes${snapshot.generatedAt ? `, generated ${snapshot.generatedAt}` : ""})`,
		)
		.join("\n")}\n`;
}
