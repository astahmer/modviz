import { Link } from "@tanstack/react-router";
import type { ModvizDataBundle, SummaryListItem } from "~/utils/modviz-data";
import { formatNumber } from "~/utils/formatting";

function MetricCard(props: { label: string; value: number; note: string }) {
	return (
		<div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
			<p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
				{props.label}
			</p>
			<p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
				{formatNumber.format(props.value)}
			</p>
			<p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
				{props.note}
			</p>
		</div>
	);
}

function SummaryTable(props: {
	title: string;
	description: string;
	rows: SummaryListItem[];
	valueLabel: string;
	getLink: (row: SummaryListItem) => { to: string; search?: Record<string, unknown> };
}) {
	return (
		<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
			<h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
				{props.title}
			</h2>
			<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
				{props.description}
			</p>
			<div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800">
				<table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
					<thead className="bg-slate-50/90 dark:bg-slate-900/80">
						<tr>
							<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Target
							</th>
							<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Path
							</th>
							<th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								{props.valueLabel}
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/60">
						{props.rows.map((row, index) => (
							<tr key={`${row.path}-${index}`} className="transition hover:bg-sky-50/70 dark:hover:bg-sky-500/10">
								<td className="px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-100">
									<Link to={props.getLink(row).to} search={props.getLink(row).search} className="hover:text-sky-700 dark:hover:text-sky-300">
										{row.label}
									</Link>
									{row.description ? (
										<p className="mt-1 text-xs font-normal text-slate-500 dark:text-slate-400">
											{row.description}
										</p>
									) : null}
								</td>
								<td className="max-w-[24rem] truncate px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
									{row.path}
								</td>
								<td className="px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
									{formatNumber.format(row.value)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

export function SummaryView(props: { bundle: ModvizDataBundle }) {
	const { graph, summary } = props.bundle;

	return (
		<div className="space-y-6">
			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<MetricCard label="Total nodes" value={summary.overview.totalNodes} note={`${formatNumber.format(summary.overview.workspaceNodes)} workspace nodes and ${formatNumber.format(summary.overview.externalNodes)} external nodes are available in the loaded graph.`} />
				<MetricCard label="Entrypoints" value={summary.overview.entrypoints} note={graph.metadata.entrypoints.join(" • ") || "No entrypoint metadata present."} />
				<MetricCard label="Workspace packages" value={summary.overview.workspacePackages} note="Monorepo packages discovered in metadata and reused by the filters in the import-search view." />
				<MetricCard label="Barrel files" value={summary.overview.barrelFiles} note={summary.hasLlm ? "The LLM companion report is available, so hotspot tables use reachable-module counts." : "No LLM companion report was found, so hotspot tables fall back to direct graph counts."} />
			</section>

			<section className="grid gap-4 xl:grid-cols-2">
				<SummaryTable title="Most transitive imports" description={summary.hasLlm ? "Approximate hotspots ranked by reachable modules from the companion report." : "Fallback ranking based on direct outgoing import count."} rows={summary.hotspots} valueLabel={summary.hasLlm ? "Reachable" : "Outgoing"} getLink={(row) => ({ to: "/explorer", search: { selected: row.path, scope: row.path.includes("node_modules") ? "external" : "workspace" } })} />
				<SummaryTable title="Most imported by" description="Files or modules with the highest number of direct importers." rows={summary.topImportedBy} valueLabel="Inbound" getLink={(row) => ({ to: "/explorer", search: { selected: row.path, scope: row.path.includes("node_modules") ? "external" : "workspace" } })} />
			</section>

			<section className="grid gap-4 xl:grid-cols-2">
				<SummaryTable title="Top importers" description="Files or modules with the highest number of direct outgoing imports." rows={summary.topImporters} valueLabel="Outgoing" getLink={(row) => ({ to: "/explorer", search: { selected: row.path, scope: row.path.includes("node_modules") ? "external" : "workspace" } })} />
				<SummaryTable title="External packages" description="Distinct external package presence in the current graph." rows={summary.topExternalPackages} valueLabel="Nodes" getLink={(row) => ({ to: "/graph", search: { scope: "external", cluster: row.label, externalGrouping: "package" } })} />
			</section>

			<SummaryTable title="Largest clusters" description="Useful when deciding where to zoom first in the bubble graph or what to scope in import search." rows={summary.topClusters} valueLabel="Nodes" getLink={(row) => ({ to: "/graph", search: { cluster: row.label, externalGrouping: "package" } })} />
		</div>
	);
}
