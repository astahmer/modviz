import { json } from "@tanstack/react-start";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { getModvizJsonStatus } from "~/utils/modviz-server";

export const ServerRoute = createServerFileRoute("/api/json-status").methods({
	GET: async () => {
		return json(getModvizJsonStatus());
	},
});
