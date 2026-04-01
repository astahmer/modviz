export type GraphLayoutSettings = {
	iterations: number;
	gravity: number;
	scalingRatio: number;
	strongGravityMode: boolean;
	linLogMode: boolean;
	adjustSizes: boolean;
	outboundAttractionDistribution: boolean;
	hideClusterLabels: boolean;
	nodeSizeScale: number;
};

export const getDefaultGraphLayoutSettings = (
	nodeCount: number,
): GraphLayoutSettings => {
	const safeNodeCount = Math.max(nodeCount, 1);

	return {
		iterations: 120,
		gravity: Math.max(10, Math.round(safeNodeCount / 4)),
		scalingRatio: Math.max(8, Math.round(safeNodeCount / 15)),
		strongGravityMode: false,
		linLogMode: false,
		adjustSizes: false,
		outboundAttractionDistribution: true,
		hideClusterLabels: false,
		nodeSizeScale: 1,
	};
};
