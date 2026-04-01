import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ModvizLlmOutput, ModvizOutput, ModvizSnapshotHistoryItem } from "./types.ts";

const SNAPSHOT_NAME_SANITIZER = /[^a-z0-9-_]+/gi;

export const resolveSnapshotHistoryDir = () =>
	path.resolve(
		process.env.MODVIZ_HISTORY_DIR ??
			(process.env.MODVIZ_PATH
				? path.join(path.dirname(path.resolve(process.env.MODVIZ_PATH)), ".modviz", "history")
				: path.join(process.cwd(), ".modviz", "history")),
	);

const toSnapshotId = (snapshotName: string, generatedAt?: string) => {
	const timestamp = new Date(generatedAt ?? Date.now()).toISOString().replace(/[:.]/g, "-");
	const normalizedName =
		snapshotName
			.trim()
			.replace(SNAPSHOT_NAME_SANITIZER, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "")
			.toLowerCase() || "snapshot";
	return `${timestamp}-${normalizedName}`;
};

const resolveSnapshotPaths = (snapshotId: string) => {
	const historyDir = resolveSnapshotHistoryDir();
	return {
		historyDir,
		graphPath: path.join(historyDir, `${snapshotId}.json`),
		llmPath: path.join(historyDir, `${snapshotId}.llm.json`),
	};
};

const readSnapshotItem = (graphPath: string): ModvizSnapshotHistoryItem | null => {
	try {
		const raw = JSON.parse(readFileSync(graphPath, "utf-8")) as ModvizOutput;
		const fileStats = statSync(graphPath);
		const snapshotId = path.basename(graphPath, ".json");
		const llmPath = graphPath.replace(/\.json$/, ".llm.json");
		return {
			id: snapshotId,
			label: snapshotId.replace(/^\d{4}-\d{2}-\d{2}t/i, "").replace(/-/g, " "),
			graphPath,
			llmPath,
			generatedAt: raw.metadata.generatedAt ?? null,
			lastModified: fileStats.mtimeMs,
			totalNodes: raw.nodes.length,
			entrypoints: raw.metadata.entrypoints,
		};
	} catch {
		return null;
	}
};

export const listSnapshotHistory = (): ModvizSnapshotHistoryItem[] => {
	const historyDir = resolveSnapshotHistoryDir();
	try {
		return readdirSync(historyDir)
			.filter((fileName) => fileName.endsWith(".json") && !fileName.endsWith(".llm.json"))
			.map((fileName) => readSnapshotItem(path.join(historyDir, fileName)))
			.filter((item): item is ModvizSnapshotHistoryItem => Boolean(item))
			.sort((left, right) => right.lastModified - left.lastModified);
	} catch {
		return [];
	}
};

export const saveSnapshotToHistory = (options: {
	graph: ModvizOutput;
	llm?: ModvizLlmOutput;
	snapshotName: string;
}) => {
	const snapshotId = toSnapshotId(options.snapshotName, options.graph.metadata.generatedAt);
	const { historyDir, graphPath, llmPath } = resolveSnapshotPaths(snapshotId);
	mkdirSync(historyDir, { recursive: true });
	writeFileSync(graphPath, JSON.stringify(options.graph, null, 2));
	if (options.llm) {
		writeFileSync(llmPath, JSON.stringify(options.llm, null, 2));
	}

	return readSnapshotItem(graphPath);
};

export const loadSnapshotGraph = (snapshotId: string) => {
	const { graphPath } = resolveSnapshotPaths(snapshotId);
	return JSON.parse(readFileSync(graphPath, "utf-8")) as ModvizOutput;
};
