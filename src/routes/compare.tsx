import { createFileRoute } from "@tanstack/react-router";
import { CompareView } from "~/components/modviz/compare-view";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { useModvizBundle } from "~/utils/modviz-data";

export const Route = createFileRoute("/compare")({
	ssr: false,
	component: CompareRoute,
});

function CompareRoute() {
	const bundle = useModvizBundle();

	return (
		<ModvizLayout
			projectTitle={bundle.projectTitle}
			title="Snapshot Compare"
			description="Compare the currently served graph with another modviz JSON snapshot to see which modules, edges, and packages changed."
		>
			<CompareView currentGraph={bundle.graph} />
		</ModvizLayout>
	);
}
