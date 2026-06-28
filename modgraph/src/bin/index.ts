#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { program } from "commander";
import { createModuleGraph } from "../index.ts";

export function readPackageVersion(moduleUrl: string | URL = import.meta.url): string {
	for (const candidate of ["../../package.json", "../../../package.json"]) {
		try {
			const packageJson = JSON.parse(readFileSync(new URL(candidate, moduleUrl), "utf8")) as {
				version: string;
			};

			return packageJson.version;
		} catch (error) {
			const errorWithCode = error as NodeJS.ErrnoException;
			if (errorWithCode.code !== "ENOENT") {
				throw error;
			}
		}
	}

	throw new Error("Unable to locate package.json for CLI version lookup.");
}

const packageJson = { version: readPackageVersion() };

program
	.name("module-graph")
	.description("CLI for analyzing JavaScript and TypeScript module graphs")
	.version(packageJson.version);

const sharedOptions = (cmd: ReturnType<typeof program.command>) =>
	cmd.option(
		"--workers [count]",
		"number of worker threads for parallel parsing (default: CPU count); pass --workers without a value to use all available cores",
	);

const parseWorkers = (value: string | boolean | undefined): boolean | number | undefined => {
	if (value === undefined) return undefined;
	if (typeof value === "boolean") return value;
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : true;
};

sharedOptions(
	program.command("find <entrypoint>").argument("<pattern>", "Module to find").description("Output the import chain for a given module"),
).action(async (entrypoint: string, pattern: string, options: { workers?: string | boolean }) => {
	const graph = await createModuleGraph(entrypoint, { workers: parseWorkers(options.workers) });

	for (const module of graph.get(pattern)) {
		console.log(module);
	}
});

sharedOptions(
	program
		.command("import-chain <entrypoint>")
		.argument("<pattern>", "Module to find import chain for")
		.description("Output the import chain for a given module"),
).action(async (entrypoint: string, pattern: string, options: { workers?: string | boolean }) => {
	const graph = await createModuleGraph(entrypoint, { workers: parseWorkers(options.workers) });

	let index = 0;
	for (const chain of graph.findImportChains(pattern)) {
		console.log(`Chain ${++index}:`);
		for (const chainItem of chain) {
			console.log(chainItem);
		}
		console.log();
	}
});

program
	.option(
		"--workers [count]",
		"number of worker threads for parallel parsing (default: CPU count); pass --workers without a value to use all available cores",
	)
	.argument("<entrypoint>", "Entrypoint")
	.action(async (entrypoint: string, options: { workers?: string | boolean }) => {
		const graph = await createModuleGraph(entrypoint, { workers: parseWorkers(options.workers) });

		for (const module of graph.getUniqueModules()) {
			console.log(module);
		}
	});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await program.parseAsync(process.argv);
}
