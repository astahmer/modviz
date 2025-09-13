import Graph, { DirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
import iwanthue from "iwanthue";
import { useCallback, useMemo } from "react";
import type { ModvizOutput, VizNode } from "../../../mod/types";
import { rng } from "~/components/common/gnrg";

export type NodeType = {
	x: number;
	y: number;
	label: string;
	size: number;
	color: string;
	highlighted?: boolean;
	hidden?: boolean;
	cluster?: string;
	modType?: string;
	louvainCommunity?: string;
	packageSubCommunity?: string;
};
export type EdgeType = { label: string; hidden?: boolean; color?: string };

export const clamp = (min: number, max: number, value: number) => {
	return Math.min(Math.max(min, value), max);
};

const colorList = [
	"#5E6BFF",
	"#FE2FB5",
	"#B752F8",
	"#F85252",
	"#53d3f0",
	"#A5243D",
	"#edcf8e",
	"#C28CAE",
	"#54457F",
	"#610F7F",
	"#9BA2FF",
	"#2A2E45",
	"#FFDC5E",
	"#FF86C8",
	"#FF69EB",
	"#1CFEBA",
	"#034748",
	"#95F2D9",
];

const defaultColor = "#E2E2E2";
const getRandom = rng("modviz");

export const useCreateGraph = (props: {
	entryNode?: string;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
}) => {
	const packageColors = useMemo(() => {
		const colors = new Map<string, string>();
		props.packages.forEach((pkg, index) => {
			// Use predefined colors first, then deterministic colors
			colors.set(pkg.name, colorList[index] ?? deterministicColor(pkg.name));
		});
		return colors;
	}, [props.packages]);

	const edges = useMemo(() => {
		const ids = new Set<string>();
		props.nodes.forEach((node) => {
			node.importees.forEach((importee) => {
				ids.add(`${node.path}->${importee}`);
			});
		});
		return {
			ids,
			list: Array.from(ids).map((edge) => {
				const [source, target] = edge.split("->");
				return { source, target };
			}),
		};
	}, [props.nodes]);

	return useCallback(() => {
		const graph = new DirectedGraph<NodeType, EdgeType>();
		const nodesMap = new Map<string, VizNode>();

		const median = props.nodes
			.map((n) => n.importees.length)
			.sort((a, b) => a - b)[props.nodes.length / 2];
		const floorMedian = Math.floor(median);

		props.nodes.forEach((node) => {
			nodesMap.set(node.path, node);

			// Position entry node at center, others spread out more
			const isEntry = props.entryNode === node.path;
			const x = isEntry ? 0 : Math.abs(getRandom()); // Spread nodes more
			const y = isEntry ? 0 : Math.abs(getRandom()); // Spread nodes more

			graph.addNode(node.path, {
				x,
				y,
				label:
					node.package && node.isBarrelFile
						? `${node.package?.name}/${node.name}`
						: node.name,
				modType: node.type,
				cluster: node.package?.name ?? "default",
				color: packageColors.get(node.package?.name ?? "") ?? defaultColor,
				size: clamp(2, floorMedian * 5, node.importees.length) * 2,
				highlighted: false,
			});
		});

		edges.list.forEach((edge) => {
			if (nodesMap.has(edge.source) && nodesMap.has(edge.target)) {
				const sourceNode = nodesMap.get(edge.source)!;
				graph.addEdge(edge.source, edge.target, {
					label: edge.source,
					color:
						packageColors.get(sourceNode.package?.name ?? "") ?? defaultColor,
				});
			}
		});

		applyHybridClustering(graph, packageColors);

		return graph as Graph<NodeType, EdgeType>;
	}, [edges.list, packageColors]);
};

const randomColor = () => {
	const digits = "0123456789abcdef";
	let code = "#";
	for (let i = 0; i < 6; i++) {
		code += digits.charAt(Math.floor(getRandom() * 16));
	}
	return code;
};

// Deterministic color generation using iwanthue
const deterministicColor = (str: string): string => {
	// Generate a single color using iwanthue with the string as seed
	const colors = iwanthue(1, {
		seed: str,
		colorSpace: "intense",
		clustering: "force-vector",
	});

	return colors[0] || randomColor();
};

function applyHybridClustering(
	graph: Graph<NodeType, EdgeType>,
	packageColors: Map<string, string>,
) {
	// Apply hybrid clustering: package-based primary + Louvain secondary
	try {
		// Group nodes by package first
		const packageGroups = new Map<string, string[]>();
		graph.forEachNode((nodeId, attrs) => {
			const packageName = attrs.cluster || "default";
			if (!packageGroups.has(packageName)) {
				packageGroups.set(packageName, []);
			}
			packageGroups.get(packageName)!.push(nodeId);
		});

		// Apply Louvain clustering within each package for sub-clustering
		packageGroups.forEach((nodeIds, packageName) => {
			if (nodeIds.length > 4) {
				// Only sub-cluster if package has enough nodes
				// Create a subgraph for this package
				const subgraph = graph.copy();
				// Remove nodes not in this package
				subgraph.forEachNode((nodeId) => {
					if (!nodeIds.includes(nodeId)) {
						subgraph.dropNode(nodeId);
					}
				});

				if (subgraph.order > 4) {
					// Need at least 5 nodes for meaningful clustering
					// Apply Louvain to the subgraph
					louvain.assign(subgraph, {
						nodeCommunityAttribute: "packageSubCommunity",
						resolution: 1, // Lower resolution for finer sub-clusters
						randomWalk: false,
					});

					// Transfer sub-community information back to main graph
					subgraph.forEachNode((nodeId, attrs) => {
						if (attrs.packageSubCommunity) {
							graph.setNodeAttribute(
								nodeId,
								"louvainCommunity",
								`${packageName}-${attrs.packageSubCommunity}`,
							);
						}
					});
				}
			} else {
				// For small packages, just use package name as cluster
				nodeIds.forEach((nodeId) => {
					graph.setNodeAttribute(nodeId, "louvainCommunity", packageName);
				});
			}
		});

		// Generate colors for package-based clusters with variations for sub-clusters
		const clusterColors = new Map<string, string>();

		packageGroups.forEach((nodeIds, packageName) => {
			const baseColor =
				packageColors.get(packageName) || deterministicColor(packageName);

			// Get all sub-communities for this package
			const subCommunities = new Set<string>();
			nodeIds.forEach((nodeId) => {
				const louvainCommunity = graph.getNodeAttribute(
					nodeId,
					"louvainCommunity",
				);
				if (louvainCommunity) {
					subCommunities.add(louvainCommunity);
				}
			});

			const subCommunitiesArray = Array.from(subCommunities);

			if (subCommunitiesArray.length > 1) {
				// Generate deterministic color variations for sub-clusters within the package
				subCommunitiesArray.forEach((subCommunity, index) => {
					const subColor = deterministicColor(
						`${packageName}-${subCommunity}-${index}`,
					);
					clusterColors.set(subCommunity, subColor);
				});
			} else {
				// Single cluster for this package
				clusterColors.set(packageName, baseColor);
			}
		});

		// Apply cluster colors to nodes (preserve entry node colors and positioning)
		graph.forEachNode((node, attrs) => {
			const currentAttrs = graph.getNodeAttributes(node);
			const isEntry = currentAttrs.modType === "entry";

			if (!isEntry) {
				const louvainCommunity = attrs.louvainCommunity;
				if (louvainCommunity && clusterColors.has(louvainCommunity)) {
					graph.setNodeAttribute(
						node,
						"color",
						clusterColors.get(louvainCommunity)!,
					);
					graph.setNodeAttribute(node, "cluster", louvainCommunity);
				}
			} else {
				// Entry node gets special treatment
				graph.setNodeAttribute(node, "color", "#FF6B35"); // Distinct entry color
				// graph.setNodeAttribute(
				// 	node,
				// 	"size",
				// 	Math.max(currentAttrs.size * 1.5, 25),
				// );
			}
		});

		console.log(
			`Applied hybrid clustering: ${packageGroups.size} packages with sub-clustering`,
		);
	} catch (error) {
		console.warn(
			"Hybrid clustering failed, falling back to package-based clustering:",
			error,
		);
	}
}
