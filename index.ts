/**
 * pi-web-archeologist
 *
 * /ask_spec_archeologist <question | spec URL | #fragment>
 *
 * Clones the full https://github.com/noamr/web-archeologist repository
 * (protocol SKILL.md files plus helper python scripts) into
 * ~/.pi/cache/web-archeologist/repo, pulls when older than 24h, and
 * injects the web-archeologist protocol together with an index of the
 * repo's other skills/scripts and your question, then triggers a turn.
 *
 * No tools are registered - the protocol instructs the model to use the
 * normal bash/grep/git workflow to trace spec prose back to its origins,
 * and it can read/run the cloned helper scripts directly.
 */

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const run = promisify(execFile);

const REPO_URL = "https://github.com/noamr/web-archeologist.git";
const REPO_DIR = path.join(os.homedir(), ".pi", "cache", "web-archeologist", "repo");
const SKILL_FILE = path.join(REPO_DIR, "skills", "web-archeologist", "SKILL.md");
const PULL_TTL_MS = 24 * 60 * 60 * 1000;

async function exists(p: string): Promise<boolean> {
	try {
		await fs.stat(p);
		return true;
	} catch {
		return false;
	}
}

async function ensureRepo(): Promise<void> {
	if (await exists(path.join(REPO_DIR, ".git"))) {
		// Refresh at most once per TTL; offline failures keep the old checkout.
		try {
			const head = await fs.stat(path.join(REPO_DIR, ".git", "FETCH_HEAD"));
			if (Date.now() - head.mtimeMs < PULL_TTL_MS) return;
		} catch {
			// never fetched since clone
		}
		try {
			await run("git", ["-C", REPO_DIR, "pull", "--ff-only", "--quiet"]);
		} catch {
			// offline or upstream problem: use existing checkout
		}
		return;
	}

	await fs.mkdir(path.dirname(REPO_DIR), { recursive: true });
	await run("git", ["clone", "--quiet", REPO_URL, REPO_DIR]);
}

async function listRepoFiles(): Promise<string[]> {
	const { stdout } = await run("git", ["-C", REPO_DIR, "ls-files"]);
	return stdout.split("\n").filter(Boolean);
}

function adapt(raw: string): string {
	// Strip YAML front-matter
	let text = raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
	// Upstream targets Gemini CLI; use pi's cache location instead
	text = text.replaceAll("~/.gemini/cache", "~/.pi/cache");
	return text;
}

async function buildProtocol(): Promise<string> {
	await ensureRepo();

	if (!(await exists(SKILL_FILE))) {
		throw new Error(`Missing ${SKILL_FILE} - upstream repo layout changed?`);
	}
	const protocol = adapt(await fs.readFile(SKILL_FILE, "utf8"));

	const files = await listRepoFiles();
	const extras = files
		.filter((f) => !f.startsWith("skills/web-archeologist/") && f !== "README.md")
		.map((f) => `- ${path.join(REPO_DIR, f)}`)
		.join("\n");

	return [
		"You are now acting as a Web Standards Archeologist. Follow this protocol (from github.com/noamr/web-archeologist):",
		"",
		protocol,
		"",
		"---",
		"",
		`The full web-archeologist repository is checked out locally at:\n${REPO_DIR}`,
		"",
		"It contains additional skills and helper scripts you can read and execute when relevant (e.g. html-spec-review checks for algorithms/WebIDL/WPT coverage, html-spec-splitter for chunking the huge HTML spec source):",
		extras,
		"",
		"Read the corresponding SKILL.md before running any of these scripts.",
	].join("\n");
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
				text = `Web Standards Archeologist task (protocol already provided above, follow it; repo checkout: ${REPO_DIR}):\n\n${question}`;
			} else {
				ctx.ui.setStatus("archeologist", "Syncing noamr/web-archeologist...");
				try {
					const protocol = await buildProtocol();
					text = `${protocol}\n\n---\n\nTask:\n${question}`;
				} catch (err) {
					ctx.ui.notify(String(err instanceof Error ? err.message : err), "error");
					return;
				} finally {
					ctx.ui.setStatus("archeologist", undefined);
				}
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
