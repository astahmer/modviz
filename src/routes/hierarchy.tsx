import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { LoadingState } from "~/components/ui/loading-state";
import { fetchModvizBundle } from "~/utils/modviz-data";

const Flamegraph = lazy(() =>
	import("~/components/graph/flamegraph").then((module) => ({
		default: module.Flamegraph,
	})),
);

type HierarchySearch = {
	entryNodeId: string;
	includeExternal: boolean;
	maxChildren: number;
	maxDepth: number;
};

const validateHierarchySearch = (search: Record<string, unknown>): HierarchySearch => ({
	entryNodeId: typeof search.entryNodeId === "string" ? search.entryNodeId : "",
	includeExternal:
		search.includeExternal === undefined
			? true
			: search.includeExternal === true || search.includeExternal === "true",
	maxChildren: Number.isFinite(Number(search.maxChildren))
		? Math.round(Number(search.maxChildren))
		: 24,
	maxDepth: Number.isFinite(Number(search.maxDepth))
		? Math.round(Number(search.maxDepth))
		: 6,
});

export const Route = createFileRoute("/hierarchy")({
	ssr: false,
	validateSearch: validateHierarchySearch,
	loader: () => fetchModvizBundle(),
	component: HierarchyRoute,
});

function HierarchyRoute() {
	const bundle = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const entryNodeId =
		search.entryNodeId ||
		bundle.graph.metadata.entrypoints[0] ||
		bundle.graph.nodes[0]?.path ||
		"";
	const updateSearch = (patch: Partial<HierarchySearch>) =>
		navigate({
			replace: true,
			search: (previous) => ({ ...previous, ...patch }),
		});

	return (
		<ModvizLayout
			title="Hierarchy"
			description="Pruned flamegraph for reading dependency hierarchy without freezing the browser. Depth and child limits are URL-backed so you can tune them per investigation."
		>
			<div className="flex h-[calc(100vh-14rem)] min-h-[680px] flex-col gap-4">
				<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-4 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<div className="grid gap-4 lg:grid-cols-4">
						<label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200 lg:col-span-2">
							<span>Entrypoint or focus node</span>
							<select
								className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
								value={entryNodeId}
								onChange={(event) =>
									updateSearch({ entryNodeId: event.currentTarget.value })
								}
							>
								{bundle.graph.metadata.entrypoints.map((entrypoint) => (
									<option key={entrypoint} value={entrypoint}>
										{entrypoint}
									</option>
								))}
							</select>
						</label>
						<label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
							<span>Max depth</span>
							<input
								type="number"
								min={2}
								max={12}
								value={search.maxDepth}
								onChange={(event) =>
									updateSearch({ maxDepth: Number(event.currentTarget.value) || 6 })
								}
								className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							/>
						</label>
						<label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
							<span>Max children per node</span>
							<input
								type="number"
								min={4}
								max={80}
								value={search.maxChildren}
								onChange={(event) =>
									updateSearch({
										maxChildren: Number(event.currentTarget.value) || 24,
									})
								}
								className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							/>
						</label>
					</div>
					<label className="mt-4 inline-flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
						<input
							type="checkbox"
							checked={search.includeExternal}
							onChange={(event) =>
								updateSearch({ includeExternal: event.currentTarget.checked })
							}
						/>
						<span>Include node_modules in the hierarchy slice</span>
					</label>
				</section>
				<section className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_20px_70px_-36px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<Suspense fallback={<LoadingState label="Loading hierarchy…" description="Building a pruned dependency slice for the selected entrypoint." />}>
						<Flamegraph
							output={bundle.graph}
							entryNodeId={entryNodeId}
							options={{
								includeExternal: search.includeExternal,
								maxChildren: search.maxChildren,
								maxDepth: search.maxDepth,
							}}
						/>
					</Suspense>
				</section>
			</div>
		</ModvizLayout>
	);
}
