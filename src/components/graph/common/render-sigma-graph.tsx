import { useLoadGraph } from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { useLayoutNoverlap } from "@react-sigma/layout-noverlap";
import { useEffect, useMemo, useRef } from "react";
import type { GraphLayoutSettings } from "~/components/graph/common/graph-layout-settings";
import {
	useCreateGraph,
	type EdgeType,
	type NodeType,
} from "~/components/graph/common/use-create-graph";
import { useGraphSettings } from "~/components/graph/common/use-graph-settings";
import type { ModvizOutput } from "../../../../mod/types";
import type { ExternalGroupingMode } from "~/utils/modviz-data";

type ForceAtlas2SynchronousLayoutParameters = Parameters<typeof useWorkerLayoutForceAtlas2>[0];

export const SigmaGraph = (props: {
	entryNode?: string;
	externalGrouping?: ExternalGroupingMode;
	layoutSettings: GraphLayoutSettings;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
	layout?: ForceAtlas2SynchronousLayoutParameters;
	cancelNonce?: number;
	onBusyChange?: (isBusy: boolean) => void;
}) => {
	const workerLayoutOptions = useMemo(
		() => ({
			...props.layout,
			settings: {
				barnesHutOptimize: true,
				slowDown: 8,
				...props.layout?.settings,
				gravity: props.layoutSettings.gravity,
				scalingRatio: props.layoutSettings.scalingRatio,
				strongGravityMode: props.layoutSettings.strongGravityMode,
				linLogMode: props.layoutSettings.linLogMode,
				adjustSizes: props.layoutSettings.adjustSizes,
				outboundAttractionDistribution: props.layoutSettings.outboundAttractionDistribution,
			},
		}),
		[
			props.layout,
			props.layoutSettings.adjustSizes,
			props.layoutSettings.gravity,
			props.layoutSettings.linLogMode,
			props.layoutSettings.outboundAttractionDistribution,
			props.layoutSettings.scalingRatio,
			props.layoutSettings.strongGravityMode,
		],
	);
	const layout = useWorkerLayoutForceAtlas2(workerLayoutOptions);
	const noverlap = useLayoutNoverlap({
		maxIterations: Math.min(240, Math.max(80, Math.round(props.layoutSettings.iterations / 2))),
		settings: {
			expansion: 1.2,
			gridSize: 40,
			margin: 6,
			ratio: 1.4,
			speed: 2,
		},
	});

	const createGraph = useCreateGraph(props);
	const loadGraph = useLoadGraph<NodeType, EdgeType>();
	const stopTimerRef = useRef<number | null>(null);
	const hasLoadedGraphRef = useRef(false);
	const animationFrameRef = useRef<number | null>(null);
	const activeRunIdRef = useRef(0);
	useGraphSettings();

	const applyNoverlapSpacing = (runId: number) => {
		if (activeRunIdRef.current !== runId) {
			return;
		}

		noverlap.assign();
	};

	const stopLayoutAfterDelay = (delayMs: number, runId: number) => {
		if (stopTimerRef.current != null) {
			window.clearTimeout(stopTimerRef.current);
		}

		stopTimerRef.current = window.setTimeout(() => {
			if (activeRunIdRef.current !== runId) {
				return;
			}

			layout.stop();
			applyNoverlapSpacing(runId);
			stopTimerRef.current = null;
			props.onBusyChange?.(false);
		}, delayMs);
	};

	const cancelActiveUpdate = () => {
		activeRunIdRef.current += 1;
		if (animationFrameRef.current != null) {
			window.cancelAnimationFrame(animationFrameRef.current);
			animationFrameRef.current = null;
		}
		if (stopTimerRef.current != null) {
			window.clearTimeout(stopTimerRef.current);
			stopTimerRef.current = null;
		}
		layout.stop();
		props.onBusyChange?.(false);
	};

	// When component mount => load the graph
	useEffect(() => {
		const runId = activeRunIdRef.current + 1;
		activeRunIdRef.current = runId;
		animationFrameRef.current = window.requestAnimationFrame(() => {
			animationFrameRef.current = null;
			if (activeRunIdRef.current !== runId) {
				return;
			}

			props.onBusyChange?.(true);
			const graph = createGraph();
			if (activeRunIdRef.current !== runId) {
				return;
			}

			loadGraph(graph);
			hasLoadedGraphRef.current = true;
			layout.stop();
			layout.start();
			stopLayoutAfterDelay(Math.max(900, props.layoutSettings.iterations * 12), runId);
		});

		return () => {
			if (activeRunIdRef.current === runId) {
				cancelActiveUpdate();
			}
		};
	}, [
		createGraph,
		layout.start,
		layout.stop,
		loadGraph,
		props.layoutSettings.iterations,
		props.onBusyChange,
	]);

	// Restart layout when runtime settings change, but only after the graph has loaded.
	useEffect(() => {
		if (!hasLoadedGraphRef.current) {
			return;
		}

		props.onBusyChange?.(true);
		layout.stop();
		layout.start();
		stopLayoutAfterDelay(
			Math.max(900, props.layoutSettings.iterations * 12),
			activeRunIdRef.current,
		);

		return () => {
			if (stopTimerRef.current != null) {
				window.clearTimeout(stopTimerRef.current);
				stopTimerRef.current = null;
			}
			layout.stop();
			props.onBusyChange?.(false);
		};
	}, [
		layout.start,
		layout.stop,
		props.layoutSettings.adjustSizes,
		props.layoutSettings.gravity,
		props.layoutSettings.iterations,
		props.layoutSettings.linLogMode,
		props.layoutSettings.outboundAttractionDistribution,
		props.layoutSettings.scalingRatio,
		props.layoutSettings.strongGravityMode,
		props.onBusyChange,
	]);

	useEffect(() => {
		if (!props.cancelNonce) {
			return;
		}

		cancelActiveUpdate();
	}, [props.cancelNonce, layout.stop, props.onBusyChange]);

	useEffect(() => {
		return () => {
			cancelActiveUpdate();
			layout.stop();
			layout.kill();
		};
	}, [layout.kill]);

	return null;
};
