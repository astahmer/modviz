import type { ModvizOutput, VizNode } from "./types.ts";

export type CliCommand = "analyze" | "serve" | "report" | "diff";

export interface CliFlags {
	port?: string;
	open: boolean;
	ui: boolean;
	barrelThreshold: number;
	exclude?: string;
	historyDir?: string;
	include?: string;
	llmAnalyze: boolean;
	llmBaseUrl?: string;
	llmModel?: string;
	outputFile: string;
	nodeModules: boolean;
	ignoreDynamic: boolean;
	ignoreTypeOnly: boolean;
	serve: boolean;
	help: boolean;
	llm: boolean;
	packageQuery?: string;
	nodeQuery?: string;
	limit: number;
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
	missingValueOptions?: string[];
	positionals?: string[];
}

const valueOptionNames = new Set([
	"--port",
	"--llm-base-url",
	"--llm-model",
	"--output-file",
	"--barrel-threshold",
	"--exclude",
	"--history-dir",
	"--include",
	"--package",
	"--node",
	"--limit",
	"--graph-file",
	"--snapshot-name",
	"--snapshot",
]);

type ParsedOptionTokens = {
	flags: Set<string>;
	values: Map<string, string>;
	missingValueOptions: string[];
	positionals: string[];
};

const parseOptionTokens = (args: string[]): ParsedOptionTokens => {
	const flags = new Set<string>();
	const values = new Map<string, string>();
	const missingValueOptions: string[] = [];
	const positionals: string[] = [];

	for (let index = 0; index < args.length; index += 1) {
		const currentArg = args[index];
		if (!currentArg) {
			continue;
		}

		if (currentArg === "--") {
			positionals.push(...args.slice(index + 1));
			break;
		}

		if (!currentArg.startsWith("--")) {
			positionals.push(currentArg);
			continue;
		}

		if (currentArg.startsWith("--no-")) {
			flags.add(currentArg);
			continue;
		}

		const equalSignIndex = currentArg.indexOf("=");
		const optionName = equalSignIndex === -1 ? currentArg : currentArg.slice(0, equalSignIndex);

		if (equalSignIndex !== -1) {
			values.set(optionName, currentArg.slice(equalSignIndex + 1));
			continue;
		}

		if (valueOptionNames.has(optionName)) {
			const nextArg = args[index + 1];
			if (nextArg && nextArg !== "--" && !nextArg.startsWith("--")) {
				values.set(optionName, nextArg);
				index += 1;
			} else {
				missingValueOptions.push(optionName);
			}
			continue;
		}

		flags.add(optionName);
	}

	return { flags, values, missingValueOptions, positionals };
};

export function parseCliArgs(args: string[]): ParsedCliArgs {
	const [firstArg, ...restArgs] = args;
	const command =
		firstArg === "analyze" || firstArg === "serve" || firstArg === "report" || firstArg === "diff"
			? firstArg
			: "analyze";
	const commandArgs = command === "analyze" && firstArg !== "analyze" ? args : restArgs;
	const {
		flags: parsedFlags,
		values: parsedValues,
		missingValueOptions,
		positionals,
	} = parseOptionTokens(commandArgs);
	const serve = args.includes("--serve");
	const effectiveServe = command === "serve" || serve;
	const getOptionValue = (name: string) => parsedValues.get(name);
	const hasFlag = (name: string) => parsedFlags.has(name);

	return {
		command,
		entryFile: effectiveServe || command === "report" ? undefined : positionals[0],
		serveDataFile: effectiveServe ? positionals[0] : undefined,
		flags: {
			port: getOptionValue("--port") ?? "3628",
			open: !hasFlag("--no-open"),
			ui: hasFlag("--ui"),
			barrelThreshold: Number.parseInt(getOptionValue("--barrel-threshold") ?? "3", 10),
			exclude: getOptionValue("--exclude"),
			historyDir: getOptionValue("--history-dir"),
			include: getOptionValue("--include"),
			llmAnalyze: hasFlag("--llm-analyze"),
			llmBaseUrl: getOptionValue("--llm-base-url"),
			llmModel: getOptionValue("--llm-model"),
			outputFile: getOptionValue("--output-file") ?? "./modviz.json",
			nodeModules: hasFlag("--node-modules"),
			ignoreDynamic: hasFlag("--ignore-dynamic"),
			ignoreTypeOnly: hasFlag("--ignore-type-only"),
			serve: effectiveServe,
			help: commandArgs.includes("--help") || commandArgs.includes("-h"),
			llm: hasFlag("--llm"),
			packageQuery: getOptionValue("--package"),
			nodeQuery: getOptionValue("--node"),
			limit: Number.parseInt(getOptionValue("--limit") ?? "20", 10),
			summary: hasFlag("--summary"),
			graphFile: getOptionValue("--graph-file"),
			snapshotName: getOptionValue("--snapshot-name"),
			snapshot: getOptionValue("--snapshot"),
			listSnapshots: hasFlag("--list-snapshots"),
		},
		missingValueOptions,
		positionals,
	};
}

export function validateCliArgs(parsedArgs: ParsedCliArgs) {
	const { command, entryFile, flags, missingValueOptions = [] } = parsedArgs;

	if (missingValueOptions.length > 0) {
		return `Missing value for ${missingValueOptions[0]}`;
	}

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

	if (command === "diff" && !flags.help && (parsedArgs.positionals?.length ?? 0) < 2) {
		return "Diff command requires <baseline> and <current> graph targets.";
	}

	if (flags.port && Number.isNaN(Number.parseInt(flags.port, 10))) {
		return `Invalid --port value: ${flags.port}`;
	}

	if (!Number.isFinite(flags.limit) || flags.limit < 1) {
		return `Invalid --limit value: ${flags.limit}`;
	}

	if (!Number.isFinite(flags.barrelThreshold) || flags.barrelThreshold < 1) {
		return `Invalid --barrel-threshold value: ${flags.barrelThreshold}`;
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
	modviz diff <baseline> <current>                Print graph deltas between two graph files or snapshot:<id> targets
	modviz report --package=zod                     Print origin traces for one external package
	modviz report --node=src/foo.ts                 Print origin traces for one node
	modviz report --list-snapshots                  Show named snapshot history
	modviz <entryFile>                              Legacy shorthand for analyze <entryFile>

Options:
	--output-file=<file>   Base JSON output path for the UI graph (default: ./modviz.json)
	--graph-file=<file>    Existing graph file used by report (default: ./modviz.json)
	--port=<port>          Port for the web server (default: 3628)
	--no-open              Do not open a browser window when launching the UI
	--ui                   Launch the browser UI after generating the graph
	--barrel-threshold=<n> Export count that marks a file as a barrel file (default: 3)
	--include=<glob,...>   Keep only matching paths in the generated graph
	--exclude=<glob,...>   Drop matching paths from the generated graph
	--history-dir=<dir>    Override the snapshot history directory for report, diff, and saved snapshots
	--serve                Launch the UI server using an existing graph JSON file
	--llm                  Also emit <output>.llm.json and <output>.llm.md focused on import origins and barrel-file impact
	--llm-analyze          Use the Vercel AI SDK to turn the structured LLM report into <output>.llm.ai.md
	--llm-model=<model>    Override the OpenAI-compatible model used by --llm-analyze
	--llm-base-url=<url>   Override the OpenAI-compatible base URL used by --llm-analyze
	--package=<name>       Focus outputs and drilldowns on one external package
	--node=<path>          Focus outputs and drilldowns on one node path or display path
	--limit=<n>            Limit printed drilldown lists and cap stored origin chains per node (default: 5)
	--summary              Print a terminal summary of the generated graph
	--snapshot-name=<name> Save the generated snapshot into history under a named run
	--snapshot=<id>        Load a named history snapshot for report
	--list-snapshots       List available named snapshots
	--node-modules         Keep node_modules in the analyzed graph instead of excluding them
	--ignore-dynamic       Ignore dynamic imports
	--ignore-type-only     Ignore type-only imports
	--help, -h             Show this help message

Examples:
	modviz analyze src/index.ts --ui --port=4000
	modviz analyze src/index.ts --llm --snapshot-name=before-refactor
	modviz analyze src/index.ts --barrel-threshold=5
	modviz analyze src/index.ts --include='src/routes/**,src/components/**' --exclude='**/*.test.ts'
	modviz analyze src/index.ts --node-modules --package=googleapis
	modviz serve ./modviz.json
	modviz report --summary
	modviz diff snapshot:before-refactor ./modviz.json
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

	return scopeOrName.startsWith("@") && maybeName ? `${scopeOrName}/${maybeName}` : scopeOrName;
};

export function buildCliSummary(output: ModvizOutput) {
	const workspaceNodes = output.nodes.filter((node) => node.type !== "external");
	const externalNodes = output.nodes.filter((node) => node.type === "external");
	const externalPackages = new Set(externalNodes.map((node) => getExternalPackageName(node)));

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

export function buildSnapshotList(
	history: Array<{ id: string; totalNodes: number; generatedAt: string | null }>,
) {
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
