// Shared formatting utilities to avoid duplication across components
export const formatNumber = new Intl.NumberFormat("en-US");

export const formatNumberValue = (value: number): string => {
	return formatNumber.format(value);
};
