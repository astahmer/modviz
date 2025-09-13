import { useLoadGraph } from "@react-sigma/core";
import { useLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { useEffect } from "react";
import {
	useCreateGraph,
	type EdgeType,
	type NodeType,
} from "~/components/graph/common/use-create-graph";
import type { ModvizOutput } from "../../../../mod/types";
import { useGraphSettings } from "~/components/graph/common/use-graph-settings";

type ForceAtlas2SynchronousLayoutParameters = Parameters<
	typeof useLayoutForceAtlas2
>[0];

export const SigmaGraph = (props: {
	entryNode?: string;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
	layout?: ForceAtlas2SynchronousLayoutParameters;
}) => {
	const layout = useLayoutForceAtlas2({
		iterations: 500,
		...props.layout,
		settings: {
			// scalingRatio: 100,
			gravity: 1,
			scalingRatio: props.nodes.length * 5,
			// strongGravityMode: true,
			...props.layout?.settings,
		},
	});

	const createGraph = useCreateGraph(props);
	const loadGraph = useLoadGraph<NodeType, EdgeType>();
	useGraphSettings(props);

	// When component mount => load the graph
	useEffect(() => {
		const graph = createGraph();
		loadGraph(graph);
		layout.assign();
	}, [loadGraph, createGraph, layout.assign]);

	return null;
};
