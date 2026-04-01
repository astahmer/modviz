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
	const densityFactor = Math.max(1, Math.sqrt(safeNodeCount));

	return {
		iterations: Math.min(320, Math.max(160, Math.round(120 + densityFactor * 1.5))),
		gravity: Number(Math.max(0.6, Math.min(4, densityFactor / 30)).toFixed(1)),
		scalingRatio: Math.min(140, Math.max(18, Math.round(12 + densityFactor * 1.2))),
		strongGravityMode: false,
		linLogMode: true,
		adjustSizes: true,
		outboundAttractionDistribution: true,
		hideClusterLabels: false,
		nodeSizeScale: 0.9,
	};
};
