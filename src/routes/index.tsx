import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import fs from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import { lazy, Suspense } from "react";

const fetchGraphData = createServerFn().handler(async (ctx) => {
	const data = fs.readFileSync(import.meta.env.modvizPath, "utf-8");
	return JSON.parse(data);
});

const GraphAll = lazy(() =>
	import("../components/graph").then((module) => ({
		default: module.GraphAll,
	})),
);

export const Route = createFileRoute("/")({
	ssr: false,
	loader: () => {
		return fetchGraphData();
	},
	component: Home,
});

function Home() {
	const graphData = Route.useLoaderData();
	console.log(graphData);
	return (
		<div className="p-2">
			<h3>Welcome Home!!!</h3>
			<Suspense>
				<GraphAll />
			</Suspense>
		</div>
	);
}
