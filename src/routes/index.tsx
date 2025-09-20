import fs from "node:fs";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useEffect } from "react";
import type { ModvizOutput } from "../../mod/types";
import { GraphCommandMenu } from "~/components/graph/graph-command-menu";
import {
	focusedNodeIdAtom,
	highlightedNodeIdAtom,
	isFocusedModalOpenedAtom,
} from "~/components/graph/common/use-graph-atoms";
import { Button } from "~/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAtom } from "@xstate/store/react";
import { LuCross, LuX } from "react-icons/lu";
import { z } from "zod/v4";
import { Flamegraph } from "~/components/graph/flamegraph";

const fetchGraphData = createServerFn().handler(async (ctx) => {
	const data = fs.readFileSync(import.meta.env.modvizPath, "utf-8");
	return JSON.parse(data) as ModvizOutput;
});

const Sigma = lazy(() =>
	import("../components/graph/modviz-sigma").then((module) => ({
		default: module.ModvizSigma,
	})),
);

export const Route = createFileRoute("/")({
	ssr: false,
	validateSearch: z.object({
		nodePath: z.string().optional(),
	}),
	loader: () => {
		return fetchGraphData();
	},
	component: Home,
});

function Home() {
	const graphData = Route.useLoaderData();
	console.log(graphData);

	const focusedValue = useAtom(focusedNodeIdAtom);
	const isFocusedModalOpened = useAtom(isFocusedModalOpenedAtom);

	// const navigate = Route.useNavigate();
	// useEffect(() => {
	// 	if (!focusedValue) return;
	// 	navigate({
	// 		to: ".",
	// 		search: {
	// 			nodePath: focusedValue,
	// 		},
	// 	});
	// }, [focusedValue]);

	return (
		<div className="h-full min-h-0 flex flex-col overflow-hidden">
			<div className="p-2 flex gap-4 items-center">
				<div className="flex gap-2 text-lg">Home</div>
				{false && focusedValue && (
					<div className="fixed inset-0 z-50">
						<Flamegraph output={graphData} entryNodeId={focusedValue} />
					</div>
				)}
				<div className="flex gap-2 ml-auto">
					{focusedValue && (
						<div>
							{/* TODO <NotesPanel chain /> */}
							<Button
								variant="default"
								className="items-center gap-2 w-full"
								onClick={() => focusedNodeIdAtom.set(null)}
							>
								{isFocusedModalOpened ? <LuX /> : <ChevronRight />}
								{isFocusedModalOpened ? "Close" : "Open"} details panel
							</Button>
						</div>
					)}
					<div className="min-w-[200px]">
						<GraphCommandMenu
							nodes={graphData.nodes}
							onHighlight={(value) => {
								if (!value) return highlightedNodeIdAtom.set(null);

								const node = graphData.nodes.find(
									(node) => node.path === value,
								);
								if (!node) return;
								highlightedNodeIdAtom.set(value);
							}}
							onSelect={(value) => {
								highlightedNodeIdAtom.set(null);

								if (!value) {
									return focusedNodeIdAtom.set(null);
								}

								const node = graphData.nodes.find(
									(node) => node.path === value,
								);
								if (!node) return;
								console.log(focusedNodeIdAtom.get(), value);
								if (focusedNodeIdAtom.get() === value)
									return focusedNodeIdAtom.set(null);

								focusedNodeIdAtom.set(value);
							}}
						/>
					</div>
				</div>
			</div>
			<Suspense>
				{/* <Sigma nodes={graphData.nodes} edges={graphData.edges} /> */}
				<Sigma
					entryNode={graphData.metadata.entrypoints[0]}
					packages={graphData.metadata.packages}
					nodes={graphData.nodes}
				/>
			</Suspense>
		</div>
	);
}
