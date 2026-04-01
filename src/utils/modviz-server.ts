import fs from "node:fs";
import path from "node:path";
import type { ModvizLlmOutput, ModvizOutput } from "../../mod/types";
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

export const loadModvizBundle = (): ModvizDataBundle => {
	const graphPath = resolveGraphPath();
	const graph = readJsonFile<ModvizOutput>(graphPath);
	const llmPath = resolveLlmPath(graphPath);
	const llm = fs.existsSync(llmPath)
		? readJsonFile<ModvizLlmOutput>(llmPath)
		: null;

	return {
		graph,
		llm,
		summary: buildModvizSummary(graph, llm),
	};
};

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