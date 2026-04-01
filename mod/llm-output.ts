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

export interface ModvizFocusOptions {
	packageName?: string;
	nodeQuery?: string;
	limit?: number;
}

export interface ModvizFocusResolution {
	matchedPackageNames: string[];
	matchedNodePaths: string[];
	includedPaths: string[];
}

interface ModvizMarkdownOptions {
	commandHints?: {
		packageCommand: string;
		nodeCommand: string;
	};
	focus?: ModvizFocusOptions;
	focusedDrilldown?: string;
}

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

	const externalPackages = buildExternalPackages(externalDependencies, metadata);

	return {
		format: "modviz-llm-v1",
		metadata: {
			...metadata,
			pathFormat: "relative-to-basePath",
		},
		summary: {
			totalNodes: output.nodes.length,
			internalNodes: output.nodes.filter((node) => node.type !== "external").length,
			barrelFiles: barrelFiles.length,
			externalDependencies: externalDependencies.length,
			externalPackages: externalPackages.length,
			nodesWithMultipleOrigins: output.nodes.filter((node) => node.chain.length > 1).length,
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

export function renderModvizLlmMarkdown(
	report: ModvizLlmOutput,
	options: ModvizMarkdownOptions = {},
): string {
	const auditHotspots = report.hotspots.filter(
		(hotspot) => hotspot.type !== "entry" && hotspot.type !== "external",
	);
	const internalFanoutCulprits = report.hotspots.filter(
		(hotspot) =>
			hotspot.type !== "external" &&
			hotspot.type !== "entry" &&
			(hotspot.directImporterCount > 1 || hotspot.isBarrelFile) &&
			(hotspot.reachableNodeModulesCount > 0 || hotspot.reachableModulesCount >= 25),
	);
	const multiSourcePackages = report.externalPackages.filter((pkg) => pkg.sourceGroupCount > 1);

	const lines = [
		"# modviz LLM report",
		"",
		...(options.focus?.packageName || options.focus?.nodeQuery
			? [
					"## Active focus",
					...(options.focus.packageName ? [`- Package query: ${options.focus.packageName}`] : []),
					...(options.focus.nodeQuery ? [`- Node query: ${options.focus.nodeQuery}`] : []),
					"",
				]
			: []),
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
		for (const hotspot of auditHotspots.slice(0, 10)) {
			const kindLabel = hotspot.isBarrelFile ? `explicit barrel, ${hotspot.type}` : hotspot.type;
			lines.push(
				`- ${hotspot.displayPath} (${kindLabel}) reaches ${hotspot.reachableModulesCount} modules, including ${hotspot.reachableNodeModulesCount} node_modules modules; direct importers: ${formatPreviewList(
					hotspot.directImporters.map((importer) => formatPathForLlm(importer, report.metadata)),
					5,
				)}`,
			);
			if (hotspot.topExternalPackages.length > 0) {
				lines.push(`  Pulls in: ${formatPreviewList(hotspot.topExternalPackages, 5)}`);
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
					hotspot.directImporters.map((importer) => formatPathForLlm(importer, report.metadata)),
					5,
				)}`,
			);
			if (hotspot.topExternalPackages.length > 0) {
				lines.push(`  Pulls in: ${formatPreviewList(hotspot.topExternalPackages, 5)}`);
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
			lines.push(`- ${pkg.packageName} is introduced by ${sourceSummary}`);
			if (pkg.sourceGroups.length > 0) {
				lines.push(`  Top source groups: ${formatSourceGroupPreview(pkg.sourceGroups, 6)}`);
			}
			if (pkg.barrelSources.length > 0) {
				const fanoutSources = buildSourceGroups(pkg.barrelSources, report.metadata).map(
					(sourceGroup) => sourceGroup.label,
				);
				lines.push(`  Fan-out sources: ${formatPreviewList(fanoutSources, 5)}`);
			}
			if (pkg.modulePaths.length > 0) {
				lines.push(
					`  Representative modules: ${formatPreviewList(
						pkg.modulePaths
							.slice(0, 3)
							.map((modulePath) =>
								formatModulePathWithinPackage(modulePath, pkg.packageName, report.metadata),
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

	if (options.commandHints) {
		lines.push(
			"",
			"## Follow-up commands",
			`- Inspect one package: ${options.commandHints.packageCommand}`,
			`- Inspect one node: ${options.commandHints.nodeCommand}`,
		);
	}

	if (options.focusedDrilldown) {
		lines.push(
			"",
			"## Focused drilldown",
			...trimTrailingBlankLines(
				options.focusedDrilldown
					.split("\n")
					.filter((line, index) => !(index === 0 && line.trim() === "# modviz LLM drilldown")),
			),
		);
	}

	return `${lines.join("\n")}\n`;
}

export function renderModvizLlmDrilldown(report: ModvizLlmOutput, options: ModvizFocusOptions) {
	const limit = Math.max(options.limit ?? 20, 1);
	const lines = ["# modviz LLM drilldown", ""];
	let renderedSectionCount = 0;

	if (options.packageName) {
		const packageMatches = findExternalPackageMatches(report.externalPackages, options.packageName);

		if (packageMatches.length === 0) {
			lines.push(`## Package: ${options.packageName}`, "- No matching package");
		} else if (packageMatches.length > 1) {
			lines.push(
				`## Package: ${options.packageName}`,
				`- Multiple matches: ${formatPreviewList(
					packageMatches.map((pkg) => pkg.packageName),
					limit,
				)}`,
			);
		} else {
			renderPackageDrilldown(lines, packageMatches[0], report.metadata, limit);
			renderedSectionCount += 1;
		}
		lines.push("");
	}

	if (options.nodeQuery) {
		const nodeMatches = findNodeMatches(report, options.nodeQuery);

		if (nodeMatches.length === 0) {
			lines.push(`## Node: ${options.nodeQuery}`, "- No matching node");
		} else if (nodeMatches.length > 1) {
			lines.push(
				`## Node: ${options.nodeQuery}`,
				`- Multiple matches: ${formatPreviewList(
					nodeMatches.map((node) => node.displayPath),
					limit,
				)}`,
			);
		} else {
			renderNodeDrilldown(lines, nodeMatches[0], report.metadata, limit);
			renderedSectionCount += 1;
		}
		lines.push("");
	}

	if (renderedSectionCount === 0 && !options.packageName && !options.nodeQuery) {
		lines.push("- No drilldown query provided", "");
	}

	return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

export function resolveModvizFocus(
	report: ModvizLlmOutput,
	options: ModvizFocusOptions,
): ModvizFocusResolution {
	const includedPaths = new Set<string>();
	const matchedPackageNames = options.packageName
		? findExternalPackageMatches(report.externalPackages, options.packageName).map(
				(pkg) => pkg.packageName,
			)
		: [];
	const matchedNodePaths = options.nodeQuery
		? findNodeMatches(report, options.nodeQuery).map((node) => node.path)
		: [];

	for (const packageName of matchedPackageNames) {
		const pkg = report.externalPackages.find(
			(externalPackage) => externalPackage.packageName === packageName,
		);
		if (!pkg) {
			continue;
		}

		for (const modulePath of pkg.modulePaths) {
			includedPaths.add(modulePath);
		}
		for (const source of pkg.sources) {
			includedPaths.add(source);
		}
		for (const source of pkg.barrelSources) {
			includedPaths.add(source);
		}
		for (const chain of pkg.originChains) {
			for (const nodePath of chain) {
				includedPaths.add(nodePath);
			}
		}
	}

	for (const nodePath of matchedNodePaths) {
		includedPaths.add(nodePath);
		const node = findNodeMatches(report, nodePath)[0];
		if (!node) {
			continue;
		}

		const directImporters =
			node.hotspot?.directImporters ?? node.externalDependency?.directImporters ?? [];
		for (const importer of directImporters) {
			includedPaths.add(importer);
		}

		const originChains =
			node.hotspot?.originChains ??
			node.barrel?.originChains ??
			node.externalDependency?.originChains ??
			[];
		for (const chain of originChains) {
			for (const chainNode of chain) {
				includedPaths.add(chainNode);
			}
		}
	}

	return {
		matchedPackageNames,
		matchedNodePaths,
		includedPaths: Array.from(includedPaths),
	};
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
		signals.push(`pulls ${reachableNodeModulesCount} node_modules modules transitively`);
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
					.flatMap((chain) => chain.filter((nodePath) => nodeMap.get(nodePath)?.isBarrelFile))
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
			const sourceGroups = buildSourceGroups(dependency.directImporters, metadata);
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

		current.modulePaths = sortStrings([...current.modulePaths, dependency.path]);
		current.sources = sortStrings([...current.sources, ...dependency.directImporters]);
		current.sourceCount = current.sources.length;
		current.sourceGroups = buildSourceGroups(current.sources, metadata);
		current.sourceGroupCount = current.sourceGroups.length;
		current.originChains = dedupeChains([...current.originChains, ...dependency.originChains]);
		current.barrelSources = sortStrings([...current.barrelSources, ...dependency.barrelSources]);
	}

	return Array.from(packageMap.values()).sort((left, right) => {
		if (right.sourceCount !== left.sourceCount) {
			return right.sourceCount - left.sourceCount;
		}
		return left.packageName.localeCompare(right.packageName);
	});
}

function collectReachablePaths(startNode: VizNode, nodeMap: Map<string, VizNode>): Set<string> {
	const reachable = new Set<string>();
	const stack = [...startNode.importees];

	while (stack.length > 0) {
		const currentPath = stack.pop();
		if (!currentPath || reachable.has(currentPath) || currentPath === startNode.path) {
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
		chains.map((chain) => chain.map((nodePath) => toDisplayPath(nodePath, basePath))),
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
	return relativePath && !relativePath.startsWith("..") ? relativePath : filePath;
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
	const groups = new Map<string, LlmExternalPackageReport["sourceGroups"][number]>();

	for (const source of sortStrings(sources)) {
		const workspacePackage = getWorkspacePackageForDisplayPath(source, metadata);
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
	return chain.map((nodePath) => formatPathForLlm(nodePath, metadata)).join(" -> ");
}

function formatPathForLlm(filePath: string, metadata: VizMetadata) {
	const displayPath = toDisplayPath(filePath, metadata.basePath);
	const workspacePackage = getWorkspacePackageForDisplayPath(displayPath, metadata);
	if (workspacePackage) {
		return `${workspacePackage.name} (${displayPath})`;
	}

	const externalPackageName = getPackageNameFromNodeModulesPath(displayPath);
	if (externalPackageName && externalPackageName !== displayPath) {
		return `${externalPackageName} (${displayPath})`;
	}

	return displayPath;
}

function getWorkspacePackageForDisplayPath(displayPath: string, metadata: VizMetadata) {
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
		.sort((left, right) => right.normalizedPath.length - left.normalizedPath.length);

	return packages[0];
}

function normalizePath(filePath: string) {
	return filePath.replace(/\\/g, "/").replace(/\/$/, "");
}

function sortStrings(values: string[]) {
	return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function formatPreviewList(values: string[], limit: number) {
	const uniqueValues = Array.from(new Set(values));
	if (uniqueValues.length === 0) {
		return "none";
	}

	const preview = uniqueValues.slice(0, limit).join(", ");
	return uniqueValues.length > limit ? `${preview}, +${uniqueValues.length - limit} more` : preview;
}

function formatSourceGroupPreview(
	sourceGroups: LlmExternalPackageReport["sourceGroups"],
	limit: number,
) {
	return formatPreviewList(
		sourceGroups.map((group) =>
			group.paths.length > 1 ? `${group.label} (${group.paths.length} files)` : group.label,
		),
		limit,
	);
}

function formatModulePathWithinPackage(
	modulePath: string,
	packageName: string,
	metadata: VizMetadata,
) {
	const displayPath = toDisplayPath(modulePath, metadata.basePath);
	const parts = normalizePath(displayPath).split("/");
	const nodeModulesIndex = parts.lastIndexOf("node_modules");
	if (nodeModulesIndex === -1) {
		return displayPath;
	}

	const packageParts = packageName.startsWith("@") ? packageName.split("/") : [packageName];
	const startIndex = nodeModulesIndex + 1 + packageParts.length;
	const withinPackage = parts.slice(startIndex).join("/");

	return withinPackage || packageName;
}

function findExternalPackageMatches(packages: LlmExternalPackageReport[], query: string) {
	const normalizedQuery = normalizeSearchQuery(query);
	const exactMatches = packages.filter(
		(pkg) => normalizeSearchQuery(pkg.packageName) === normalizedQuery,
	);
	if (exactMatches.length > 0) {
		return exactMatches;
	}

	return packages.filter((pkg) => normalizeSearchQuery(pkg.packageName).includes(normalizedQuery));
}

function findNodeMatches(report: ModvizLlmOutput, query: string) {
	const nodesByPath = new Map<
		string,
		{
			path: string;
			displayPath: string;
			hotspot?: LlmHotspot;
			barrel?: LlmBarrelFileReport;
			externalDependency?: LlmExternalDependencyReport;
		}
	>();

	for (const hotspot of report.hotspots) {
		nodesByPath.set(hotspot.path, {
			path: hotspot.path,
			displayPath: hotspot.displayPath,
			hotspot,
			barrel: report.barrelFiles.find((barrel) => barrel.path === hotspot.path),
			externalDependency: report.externalDependencies.find(
				(dependency) => dependency.path === hotspot.path,
			),
		});
	}

	for (const barrel of report.barrelFiles) {
		const existing = nodesByPath.get(barrel.path);
		if (existing) {
			existing.barrel = barrel;
			continue;
		}

		nodesByPath.set(barrel.path, {
			path: barrel.path,
			displayPath: barrel.displayPath,
			barrel,
		});
	}

	for (const dependency of report.externalDependencies) {
		const existing = nodesByPath.get(dependency.path);
		if (existing) {
			existing.externalDependency = dependency;
			continue;
		}

		nodesByPath.set(dependency.path, {
			path: dependency.path,
			displayPath: dependency.displayPath,
			externalDependency: dependency,
		});
	}

	const normalizedQuery = normalizeSearchQuery(query);
	const nodes = Array.from(nodesByPath.values());
	const exactMatches = nodes.filter((node) =>
		buildNodeSearchTerms(node).some((term) => normalizeSearchQuery(term) === normalizedQuery),
	);
	if (exactMatches.length > 0) {
		return exactMatches;
	}

	return nodes.filter((node) =>
		buildNodeSearchTerms(node).some((term) => normalizeSearchQuery(term).includes(normalizedQuery)),
	);
}

function buildNodeSearchTerms(node: {
	path: string;
	displayPath: string;
	externalDependency?: LlmExternalDependencyReport;
}) {
	return [node.path, node.displayPath, node.externalDependency?.packageName]
		.filter(Boolean)
		.map((term) => term as string);
}

function renderPackageDrilldown(
	lines: string[],
	pkg: LlmExternalPackageReport,
	metadata: VizMetadata,
	limit: number,
) {
	lines.push(`## Package: ${pkg.packageName}`);
	lines.push(`- Source files: ${pkg.sourceCount}`);
	lines.push(`- Source groups: ${pkg.sourceGroupCount}`);
	lines.push(`- Matched external modules: ${pkg.modulePaths.length}`);
	if (pkg.barrelSources.length > 0) {
		lines.push(
			`- Fan-out sources: ${formatPreviewList(
				buildSourceGroups(pkg.barrelSources, metadata).map((group) => group.label),
				limit,
			)}`,
		);
	}
	lines.push("", "### Source groups");
	for (const group of pkg.sourceGroups.slice(0, limit)) {
		lines.push(
			`- ${group.label} (${group.paths.length} file${group.paths.length === 1 ? "" : "s"}): ${formatPreviewList(group.paths, limit)}`,
		);
	}
	if (pkg.sourceGroups.length > limit) {
		lines.push(`- +${pkg.sourceGroups.length - limit} more source groups`);
	}
	lines.push("", "### Representative modules");
	for (const modulePath of pkg.modulePaths.slice(0, limit)) {
		lines.push(`- ${formatModulePathWithinPackage(modulePath, pkg.packageName, metadata)}`);
	}
	if (pkg.modulePaths.length > limit) {
		lines.push(`- +${pkg.modulePaths.length - limit} more modules`);
	}
	lines.push("", "### Origin chains");
	for (const chain of pkg.originChains.slice(0, limit)) {
		lines.push(`- ${formatChainForLlm(chain, metadata)}`);
	}
	if (pkg.originChains.length > limit) {
		lines.push(`- +${pkg.originChains.length - limit} more origin chains`);
	}
}

function renderNodeDrilldown(
	lines: string[],
	node: {
		path: string;
		displayPath: string;
		hotspot?: LlmHotspot;
		barrel?: LlmBarrelFileReport;
		externalDependency?: LlmExternalDependencyReport;
	},
	metadata: VizMetadata,
	limit: number,
) {
	lines.push(`## Node: ${node.displayPath}`);
	if (node.hotspot) {
		lines.push(`- Type: ${node.hotspot.type}`);
		lines.push(`- Reachable modules: ${node.hotspot.reachableModulesCount}`);
		lines.push(`- Reachable node_modules modules: ${node.hotspot.reachableNodeModulesCount}`);
		lines.push(`- Direct importers: ${node.hotspot.directImporterCount}`);
		lines.push(`- Direct importees: ${node.hotspot.directImporteeCount}`);
		if (node.hotspot.topExternalPackages.length > 0) {
			lines.push(
				`- Top external packages: ${formatPreviewList(node.hotspot.topExternalPackages, limit)}`,
			);
		}
		if (node.hotspot.signals.length > 0) {
			lines.push(`- Signals: ${formatPreviewList(node.hotspot.signals, limit)}`);
		}
	}
	if (node.barrel) {
		lines.push(`- Explicit barrel file: yes`);
		lines.push(`- node_modules introduced: ${node.barrel.nodeModulesIntroduced.length}`);
	}
	if (node.externalDependency) {
		lines.push(
			`- External package: ${node.externalDependency.packageName ?? node.externalDependency.path}`,
		);
		if (node.externalDependency.barrelSources.length > 0) {
			lines.push(
				`- Fan-out sources: ${formatPreviewList(node.externalDependency.barrelSources, limit)}`,
			);
		}
	}
	if (node.hotspot?.directImporters.length || node.externalDependency?.directImporters.length) {
		const importers =
			node.hotspot?.directImporters ?? node.externalDependency?.directImporters ?? [];
		lines.push("", "### Direct importers");
		for (const importer of importers.slice(0, limit)) {
			lines.push(`- ${importer}`);
		}
		if (importers.length > limit) {
			lines.push(`- +${importers.length - limit} more importers`);
		}
	}
	if (node.externalDependency?.introducedThrough.length) {
		lines.push("", "### Introduced through");
		for (const source of node.externalDependency.introducedThrough.slice(0, limit)) {
			lines.push(
				`- ${source.path}: ${source.originChains.length} chain${source.originChains.length === 1 ? "" : "s"}`,
			);
		}
		if (node.externalDependency.introducedThrough.length > limit) {
			lines.push(`- +${node.externalDependency.introducedThrough.length - limit} more introducers`);
		}
	}
	const originChains =
		node.hotspot?.originChains ??
		node.barrel?.originChains ??
		node.externalDependency?.originChains ??
		[];
	if (originChains.length > 0) {
		lines.push("", "### Origin chains");
		for (const chain of originChains.slice(0, limit)) {
			lines.push(`- ${formatChainForLlm(chain, metadata)}`);
		}
		if (originChains.length > limit) {
			lines.push(`- +${originChains.length - limit} more origin chains`);
		}
	}
}

function normalizeSearchQuery(value: string) {
	return normalizePath(value).toLowerCase();
}

function trimTrailingBlankLines(lines: string[]) {
	const nextLines = [...lines];
	while (nextLines.length > 0 && nextLines.at(-1) === "") {
		nextLines.pop();
	}
	return nextLines;
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

function getSourceGroupRank(kind: LlmExternalPackageReport["sourceGroups"][number]["kind"]) {
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
