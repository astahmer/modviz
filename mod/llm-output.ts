import path from "node:path";
import type {
	LlmBarrelFileReport,
	LlmExternalDependencyReport,
	LlmExternalPackageReport,
	LlmHotspot,
	ModvizLlmOutput,
	ModvizOutput,
	VizNode,
} from "./types.ts";

export function buildModvizLlmOutput(output: ModvizOutput): ModvizLlmOutput {
	const nodeMap = new Map(output.nodes.map((node) => [node.path, node]));

	const externalDependencies = output.nodes
		.filter((node) => node.type === "external")
		.map((node) =>
			buildExternalDependencyReport(node, nodeMap, output.metadata.basePath),
		);

	const barrelFiles = output.nodes
		.filter((node) => node.isBarrelFile && node.type !== "external")
		.map((node) =>
			buildBarrelFileReport(node, nodeMap, output.metadata.basePath),
		);

	const hotspots = output.nodes
		.filter((node) => node.type !== "external")
		.map((node) => buildHotspot(node, nodeMap, output.metadata.basePath))
		.sort((left, right) => compareHotspots(right, left));

	const externalPackages = buildExternalPackages(
		externalDependencies,
		output.metadata.basePath,
	);

	return {
		format: "modviz-llm-v1",
		metadata: {
			...output.metadata,
			pathFormat: "relative-to-basePath",
		},
		summary: {
			totalNodes: output.nodes.length,
			internalNodes: output.nodes.filter((node) => node.type !== "external")
				.length,
			barrelFiles: barrelFiles.length,
			externalDependencies: externalDependencies.length,
			externalPackages: externalPackages.length,
			nodesWithMultipleOrigins: output.nodes.filter(
				(node) => node.chain.length > 1,
			).length,
			topHotspots: hotspots.slice(0, 10).map((hotspot) => ({
				path: hotspot.path,
				reachableModulesCount: hotspot.reachableModulesCount,
				reachableNodeModulesCount: hotspot.reachableNodeModulesCount,
				directImporterCount: hotspot.directImporterCount,
				isBarrelFile: hotspot.isBarrelFile,
			})),
			topExternalPackagesBySourceCount: externalPackages
				.slice()
				.sort((left, right) => {
					if (right.sourceCount !== left.sourceCount) {
						return right.sourceCount - left.sourceCount;
					}
					return right.modulePaths.length - left.modulePaths.length;
				})
				.slice(0, 10)
				.map((pkg) => ({
					packageName: pkg.packageName,
					sourceCount: pkg.sourceCount,
					moduleCount: pkg.modulePaths.length,
				})),
		},
		hotspots,
		barrelFiles,
		externalDependencies,
		externalPackages,
	};
}

export function renderModvizLlmMarkdown(report: ModvizLlmOutput): string {
	const lines = [
		"# modviz LLM report",
		"",
		"## Summary",
		`- Total nodes: ${report.summary.totalNodes}`,
		`- Internal nodes: ${report.summary.internalNodes}`,
		`- Barrel files: ${report.summary.barrelFiles}`,
		`- External dependency modules: ${report.summary.externalDependencies}`,
		`- External packages: ${report.summary.externalPackages}`,
		`- Nodes with multiple origin chains: ${report.summary.nodesWithMultipleOrigins}`,
		"",
		"## Top hotspots",
	];

	if (report.hotspots.length === 0) {
		lines.push("- None");
	} else {
		for (const hotspot of report.hotspots.slice(0, 10)) {
			lines.push(
				`- ${hotspot.path} (${hotspot.isBarrelFile ? "barrel" : hotspot.type}) reaches ${hotspot.reachableModulesCount} modules, including ${hotspot.reachableNodeModulesCount} node_modules modules; direct importers: ${formatList(hotspot.directImporters)}`,
			);
			if (hotspot.originChains.length > 0) {
				lines.push(
					`  Origin chains: ${hotspot.originChains
						.slice(0, 3)
						.map((chain) => chain.join(" -> "))
						.join(" | ")}`,
				);
			}
		}
	}

	lines.push("", "## Barrel files to audit");
	if (report.barrelFiles.length === 0) {
		lines.push("- None");
	} else {
		for (const barrelFile of report.barrelFiles.slice(0, 10)) {
			lines.push(
				`- ${barrelFile.path} reaches ${barrelFile.impact.reachableModulesCount} modules, including ${barrelFile.impact.reachableNodeModulesCount} node_modules modules; direct importers: ${formatList(barrelFile.directImporters)}`,
			);
			if (barrelFile.nodeModulesIntroduced.length > 0) {
				lines.push(
					`  Pulls in: ${barrelFile.nodeModulesIntroduced
						.slice(0, 5)
						.map((dependency) => dependency.packageName ?? dependency.path)
						.join(", ")}`,
				);
			}
		}
	}

	lines.push("", "## node_modules with multiple sources");
	const multiSourcePackages = report.externalPackages.filter(
		(pkg) => pkg.sourceCount > 1,
	);
	if (multiSourcePackages.length === 0) {
		lines.push("- None");
	} else {
		for (const pkg of multiSourcePackages.slice(0, 10)) {
			lines.push(
				`- ${pkg.packageName} is introduced by ${pkg.sourceCount} sources: ${formatList(pkg.sources)}`,
			);
			if (pkg.barrelSources.length > 0) {
				lines.push(`  Barrel sources: ${formatList(pkg.barrelSources)}`);
			}
			if (pkg.originChains.length > 0) {
				lines.push(
					`  Origin chains: ${pkg.originChains
						.slice(0, 3)
						.map((chain) => chain.join(" -> "))
						.join(" | ")}`,
				);
			}
		}
	}

	return `${lines.join("\n")}\n`;
}

export function inferLlmOutputPaths(outputFile: string) {
	const parsed = path.parse(outputFile);
	const llmBase = path.join(parsed.dir, `${parsed.name}.llm`);

	return {
		json: `${llmBase}.json`,
		markdown: `${llmBase}.md`,
	};
}

function buildHotspot(
	node: VizNode,
	nodeMap: Map<string, VizNode>,
	basePath: string,
): LlmHotspot {
	const reachablePaths = collectReachablePaths(node, nodeMap);
	const reachableNodes = Array.from(reachablePaths)
		.map((nodePath) => nodeMap.get(nodePath))
		.filter(Boolean) as VizNode[];
	const reachableNodeModulesCount = reachableNodes.filter(
		(reachableNode) => reachableNode.type === "external",
	).length;
	const reachableBarrelFilesCount = reachableNodes.filter(
		(reachableNode) => reachableNode.isBarrelFile,
	).length;

	const signals = [];
	if (node.isBarrelFile) {
		signals.push("barrel-file");
	}
	if (reachableNodeModulesCount > 0) {
		signals.push(
			`pulls ${reachableNodeModulesCount} node_modules modules transitively`,
		);
	}
	if (node.importedBy.length > 1) {
		signals.push(`shared by ${node.importedBy.length} direct importers`);
	}
	if (reachablePaths.size > node.importees.length + 5) {
		signals.push(`fans out to ${reachablePaths.size} transitive modules`);
	}

	return {
		path: toDisplayPath(node.path, basePath),
		type: node.type,
		isBarrelFile: node.isBarrelFile,
		directImporterCount: node.importedBy.length,
		directImporters: sortStrings(
			node.importedBy.map((importer) => toDisplayPath(importer, basePath)),
		),
		directImporteeCount: node.importees.length,
		originChains: normalizeChains(node.chain, basePath),
		reachableModulesCount: reachablePaths.size,
		reachableInternalModulesCount: reachableNodes.filter(
			(reachableNode) => reachableNode.type !== "external",
		).length,
		reachableNodeModulesCount,
		reachableBarrelFilesCount,
		signals,
	};
}

function buildBarrelFileReport(
	node: VizNode,
	nodeMap: Map<string, VizNode>,
	basePath: string,
): LlmBarrelFileReport {
	const reachablePaths = collectReachablePaths(node, nodeMap);
	const reachableNodes = Array.from(reachablePaths)
		.map((nodePath) => nodeMap.get(nodePath))
		.filter(Boolean) as VizNode[];
	const nodeModulesIntroduced = reachableNodes
		.filter((reachableNode) => reachableNode.type === "external")
		.map((dependency) => ({
			path: toDisplayPath(dependency.path, basePath),
			packageName: getPackageNameFromNodeModulesPath(dependency.path),
			chainsFromBarrel: normalizeChains(
				dependency.chain
					.filter((chain) => chain.includes(node.path))
					.map((chain) => chain.slice(chain.indexOf(node.path))),
				basePath,
			),
		}))
		.sort((left, right) => left.path.localeCompare(right.path));

	return {
		path: toDisplayPath(node.path, basePath),
		directImporterCount: node.importedBy.length,
		directImporters: sortStrings(
			node.importedBy.map((importer) => toDisplayPath(importer, basePath)),
		),
		originChains: normalizeChains(node.chain, basePath),
		impact: {
			directImporteeCount: node.importees.length,
			reachableModulesCount: reachablePaths.size,
			reachableInternalModulesCount: reachableNodes.filter(
				(reachableNode) => reachableNode.type !== "external",
			).length,
			reachableNodeModulesCount: reachableNodes.filter(
				(reachableNode) => reachableNode.type === "external",
			).length,
			reachableBarrelFilesCount: reachableNodes.filter(
				(reachableNode) => reachableNode.isBarrelFile,
			).length,
		},
		nodeModulesIntroduced,
	};
}

function buildExternalDependencyReport(
	node: VizNode,
	nodeMap: Map<string, VizNode>,
	basePath: string,
): LlmExternalDependencyReport {
	const directImporters = sortStrings(
		node.importedBy.map((importer) => toDisplayPath(importer, basePath)),
	);
	const originChains = normalizeChains(node.chain, basePath);
	const introducedThrough = directImporters.map((importer) => ({
		path: importer,
		originChains: originChains.filter((chain) => chain.at(-2) === importer),
	}));
	const barrelSources = sortStrings(
		Array.from(
			new Set(
				node.chain
					.flatMap((chain) =>
						chain.filter((nodePath) => nodeMap.get(nodePath)?.isBarrelFile),
					)
					.filter((nodePath) => nodePath !== node.path)
					.map((nodePath) => toDisplayPath(nodePath, basePath)),
			),
		),
	);

	return {
		path: toDisplayPath(node.path, basePath),
		packageName: getPackageNameFromNodeModulesPath(node.path),
		directImporterCount: directImporters.length,
		directImporters,
		originChains,
		introducedThrough,
		barrelSources,
	};
}

function buildExternalPackages(
	externalDependencies: LlmExternalDependencyReport[],
	_basePath: string,
): LlmExternalPackageReport[] {
	const packageMap = new Map<string, LlmExternalPackageReport>();

	for (const dependency of externalDependencies) {
		const packageName = dependency.packageName ?? dependency.path;
		const current = packageMap.get(packageName);

		if (!current) {
			packageMap.set(packageName, {
				packageName,
				modulePaths: [dependency.path],
				sourceCount: dependency.directImporters.length,
				sources: [...dependency.directImporters],
				originChains: [...dependency.originChains],
				barrelSources: [...dependency.barrelSources],
			});
			continue;
		}

		current.modulePaths = sortStrings([
			...current.modulePaths,
			dependency.path,
		]);
		current.sources = sortStrings([
			...current.sources,
			...dependency.directImporters,
		]);
		current.sourceCount = current.sources.length;
		current.originChains = dedupeChains([
			...current.originChains,
			...dependency.originChains,
		]);
		current.barrelSources = sortStrings([
			...current.barrelSources,
			...dependency.barrelSources,
		]);
	}

	return Array.from(packageMap.values()).sort((left, right) => {
		if (right.sourceCount !== left.sourceCount) {
			return right.sourceCount - left.sourceCount;
		}
		return left.packageName.localeCompare(right.packageName);
	});
}

function collectReachablePaths(
	startNode: VizNode,
	nodeMap: Map<string, VizNode>,
): Set<string> {
	const reachable = new Set<string>();
	const stack = [...startNode.importees];

	while (stack.length > 0) {
		const currentPath = stack.pop();
		if (
			!currentPath ||
			reachable.has(currentPath) ||
			currentPath === startNode.path
		) {
			continue;
		}

		reachable.add(currentPath);
		const currentNode = nodeMap.get(currentPath);
		if (!currentNode) {
			continue;
		}

		for (const importee of currentNode.importees) {
			if (!reachable.has(importee)) {
				stack.push(importee);
			}
		}
	}

	return reachable;
}

function normalizeChains(chains: string[][], basePath: string) {
	return dedupeChains(
		chains.map((chain) =>
			chain.map((nodePath) => toDisplayPath(nodePath, basePath)),
		),
	);
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

function compareHotspots(left: LlmHotspot, right: LlmHotspot) {
	if (left.reachableNodeModulesCount !== right.reachableNodeModulesCount) {
		return left.reachableNodeModulesCount - right.reachableNodeModulesCount;
	}
	if (left.reachableModulesCount !== right.reachableModulesCount) {
		return left.reachableModulesCount - right.reachableModulesCount;
	}
	if (left.directImporterCount !== right.directImporterCount) {
		return left.directImporterCount - right.directImporterCount;
	}
	if (left.isBarrelFile !== right.isBarrelFile) {
		return Number(left.isBarrelFile) - Number(right.isBarrelFile);
	}
	return left.path.localeCompare(right.path);
}

function toDisplayPath(filePath: string, basePath: string) {
	if (!path.isAbsolute(filePath)) {
		return filePath;
	}

	const relativePath = path.relative(basePath, filePath);
	return relativePath && !relativePath.startsWith("..")
		? relativePath
		: filePath;
}

function getPackageNameFromNodeModulesPath(filePath: string) {
	const parts = filePath.split(/[\\/]/g);
	const nodeModulesIndex = parts.lastIndexOf("node_modules");
	if (nodeModulesIndex === -1) {
		return undefined;
	}

	const firstPart = parts[nodeModulesIndex + 1];
	if (!firstPart) {
		return undefined;
	}

	if (firstPart.startsWith("@")) {
		const secondPart = parts[nodeModulesIndex + 2];
		return secondPart ? `${firstPart}/${secondPart}` : firstPart;
	}

	return firstPart;
}

function sortStrings(values: string[]) {
	return Array.from(new Set(values)).sort((left, right) =>
		left.localeCompare(right),
	);
}

function formatList(values: string[]) {
	return values.length > 0 ? values.join(", ") : "none";
}
