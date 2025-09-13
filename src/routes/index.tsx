import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import fs from "node:fs";
import { lazy, Suspense } from "react";
import type { ModvizOutput } from "../../mod/types";

const fetchGraphData = createServerFn().handler(async (ctx) => {
	const data = fs.readFileSync(import.meta.env.modvizPath, "utf-8");
	return JSON.parse(data) as ModvizOutput;
});

const Sigma = lazy(() =>
	import("../components/modviz-sigma").then((module) => ({
		default: module.ModvizSigma,
	})),
);

export const Route = createFileRoute("/")({
	ssr: false,
	loader: () => {
		return fetchGraphData();
	},
	component: Home,
});

// network graph js
// https://www.sigmajs.org/storybook/?path=/story/layouts--story&clusters=3&edges-renderer=edges-default&order=5000&size=10000
// https://js.cytoscape.org/
// https://d3-graph-gallery.com/network.html
// https://sim51.github.io/react-sigma/docs/example/controls

function Home() {
	const graphData = Route.useLoaderData();
	console.log(graphData);
	return (
		<div className="p-2 h-[800px]">
			<Suspense>
				{/* <Sigma nodes={graphData.nodes} edges={graphData.edges} /> */}
				<Sigma
					entryNode={graphData.metadata.entryPoint}
					packages={graphData.metadata.packages}
					nodes={graphData.nodes}
				/>
			</Suspense>
		</div>
	);
}
