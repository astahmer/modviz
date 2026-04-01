import type { ModvizOutput, VizNode } from "./types.ts";

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
}

export interface ParsedCliArgs {
	entryFile?: string;
	serveDataFile?: string;
	flags: CliFlags;
}

const getOptionValue = (args: string[], name: string) =>
	args.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1];

export function parseCliArgs(args: string[]): ParsedCliArgs {
	const positionalArgs = args.filter((arg) => !arg.startsWith("--"));
	const serve = args.includes("--serve");

	return {
		entryFile: serve ? undefined : positionalArgs[0],
		serveDataFile: serve ? positionalArgs[0] : undefined,
		flags: {
			port: getOptionValue(args, "--port"),
			ui: args.includes("--ui"),
			llmAnalyze: args.includes("--llm-analyze"),
			llmBaseUrl: getOptionValue(args, "--llm-base-url"),
			llmModel: getOptionValue(args, "--llm-model"),
			outputFile: getOptionValue(args, "--output-file") ?? "./modviz.json",
			nodeModules: args.includes("--node-modules"),
			ignoreDynamic: args.includes("--ignore-dynamic"),
			serve,
			help: args.includes("--help") || args.includes("-h"),
			llm: args.includes("--llm"),
			packageQuery: getOptionValue(args, "--package"),
			nodeQuery: getOptionValue(args, "--node"),
			limit: Number.parseInt(getOptionValue(args, "--limit") ?? "20", 10),
			moduleLexer: getOptionValue(args, "--module-lexer"),
			summary: args.includes("--summary"),
		},
	};
}

export function validateCliArgs(parsedArgs: ParsedCliArgs) {
	const { entryFile, flags } = parsedArgs;

	if (!flags.serve && !entryFile && !flags.help) {
		return "Entry file is required when not using --serve.";
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
	modviz <entryFile>                              Generate graph JSON for the UI
	modviz <entryFile> --ui                         Generate graph JSON and launch the web UI
	modviz <entryFile> --llm                        Generate UI JSON plus LLM-focused JSON and Markdown reports
	modviz <entryFile> --llm-analyze                Generate LLM companion files plus an AI-written engineering summary
	modviz <entryFile> --summary                    Print a concise terminal summary after generating the graph
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
	--llm-analyze          Use the Vercel AI SDK to turn the structured LLM report into <output>.llm.ai.md
	--llm-model=<model>    Override the OpenAI-compatible model used by --llm-analyze
	--llm-base-url=<url>   Override the OpenAI-compatible base URL used by --llm-analyze
	--package=<name>       Focus outputs and drilldowns on one external package
	--node=<path>          Focus outputs and drilldowns on one node path or display path
	--limit=<n>            Limit printed list output in focused drilldowns (default: 20)
	--summary              Print a terminal summary of the generated graph
	--node-modules         Keep node_modules in the analyzed graph instead of excluding them
	--ignore-dynamic       Ignore dynamic imports
	--module-lexer=<mode>  Choose import parser: rs or es (default: rs)
	--help, -h             Show this help message

Examples:
	modviz src/index.ts
	modviz src/index.ts --ui --port=4000
	modviz src/index.ts --llm --node-modules
	modviz src/index.ts --summary
	MODVIZ_LLM_API_KEY=... modviz src/index.ts --llm-analyze --llm-model=gpt-4.1-mini
	modviz src/index.ts --node-modules --package=googleapis
	modviz src/index.ts --node-modules --node=src/adapter-rest/register-app-routes.ts
	modviz --serve ./modviz.json
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
