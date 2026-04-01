import { useLoadGraph } from "@react-sigma/core";
import { useLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { useEffect } from "react";
import type { GraphLayoutSettings } from "~/components/graph/common/graph-layout-settings";
import {
	useCreateGraph,
	type EdgeType,
	type NodeType,
} from "~/components/graph/common/use-create-graph";
import { useGraphSettings } from "~/components/graph/common/use-graph-settings";
import type { ModvizOutput } from "../../../../mod/types";
import type { ExternalGroupingMode } from "~/utils/modviz-data";

type ForceAtlas2SynchronousLayoutParameters = Parameters<
	typeof useLayoutForceAtlas2
>[0];

export const SigmaGraph = (props: {
	entryNode?: string;
	externalGrouping?: ExternalGroupingMode;
	layoutSettings: GraphLayoutSettings;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
	layout?: ForceAtlas2SynchronousLayoutParameters;
}) => {
	const layout = useLayoutForceAtlas2({
		iterations: props.layoutSettings.iterations,
		...props.layout,
		settings: {
			...props.layout?.settings,
			gravity: props.layoutSettings.gravity,
			scalingRatio: props.layoutSettings.scalingRatio,
			strongGravityMode: props.layoutSettings.strongGravityMode,
			linLogMode: props.layoutSettings.linLogMode,
			adjustSizes: props.layoutSettings.adjustSizes,
			outboundAttractionDistribution:
				props.layoutSettings.outboundAttractionDistribution,
		},
	});

	const createGraph = useCreateGraph(props);
	const loadGraph = useLoadGraph<NodeType, EdgeType>();
	useGraphSettings(props);

	// When component mount => load the graph
	useEffect(() => {
		const graph = createGraph();
		loadGraph(graph);
	}, [loadGraph, createGraph]);

	// When controls change => update layout
	useEffect(() => {
		layout.assign();
	}, [layout.assign, props.layoutSettings]);

	return null;
};
