import type { ModvizOutput, VizNode } from "../mod/types.ts";

export interface ModvizTraceMatch {
	path: string;
	label: string;
	packageName: string | null;
	type: string;
	directImporters: string[];
	directImporteeCount: number;
	chains: string[][];
}

export interface ModvizTraceReport {
	kind: "package" | "node";
	query: string;
	matchedLabels: string[];
	matches: ModvizTraceMatch[];
	totalChains: number;
}

const normalizeForSearch = (value: string) => value.trim().toLowerCase();

export const getTracePackageName = (node: VizNode) => {
	if (!node.path.includes("node_modules")) {
		return node.package?.name ?? null;
	}

	if (node.package?.name && node.package.name !== "node_modules") {
		return node.package.name;
	}

	const segments = node.path.split(/[\\/]/).filter(Boolean);
	const nodeModulesIndex = segments.lastIndexOf("node_modules");
	if (nodeModulesIndex === -1) {
		return null;
	}

	const scopeOrName = segments[nodeModulesIndex + 1];
	const maybeName = segments[nodeModulesIndex + 2];
	if (!scopeOrName) {
		return null;
	}

	return scopeOrName.startsWith("@") && maybeName
		? `${scopeOrName}/${maybeName}`
		: scopeOrName;
};

const uniqueChains = (chains: string[][]) => {
	const seen = new Set<string>();
	const nextChains: string[][] = [];

	for (const chain of chains) {
		const key = chain.join(" -> ");
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		nextChains.push(chain);
	}

	return nextChains.sort((left, right) => {
		const byLength = left.length - right.length;
		return byLength !== 0 ? byLength : left.join("/").localeCompare(right.join("/"));
	});
};

const createTraceMatch = (node: VizNode): ModvizTraceMatch => ({
	path: node.path,
	label: node.name,
	packageName: getTracePackageName(node),
	type: node.type,
	directImporters: [...node.importedBy].sort((left, right) => left.localeCompare(right)),
	directImporteeCount: node.importees.length,
	chains: uniqueChains(node.chain),
});

export const buildPackageTraceReport = (
	graph: ModvizOutput,
	packageQuery: string,
): ModvizTraceReport => {
	const normalizedQuery = normalizeForSearch(packageQuery);
	const matches = graph.nodes
		.filter((node) => node.path.includes("node_modules"))
		.filter((node) => {
			const packageName = getTracePackageName(node);
			return packageName ? normalizeForSearch(packageName).includes(normalizedQuery) : false;
		})
		.map(createTraceMatch);

	return {
		kind: "package",
		query: packageQuery,
		matchedLabels: Array.from(
			new Set(matches.map((match) => match.packageName).filter(Boolean) as string[]),
		).sort((left, right) => left.localeCompare(right)),
		matches,
		totalChains: matches.reduce((sum, match) => sum + match.chains.length, 0),
	};
};

export const buildNodeTraceReport = (
	graph: ModvizOutput,
	nodeQuery: string,
): ModvizTraceReport => {
	const normalizedQuery = normalizeForSearch(nodeQuery);
	const matches = graph.nodes
		.filter((node) => {
			return [node.path, node.name, node.package?.name, node.cluster]
				.filter(Boolean)
				.some((value) => normalizeForSearch(String(value)).includes(normalizedQuery));
		})
		.map(createTraceMatch);

	return {
		kind: "node",
		query: nodeQuery,
		matchedLabels: matches.map((match) => match.path),
		matches,
		totalChains: matches.reduce((sum, match) => sum + match.chains.length, 0),
	};
};

export const renderTraceReport = (
	report: ModvizTraceReport,
	limit = 10,
) => {
	const lines = [
		`${report.kind === "package" ? "Package" : "Node"} trace for: ${report.query}`,
		`Matched ${report.matches.length} node(s) across ${report.totalChains} origin chain(s).`,
		"",
	];

	if (report.matches.length === 0) {
		lines.push("No matching nodes were found.");
		return `${lines.join("\n")}\n`;
	}

	for (const match of report.matches.slice(0, limit)) {
		lines.push(`- ${match.path} (${match.type})`);
		if (match.packageName) {
			lines.push(`  Package: ${match.packageName}`);
		}
		lines.push(`  Direct importers: ${match.directImporters.join(", ") || "none"}`);
		lines.push(`  Direct importees: ${match.directImporteeCount}`);
		for (const chain of match.chains.slice(0, limit)) {
			lines.push(`  Chain: ${chain.join(" -> ")}`);
		}
		if (match.chains.length > limit) {
			lines.push(`  +${match.chains.length - limit} more chain(s)`);
		}
		lines.push("");
	}

	if (report.matches.length > limit) {
		lines.push(`+${report.matches.length - limit} more matching node(s)`);
	}

	return `${lines.join("\n").trimEnd()}\n`;
};
