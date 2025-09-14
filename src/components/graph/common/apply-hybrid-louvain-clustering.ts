import type Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { colors } from "~/components/graph/common/colors";
import type {
	NodeType,
	EdgeType,
} from "~/components/graph/common/use-create-graph";

export function applyHybridLouvainClustering(
	graph: Graph<NodeType, EdgeType>,
	packageColors: Map<string, string>,
) {
	const packageGroups = new Map<string, string[]>();
	// Apply hybrid clustering: package-based primary + Louvain secondary
	try {
		// Group nodes by package first
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
						resolution: 1.1, // Higher means more groups
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
				packageColors.get(packageName) || colors.deterministic(packageName);

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
					const subColor = colors.deterministic(
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

	return packageGroups;
}
