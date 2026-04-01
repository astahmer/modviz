import { createFileRoute } from "@tanstack/react-router";
import { DashboardView } from "~/components/modviz/dashboard-view";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { SetupView } from "~/components/modviz/setup-view";
import { isModvizBundleReady, useModvizBundle } from "~/utils/modviz-data";

export const Route = createFileRoute("/")({
	ssr: false,
	component: Home,
});

function Home() {
	const bundle = useModvizBundle();

	return (
		<ModvizLayout
			projectTitle={bundle.projectTitle}
			title="Overview"
			description="Start from a lightweight dashboard, then choose the graph, summary, import-search, or hierarchy view based on the question you are asking."
		>
			{isModvizBundleReady(bundle) ? <DashboardView bundle={bundle} /> : <SetupView bundle={bundle} />}
		</ModvizLayout>
	);
}
