import { startTransition, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import type { ModvizDataBundle } from "~/utils/modviz-data";
import type { VizImport, VizNode } from "../../../mod/types";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { ImportDisplay } from "~/components/modviz/import-display";

type ReadyBundle = ModvizDataBundle & {
	graph: NonNullable<ModvizDataBundle["graph"]>;
};

const formatNumber = new Intl.NumberFormat("en-US");

type MatchMode = "contains" | "exact" | "regex";
type TargetScope = "all" | "workspace" | "external";

type ImportSearchResult = {
	node: VizNode;
	matches: VizImport[];
};

const splitTokens = (value: string) =>
	value
		.split(/[\n,]+/)
		.map((token) => token.trim())
		.filter(Boolean);

const createMatcher = (query: string, mode: MatchMode) => {
	if (!query.trim()) {
		return () => true;
	}

	if (mode === "regex") {
		const regex = new RegExp(query, "i");
		return (value: string) => regex.test(value);
	}

	if (mode === "exact") {
		const normalized = query.trim().toLowerCase();
		return (value: string) => value.trim().toLowerCase() === normalized;
	}

	const normalized = query.trim().toLowerCase();
	return (value: string) => value.toLowerCase().includes(normalized);
};

const matchesSourceToken = (node: VizNode, token: string, mode: MatchMode) => {
	const matcher = createMatcher(token, mode);
	return [node.path, node.name, node.cluster, node.package?.name, node.package?.path]
		.filter(Boolean)
		.some((value) => matcher(String(value)));
};

const isWorkspaceImport = (importItem: VizImport, workspacePackageNames: Set<string>) => {
	if (importItem.module.startsWith(".") || importItem.module.startsWith("/")) {
		return true;
	}

	for (const packageName of workspacePackageNames) {
		if (importItem.module === packageName || importItem.module.startsWith(`${packageName}/`)) {
			return true;
		}
	}

	return false;
};

export function ImportSearchView(props: {
	bundle: ReadyBundle;
	search: {
		exclude: string;
		include: string;
		mode: MatchMode;
		module: string;
		preset: string;
		scope: TargetScope;
		symbol: string;
	};
	onSearchChange: (
		patch: Partial<{
			exclude: string;
			include: string;
			mode: MatchMode;
			module: string;
			preset: string;
			scope: TargetScope;
			symbol: string;
		}>,
	) => void;
}) {
	const { graph } = props.bundle;
	const {
		exclude: excludeSources,
		include: includeSources,
		mode: matchMode,
		module: moduleQuery,
		preset,
		scope: targetScope,
		symbol: symbolQuery,
	} = props.search;
	const workspacePackageNames = useMemo(
		() => new Set(graph.metadata.packages.map((pkg) => pkg.name)),
		[graph.metadata.packages],
	);
	const updateSearch = (
		patch: Partial<{
			exclude: string;
			include: string;
			mode: MatchMode;
			module: string;
			preset: string;
			scope: TargetScope;
			symbol: string;
		}>,
	) => startTransition(() => props.onSearchChange(patch));

	const search = useMemo(() => {
		try {
			const moduleMatcher = createMatcher(moduleQuery, matchMode);
			const symbolMatcher = createMatcher(symbolQuery, matchMode);
			const includeTokens = splitTokens(includeSources);
			const excludeTokens = splitTokens(excludeSources);

			const results = graph.nodes
				.map<ImportSearchResult | null>((node) => {
					const matches = node.imports.filter((importItem) => {
						const moduleMatches = moduleMatcher(importItem.module);
						const symbolMatches = symbolQuery.trim()
							? [importItem.name, importItem.declaration]
									.filter(Boolean)
									.some((value) => symbolMatcher(String(value)))
							: true;
						const workspaceImport = isWorkspaceImport(importItem, workspacePackageNames);
						const scopeMatches =
							targetScope === "all" ||
							(targetScope === "workspace" && workspaceImport) ||
							(targetScope === "external" && !workspaceImport);

						return moduleMatches && symbolMatches && scopeMatches;
					});

					if (!matches.length) return null;
					if (
						includeTokens.length &&
						!includeTokens.every((token) => matchesSourceToken(node, token, matchMode))
					) {
						return null;
					}
					if (excludeTokens.some((token) => matchesSourceToken(node, token, matchMode))) {
						return null;
					}

					return { node, matches };
				})
				.filter(Boolean) as ImportSearchResult[];

			results.sort((left, right) => {
				const matchCountOrder = right.matches.length - left.matches.length;
				return matchCountOrder !== 0
					? matchCountOrder
					: left.node.path.localeCompare(right.node.path);
			});

			return { results, error: null as string | null };
		} catch (error) {
			return {
				results: [] as ImportSearchResult[],
				error: error instanceof Error ? error.message : "Invalid search expression",
			};
		}
	}, [
		excludeSources,
		graph.nodes,
		includeSources,
		matchMode,
		moduleQuery,
		symbolQuery,
		targetScope,
		workspacePackageNames,
	]);

	const presets = [
		{
			id: "external-hunt",
			label: "External package hunt",
			apply: () =>
				updateSearch({
					preset: "external-hunt",
					scope: "external",
					mode: "contains",
				}),
		},
		{
			id: "workspace-path-regex",
			label: "Workspace path regex",
			apply: () =>
				updateSearch({
					preset: "workspace-path-regex",
					scope: "workspace",
					mode: "regex",
					include: includeSources || "(@weliihq/backend|apps/backend).*(routers|organization)",
				}),
		},
		{
			id: "lodash-omit",
			label: "Find lodash omit",
			apply: () =>
				updateSearch({
					preset: "lodash-omit",
					module: "lodash-es",
					symbol: "omit",
					scope: "external",
					mode: "contains",
				}),
		},
	] as const;

	return (
		<div className="space-y-6">
			<details
				open
				className="group sticky top-0 z-10 rounded-[24px] border border-slate-200/70 bg-white/90 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] transition-all dark:border-slate-800 dark:bg-slate-950/70"
			>
				<summary className="flex cursor-pointer list-none items-center justify-between p-5">
					<h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
						Filter options
					</h3>
					<span className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
						<ChevronDown className="size-4 -rotate-90 transition-transform group-open:rotate-0" />
					</span>
				</summary>
				<div className="border-t border-slate-200/70 px-5 py-4 dark:border-slate-800">
					<div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
						<div className="space-y-2">
							<label className="text-sm font-medium text-slate-700 dark:text-slate-200">
								Imported module
							</label>
							<Input
								placeholder="lodash-es, ./router, @weliihq/backend..."
								value={moduleQuery}
								onChange={(event) =>
									updateSearch({ module: event.currentTarget.value, preset: "" })
								}
							/>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium text-slate-700 dark:text-slate-200">
								Imported symbol
							</label>
							<Input
								placeholder="omit, mapValues, OrganizationRouter..."
								value={symbolQuery}
								onChange={(event) =>
									updateSearch({ symbol: event.currentTarget.value, preset: "" })
								}
							/>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium text-slate-700 dark:text-slate-200">
								Match mode
							</label>
							<select
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
								value={matchMode}
								onChange={(event) =>
									updateSearch({
										mode: event.currentTarget.value as MatchMode,
										preset: "",
									})
								}
							>
								<option value="contains">contains</option>
								<option value="exact">exact</option>
								<option value="regex">regex</option>
							</select>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium text-slate-700 dark:text-slate-200">
								Target scope
							</label>
							<select
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
								value={targetScope}
								onChange={(event) =>
									updateSearch({
										scope: event.currentTarget.value as TargetScope,
										preset: "",
									})
								}
							>
								<option value="all">all imports</option>
								<option value="workspace">workspace or monorepo imports</option>
								<option value="external">external package imports</option>
							</select>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium text-slate-700 dark:text-slate-200">
								Only imported from
							</label>
							<textarea
								className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
								placeholder="@weliihq/backend\nrouters/organization"
								value={includeSources}
								onChange={(event) =>
									updateSearch({ include: event.currentTarget.value, preset: "" })
								}
							/>
							<p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
								Regex helpers: use <code>routers/organization</code>, <code>(router|service)</code>,
								or <code>^apps/backend/</code> when match mode is regex.
							</p>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium text-slate-700 dark:text-slate-200">
								Exclude imported from
							</label>
							<textarea
								className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
								placeholder="test, stories, generated"
								value={excludeSources}
								onChange={(event) =>
									updateSearch({ exclude: event.currentTarget.value, preset: "" })
								}
							/>
						</div>
					</div>
					<div className="mt-4 flex flex-wrap gap-2">
						{presets.map((presetItem) => (
							<Button
								key={presetItem.id}
								variant={preset === presetItem.id ? "default" : "outline"}
								size="sm"
								onClick={presetItem.apply}
							>
								{presetItem.label}
							</Button>
						))}
					</div>
					<div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
						<Button
							variant="outline"
							onClick={() => {
								updateSearch({
									module: "",
									symbol: "",
									include: "",
									exclude: "",
									mode: "contains",
									scope: "all",
									preset: "",
								});
							}}
						>
							Reset filters
						</Button>
						<span>
							Try: module = lodash-es, symbol = omit, include = @weliihq/backend and
							routers/organization.
						</span>
					</div>
				</div>
			</details>

			<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Matches</h2>
						<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
							Importer files or modules whose import list matches the current filters.
						</p>
					</div>
					<div className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-950">
						{formatNumber.format(search.results.length)} result(s)
					</div>
				</div>
				{search.error ? (
					<p className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
						{search.error}
					</p>
				) : null}
				<div className="mt-4 space-y-4">
					{search.results.map((result) => (
						<article
							key={result.node.path}
							className="rounded-[22px] border border-slate-200/80 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70"
						>
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
										{result.node.path}
									</h3>
									<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
										{result.node.package?.name ? `${result.node.package.name} • ` : ""}
										{result.node.cluster ?? result.node.type}
									</p>
								</div>
								<div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm dark:bg-slate-950 dark:text-slate-200">
									{formatNumber.format(result.matches.length)} matching import(s)
								</div>
							</div>
							<div className="mt-3">
								<ImportDisplay imports={result.matches} showViewToggle={false} />
							</div>
						</article>
					))}
					{!search.error && !search.results.length ? (
						<p className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
							No imports matched the current query.
						</p>
					) : null}
				</div>
			</section>
		</div>
	);
}
