import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { ImportSearchView } from "~/components/modviz/import-search-view";
import { fetchModvizBundle } from "~/utils/modviz-data";

const importSearchSchema = z.object({
	module: z.string().catch(""),
	symbol: z.string().catch(""),
	include: z.string().catch(""),
	exclude: z.string().catch(""),
	mode: z.enum(["contains", "exact", "regex"]).catch("contains"),
	scope: z.enum(["all", "workspace", "external"]).catch("all"),
	preset: z.string().catch(""),
});

export const Route = createFileRoute("/imports")({
	ssr: false,
	validateSearch: (search) => importSearchSchema.parse(search),
	loader: () => fetchModvizBundle(),
	component: ImportsRoute,
});

function ImportsRoute() {
	const bundle = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<ModvizLayout
			title="Import Search"
			description="Search by imported module or symbol, then scope the results to monorepo packages, folders, or specific files with include and exclude filters."
		>
			<ImportSearchView
				bundle={bundle}
				search={search}
				onSearchChange={(patch) =>
					navigate({
						replace: true,
						search: (previous) => ({ ...previous, ...patch }),
					})
				}
			/>
		</ModvizLayout>
	);
}
