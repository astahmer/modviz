import path from "node:path";
import { writeFileSync } from "node:fs";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

export async function generateAiAnalysis(options: {
	baseUrl?: string;
	markdown: string;
	model?: string;
	outputFile: string;
}) {
	const apiKey = process.env.MODVIZ_LLM_API_KEY ?? process.env.OPENAI_API_KEY;
	if (!apiKey) {
		throw new Error(
			"Missing MODVIZ_LLM_API_KEY or OPENAI_API_KEY. Set one before using --llm-analyze.",
		);
	}

	const modelName = options.model ?? process.env.MODVIZ_LLM_MODEL ?? "gpt-4.1-mini";
	const baseURL = options.baseUrl ?? process.env.MODVIZ_LLM_BASE_URL;
	const openai = createOpenAI({
		apiKey,
		baseURL,
	});

	const result = await generateText({
		model: openai(modelName),
		temperature: 0.2,
		system:
			"You are analyzing a module dependency graph. Produce a terse engineering report with these sections: Executive summary, Architectural risks, Dependency hotspots, Suggested next actions. Ground every claim in the provided report. Avoid fluff.",
		prompt: `Analyze this module dependency report and write an actionable engineering summary.\n\n${options.markdown}`,
	});

	const parsed = path.parse(options.outputFile);
	const analysisPath = path.join(parsed.dir, `${parsed.name}.llm.ai.md`);
	writeFileSync(analysisPath, result.text);

	return {
		analysisPath,
		modelName,
	};
}
