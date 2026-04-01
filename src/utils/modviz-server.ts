import fs from "node:fs";
import path from "node:path";
import type { ModvizLlmOutput, ModvizOutput } from "../../mod/types";
import { listSnapshotHistory } from "../../mod/snapshot-history.ts";
import {
	buildModvizSummary,
	type ModvizDataBundle,
	type ModvizJsonStatus,
} from "~/utils/modviz-data";

const resolveGraphPath = () =>
	path.resolve(process.env.MODVIZ_PATH ?? path.join(process.cwd(), "modviz.json"));

const resolveLlmPath = (graphPath: string) => {
	if (graphPath.endsWith(".llm.json")) {
		return graphPath;
	}

	const parsed = path.parse(graphPath);
	return path.join(parsed.dir, `${parsed.name}.llm.json`);
};

const parseJsonError = (error: unknown, filePath: string) => {
	if (!(error instanceof SyntaxError) || !("message" in error)) {
		return `Unable to parse JSON from ${filePath}.`;
	}

	const positionMatch = error.message.match(/position\s+(\d+)/i);
	if (!positionMatch) {
		return `Unable to parse JSON from ${filePath}: ${error.message}`;
	}

	const source = fs.readFileSync(filePath, "utf-8");
	const position = Number(positionMatch[1]);
	const prefix = source.slice(0, position);
	const line = prefix.split("\n").length;
	const column = prefix.length - prefix.lastIndexOf("\n");
	return `Unable to parse JSON from ${filePath} at line ${line}, column ${column}: ${error.message}`;
};

const readJsonFile = <T>(filePath: string): T => {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
	} catch (error) {
		throw new Error(parseJsonError(error, filePath));
	}
};

const findClosestPackageJson = (startPath: string) => {
	let currentPath = startPath;

	while (true) {
		const packageJsonPath = path.join(currentPath, "package.json");
		if (fs.existsSync(packageJsonPath)) {
			return packageJsonPath;
		}

		const parentPath = path.dirname(currentPath);
		if (parentPath === currentPath) {
			return null;
		}

		currentPath = parentPath;
	}
};

const resolveProjectTitle = (graph: ModvizOutput) => {
	const firstEntrypoint = graph.metadata.entrypoints[0];
	if (!firstEntrypoint) {
		return graph.metadata.packages[0]?.name ?? null;
	}

	const entrypointPath = path.isAbsolute(firstEntrypoint)
		? firstEntrypoint
		: path.resolve(graph.metadata.basePath, firstEntrypoint);
	const packageJsonPath = findClosestPackageJson(path.dirname(entrypointPath));
	if (!packageJsonPath) {
		return graph.metadata.packages[0]?.name ?? null;
	}

	try {
		const packageJson = readJsonFile<{ name?: string; title?: string }>(packageJsonPath);
		return packageJson.title ?? packageJson.name ?? graph.metadata.packages[0]?.name ?? null;
	} catch {
		return graph.metadata.packages[0]?.name ?? null;
	}
};

export const loadModvizBundle = (): ModvizDataBundle => {
	const graphPath = resolveGraphPath();
	const llmPath = resolveLlmPath(graphPath);
	const history = listSnapshotHistory();

	if (!fs.existsSync(graphPath)) {
		return {
			graph: null,
			llm: null,
			projectTitle: null,
			summary: null,
			history,
			setup: {
				status: "missing",
				graphPath,
				message: `No graph snapshot exists at ${graphPath}. Generate one with modviz analyze <entryFile> or choose a named snapshot from history.`,
			},
		};
	}

	try {
		const graph = readJsonFile<ModvizOutput>(graphPath);
		const llm = fs.existsSync(llmPath)
			? readJsonFile<ModvizLlmOutput>(llmPath)
			: null;

		return {
			graph,
			llm,
			projectTitle: resolveProjectTitle(graph),
			summary: buildModvizSummary(graph, llm),
			history,
			setup: {
				status: "ready",
				graphPath,
			},
		};
	} catch (error) {
		return {
			graph: null,
			llm: null,
			projectTitle: null,
			summary: null,
			history,
			setup: {
				status: "invalid",
				graphPath,
				message:
					error instanceof Error
						? error.message
						: `Failed to read ${graphPath}.`,
			},
		};
	}
};

export { resolveProjectTitle };

export const getModvizJsonStatus = (): ModvizJsonStatus => {
	const graphPath = resolveGraphPath();
	const llmPath = resolveLlmPath(graphPath);
	const exists = fs.existsSync(graphPath);

	if (!exists) {
		return {
			exists: false,
			graphPath,
			hasLlm: fs.existsSync(llmPath),
			lastModified: null,
			llmPath,
		};
	}

	const stat = fs.statSync(graphPath);
	return {
		exists: true,
		graphPath,
		hasLlm: fs.existsSync(llmPath),
		lastModified: stat.mtimeMs,
		llmPath,
	};
};
