import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ExplorerView } from "~/components/modviz/explorer-view";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { useModvizBundle } from "~/utils/modviz-data";

const explorerSearchSchema = z.object({
	q: z.string().catch(""),
	selected: z.string().catch(""),
	scope: z.enum(["all", "workspace", "external"]).catch("workspace"),
});

export const Route = createFileRoute("/explorer")({
	ssr: false,
	validateSearch: (search) => explorerSearchSchema.parse(search),
	component: ExplorerRoute,
});

function ExplorerRoute() {
	const bundle = useModvizBundle();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<ModvizLayout
			projectTitle={bundle.projectTitle}
			title="File Explorer"
			description="Browse the monorepo or node_modules tree, select any file, then inspect its direct imports and importers without opening the force-directed graph."
		>
			<ExplorerView
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
