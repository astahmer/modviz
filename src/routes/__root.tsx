/// <reference types="vite/client" />
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import * as React from "react";
import appCss from "~/styles/app.css?url";
import { fetchModvizBundle } from "~/utils/modviz-data";
import { DefaultCatchBoundary } from "../components/DefaultCatchBoundary";
import { NotFound } from "../components/NotFound";
import { seo } from "../utils/seo";

export const Route = createRootRoute({
	ssr: false,
	loader: () => fetchModvizBundle(),
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			...seo({
				title: "modviz",
				description: `visualization for module-graph`,
			}),
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{
				rel: "apple-touch-icon",
				sizes: "180x180",
				href: "/apple-touch-icon.png",
			},
			{ rel: "manifest", href: "/site.webmanifest", color: "#fffff" },
		],
	}),
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: () => <NotFound />,
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html>
			<head>
				<HeadContent />
			</head>
			<body className="h-[100vh] flex flex-col">
				{children}
				{/* <TanStackRouterDevtools position="bottom-center" /> */}
				<Scripts />
			</body>
		</html>
	);
}
