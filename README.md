# pi-web-archeologist

A pi extension that ports the useful part of
[noamr/web-archeologist](https://github.com/noamr/web-archeologist)
into a single slash command.

## What it does

Registers `/ask_spec_archeologist <question | spec URL | #fragment>`.

On first use in a session it injects the "Web Standards Archeologist"
chain-of-evidence protocol (cross-spec discovery via ReSpec Xref/WebDex/MDN,
spec repo mapping, `<dfn>` locating heuristics, `git log -L` deep blame,
Bugzilla/SVN/IRC link extraction, spec call graphs) together with your
question, and triggers a turn. Subsequent calls only send the question
and reference the already-injected protocol.

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

Spec clones are cached in `~/.pi/cache/specs`.
