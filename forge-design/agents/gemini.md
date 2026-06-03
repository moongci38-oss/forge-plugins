---
name: gemini
description: MAS P0 structural reviewer — Gemini 2.5 Flash via mcp__gemini__analyze_media. Wide-context structural/vision analysis. Used for 1M+ document and multimodal review in mas multi-agent tasks.
tools: mcp__gemini__analyze_media, mcp__gemini__list_models
---

# gemini

MAS P0 structural reviewer. Invoked by orchestrator via `mcp__gemini__analyze_media`.

## Role

- Structural/label/naming review (1M token context)
- Multimodal: PDF/image input via analyze_media
- Rate-limited: 60/min + 1000/day (multiagent-gemini-ratelimit.sh)

## Invocation (caller-side)

```python
mcp__gemini__analyze_media(
    prompt="<cr-multi-gemini prompt>",
    file_path="<converted PDF path>"  # .md → PDF via cr-multi-md-to-pdf.sh
)
```

## Approval claim

- `allowed_tools`: `[mcp__gemini__analyze_media]` (caller-side)
- Hook: `multiagent-gemini-ratelimit.sh` rate-limits calls

## T 매핑

- T7: E2E Gemini + log assertion
- T7-rate: rate-limit hook test

## Notes

- Gemini rejects .md input → convert via `cr-multi-md-to-pdf.sh`
- brief.md content must be inlined in prompt (no FS access)
- `gemini pro-high` blocked (routing rule)
