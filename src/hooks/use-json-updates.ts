import { useRouter } from "@tanstack/react-router";
import { startTransition, useEffect, useRef, useState } from "react";
import { fetchModvizJsonStatus, type ModvizJsonStatus } from "~/utils/modviz-data";

export function useJsonUpdates(intervalMs = 2500) {
	const router = useRouter();
	const lastModifiedRef = useRef<number | null>(null);
	const graphPathRef = useRef<string | null>(null);
	const isRefreshingRef = useRef(false);
	const [status, setStatus] = useState<ModvizJsonStatus | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);

	useEffect(() => {
		let isDisposed = false;

		const poll = async () => {
			try {
				const nextStatus = await fetchModvizJsonStatus();
				if (isDisposed) {
					return;
				}

				setStatus(nextStatus);
				if (graphPathRef.current !== nextStatus.graphPath) {
					graphPathRef.current = nextStatus.graphPath;
					lastModifiedRef.current = nextStatus.lastModified;
					return;
				}

				if (nextStatus.lastModified == null) {
					return;
				}

				if (lastModifiedRef.current == null) {
					lastModifiedRef.current = nextStatus.lastModified;
					return;
				}

				if (nextStatus.lastModified > lastModifiedRef.current && !isRefreshingRef.current) {
					lastModifiedRef.current = nextStatus.lastModified;
					isRefreshingRef.current = true;
					setIsRefreshing(true);

					startTransition(() => {
						void router.invalidate().finally(() => {
							if (isDisposed) {
								return;
							}

							isRefreshingRef.current = false;
							setIsRefreshing(false);
						});
					});
				}
			} catch {
				if (isDisposed) {
					return;
				}

				isRefreshingRef.current = false;
				setIsRefreshing(false);
			}
		};

		void poll();
		const intervalId = window.setInterval(() => {
			void poll();
		}, intervalMs);

		return () => {
			isDisposed = true;
			window.clearInterval(intervalId);
		};
	}, [intervalMs, router]);

	return {
		isRefreshing,
		status,
	};
}
