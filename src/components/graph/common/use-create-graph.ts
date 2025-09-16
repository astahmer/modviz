import Graph, { DirectedGraph } from "graphology";
import { useCallback, useMemo } from "react";
import { clamp } from "~/components/graph/common/clamp";
import type { ModvizOutput, VizNode } from "../../../../mod/types";
import { colors } from "~/components/graph/common/colors";
import { getRandom } from "~/components/graph/common/random";

export type NodeType = {
	x: number;
	y: number;
	label: string;
	originalLabel: string;
	size: number;
	color: string;
	highlighted?: boolean;
	hidden?: boolean;
	cluster?: string;
	clusterPath?: string;
	modType?: string;
	louvainCommunity?: string;
	packageSubCommunity?: string;
};
export type EdgeType = { label: string; hidden?: boolean; color?: string };

export const useCreateGraph = (props: {
	entryNode?: string;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
}) => {
	const clusterColors = useMemo(() => {
		const colorMap = new Map<string, string>();
		const clusters = new Set<string>();
		props.nodes.forEach((node) => {
			if (node.cluster || node.package?.name) {
				clusters.add((node.cluster || node.package?.name) as string);
			}
		});
		let index = 0;
		clusters.forEach((cluster) => {
			colorMap.set(
				cluster,
				colors.list[++index] ?? colors.deterministic(cluster),
			);
		});
		return colorMap;
	}, []);

	const edges = useMemo(() => {
		const ids = new Set<string>();
		props.nodes.forEach((node) => {
			// node.importees.forEach((importee) => {
			// 	ids.add(`${node.path}->${importee}`);
			// });
			node.importedBy.forEach((importee) => {
				ids.add(`${importee}->${node.path}`);
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

		props.nodes.forEach((node) => {
			nodesMap.set(node.path, node);

			// Position entry node at center, others spread out more
			const isEntry = props.entryNode === node.path;
			const x = isEntry ? 0 : Math.abs(getRandom());
			const y = isEntry ? 0 : Math.abs(getRandom());
			const label =
				node.package && node.isBarrelFile
					? `${node.package?.name}/${node.name}`
					: node.name;

			graph.addNode(node.path, {
				x,
				y,
				label,
				originalLabel: label,
				modType: node.type,
				cluster: node.cluster ?? node.package?.name ?? "default",
				clusterPath: node.package?.path,
				color:
					clusterColors.get(node.cluster ?? node.package?.name ?? "") ??
					colors.default,
				size: clamp(4, 15, node.importedBy.length),
				highlighted: false,
			});
		});

		edges.list.forEach((edge) => {
			if (nodesMap.has(edge.source) && nodesMap.has(edge.target)) {
				const sourceNode = nodesMap.get(edge.source)!;
				graph.addEdge(edge.source, edge.target, {
					label: edge.source,
					color:
						clusterColors.get(
							sourceNode.cluster ?? sourceNode.package?.name ?? "",
						) ?? colors.default,
				});
			}
		});

		// applyHybridClustering(graph, packageColors);

		return graph as Graph<NodeType, EdgeType>;
	}, [edges.list, clusterColors]);
};
