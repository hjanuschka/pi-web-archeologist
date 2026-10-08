# pi-web-archeologist

A pi extension that ports the useful part of
[noamr/web-archeologist](https://github.com/noamr/web-archeologist)
into a single slash command.

## What it does

Registers `/ask_spec_archeologist <question | spec URL | #fragment>`.

On first use in a session it clones the full
[noamr/web-archeologist](https://github.com/noamr/web-archeologist)
repository into `~/.pi/cache/web-archeologist/repo` (pulled again when
older than 24h, offline falls back to the existing checkout) and injects:

- the `skills/web-archeologist/SKILL.md` protocol (front-matter stripped,
  `~/.gemini/cache` rewritten to `~/.pi/cache`)
- an index of the repo's other skills and helper scripts with local
  absolute paths (html-spec-review checks for algorithms/WebIDL/WPT
  coverage, html-spec-splitter), so the agent can read and run them
- your question

then triggers a turn. Subsequent calls only send the question and
reference the already-injected protocol.

No tools, no skill - just context injection when you need it, e.g. while
working on a spec PR:

```
/ask_spec_archeologist why does https://fetch.spec.whatwg.org/#main-fetch check the request's reserved client?
```

## Install

As a pi package (recommended):

```bash
pi package install git:github.com/hjanuschka/pi-web-archeologist
```

Or add to `~/.pi/agent/settings.json`:

```json
{
  "extensions": ["/Users/hjanuschka/lab/pi-web-archeologist/index.ts"]
}
```

Spec clones made by the protocol are cached in `~/.pi/cache/specs`.
