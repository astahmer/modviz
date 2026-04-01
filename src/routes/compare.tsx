import { createFileRoute } from "@tanstack/react-router";
import { CompareView } from "~/components/modviz/compare-view";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { useModvizBundle } from "~/utils/modviz-data";

export const Route = createFileRoute("/compare")({
	ssr: false,
	validateSearch: (search: Record<string, unknown>) => ({
		baselineSnapshot:
			typeof search.baselineSnapshot === "string"
				? search.baselineSnapshot
				: "",
	}),
	component: CompareRoute,
});

function CompareRoute() {
	const bundle = useModvizBundle();
	const search = Route.useSearch();

	return (
		<ModvizLayout
			projectTitle={bundle.projectTitle}
			title="Snapshot Compare"
			description="Compare the currently served graph with another modviz JSON snapshot to see which modules, edges, and packages changed."
		>
			<CompareView
				baselineSnapshotId={search.baselineSnapshot}
				currentGraph={bundle.graph}
				history={bundle.history}
			/>
		</ModvizLayout>
	);
}
