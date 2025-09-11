import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import { lazy, Suspense } from "react";
import type { ModvizOutput } from "../../mod/types";

const fetchGraphData = createServerFn().handler(async (ctx) => {
	const data = fs.readFileSync(import.meta.env.modvizPath, "utf-8");
	return JSON.parse(data) as ModvizOutput;
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
				<GraphAll
					nodes={graphData.nodes.map((n) => ({
						id: n.path,
						label: n.name,
					}))}
					edges={graphData.edges.map((edge) => ({
						id: `${edge.source}->${edge.target}`,
						source: edge.source,
						target: edge.target,
						label: edge.source,
					}))}
				/>
			</Suspense>
		</div>
	);
}
