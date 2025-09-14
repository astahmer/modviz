import iwanthue from "iwanthue";
import { getRandom } from "~/components/graph/common/random";

const defaultColor = "#E2E2E2";

const colorList = [
	"#FF5733",
	"#3357FF",
	"#FF33A6",
	"#A633FF",
	"#FF8633",
	"#33FF86",
	"#8633FF",
	"#FF3386",
	"#3386FF",
	"#33FFA6",
	"#FF8633",
	"#F3FF33",
	"#3366FF",
	"#FF6633",
	"#3399FF",
	"#FF9966",
	"#9966FF",
	"#5E6BFF",
	"#FE2FB5",
	"#B752F8",
	"#F85252",
	"#A5243D",
	"#edcf8e",
	"#C28CAE",
	"#610F7F",
	"#9BA2FF",
	"#FFDC5E",
	"#FF86C8",
	"#FF69EB",
	"#1CFEBA",
	"#95F2D9",
];

const randomColor = () => {
	const digits = "0123456789abcdef";
	let code = "#";
	for (let i = 0; i < 6; i++) {
		code += digits.charAt(Math.floor(getRandom() * 16));
	}
	return code;
};

// Deterministic color generation using iwanthue
const deterministicColor = (str: string): string => {
	// Generate a single color using iwanthue with the string as seed
	const colors = iwanthue(1, {
		seed: str,
		colorSpace: "all",
		clustering: "force-vector",
	});

	return colors[0] || randomColor();
};

export const colors = {
	default: defaultColor,
	list: colorList,
	random: randomColor,
	deterministic: deterministicColor,
};
