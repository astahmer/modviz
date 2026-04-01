import { json } from "@tanstack/react-start";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { loadModvizBundle } from "~/utils/modviz-server";

export const ServerRoute = createServerFileRoute("/api/modviz-bundle").methods({
	GET: async () => {
		try {
			return json(loadModvizBundle());
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
