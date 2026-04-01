import { Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, FolderTree, GitBranchPlus, Network, Sparkles, SquareStack } from "lucide-react";
import type { ModvizDataBundle, SummaryListItem } from "~/utils/modviz-data";

type RouteCard = {
	to: "/graph" | "/explorer" | "/summary" | "/imports" | "/hierarchy";
	title: string;
	description: string;
	icon: typeof Network;
	search?: Record<string, unknown>;
};

const routes: RouteCard[] = [
	{
		to: "/graph",
		title: "Bubble graph",
		description:
			"Open the force-directed view only when you need it, with tunable layout controls and broader node search.",
		icon: Network,
		search: undefined,
	},
	{
		to: "/explorer",
		title: "File explorer",
		description:
			"Browse folders and files directly, then inspect imports and imported-by lists from the selected path.",
		icon: FolderTree,
		search: undefined,
	},
	{
		to: "/summary",
		title: "Summary",
		description:
			"Read hotspots, top importers, top imported modules, and package-level distribution without rendering Sigma.",
		icon: BarChart3,
		search: undefined,
	},
	{
		to: "/imports",
		title: "Import search",
		description:
			"Search for imports by module or symbol and narrow results to specific monorepo packages, folders, or files.",
		icon: GitBranchPlus,
		search: undefined,
	},
	{
		to: "/hierarchy",
		title: "Hierarchy",
		description:
			"Inspect the dependency tree as a flamegraph-style hierarchy for entrypoint-focused analysis.",
		icon: SquareStack,
		search: undefined,
	},
] as const;

const formatNumber = new Intl.NumberFormat("en-US");

function StatCard(props: { label: string; value: number; detail: string }) {
	return (
		<div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
			<p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
				{props.label}
			</p>
			<div className="mt-3 flex items-end justify-between gap-4">
				<p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
					{formatNumber.format(props.value)}
				</p>
				<p className="max-w-[14rem] text-right text-xs leading-5 text-slate-500 dark:text-slate-400">
					{props.detail}
				</p>
			</div>
		</div>
	);
}

function RankingList(props: {
	title: string;
	description: string;
	items: SummaryListItem[];
	getLink: (item: SummaryListItem) => { to: string; search?: Record<string, unknown> };
}) {
	return (
		<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
						{props.title}
					</h2>
					<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
						{props.description}
					</p>
				</div>
			</div>
			<div className="mt-4 space-y-3">
				{props.items.map((item, index) => (
					<Link
						key={`${item.path}-${index}`}
						to={props.getLink(item).to}
						search={props.getLink(item).search}
						className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50/80 px-4 py-3 transition hover:bg-sky-50 dark:bg-slate-900/80 dark:hover:bg-sky-500/10"
					>
						<div className="min-w-0">
							<p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
								{item.label}
							</p>
							<p className="truncate text-xs text-slate-500 dark:text-slate-400">
								{item.path}
							</p>
							{item.description ? (
								<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
									{item.description}
								</p>
							) : null}
						</div>
						<div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-950">
							{formatNumber.format(item.value)}
						</div>
					</Link>
				))}
			</div>
		</section>
	);
}

export function DashboardView(props: { bundle: ModvizDataBundle }) {
	const { graph, summary } = props.bundle;

	return (
		<div className="space-y-6">
			<section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
				<div className="rounded-[28px] border border-slate-200/70 bg-slate-950 p-6 text-slate-100 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.8)]">
					<div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
						<Sparkles className="size-3.5" />
						Session overview
					</div>
					<h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight">
						Start with structure, then open the heavy views only when the question needs them.
					</h2>
					<p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
						The dataset contains {formatNumber.format(summary.overview.totalNodes)} modules across {formatNumber.format(summary.overview.workspacePackages)} workspace packages and {formatNumber.format(summary.overview.externalPackages)} external packages.
					</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
					<StatCard
						label="Entrypoints"
						value={summary.overview.entrypoints}
						detail={graph.metadata.entrypoints.slice(0, 2).join(" • ") || "No entrypoint metadata"}
					/>
					<StatCard
						label="Workspace Nodes"
						value={summary.overview.workspaceNodes}
						detail={`${formatNumber.format(summary.overview.externalNodes)} external nodes are available for search and graph views.`}
					/>
				</div>
			</section>

			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<StatCard label="Total nodes" value={summary.overview.totalNodes} detail="Whole analyzed graph, including node_modules when present." />
				<StatCard label="External packages" value={summary.overview.externalPackages} detail="Distinct third-party packages detected in the loaded graph." />
				<StatCard label="Barrel files" value={summary.overview.barrelFiles} detail="Files marked as re-export hubs by the analyzer." />
				<StatCard label="LLM report" value={summary.hasLlm ? 1 : 0} detail={summary.hasLlm ? "Companion summary available for hotspot rankings." : "Only graph data is loaded; rankings use direct edge counts."} />
			</section>

			<section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
				{[...presetRoutes, ...routes].map((route) => {
					const Icon = route.icon;
					return (
						<Link
							key={`${route.to}-${route.title}`}
							to={route.to}
							search={route.search}
							className="group rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_24px_70px_-34px_rgba(14,165,233,0.45)] dark:border-slate-800 dark:bg-slate-950/70"
						>
							<div className="flex items-start justify-between gap-4">
								<div className="rounded-2xl bg-sky-100 p-3 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
									<Icon className="size-5" />
								</div>
								<ArrowRight className="size-4 text-slate-400 transition group-hover:text-sky-600 dark:group-hover:text-sky-300" />
							</div>
							<h3 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">
								{route.title}
							</h3>
							<p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
								{route.description}
							</p>
						</Link>
					);
				})}
			</section>

			<section className="grid gap-4 xl:grid-cols-3">
				<RankingList title="Hotspots" description={summary.hasLlm ? "Reachable-module hotspots from the companion report." : "Fallback ranking based on direct outgoing imports."} items={summary.hotspots.slice(0, 6)} getLink={(item) => ({ to: "/explorer", search: { selected: item.path, scope: item.path.includes("node_modules") ? "external" : "workspace" } })} />
				<RankingList title="Most imported by" description="Files or modules with the most inbound edges." items={summary.topImportedBy.slice(0, 6)} getLink={(item) => ({ to: "/explorer", search: { selected: item.path, scope: item.path.includes("node_modules") ? "external" : "workspace" } })} />
				<RankingList title="Top clusters" description="Largest package or cluster groupings in the loaded graph." items={summary.topClusters.slice(0, 6)} getLink={(item) => ({ to: "/graph", search: { cluster: item.label, externalGrouping: "package" } })} />
			</section>
		</div>
	);
}

const presetRoutes: RouteCard[] = [
	{
		to: "/graph",
		search: { scope: "workspace" as const },
		title: "Monorepo graph",
		description: "Start from workspace files only when external noise is getting in the way.",
		icon: Network,
	},
	{
		to: "/graph",
		search: { scope: "external" as const, externalGrouping: "package" as const },
		title: "node_modules graph",
		description: "Open a dependency-package view where external files are grouped by package instead of one big node_modules blob.",
		icon: Network,
	},
	{
		to: "/imports",
		search: { scope: "external" as const },
		title: "External import hunt",
		description: "Jump straight into package-focused search when you are tracking third-party usage.",
		icon: GitBranchPlus,
	},
] as const;
