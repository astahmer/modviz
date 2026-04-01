import { createAtom } from "@xstate/store";

export const focusedNodeIdAtom = createAtom<string | null>(null);
export const isFocusedModalOpenedAtom = createAtom<boolean>((get) =>
	Boolean(get(focusedNodeIdAtom)),
);
export const highlightedNodeIdAtom = createAtom<string | null>(null);
export const hoveredClusterNameAtom = createAtom<string | null>(null);
export const selectionModeEnabledAtom = createAtom<boolean>(false);
export const selectedNodeIdsAtom = createAtom<string[]>([]);
