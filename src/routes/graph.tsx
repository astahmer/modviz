import { createFileRoute } from "@tanstack/react-router";
import { useAtom } from "@xstate/store/react";
import { lazy, Suspense, useMemo, useState } from "react";
import { ChevronRight, Settings2 } from "lucide-react";
import { GraphCommandMenu } from "~/components/graph/graph-command-menu";
import {
	getDefaultGraphLayoutSettings,
	type GraphLayoutSettings,
} from "~/components/graph/common/graph-layout-settings";
import {
	focusedNodeIdAtom,
	highlightedNodeIdAtom,
	isFocusedModalOpenedAtom,
} from "~/components/graph/common/use-graph-atoms";
import { GraphSettingsPanel } from "~/components/graph/graph-settings-panel";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { Button } from "~/components/ui/button";
import { fetchModvizBundle } from "~/utils/modviz-data";

const Sigma = lazy(() =>
	import("~/components/graph/modviz-sigma").then((module) => ({
		default: module.ModvizSigma,
	})),
);

export const Route = createFileRoute("/graph")({
	ssr: false,
	loader: () => fetchModvizBundle(),
	component: GraphRoute,
});

function GraphRoute() {
	const bundle = Route.useLoaderData();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [layoutSettings, setLayoutSettings] = useState<GraphLayoutSettings>(() =>
		getDefaultGraphLayoutSettings(bundle.graph.nodes.length),
	);
	const focusedValue = useAtom(focusedNodeIdAtom);
	const isFocusedModalOpened = useAtom(isFocusedModalOpenedAtom);
	const sigmaKey = useMemo(() => JSON.stringify(layoutSettings), [layoutSettings]);

	return (
		<ModvizLayout
			title="Bubble Graph"
			description="Force-directed cluster view for spatial exploration. Open this only when you need the full graph canvas, then tune spacing and gravity from the floating settings panel."
			actions={
				<Button variant="outline" onClick={() => setSettingsOpen(true)}>
					<Settings2 className="size-4" />
					Layout settings
				</Button>
			}
		>
			<div className="flex h-[calc(100vh-14rem)] min-h-[680px] flex-col gap-4">
				<section className="flex flex-wrap items-center gap-3 rounded-[24px] border border-slate-200/70 bg-white/90 p-4 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<div className="min-w-[18rem] flex-1">
						<GraphCommandMenu
							nodes={bundle.graph.nodes}
							onHighlight={(value) => {
								if (!value) return highlightedNodeIdAtom.set(null);
								highlightedNodeIdAtom.set(value);
							}}
							onSelect={(value) => {
								highlightedNodeIdAtom.set(null);
								if (!value) return focusedNodeIdAtom.set(null);
								focusedNodeIdAtom.set(
									focusedNodeIdAtom.get() === value ? null : value,
								);
							}}
						/>
					</div>
					{focusedValue ? (
						<Button
							variant="outline"
							onClick={() => focusedNodeIdAtom.set(null)}
						>
							<ChevronRight className="size-4" />
							{isFocusedModalOpened ? "Close details" : "Clear selection"}
						</Button>
					) : null}
					<div className="text-sm text-slate-500 dark:text-slate-400">
						{bundle.graph.nodes.length} nodes, {bundle.graph.metadata.packages.length} workspace packages
					</div>
				</section>
				<section className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_20px_70px_-36px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">Loading graph…</div>}>
						<Sigma
							key={sigmaKey}
							output={bundle.graph}
							entryNode={bundle.graph.metadata.entrypoints[0]}
							layoutSettings={layoutSettings}
							packages={bundle.graph.metadata.packages}
							nodes={bundle.graph.nodes}
						/>
					</Suspense>
				</section>
			</div>
			<GraphSettingsPanel
				open={settingsOpen}
				settings={layoutSettings}
				onOpenChange={setSettingsOpen}
				onSettingsChange={setLayoutSettings}
				onReset={() =>
					setLayoutSettings(
						getDefaultGraphLayoutSettings(bundle.graph.nodes.length),
					)
				}
			/>
		</ModvizLayout>
	);
}
