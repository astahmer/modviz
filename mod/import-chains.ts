export interface ImportChainSource {
	relativeEntrypoints: string[];
	modules: Map<string, { importedBy: string[] }>;
}

export function findImportChainsLimited(
	moduleGraph: ImportChainSource,
	targetModule: string,
	maxChains = 5,
): string[][] {
	if (!Number.isFinite(maxChains) || maxChains < 1) {
		return [];
	}

	const entrypoints = new Set(moduleGraph.relativeEntrypoints);
	if (entrypoints.has(targetModule)) {
		return [[targetModule]];
	}

	if (!moduleGraph.modules.has(targetModule)) {
		return [];
	}

	const chains: string[][] = [];
	const seenChains = new Set<string>();

	const visit = (modulePath: string, reverseChain: string[]): void => {
		if (chains.length >= maxChains) {
			return;
		}

		if (entrypoints.has(modulePath)) {
			const chain = [...reverseChain].reverse();
			const key = chain.join("\u0000");
			if (!seenChains.has(key)) {
				seenChains.add(key);
				chains.push(chain);
			}
			return;
		}

		const importers = moduleGraph.modules.get(modulePath)?.importedBy ?? [];
		for (const importer of importers) {
			if (reverseChain.includes(importer)) {
				continue;
			}

			visit(importer, [...reverseChain, importer]);
			if (chains.length >= maxChains) {
				return;
			}
		}
	};

	visit(targetModule, [targetModule]);

	return chains;
}
