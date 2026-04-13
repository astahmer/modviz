export interface ImportChainSource {
	relativeEntrypoints: string[];
	graph: Map<string, Set<string>>;
	modules: Map<string, { importedBy: string[] }>;
}

const importChainsIndexCache = new WeakMap<
	ImportChainSource,
	Map<number, Map<string, string[][]>>
>();

export function findImportChainsLimited(
	moduleGraph: ImportChainSource,
	targetModule: string,
	maxChains = 5,
): string[][] {
	if (!Number.isFinite(maxChains) || maxChains < 1) {
		return [];
	}

	return getImportChainsIndex(moduleGraph, maxChains).get(targetModule) ?? [];
}

function getImportChainsIndex(moduleGraph: ImportChainSource, maxChains: number) {
	let graphCache = importChainsIndexCache.get(moduleGraph);
	if (!graphCache) {
		graphCache = new Map<number, Map<string, string[][]>>();
		importChainsIndexCache.set(moduleGraph, graphCache);
	}

	const cachedIndex = graphCache.get(maxChains);
	if (cachedIndex) {
		return cachedIndex;
	}

	const nextIndex = buildImportChainsIndex(moduleGraph, maxChains);
	graphCache.set(maxChains, nextIndex);
	return nextIndex;
}

function buildImportChainsIndex(moduleGraph: ImportChainSource, maxChains: number) {
	const index = new Map<string, string[][]>();
	const seenByModule = new Map<string, Set<string>>();
	const processedChainCounts = new Map<string, number>();
	const queue: string[] = [];

	const addChain = (modulePath: string, chain: string[]) => {
		const existingChains = index.get(modulePath) ?? [];
		if (!index.has(modulePath)) {
			index.set(modulePath, existingChains);
		}

		if (existingChains.length >= maxChains) {
			return false;
		}

		let seenChains = seenByModule.get(modulePath);
		if (!seenChains) {
			seenChains = new Set<string>();
			seenByModule.set(modulePath, seenChains);
		}

		const chainKey = chain.join("\u0000");
		if (seenChains.has(chainKey)) {
			return false;
		}

		seenChains.add(chainKey);
		existingChains.push(chain);
		queue.push(modulePath);
		return true;
	};

	for (const entrypoint of moduleGraph.relativeEntrypoints) {
		addChain(entrypoint, [entrypoint]);
	}

	for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
		const importer = queue[queueIndex]!;
		const importerChains = index.get(importer) ?? [];
		const processedCount = processedChainCounts.get(importer) ?? 0;
		if (processedCount >= importerChains.length) {
			continue;
		}

		processedChainCounts.set(importer, importerChains.length);
		const importees = moduleGraph.graph.get(importer);
		if (!importees) {
			continue;
		}

		for (const chain of importerChains.slice(processedCount)) {
			for (const importee of importees) {
				if (chain.includes(importee)) {
					continue;
				}

				addChain(importee, [...chain, importee]);
			}
		}
	}

	return index;
}
