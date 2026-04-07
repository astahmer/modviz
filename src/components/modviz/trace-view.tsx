import { Link } from "@tanstack/react-router";
import { Search, Sparkles } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { ModvizDataBundle } from "~/utils/modviz-data";
import { buildNodeTraceReport, buildPackageTraceReport } from "../../../shared/modviz-trace";

type TraceSearch = {
	limit: number;
	node: string;
	package: string;
};

const TRACE_RESULT_LIMIT_DEFAULT = 25;
const TRACE_RENDERED_MATCHES_LIMIT = 30;

const explorerSearchForPath = (path: string) => ({
	q: "",
	selected: path,
	scope: path.includes("node_modules") ? ("external" as const) : ("workspace" as const),
});

function TracePathLink(props: { path: string; className?: string }) {
	return (
		<Link
			to="/explorer"
			search={explorerSearchForPath(props.path)}
			className={
				props.className ??
				"rounded-full bg-white px-3 py-1 hover:text-sky-700 dark:bg-slate-950/80 dark:hover:text-sky-300"
			}
		>
			{props.path}
		</Link>
	);
}

const defaultGraphSearch = {
	adjustSizes: false,
	cluster: "",
	externalGrouping: "package" as const,
	focus: "",
	gravity: 0,
	hideClusterLabels: false,
	iterations: 0,
	linLogMode: false,
	nodeSizeScale: 0,
	outboundAttractionDistribution: true,
	scalingRatio: 0,
	scope: "all" as const,
	strongGravityMode: false,
};

export function TraceView(props: {
	bundle: ModvizDataBundle & { graph: NonNullable<ModvizDataBundle["graph"]> };
	search: TraceSearch;
	onSearchChange: (patch: Partial<TraceSearch>) => void;
}) {
	const [draftSearch, setDraftSearch] = useState(props.search);
	const deferredSearch = useDeferredValue(props.search);

	useEffect(() => {
		setDraftSearch(props.search);
	}, [props.search]);

	const applySearch = (next: TraceSearch) => {
		props.onSearchChange(next);
	};
	const renderedLimit = deferredSearch.limit || TRACE_RESULT_LIMIT_DEFAULT;

	const report = useMemo(() => {
		if (deferredSearch.package.trim()) {
			return buildPackageTraceReport(props.bundle.graph, deferredSearch.package, {
				maxChainsPerTarget: Math.max(14, renderedLimit),
				maxDepth: 22,
				maxNodesPerPackage: Math.max(80, renderedLimit * 4),
			});
		}

		if (deferredSearch.node.trim()) {
			return buildNodeTraceReport(props.bundle.graph, deferredSearch.node, {
				maxChainsPerTarget: Math.max(14, renderedLimit),
				maxDepth: 22,
				maxNodeMatches: Math.max(160, renderedLimit * 6),
			});
		}

		return null;
	}, [deferredSearch.node, deferredSearch.package, props.bundle.graph, renderedLimit]);

	const visibleMatches = useMemo(
		() => report?.matches.slice(0, TRACE_RENDERED_MATCHES_LIMIT) ?? [],
		[report],
	);

	return (
		<div className="space-y-6">
			<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
				<div className="grid gap-4 lg:grid-cols-3">
					<div className="space-y-2">
						<label className="text-sm font-medium text-slate-700 dark:text-slate-200">
							External package
						</label>
						<Input
							placeholder="zod, react, lodash-es"
							value={draftSearch.package}
							onChange={(event) => {
								const value = event.currentTarget.value;
								setDraftSearch((previous) => ({ ...previous, package: value, node: "" }));
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									const value = event.currentTarget.value;
									applySearch({ ...draftSearch, package: value, node: "" });
								}
							}}
						/>
					</div>
					<div className="space-y-2">
						<label className="text-sm font-medium text-slate-700 dark:text-slate-200">
							Node path or name
						</label>
						<Input
							placeholder="src/routes/index.ts"
							value={draftSearch.node}
							onChange={(event) => {
								const value = event.currentTarget.value;
								setDraftSearch((previous) => ({ ...previous, node: value, package: "" }));
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									const value = event.currentTarget.value;
									applySearch({ ...draftSearch, node: value, package: "" });
								}
							}}
						/>
					</div>
					<div className="space-y-2">
						<label className="text-sm font-medium text-slate-700 dark:text-slate-200">
							Chain limit
						</label>
						<Input
							type="number"
							min="1"
							max="200"
							value={String(draftSearch.limit)}
							onChange={(event) => {
								setDraftSearch((previous) => ({
									...previous,
									limit: Math.max(
										1,
										Number(event.currentTarget.value) || TRACE_RESULT_LIMIT_DEFAULT,
									),
								}));
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") applySearch(draftSearch);
							}}
						/>
					</div>
				</div>
				<div className="mt-4 flex flex-wrap gap-2">
					<Button
						variant="outline"
						onClick={() =>
							applySearch({
								package: "react",
								node: "",
								limit: draftSearch.limit || TRACE_RESULT_LIMIT_DEFAULT,
							})
						}
					>
						Trace React
					</Button>
					<Button
						variant="outline"
						onClick={() =>
							applySearch({
								package: "",
								node: props.bundle.graph.metadata.entrypoints[0] ?? "",
								limit: draftSearch.limit || TRACE_RESULT_LIMIT_DEFAULT,
							})
						}
					>
						Trace entrypoint
					</Button>
					<Button
						variant="outline"
						onClick={() => {
							const reset = { package: "", node: "", limit: TRACE_RESULT_LIMIT_DEFAULT };
							setDraftSearch(reset);
							applySearch(reset);
						}}
					>
						Reset
					</Button>
					<Button onClick={() => applySearch(draftSearch)}>Apply</Button>
				</div>
				<p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
					Import search finds matching import statements. Trace explains why a file or external
					package is reachable by walking upstream importers back toward workspace roots and
					entrypoints.
				</p>
			</section>

			{report ? (
				<section className="space-y-4">
					<div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
						<div className="flex items-center justify-between gap-4">
							<div>
								<h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
									Trace results
								</h2>
								<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
									Matched {report.matches.length} result(s) across {report.totalChains} origin
									chain(s). Showing up to {renderedLimit} path(s) per section.
								</p>
							</div>
							<div className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-950">
								{report.kind}
							</div>
						</div>
					</div>

					{report.matches.length === 0 ? (
						<div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-8 text-sm text-slate-500 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">
							No matching origin traces were found.
						</div>
					) : (
						<>
							{report.matches.length > TRACE_RENDERED_MATCHES_LIMIT ? (
								<div className="rounded-[20px] border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
									Rendering the first {TRACE_RENDERED_MATCHES_LIMIT} matches out of{" "}
									{report.matches.length}. Refine the query to narrow results.
								</div>
							) : null}
							{visibleMatches.map((match) => (
								<article
									key={match.path}
									className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70"
								>
									<div className="flex flex-wrap items-start justify-between gap-4">
										<div>
											<h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
												{match.label}
											</h3>
											<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
												{match.packageName ? `${match.packageName} • ` : ""}
												{match.type} • {match.targetPaths.length} matching file(s) •{" "}
												{match.workspaceOrigins.length} workspace origin(s)
											</p>
										</div>
										<div className="flex flex-wrap gap-2">
											<Link
												to="/graph"
												search={{
													...defaultGraphSearch,
													focus:
														match.introducedThrough[0] ??
														match.workspaceOrigins[0] ??
														match.targetPaths[0] ??
														match.path,
													scope:
														match.introducedThrough[0] || match.workspaceOrigins[0]
															? "workspace"
															: match.path.includes("node_modules")
																? "external"
																: "workspace",
												}}
												className="text-sm font-medium text-sky-700 dark:text-sky-300"
											>
												Open in graph
											</Link>
											<Link
												to="/explorer"
												search={{
													selected:
														match.introducedThrough[0] ??
														match.workspaceOrigins[0] ??
														match.targetPaths[0] ??
														match.path,
													q: "",
													scope:
														match.introducedThrough[0] || match.workspaceOrigins[0]
															? "workspace"
															: match.path.includes("node_modules")
																? "external"
																: "workspace",
												}}
												className="text-sm font-medium text-sky-700 dark:text-sky-300"
											>
												Open in explorer
											</Link>
										</div>
									</div>
									<div className="mt-4 grid gap-3 lg:grid-cols-2">
										<div className="rounded-2xl bg-slate-50/90 px-4 py-3 dark:bg-slate-900/70">
											<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
												Introduced through
											</p>
											<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
												Workspace files that first cross into this external dependency chain.
											</p>
											<div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-700 dark:text-slate-200">
												{match.introducedThrough.length > 0 ? (
													match.introducedThrough
														.slice(0, renderedLimit)
														.map((segment) => (
															<TracePathLink
																key={`${match.path}-introduced-${segment}`}
																path={segment}
															/>
														))
												) : (
													<span className="text-slate-500 dark:text-slate-400">
														No workspace importer path found.
													</span>
												)}
											</div>
										</div>
										<div className="rounded-2xl bg-slate-50/90 px-4 py-3 dark:bg-slate-900/70">
											<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
												Workspace origins
											</p>
											<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
												Workspace roots or entrypoint-side files that can eventually reach this
												result.
											</p>
											<div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-700 dark:text-slate-200">
												{match.workspaceOrigins.length > 0 ? (
													match.workspaceOrigins
														.slice(0, renderedLimit)
														.map((segment) => (
															<TracePathLink
																key={`${match.path}-origin-${segment}`}
																path={segment}
															/>
														))
												) : (
													<span className="text-slate-500 dark:text-slate-400">
														No upstream workspace root found.
													</span>
												)}
											</div>
										</div>
									</div>
									<div className="mt-4 rounded-2xl bg-slate-50/90 px-4 py-3 dark:bg-slate-900/70">
										<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
											Matched files
										</p>
										<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
											Concrete matching files inside the package or node search result.
										</p>
										<div className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-300">
											{match.targetPaths.slice(0, renderedLimit).map((targetPath) => (
												<div key={`${match.path}-target-${targetPath}`} className="font-mono">
													<TracePathLink
														path={targetPath}
														className="hover:text-sky-700 dark:hover:text-sky-300"
													/>
												</div>
											))}
										</div>
									</div>
									<div className="mt-4 space-y-3">
										{match.chains.slice(0, renderedLimit).map((chain, index) => (
											<div
												key={`${match.path}-${index}`}
												className="rounded-2xl bg-slate-50/90 px-4 py-3 dark:bg-slate-900/70"
											>
												<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
													Origin chain {index + 1}
												</p>
												<div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-700 dark:text-slate-200">
													{chain.map((segment, segmentIndex) => (
														<TracePathLink key={`${segment}-${segmentIndex}`} path={segment} />
													))}
												</div>
											</div>
										))}
									</div>
								</article>
							))}
						</>
					)}
				</section>
			) : (
				<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-8 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<div className="flex items-start gap-4">
						<div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
							<Search className="size-5" />
						</div>
						<div>
							<h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
								Explain why something is here
							</h2>
							<p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
								Enter a package name or a node path to inspect the origin chains captured in the
								graph snapshot.
							</p>
							<p className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">
								<Sparkles className="size-3.5" />
								This uses stored import chains, not a fresh graph walk.
							</p>
						</div>
					</div>
				</section>
			)}
		</div>
	);
}
