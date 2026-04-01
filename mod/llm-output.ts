import path from "node:path";
import type {
	LlmBarrelFileReport,
	LlmExternalDependencyReport,
	LlmExternalPackageReport,
	LlmHotspot,
	ModvizLlmOutput,
	ModvizOutput,
	VizMetadata,
	VizNode,
} from "./types.ts";

export function buildModvizLlmOutput(output: ModvizOutput): ModvizLlmOutput {
	const metadata = output.metadata;
	const nodeMap = new Map(output.nodes.map((node) => [node.path, node]));

	const externalDependencies = output.nodes
		.filter((node) => node.type === "external")
		.map((node) => buildExternalDependencyReport(node, nodeMap, metadata));

	const barrelFiles = output.nodes
		.filter((node) => node.isBarrelFile && node.type !== "external")
		.map((node) => buildBarrelFileReport(node, nodeMap, metadata));

	const hotspots = output.nodes
		.map((node) => buildHotspot(node, nodeMap, metadata))
		.filter(
			(node) =>
				node.reachableModulesCount > 0 &&
				(node.reachableModulesCount > 1 ||
					node.reachableNodeModulesCount > 0 ||
					node.directImporterCount > 1 ||
					node.isBarrelFile),
		)
		.sort((left, right) => compareHotspots(right, left));

	const externalPackages = buildExternalPackages(
		externalDependencies,
		metadata,
	);

	return {
		format: "modviz-llm-v1",
		metadata: {
			...metadata,
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
				displayPath: hotspot.displayPath,
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
	const internalFanoutCulprits = report.hotspots.filter(
		(hotspot) =>
			hotspot.type !== "external" &&
			hotspot.type !== "entry" &&
			(hotspot.reachableNodeModulesCount > 0 ||
				hotspot.reachableModulesCount >= 25),
	);
	const multiSourcePackages = report.externalPackages.filter(
		(pkg) => pkg.sourceGroupCount > 1,
	);

	const lines = [
		"# modviz LLM report",
		"",
		"## Summary",
		`- Total nodes: ${report.summary.totalNodes}`,
		`- Internal nodes: ${report.summary.internalNodes}`,
		`- Explicit barrel files: ${report.summary.barrelFiles}`,
		`- External dependency modules: ${report.summary.externalDependencies}`,
		`- External packages: ${report.summary.externalPackages}`,
		`- Nodes with multiple origin chains: ${report.summary.nodesWithMultipleOrigins}`,
		"",
		"## Import triggers to audit",
	];

	if (report.hotspots.length === 0) {
		lines.push("- None");
	} else {
		for (const hotspot of report.hotspots.slice(0, 10)) {
			const kindLabel = hotspot.isBarrelFile
				? `explicit barrel, ${hotspot.type}`
				: hotspot.type;
			lines.push(
				`- ${hotspot.displayPath} (${kindLabel}) reaches ${hotspot.reachableModulesCount} modules, including ${hotspot.reachableNodeModulesCount} node_modules modules; direct importers: ${formatPreviewList(
					hotspot.directImporters.map((importer) =>
						formatPathForLlm(importer, report.metadata),
					),
					5,
				)}`,
			);
			if (hotspot.topExternalPackages.length > 0) {
				lines.push(
					`  Pulls in: ${formatPreviewList(hotspot.topExternalPackages, 5)}`,
				);
			}
			if (hotspot.signals.length > 0) {
				lines.push(`  Signals: ${formatPreviewList(hotspot.signals, 4)}`);
			}
			if (hotspot.originChains.length > 0) {
				lines.push(
					`  Origin chains: ${hotspot.originChains
						.slice(0, 2)
						.map((chain) => formatChainForLlm(chain, report.metadata))
						.join(
							" | ",
						)}${hotspot.originChains.length > 2 ? ` | +${hotspot.originChains.length - 2} more` : ""}`,
				);
			}
		}
	}

	lines.push("", "## Internal fan-out culprits");
	if (internalFanoutCulprits.length === 0) {
		lines.push("- None");
	} else {
		for (const hotspot of internalFanoutCulprits.slice(0, 10)) {
			lines.push(
				`- ${hotspot.displayPath}${hotspot.isBarrelFile ? " [explicit barrel]" : ""} reaches ${hotspot.reachableModulesCount} modules, including ${hotspot.reachableNodeModulesCount} node_modules modules; direct importers: ${formatPreviewList(
					hotspot.directImporters.map((importer) =>
						formatPathForLlm(importer, report.metadata),
					),
					5,
				)}`,
			);
			if (hotspot.topExternalPackages.length > 0) {
				lines.push(
					`  Pulls in: ${formatPreviewList(hotspot.topExternalPackages, 5)}`,
				);
			}
			lines.push(`  Signals: ${formatPreviewList(hotspot.signals, 4)}`);
		}
	}

	lines.push("", "## node_modules with multiple sources");
	if (multiSourcePackages.length === 0) {
		lines.push("- None");
	} else {
		for (const pkg of multiSourcePackages.slice(0, 10)) {
			const sourceSummary =
				pkg.sourceGroupCount === pkg.sourceCount
					? `${pkg.sourceCount} sources`
					: `${pkg.sourceCount} source files across ${pkg.sourceGroupCount} source groups`;
			lines.push(
				`- ${pkg.packageName} is introduced by ${sourceSummary}: ${formatPreviewList(
					pkg.sourceGroups.map((group) => group.label),
					8,
				)}`,
			);
			if (pkg.barrelSources.length > 0) {
				const fanoutSources = buildSourceGroups(
					pkg.barrelSources,
					report.metadata,
				).map((sourceGroup) => sourceGroup.label);
				lines.push(`  Fan-out sources: ${formatPreviewList(fanoutSources, 5)}`);
			}
			if (pkg.modulePaths.length > 0) {
				lines.push(
					`  Representative modules: ${formatPreviewList(
						pkg.modulePaths
							.slice(0, 3)
							.map((modulePath) =>
								formatPathForLlm(modulePath, report.metadata),
							),
						3,
					)}`,
				);
			}
			if (pkg.originChains.length > 0) {
				lines.push(
					`  Origin chains: ${pkg.originChains
						.slice(0, 2)
						.map((chain) => formatChainForLlm(chain, report.metadata))
						.join(
							" | ",
						)}${pkg.originChains.length > 2 ? ` | +${pkg.originChains.length - 2} more` : ""}`,
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
	metadata: VizMetadata,
): LlmHotspot {
	const basePath = metadata.basePath;
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
		displayPath: formatPathForLlm(node.path, metadata),
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
		topExternalPackages: collectExternalPackageNames(reachableNodes),
		signals,
	};
}

function buildBarrelFileReport(
	node: VizNode,
	nodeMap: Map<string, VizNode>,
	metadata: VizMetadata,
): LlmBarrelFileReport {
	const basePath = metadata.basePath;
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
		displayPath: formatPathForLlm(node.path, metadata),
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
	metadata: VizMetadata,
): LlmExternalDependencyReport {
	const basePath = metadata.basePath;
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
		displayPath: formatPathForLlm(node.path, metadata),
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
	metadata: VizMetadata,
): LlmExternalPackageReport[] {
	const packageMap = new Map<string, LlmExternalPackageReport>();

	for (const dependency of externalDependencies) {
		const packageName = dependency.packageName ?? dependency.path;
		const current = packageMap.get(packageName);

		if (!current) {
			const sourceGroups = buildSourceGroups(
				dependency.directImporters,
				metadata,
			);
			packageMap.set(packageName, {
				packageName,
				modulePaths: [dependency.path],
				sourceCount: dependency.directImporters.length,
				sourceGroupCount: sourceGroups.length,
				sources: [...dependency.directImporters],
				originChains: [...dependency.originChains],
				barrelSources: [...dependency.barrelSources],
				sourceGroups,
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
		current.sourceGroups = buildSourceGroups(current.sources, metadata);
		current.sourceGroupCount = current.sourceGroups.length;
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

		const currentNode = nodeMap.get(currentPath);
		if (!currentNode) {
			continue;
		}

		reachable.add(currentPath);

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

function collectExternalPackageNames(nodes: VizNode[]) {
	const counts = new Map<string, number>();

	for (const node of nodes) {
		if (node.type !== "external") {
			continue;
		}

		const packageName = getPackageNameFromNodeModulesPath(node.path);
		if (!packageName) {
			continue;
		}

		counts.set(packageName, (counts.get(packageName) ?? 0) + 1);
	}

	return Array.from(counts.entries())
		.sort((left, right) => {
			if (right[1] !== left[1]) {
				return right[1] - left[1];
			}
			return left[0].localeCompare(right[0]);
		})
		.map(([packageName]) => packageName);
}

function buildSourceGroups(sources: string[], metadata: VizMetadata) {
	const groups = new Map<
		string,
		LlmExternalPackageReport["sourceGroups"][number]
	>();

	for (const source of sortStrings(sources)) {
		const workspacePackage = getWorkspacePackageForDisplayPath(
			source,
			metadata,
		);
		const externalPackage = getPackageNameFromNodeModulesPath(source);
		const label = workspacePackage?.name ?? externalPackage ?? source;
		const kind = workspacePackage
			? "workspace-package"
			: externalPackage
				? "external-package"
				: "file";
		const current = groups.get(label);

		if (!current) {
			groups.set(label, {
				kind,
				label,
				paths: [source],
			});
			continue;
		}

		current.paths = sortStrings([...current.paths, source]);
	}

	return Array.from(groups.values()).sort(compareSourceGroups);
}

function formatChainForLlm(chain: string[], metadata: VizMetadata) {
	return chain
		.map((nodePath) => formatPathForLlm(nodePath, metadata))
		.join(" -> ");
}

function formatPathForLlm(filePath: string, metadata: VizMetadata) {
	const displayPath = toDisplayPath(filePath, metadata.basePath);
	const workspacePackage = getWorkspacePackageForDisplayPath(
		displayPath,
		metadata,
	);
	if (workspacePackage) {
		return `${workspacePackage.name} (${displayPath})`;
	}

	const externalPackageName = getPackageNameFromNodeModulesPath(displayPath);
	if (externalPackageName && externalPackageName !== displayPath) {
		return `${externalPackageName} (${displayPath})`;
	}

	return displayPath;
}

function getWorkspacePackageForDisplayPath(
	displayPath: string,
	metadata: VizMetadata,
) {
	const normalizedDisplayPath = normalizePath(displayPath);
	const packages = metadata.packages
		.map((pkg) => ({
			...pkg,
			normalizedPath: normalizePath(pkg.path),
		}))
		.filter(
			(pkg) =>
				normalizedDisplayPath === pkg.normalizedPath ||
				normalizedDisplayPath.startsWith(`${pkg.normalizedPath}/`),
		)
		.sort(
			(left, right) => right.normalizedPath.length - left.normalizedPath.length,
		);

	return packages[0];
}

function normalizePath(filePath: string) {
	return filePath.replace(/\\/g, "/").replace(/\/$/, "");
}

function sortStrings(values: string[]) {
	return Array.from(new Set(values)).sort((left, right) =>
		left.localeCompare(right),
	);
}

function formatPreviewList(values: string[], limit: number) {
	const uniqueValues = Array.from(new Set(values));
	if (uniqueValues.length === 0) {
		return "none";
	}

	const preview = uniqueValues.slice(0, limit).join(", ");
	return uniqueValues.length > limit
		? `${preview}, +${uniqueValues.length - limit} more`
		: preview;
}

function compareSourceGroups(
	left: LlmExternalPackageReport["sourceGroups"][number],
	right: LlmExternalPackageReport["sourceGroups"][number],
) {
	const leftRank = getSourceGroupRank(left.kind);
	const rightRank = getSourceGroupRank(right.kind);
	if (leftRank !== rightRank) {
		return leftRank - rightRank;
	}

	if (right.paths.length !== left.paths.length) {
		return right.paths.length - left.paths.length;
	}

	return left.label.localeCompare(right.label);
}

function getSourceGroupRank(
	kind: LlmExternalPackageReport["sourceGroups"][number]["kind"],
) {
	switch (kind) {
		case "workspace-package":
			return 0;
		case "file":
			return 1;
		case "external-package":
			return 2;
		default:
			return 3;
	}
}
