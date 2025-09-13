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
// https://storybook.reagraph.dev/?path=/story/demos-highlight-hover--all
// https://reagraph.dev/docs/getting-started/Layouts#radial-2d

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
					edges={graphData.edges}
				/>
				{/* <GraphAll
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
				/> */}
			</Suspense>
		</div>
	);
}
