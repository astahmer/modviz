import Graph, { DirectedGraph } from "graphology";
import { useCallback, useMemo } from "react";
import { clamp } from "~/components/graph/common/clamp";
import type { ModvizOutput, VizNode } from "../../../../mod/types";
import { colors } from "~/components/graph/common/colors";
import type { GraphLayoutSettings } from "~/components/graph/common/graph-layout-settings";
import { getRandom } from "~/components/graph/common/random";
import {
	getNodeGroupingLabel,
	type ExternalGroupingMode,
} from "~/utils/modviz-data";

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
	layoutSettings?: GraphLayoutSettings;
	externalGrouping?: ExternalGroupingMode;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
}) => {
	const workspacePackageNames = useMemo(
		() => new Set(props.packages.map((pkg) => pkg.name)),
		[props.packages],
	);

	const clusterColors = useMemo(() => {
		const colorMap = new Map<string, string>();
		const clusters = new Set<string>();
		props.nodes.forEach((node) => {
			clusters.add(
				getNodeGroupingLabel(
					node,
					workspacePackageNames,
					props.externalGrouping ?? "combined",
				),
			);
		});
		let index = 0;
		clusters.forEach((cluster) => {
			colorMap.set(
				cluster,
				colors.list[++index] ?? colors.deterministic(cluster),
			);
		});
		return colorMap;
	}, [props.externalGrouping, props.nodes, workspacePackageNames]);

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
		const nodeSizeScale = props.layoutSettings?.nodeSizeScale ?? 1;

		props.nodes.forEach((node) => {
			nodesMap.set(node.path, node);
			const groupLabel = getNodeGroupingLabel(
				node,
				workspacePackageNames,
				props.externalGrouping ?? "combined",
			);

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
				cluster: groupLabel,
				clusterPath: node.package?.path ?? groupLabel,
				color:
					clusterColors.get(groupLabel) ??
					colors.default,
				size: clamp(
					4,
					18 * nodeSizeScale,
					Math.max(4, node.importedBy.length * nodeSizeScale),
				),
				highlighted: false,
			});
		});

		edges.list.forEach((edge) => {
			if (nodesMap.has(edge.source) && nodesMap.has(edge.target)) {
				const sourceNode = nodesMap.get(edge.source)!;
				const sourceGroup = getNodeGroupingLabel(
					sourceNode,
					workspacePackageNames,
					props.externalGrouping ?? "combined",
				);
				graph.addEdge(edge.source, edge.target, {
					label: edge.source,
					color:
						clusterColors.get(sourceGroup) ?? colors.default,
				});
			}
		});

		// applyHybridClustering(graph, packageColors);

		return graph as Graph<NodeType, EdgeType>;
	}, [
		clusterColors,
		edges.list,
		props.entryNode,
		props.externalGrouping,
		props.layoutSettings?.nodeSizeScale,
		props.nodes,
		workspacePackageNames,
	]);
};
