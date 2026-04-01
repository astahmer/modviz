import { useSigma } from "@react-sigma/core";
import { useLayoutCirclepack } from "@react-sigma/layout-circlepack";
import { useLayoutCircular } from "@react-sigma/layout-circular";
import { LayoutHook, LayoutWorkerHook, WorkerLayoutControl } from "@react-sigma/layout-core";
import { useLayoutForce, useWorkerLayoutForce } from "@react-sigma/layout-force";
import { useLayoutForceAtlas2, useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { useLayoutNoverlap, useWorkerLayoutNoverlap } from "@react-sigma/layout-noverlap";
import { useLayoutRandom } from "@react-sigma/layout-random";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaProjectDiagram } from "react-icons/fa";
import { LuRefreshCcw } from "react-icons/lu";
import { animateNodes } from "sigma/utils";

type LayoutName =
	| "circular"
	| "circlepack"
	| "random"
	| "noverlaps"
	| "forceDirected"
	| "forceAtlas";

export const LayoutsControl: React.FC = () => {
	const [selectedLayout, setSelectedLayout] = useState<LayoutName>("noverlaps");
	const [opened, setOpened] = useState<boolean>(false);

	const sigma = useSigma();
	const layoutCircular = useLayoutCircular();
	const layoutCirclepack = useLayoutCirclepack();
	const layoutRandom = useLayoutRandom();
	const layoutNoverlap = useLayoutNoverlap({
		settings: {
			// expansion: 100,
			// margin: 10000,
			gridSize: 1,
			// ratio: 10,
		},
		// inputReducer: (key, attr) => ({ x: attr.x * 100, y: attr.y * 100 }),
	});
	const layoutForce = useLayoutForce({ maxIterations: 100 });
	const layoutForceAtlas2 = useLayoutForceAtlas2({
		iterations: 100,
		settings: {
			gravity: 0.5, // Lower gravity to allow clusters to spread out
			scalingRatio: 30, // Higher scaling for better separation
			strongGravityMode: false, // Allow more natural clustering
			slowDown: 5, // Faster convergence
			outboundAttractionDistribution: true, // Better for clustered graphs
			linLogMode: true, // Better for clustered networks
		},
	});
	const workerNoverlap = useWorkerLayoutNoverlap();
	const workerForce = useWorkerLayoutForce();
	const workerForceAtlas2 = useWorkerLayoutForceAtlas2();

	const layouts = useMemo(() => {
		return {
			circular: {
				layout: layoutCircular,
			},
			circlepack: {
				layout: layoutCirclepack,
			},
			random: {
				layout: layoutRandom,
			},
			noverlaps: {
				layout: layoutNoverlap,
				worker: workerNoverlap,
			},
			forceDirected: {
				layout: layoutForce,
				worker: workerForce,
			},
			forceAtlas: {
				layout: layoutForceAtlas2,
				worker: workerForceAtlas2,
			},
		} as { [key: string]: { layout: LayoutHook; worker?: LayoutWorkerHook } };
	}, [
		layoutCirclepack,
		layoutCircular,
		layoutForce,
		layoutForceAtlas2,
		layoutNoverlap,
		layoutRandom,
		workerForce,
		workerNoverlap,
		workerForceAtlas2,
	]);

	useEffect(() => {
		const close = () => {
			setOpened(false);
		};
		if (opened === true) {
			setTimeout(() => document.addEventListener("click", close), 0);
		}
		return () => document.removeEventListener("click", close);
	}, [opened]);

	const isRefreshingRef = useRef(false);
	const refreshLayout = () => {
		if (isRefreshingRef.current) return;
		const { positions } = layouts[selectedLayout].layout;
		animateNodes(sigma.getGraph(), positions(), { duration: 1000 }, () => {
			isRefreshingRef.current = false;
		});
	};

	return (
		<div className="react-sigma-control">
			<button onClick={refreshLayout}>
				<LuRefreshCcw />
			</button>
			<button onClick={() => setOpened((e) => !e)}>
				<FaProjectDiagram />
			</button>
			{opened === true && (
				<ul
					style={{
						position: "absolute",
						bottom: 0,
						right: "35px",
						backgroundColor: "#e7e9ed",
						margin: 0,
						padding: 0,
						listStyle: "none",
					}}
				>
					{Object.keys(layouts).map((name) => {
						return (
							<li key={name}>
								<button
									className="btn btn-link"
									style={{
										fontWeight: selectedLayout === name ? "bold" : "normal",
										width: "100%",
									}}
									onClick={() => {
										setSelectedLayout(name as LayoutName);
										refreshLayout();
									}}
								>
									{name}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
};
