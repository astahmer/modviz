import { useLoadGraph } from "@react-sigma/core";
import { useLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { button, useControls } from "leva";
import { useEffect } from "react";
import {
	useCreateGraph,
	type EdgeType,
	type NodeType,
} from "~/components/graph/common/use-create-graph";
import { useGraphSettings } from "~/components/graph/common/use-graph-settings";
import type { ModvizOutput } from "../../../../mod/types";

type ForceAtlas2SynchronousLayoutParameters = Parameters<
	typeof useLayoutForceAtlas2
>[0];

export const SigmaGraph = (props: {
	entryNode?: string;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
	layout?: ForceAtlas2SynchronousLayoutParameters;
}) => {
	const controls = useControls({
		iterations: {
			min: 100,
			max: 1000,
			step: 10,
			value: 500,
		},
		gravity: {
			min: 0,
			max: 500,
			step: 1,
			value: 1,
		},
		scalingRatio: {
			min: 1,
			max: 5000,
			step: 1,
			value: props.nodes.length * 5, // 100?
		},
		strongGravityMode: false, // true?
		linLogMode: false,
		adjustSizes: false,
		outboundAttractionDistribution: false,
		refresh: button(() => {
			const graph = createGraph();
			loadGraph(graph);
			layout.assign();
		}),
		hideClusterLabels: {
			value: false,
			onChange: (value) => {
				const clusterLabelLayer = document.getElementById(
					"cluster-label-layers",
				);
				if (clusterLabelLayer) {
					clusterLabelLayer.style.display = value ? "none" : "initial";
				}
			},
		},
	});
	const { iterations, ...settings } = controls;

	const layout = useLayoutForceAtlas2({
		iterations: iterations,
		...props.layout,
		settings: {
			...settings,
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
	}, [loadGraph, createGraph]);

	// When controls change => update layout
	useEffect(() => {
		layout.assign();
	}, [controls, layout.assign]);

	return null;
};
