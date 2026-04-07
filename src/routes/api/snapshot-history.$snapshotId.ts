import { createFileRoute } from "@tanstack/react-router";
import { loadSnapshotGraph } from "../../../mod/snapshot-history.ts";

export const Route = createFileRoute("/api/snapshot-history/$snapshotId")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					return Response.json(loadSnapshotGraph(params.snapshotId));
				} catch (error) {
					return Response.json(
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
		},
	},
});
