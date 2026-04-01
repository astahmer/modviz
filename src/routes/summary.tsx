import { createFileRoute } from "@tanstack/react-router";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { SetupView } from "~/components/modviz/setup-view";
import { SummaryView } from "~/components/modviz/summary-view";
import { isModvizBundleReady, useModvizBundle } from "~/utils/modviz-data";

export const Route = createFileRoute("/summary")({
	ssr: false,
	component: SummaryRoute,
});

function SummaryRoute() {
	const bundle = useModvizBundle();

	return (
		<ModvizLayout
			projectTitle={bundle.projectTitle}
			title="Summary"
			description="Tabular views for hotspots, direct import fan-in and fan-out, cluster sizes, and package-level distribution."
		>
			{isModvizBundleReady(bundle) ? <SummaryView bundle={bundle} /> : <SetupView bundle={bundle} />}
		</ModvizLayout>
	);
}
