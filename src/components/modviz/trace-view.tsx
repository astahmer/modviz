import { Link } from "@tanstack/react-router";
import { Search, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { ModvizDataBundle } from "~/utils/modviz-data";
import { buildNodeTraceReport, buildPackageTraceReport } from "../../../shared/modviz-trace";

type TraceSearch = {
	limit: number;
	node: string;
	package: string;
};

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
	preset: "",
	scalingRatio: 0,
	scope: "all" as const,
	strongGravityMode: false,
};

export function TraceView(props: {
	bundle: ModvizDataBundle & { graph: NonNullable<ModvizDataBundle["graph"]> };
	search: TraceSearch;
	onSearchChange: (patch: Partial<TraceSearch>) => void;
}) {
	const report = useMemo(() => {
		if (props.search.package.trim()) {
			return buildPackageTraceReport(props.bundle.graph, props.search.package);
		}

		if (props.search.node.trim()) {
			return buildNodeTraceReport(props.bundle.graph, props.search.node);
		}

		return null;
	}, [props.bundle.graph, props.search.node, props.search.package]);

	return (
		<div className="space-y-6">
			<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
				<div className="grid gap-4 lg:grid-cols-3">
					<div className="space-y-2">
						<label className="text-sm font-medium text-slate-700 dark:text-slate-200">External package</label>
						<Input placeholder="zod, react, lodash-es" value={props.search.package} onChange={(event) => props.onSearchChange({ package: event.currentTarget.value, node: "" })} />
					</div>
					<div className="space-y-2">
						<label className="text-sm font-medium text-slate-700 dark:text-slate-200">Node path or name</label>
						<Input placeholder="src/routes/index.ts" value={props.search.node} onChange={(event) => props.onSearchChange({ node: event.currentTarget.value, package: "" })} />
					</div>
					<div className="space-y-2">
						<label className="text-sm font-medium text-slate-700 dark:text-slate-200">Chain limit</label>
						<Input type="number" min="1" max="50" value={String(props.search.limit)} onChange={(event) => props.onSearchChange({ limit: Math.max(1, Number(event.currentTarget.value) || 10) })} />
					</div>
				</div>
				<div className="mt-4 flex flex-wrap gap-2">
					<Button variant="outline" onClick={() => props.onSearchChange({ package: "react", node: "" })}>Trace React</Button>
					<Button variant="outline" onClick={() => props.onSearchChange({ package: "", node: props.bundle.graph.metadata.entrypoints[0] ?? "" })}>Trace entrypoint</Button>
					<Button variant="outline" onClick={() => props.onSearchChange({ package: "", node: "", limit: 10 })}>Reset</Button>
				</div>
			</section>

			{report ? (
				<section className="space-y-4">
					<div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
						<div className="flex items-center justify-between gap-4">
							<div>
								<h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Trace results</h2>
								<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Matched {report.matches.length} node(s) across {report.totalChains} origin chain(s).</p>
							</div>
							<div className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-950">{report.kind}</div>
						</div>
					</div>

					{report.matches.length === 0 ? (
						<div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-8 text-sm text-slate-500 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-400">No matching origin traces were found.</div>
					) : (
						report.matches.map((match) => (
							<article key={match.path} className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div>
										<h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{match.path}</h3>
										<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{match.packageName ? `${match.packageName} • ` : ""}{match.type} • {match.directImporters.length} direct importer(s)</p>
									</div>
									<div className="flex flex-wrap gap-2">
										<Link to="/graph" search={{ ...defaultGraphSearch, focus: match.path, scope: match.path.includes("node_modules") ? "external" : "workspace" }} className="text-sm font-medium text-sky-700 dark:text-sky-300">Open in graph</Link>
										<Link to="/explorer" search={{ selected: match.path, q: "", scope: match.path.includes("node_modules") ? "external" : "workspace" }} className="text-sm font-medium text-sky-700 dark:text-sky-300">Open in explorer</Link>
									</div>
								</div>
								<div className="mt-4 space-y-3">
									{match.chains.slice(0, props.search.limit).map((chain, index) => (
										<div key={`${match.path}-${index}`} className="rounded-2xl bg-slate-50/90 px-4 py-3 dark:bg-slate-900/70">
											<p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Origin chain {index + 1}</p>
											<div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-700 dark:text-slate-200">
												{chain.map((segment, segmentIndex) => (
													<span key={`${segment}-${segmentIndex}`} className="rounded-full bg-white px-3 py-1 dark:bg-slate-950/80">{segment}</span>
												))}
											</div>
										</div>
									))}
								</div>
							</article>
						))
					)}
				</section>
			) : (
				<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-8 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<div className="flex items-start gap-4">
						<div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
							<Search className="size-5" />
						</div>
						<div>
							<h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Explain why something is here</h2>
							<p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Enter a package name or a node path to inspect the origin chains captured in the graph snapshot.</p>
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
