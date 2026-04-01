/**
 * Shared URL search parameter parsing utilities
 * Used across routes for consistent validation and fallback handling
 */

export const parseSearchParam = {
	boolean: (value: unknown, fallback: boolean): boolean => {
		if (value === undefined || value === null || value === "") return fallback;
		if (typeof value === "boolean") return value;
		return value === "true";
	},

	number: (value: unknown, fallback: number): number => {
		if (value === undefined || value === null || value === "") return fallback;
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	},

	string: (value: unknown, fallback: string = ""): string => {
		if (typeof value === "string") return value;
		return fallback;
	},

	stringOrUndefined: (value: unknown): string | undefined => {
		return typeof value === "string" ? value : undefined;
	},
};
