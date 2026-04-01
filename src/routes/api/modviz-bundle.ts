import { json } from "@tanstack/react-start";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { loadModvizBundle } from "~/utils/modviz-server";

export const ServerRoute = createServerFileRoute("/api/modviz-bundle").methods({
	GET: async ({ request }) => {
		try {
			const url = new URL(request.url);
			return json(
				loadModvizBundle({
					graphPath: url.searchParams.get("graphPath"),
					snapshotId: url.searchParams.get("snapshotId"),
				}),
			);
		} catch (error) {
			return json(
				{
					error:
						error instanceof Error ? error.message : "Failed to load modviz bundle.",
				},
				{ status: 500 },
			);
		}
	},
});
