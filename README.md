# pi-web-archeologist

A pi extension that ports the useful part of
[noamr/web-archeologist](https://github.com/noamr/web-archeologist)
into a single slash command.

## What it does

Registers `/ask_spec_archeologist <question | spec URL | #fragment>`.

On first use in a session it loads the "Web Standards Archeologist"
protocol straight from
[noamr/web-archeologist](https://github.com/noamr/web-archeologist)
(`skills/web-archeologist/SKILL.md`) and injects it together with your
question, then triggers a turn. Subsequent calls only send the question
and reference the already-injected protocol.

The upstream SKILL.md is cached in `~/.pi/cache/web-archeologist/` and
refreshed when older than 24h; offline use falls back to the cached copy.
The only adaptation applied is stripping the front-matter and rewriting
the Gemini cache path (`~/.gemini/cache` -> `~/.pi/cache`).

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
