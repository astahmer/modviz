import { createAtom } from "@xstate/store";

export const focusedNodeIdAtom = createAtom<string | null>(null);
export const isFocusedModalOpenedAtom = createAtom<boolean>(false);
export const highlightedNodeIdAtom = createAtom<string | null>(null);
