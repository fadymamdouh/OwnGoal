#!/usr/bin/env python3
"""Export references/rules.json to web/rules.js for the browser engine.

Only the sections the engine reads are shipped, so the browser bundle does not
carry the design notes and rationale text.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEEP = ('game', 'version', 'match', 'physical_cards', 'cards', 'counters',
        'possession_after_successful_defense', 'play_modes', 'match_types_detail')

rules = json.loads((ROOT / 'references' / 'rules.json').read_text(encoding='utf-8'))
subset = {k: rules[k] for k in KEEP}
out = ROOT / 'web' / 'rules.js'
out.write_text(
    "// generated from references/rules.json — do not edit\n"
    f"export const RULES = {json.dumps(subset, ensure_ascii=False)};\n", encoding='utf-8')
print(f"wrote {out.relative_to(ROOT)} (rules v{rules['version']})")
