import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { fetchModvizBundle } from "~/utils/modviz-data";

const Flamegraph = lazy(() =>
	import("~/components/graph/flamegraph").then((module) => ({
		default: module.Flamegraph,
	})),
);

export const Route = createFileRoute("/hierarchy")({
	ssr: false,
	loader: () => fetchModvizBundle(),
	component: HierarchyRoute,
});

function HierarchyRoute() {
	const bundle = Route.useLoaderData();
	const [entryNodeId, setEntryNodeId] = useState(
		bundle.graph.metadata.entrypoints[0] ?? bundle.graph.nodes[0]?.path ?? "",
	);

	return (
		<ModvizLayout
			title="Hierarchy"
			description="Entrypoint-focused flamegraph for reading dependency hierarchy without the full force-directed canvas."
		>
			<div className="flex h-[calc(100vh-14rem)] min-h-[680px] flex-col gap-4">
				<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-4 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
						<span>Entrypoint or focus node</span>
						<select
							className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							value={entryNodeId}
							onChange={(event) => setEntryNodeId(event.currentTarget.value)}
						>
							{bundle.graph.metadata.entrypoints.map((entrypoint) => (
								<option key={entrypoint} value={entrypoint}>
									{entrypoint}
								</option>
							))}
						</select>
					</label>
				</section>
				<section className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_20px_70px_-36px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">Loading hierarchy…</div>}>
						<Flamegraph output={bundle.graph} entryNodeId={entryNodeId} />
					</Suspense>
				</section>
			</div>
		</ModvizLayout>
	);
}
