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

export const getDefaultGraphLayoutSettings = (nodeCount: number): GraphLayoutSettings => {
	const safeNodeCount = Math.max(nodeCount, 1);
	const densityFactor = Math.max(1, Math.sqrt(safeNodeCount));

	return {
		iterations: Math.min(420, Math.max(220, Math.round(170 + densityFactor * 2.4))),
		gravity: Number(Math.max(0.15, Math.min(1.2, densityFactor / 90)).toFixed(2)),
		scalingRatio: Math.min(220, Math.max(40, Math.round(28 + densityFactor * 2.6))),
		strongGravityMode: false,
		linLogMode: true,
		adjustSizes: true,
		outboundAttractionDistribution: true,
		hideClusterLabels: false,
		nodeSizeScale: 0.85,
	};
};
