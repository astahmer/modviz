import { createFileRoute } from "@tanstack/react-router";
import { DashboardView } from "~/components/modviz/dashboard-view";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { fetchModvizBundle } from "~/utils/modviz-data";

export const Route = createFileRoute("/")({
	ssr: false,
	loader: () => {
		return fetchModvizBundle();
	},
	component: Home,
});

function Home() {
	const bundle = Route.useLoaderData();

	return (
		<ModvizLayout
			projectTitle={bundle.projectTitle}
			title="Overview"
			description="Start from a lightweight dashboard, then choose the graph, summary, import-search, or hierarchy view based on the question you are asking."
		>
			<DashboardView bundle={bundle} />
		</ModvizLayout>
	);
}
