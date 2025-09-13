import Graph, { DirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
import iwanthue from "iwanthue";
import { useCallback, useMemo } from "react";
import type { ModvizOutput, VizNode } from "../../../mod/types";

export type NodeType = {
	x: number;
	y: number;
	label: string;
	size: number;
	color: string;
	highlighted?: boolean;
	hidden?: boolean;
	cluster?: string;
	type?: string;
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
	"#b9cfd4",
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

export const useCreateGraph = (props: {
	entryNode?: string;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
	edges: ModvizOutput["edges"];
}) => {
	const packageColors = useMemo(() => {
		const colors = new Map<string, string>();
		props.packages.forEach((pkg, index) => {
			colors.set(pkg.name, colorList[index] ?? randomColor());
		});
		return colors;
	}, [props.packages]);

	return useCallback(() => {
		const graph = new DirectedGraph<NodeType, EdgeType>();
		const nodesMap = new Map<string, VizNode>();
		const edges = new Set<string>();

		const median = props.nodes
			.map((n) => n.importees.length)
			.sort((a, b) => a - b)[props.nodes.length / 2];
		const floorMedian = Math.floor(median);

		props.nodes.forEach((node) => {
			nodesMap.set(node.path, node);
			graph.addNode(node.path, {
				// Set random initial position cause some algorithms (e.g. forceAtlas2) don't work well without it
				x: props.entryNode === node.path ? 0.5 : Math.random(),
				y: props.entryNode === node.path ? 0.5 : Math.random(),
				label: node.name,
				cluster: node.package?.name ?? "default",
				color: defaultColor,
				// color:
				// 	node.type === "entry"
				// 		? "#637AB9"
				// 		: (packageColors.get(node.package?.name ?? "") ?? defaultColor),
				size: clamp(floorMedian, floorMedian * 5, node.importees.length * 2),
				highlighted: false,
				// hidden: true,
			});
		});

		props.edges.forEach((edge) => {
			const edgeId = `${edge.source}->${edge.target}`;
			if (
				nodesMap.has(edge.source) &&
				nodesMap.has(edge.target) &&
				!edges.has(edgeId)
			) {
				edges.add(edgeId);

				const sourceNode = nodesMap.get(edge.source)!;
				graph.addEdge(edge.source, edge.target, {
					label: edge.source,
					color: packageColors.get(sourceNode.package?.name ?? "") ?? "#E2E2E2",
				});
			}
		});

		applyHybridClustering(graph, packageColors);

		return graph as Graph<NodeType, EdgeType>;
	}, [packageColors]);
};

const randomColor = () => {
	const digits = "0123456789abcdef";
	let code = "#";
	for (let i = 0; i < 6; i++) {
		code += digits.charAt(Math.floor(Math.random() * 16));
	}
	return code;
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
			if (nodeIds.length > 3) {
				// Only sub-cluster if package has enough nodes
				// Create a subgraph for this package
				const subgraph = graph.copy();
				// Remove nodes not in this package
				subgraph.forEachNode((nodeId) => {
					if (!nodeIds.includes(nodeId)) {
						subgraph.dropNode(nodeId);
					}
				});

				if (subgraph.order > 2) {
					// Need at least 3 nodes for meaningful clustering
					// Apply Louvain to the subgraph
					louvain.assign(subgraph, {
						nodeCommunityAttribute: "packageSubCommunity",
						resolution: 0.8, // Lower resolution for finer sub-clusters
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
			const baseColor = packageColors.get(packageName) || randomColor();

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
				// Generate color variations for sub-clusters within the package
				const subColors = iwanthue(subCommunitiesArray.length, {
					seed: `${packageName}-subclusters`,
					colorSpace: "intense",
					clustering: "force-vector",
				});

				subCommunitiesArray.forEach((subCommunity, index) => {
					clusterColors.set(subCommunity, subColors[index] || baseColor);
				});
			} else {
				// Single cluster for this package
				clusterColors.set(packageName, baseColor);
			}
		});

		// Apply cluster colors to nodes (preserve entry node colors)
		graph.forEachNode((node, attrs) => {
			const currentAttrs = graph.getNodeAttributes(node);
			if (currentAttrs.type !== "entry") {
				const louvainCommunity = attrs.louvainCommunity;
				if (louvainCommunity && clusterColors.has(louvainCommunity)) {
					graph.setNodeAttribute(
						node,
						"color",
						clusterColors.get(louvainCommunity)!,
					);
					graph.setNodeAttribute(node, "cluster", louvainCommunity);
				}
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
