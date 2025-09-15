import { createAtom } from "@xstate/store";

export const selectedNodeAtom = createAtom<string | null>(null);
export const hoveredNodeAtom = createAtom<string | null>(null);
