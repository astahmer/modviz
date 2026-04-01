import { createFileRoute } from "@tanstack/react-router";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { ImportSearchView } from "~/components/modviz/import-search-view";
import { fetchModvizBundle } from "~/utils/modviz-data";

export const Route = createFileRoute("/imports")({
	ssr: false,
	loader: () => fetchModvizBundle(),
	component: ImportsRoute,
});

function ImportsRoute() {
	const bundle = Route.useLoaderData();

	return (
		<ModvizLayout
			title="Import Search"
			description="Search by imported module or symbol, then scope the results to monorepo packages, folders, or specific files with include and exclude filters."
		>
			<ImportSearchView bundle={bundle} />
		</ModvizLayout>
	);
}
