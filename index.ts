/**
 * pi-web-archeologist
 *
 * /ask_spec_archeologist <question | spec URL | #fragment>
 *
 * Loads the "Web Standards Archeologist" protocol from
 * https://github.com/noamr/web-archeologist (skills/web-archeologist/SKILL.md),
 * injects it into the conversation as context together with your question,
 * and triggers a turn.
 *
 * The upstream SKILL.md is fetched on first use, cached in
 * ~/.pi/cache/web-archeologist/ and refreshed when older than 24h.
 * Offline use falls back to the cached copy.
 *
 * No tools are registered - the protocol instructs the model to use the
 * normal bash/grep/git workflow to trace spec prose back to its origins.
 */

import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SKILL_URL =
	"https://raw.githubusercontent.com/noamr/web-archeologist/main/skills/web-archeologist/SKILL.md";
const CACHE_FILE = path.join(os.homedir(), ".pi", "cache", "web-archeologist", "SKILL.md");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function adapt(raw: string): string {
	// Strip YAML front-matter
	let text = raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
	// Upstream targets Gemini CLI; use pi's cache location instead
	text = text.replaceAll("~/.gemini/cache", "~/.pi/cache");
	return text;
}

async function loadProtocol(): Promise<string> {
	let cached: string | null = null;
	try {
		const stat = await fs.stat(CACHE_FILE);
		cached = await fs.readFile(CACHE_FILE, "utf8");
		if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) return adapt(cached);
	} catch {
		// no cache yet
	}

	try {
		const res = await fetch(SKILL_URL);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const text = await res.text();
		await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
		await fs.writeFile(CACHE_FILE, text);
		return adapt(text);
	} catch (err) {
		if (cached) return adapt(cached); // stale cache beats no protocol
		throw new Error(`Failed to fetch ${SKILL_URL}: ${err instanceof Error ? err.message : err}`);
	}
}

export default function (pi: ExtensionAPI) {
	let injected = false;

	pi.registerCommand("ask_spec_archeologist", {
		description: "Trace spec prose to its historical origins (Web Standards Archeologist)",
		handler: async (args, ctx) => {
			const question = args.trim();
			if (!question) {
				ctx.ui.notify(
					"Usage: /ask_spec_archeologist <question, spec URL, or #fragment>",
					"warning",
				);
				return;
			}

			let text: string;
			if (injected) {
				text = `Web Standards Archeologist task (protocol already provided above, follow it):\n\n${question}`;
			} else {
				let protocol: string;
				try {
					protocol = await loadProtocol();
				} catch (err) {
					ctx.ui.notify(String(err instanceof Error ? err.message : err), "error");
					return;
				}
				text = `You are now acting as a Web Standards Archeologist. Follow this protocol (from github.com/noamr/web-archeologist):\n\n${protocol}\n\n---\n\nTask:\n${question}`;
			}
			injected = true;

			if (ctx.isIdle()) {
				pi.sendUserMessage(text);
			} else {
				pi.sendUserMessage(text, { deliverAs: "followUp" });
				ctx.ui.notify("Archeologist task queued as follow-up", "info");
			}
		},
	});
}
