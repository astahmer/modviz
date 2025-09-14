/**
 * Infers a label name for a group of files based on common directory patterns.
 * Analyzes file paths to find the most significant common directory segment.
 *
 * @param filePaths - Array of file paths to analyze
 * @returns The inferred group label or undefined if no clear pattern is found
 *
 * @example
 * inferGroupLabel([
 *   "apps/backend/src/commitments/use-cases/compute-timeline.use-case.ts",
 *   "apps/backend/src/commitments/use-cases/export-commitments.use-case.ts",
 *   "apps/backend/src/commitments/mappers/commitment.mapper.ts"
 * ]); // Returns "commitments"
 */
export function inferPathsLabel(filePaths: string[]): string | undefined {
	if (!filePaths.length) return;

	// Extract all directory segments from all paths
	const allSegments: string[][] = filePaths.map((path) => {
		const segments = path.split("/").filter(
			(segment) =>
				segment &&
				segment !== "src" &&
				segment !== "lib" &&
				segment !== "dist" &&
				segment !== "build" &&
				!segment.includes("."), // Filter out files
		);
		return segments;
	});

	// Count frequency of each segment and its position
	const segmentFrequency = new Map<
		string,
		{ count: number; positions: number[] }
	>();

	allSegments.forEach((segments) => {
		segments.forEach((segment, index) => {
			const current = segmentFrequency.get(segment) || {
				count: 0,
				positions: [],
			};
			current.count++;
			current.positions.push(index);
			segmentFrequency.set(segment, current);
		});
	});

	// Filter out common/generic directory names
	const genericNames = new Set([
		"apps",
		"packages",
		"src",
		"modules",
		"components",
		"utils",
		"helpers",
		"shared",
		"common",
		"core",
		"base",
		"types",
		"interfaces",
		"backend",
		"frontend",
		"client",
		"server",
		"api",
		"web",
	]);

	// Find the best candidate segment
	let bestCandidate = { segment: "", score: 0 };

	for (const [segment, data] of segmentFrequency) {
		if (genericNames.has(segment)) continue;

		// Calculate score based on frequency and position consistency
		const frequencyRatio = data.count / filePaths.length;
		const avgPosition =
			data.positions.reduce((sum, pos) => sum + pos, 0) / data.positions.length;
		const positionConsistency =
			1 - (Math.max(...data.positions) - Math.min(...data.positions)) / 10;

		// Prefer segments that appear in most files, are reasonably positioned, and have consistent positioning
		const score =
			frequencyRatio * 0.6 + positionConsistency * 0.4 - avgPosition * 0.1;

		if (score > bestCandidate.score && frequencyRatio >= 0.5) {
			bestCandidate = { segment, score };
		}
	}

	// If no good candidate found, try to extract from the longest common path
	if (!bestCandidate.segment) {
		const commonPath = findLongestCommonPath(filePaths);
		const pathSegments = commonPath
			.split("/")
			.filter((s) => s && !s.includes("."));

		// Take the last non-generic segment from common path
		for (let i = pathSegments.length - 1; i >= 0; i--) {
			if (!genericNames.has(pathSegments[i])) {
				bestCandidate.segment = pathSegments[i];
				break;
			}
		}
	}

	return bestCandidate.segment || undefined;
}

/**
 * Finds the longest common path prefix among multiple file paths
 */
function findLongestCommonPath(paths: string[]): string {
	if (paths.length === 0) return "";
	if (paths.length === 1) return paths[0];

	const segments = paths.map((path) => path.split("/"));
	const minLength = Math.min(...segments.map((s) => s.length));

	let commonLength = 0;
	for (let i = 0; i < minLength; i++) {
		const segment = segments[0][i];
		if (segments.every((s) => s[i] === segment)) {
			commonLength = i + 1;
		} else {
			break;
		}
	}

	return segments[0].slice(0, commonLength).join("/");
}
