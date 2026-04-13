import { expect, test } from "vitest";
import { findImportChainsLimited, type ImportChainSource } from "../mod/import-chains.ts";

function createImportChainSource(
	entrypoints: string[],
	edges: Record<string, string[]>,
): ImportChainSource {
	const importedBy = new Map<string, string[]>();

	for (const [modulePath, dependencies] of Object.entries(edges)) {
		importedBy.set(modulePath, importedBy.get(modulePath) ?? []);
		for (const dependency of dependencies) {
			const currentImporters = importedBy.get(dependency) ?? [];
			currentImporters.push(modulePath);
			importedBy.set(dependency, currentImporters);
		}
	}

	return {
		relativeEntrypoints: entrypoints,
		graph: new Map(
			Object.entries(edges).map(([modulePath, dependencies]) => [modulePath, new Set(dependencies)]),
		),
		modules: new Map(
			Array.from(importedBy.entries(), ([modulePath, importers]) => [
				modulePath,
				{ importedBy: importers },
			]),
		),
	};
}

test("findImportChainsLimited caps the number of stored chains", () => {
	const moduleGraph = createImportChainSource(["entry"], {
		entry: ["left", "right", "third"],
		left: ["target"],
		right: ["target"],
		third: ["target"],
		target: [],
	});

	expect(findImportChainsLimited(moduleGraph, "target", 2)).toEqual([
		["entry", "left", "target"],
		["entry", "right", "target"],
	]);
});

test("findImportChainsLimited preserves valid chains through cycles", () => {
	const moduleGraph = createImportChainSource(["entry"], {
		entry: ["a"],
		a: ["b"],
		b: ["c", "target"],
		c: ["a", "target"],
		target: [],
	});

	const chains = findImportChainsLimited(moduleGraph, "target", 10).sort((left, right) =>
		left.join("/").localeCompare(right.join("/")),
	);

	expect(chains).toEqual(
		[
			["entry", "a", "b", "c", "target"],
			["entry", "a", "b", "target"],
		].sort((left, right) => left.join("/").localeCompare(right.join("/"))),
	);
});

test("findImportChainsLimited returns the entrypoint chain for entry nodes", () => {
	const moduleGraph = createImportChainSource(["entry"], {
		entry: ["child"],
		child: [],
	});

	expect(findImportChainsLimited(moduleGraph, "entry", 5)).toEqual([["entry"]]);
});
