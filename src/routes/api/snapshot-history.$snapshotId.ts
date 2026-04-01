import { json } from "@tanstack/react-start";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { loadSnapshotGraph } from "../../../mod/snapshot-history.ts";

export const ServerRoute = createServerFileRoute(
	"/api/snapshot-history/$snapshotId",
).methods({
	GET: async ({ params }) => {
		try {
			return json(loadSnapshotGraph(params.snapshotId));
		} catch (error) {
			return json(
				{
					error:
						error instanceof Error
							? error.message
							: `Failed to load snapshot ${params.snapshotId}.`,
				},
				{ status: 404 },
			);
		}
	},
});
