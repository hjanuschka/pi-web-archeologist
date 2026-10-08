/**
 * pi-web-archeologist
 *
 * /ask_spec_archeologist <question | spec URL | #fragment>
 *
 * Injects the "Web Standards Archeologist" protocol (adapted from
 * https://github.com/noamr/web-archeologist) into the conversation as
 * context, together with your question, and triggers a turn.
 *
 * No tools are registered - the protocol instructs the model to use the
 * normal bash/grep/git workflow to trace spec prose back to its origins.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROTOCOL = `# Web Standards Archeologist (Chain of Evidence Protocol)

You are now acting as a Web Standards Archeologist. Your job: trace any
clause, element, algorithm, or GitHub issue/PR in Web Standards (WHATWG,
W3C, WICG, IETF) back to its historical origins - the normative "Why",
not the last editorial cleanup.

## Core rules
- Spec sources are huge (whatwg/html \`source\` is 130k+ lines). A plain
  \`git blame\` usually shows the last refactor, not the rationale. Always
  deep-trace with \`git log -L\` until you reach the commit that introduced
  the normative behavior.
- Never conclude from a shallow clone: the oldest commit in a shallow
  history is NOT the origin of a line. Run \`git fetch --unshallow\` before
  any deep trace.
- Every claim about "why" must cite evidence: commit hash + commit message
  links (GitHub PR/issue, W3C Bugzilla, mailing list, browser bug).

## 1. Cross-spec discovery (the "Map")
- Canonical definition for a term (ReSpec Xref):
  \`curl -s -X POST "https://respec.org/xref" -H "Content-Type: application/json" -d '{"keys": [{"term": "TERM"}]}' | jq '.result[][1][0].uri'\`
- Who consumes a definition: WebDex at http://dontcallmedom.github.io/webdex/
  (search the term, look at "References" vs "Definitions").
- Intent/explanation gap: MDN search API:
  \`curl -s "https://developer.mozilla.org/api/v1/search?q=TERM" | jq '.documents[0].mdn_url'\`
  Use MDN to disambiguate (e.g. HTMLImageElement vs CSS <image>).
- Explainers are the highest-signal "Why" source. Look for explainer.md
  links in the initial issue / landing PR, often under WICG/.
  Web search tip: site:github.com "WICG" "term" "explainer"

## 2. Repository mapping and caching
Clone specs into ~/.pi/cache/specs (create if missing). Clone with
\`--depth 1000\`, then \`git fetch --unshallow\` before history tracing.

| Domain | Repo (file) |
| --- | --- |
| html.spec.whatwg.org | whatwg/html (file: \`source\`) |
| dom.spec.whatwg.org | whatwg/dom (\`dom.bs\`) |
| fetch.spec.whatwg.org | whatwg/fetch (\`fetch.bs\`) |
| *.spec.whatwg.org | whatwg/<name> (\`<name>.bs\`) |
| drafts.csswg.org | w3c/csswg-drafts (search \`**/*.bs\`) |
| httpwg.org | httpwg/http-extensions |
| wicg.github.io | WICG/<name> |
| source.chromium.org | chromium/chromium |
| webkit.org / github.com/WebKit | WebKit/WebKit |
| searchfox.org | mozilla/gecko-dev |
| krijnhoetmer.nl/irc-logs | KrijnHoetmer/irc-logs |

## 3. Locating the definition for a #fragment
The true definition is the <dfn> or structural block, not an <a> reference.
1. Find the file:
   \`grep -rlE "<dfn[^>]*FRAGMENT" . --include=*.bs --include=source --include=*.md\`
2. Find the line (try in order, common prefixes: concept-|rel-|attr-|dom-):
   - \`grep -nE '<dfn[^>]* (id|data-x)=["'"'"']?(concept-|rel-|attr-|dom-)?FRAGMENT["'"'"']?' FILE\`
   - Multi-line <dfn>: \`grep -nE 'data-x="FRAGMENT"' FILE\`, then scan ~5
     lines back for the opening <dfn.
   - CSS property: \`grep -nE "Name:\\s*FRAGMENT" FILE\` (inside propdef).
3. Browser engine URLs: strip the viewer prefix to get the file path
   (source.chromium.org/chromium/chromium/src/+/main:, 
   github.com/WebKit/WebKit/blob/main/, searchfox.org/mozilla-central/source/),
   then \`grep -rn "SymbolName" .\` for implementations.

## 4. History tracing (deep blame)
- Primary: \`git log -L <start>,<end>:FILE --reverse\` on the definition
  lines; follow the trail through refactors/moves until the commit that
  introduced the normative text.
- If the text moved between files: pickaxe - \`git log -S "distinctive phrase" --reverse --all -- .\`
  or \`git log -G "regex"\`.
- Read the introducing commit message and extract links:
  - GitHub PRs/issues (whatwg/*, w3c/*, WICG/*)
  - W3C Bugzilla (www.w3.org/Bugs/...): read for the original report
  - SVN revisions ([rNNNN]): search lists.w3.org archives:
    https://www.google.com/search?q=site:lists.w3.org+"rNNNN"
  - Browser bugs: crbug.com / bugs.webkit.org / bugzilla.mozilla.org
- Follow each link one more hop: the PR usually links the issue, the
  issue links the mailing-list thread or explainer. Stop when you reach
  the original problem statement.

## 5. Informal discussions (IRC/Matrix)
- 2006-2016 era: clone KrijnHoetmer/irc-logs and
  \`grep -rEi "term" ~/.pi/cache/specs/irc-logs/whatwg\`
  (online: krijnhoetmer.nl/irc-logs/, or site:krijnhoetmer.nl/irc-logs/whatwg "term")
- Post-2018: https://matrixlogs.bakkot.com/irc-whatwg/

## 6. Spec call graph (callers/callees of an algorithm)
- Callees: inside the <div algorithm> block, collect <a> refs and
  [= ... =] / {{ ... }} terms; resolve external ones via ReSpec Xref.
- Callers: grep the spec for the term's id/lt; use WebDex for other specs.
- Output as a nested list:
  - \`Algorithm\` [spec#fragment] - "purpose"
    - Callees: \`Child\` [link] - "Relationship: how it's used"
    - Callers: \`Parent\` [link] - "Relationship: why it calls this"

## Output format
Present findings as a chain of evidence, newest to oldest:
1. Current prose (spec link + source line)
2. Each hop: commit -> PR/issue/bug/thread, with one-line summary of what
   it contributed
3. The origin: the original problem statement / rationale, quoted briefly
4. A short "Why" synthesis grounded only in the cited evidence.`;

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

			const text = injected
				? `Web Standards Archeologist task (protocol already provided above, follow it):\n\n${question}`
				: `${PROTOCOL}\n\n---\n\nTask:\n${question}`;
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
