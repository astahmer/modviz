import { createFileRoute } from "@tanstack/react-router";
import { CompareView } from "~/components/modviz/compare-view";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { fetchModvizBundle } from "~/utils/modviz-data";

export const Route = createFileRoute("/compare")({
	ssr: false,
	loader: () => fetchModvizBundle(),
	component: CompareRoute,
});

function CompareRoute() {
	const bundle = Route.useLoaderData();

	return (
		<ModvizLayout
			title="Snapshot Compare"
			description="Compare the currently served graph with another modviz JSON snapshot to see which modules, edges, and packages changed."
		>
			<CompareView currentGraph={bundle.graph} />
		</ModvizLayout>
	);
}