import { createAtom } from "@xstate/store";

export const currentNodeIdAtom = createAtom<string | null>(null);
export const isNodeDetailsOpenAtom = createAtom<boolean>(false);
export const highlightedNodeIdAtom = createAtom<string | null>(null);
export const hoveredClusterNameAtom = createAtom<string | null>(null);
export const selectedNodeIdsAtom = createAtom<string[]>([]);
