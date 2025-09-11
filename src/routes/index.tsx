import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { GraphAll } from "../components/graph";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	return (
		<div className="p-2">
			<h3>Welcome Home!!!</h3>
			<ClientOnly>
				<GraphAll />
			</ClientOnly>
		</div>
	);
}
