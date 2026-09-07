#!/usr/bin/env python3
"""
Bundle the browser build into ONE self-contained HTML file.

ES modules are blocked on file:// — the browser treats each local file as its
own security origin, so every import between them is refused. This script
inlines rules, cards, the engine and the UI into a single classic script, which
opens by double-click with no server, no install and no admin rights.

Bot play only: online rooms need Firebase, and Firebase needs http(s).

    python scripts/build_offline.py
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"


def strip_module(src: str) -> str:
    """Turn an ES module into a plain script body."""
    src = re.sub(r"^\s*import\s+.*?;\s*$", "", src, flags=re.M | re.S)
    src = re.sub(r"^\s*export\s+(const|class|function|let)\s", r"\1 ", src, flags=re.M)
    src = re.sub(r"^\s*export\s*\{[^}]*\}\s*;?\s*$", "", src, flags=re.M)
    # Remove 'export function' (one word)
    src = re.sub(r"^\s*export\s+function\s", "function ", src, flags=re.M)
    return src


rules = strip_module((WEB / "rules.js").read_text(encoding="utf-8"))
cards = strip_module((WEB / "cards.js").read_text(encoding="utf-8"))
engine = strip_module((WEB / "engine.js").read_text(encoding="utf-8"))

# ── CSS: concatenate the 4 split files ────────────────────────────────────────
style = ""
for css_file in ["base.css", "lobby.css", "game.css", "components.css"]:
    style += (WEB / "styles" / css_file).read_text(encoding="utf-8") + "\n"

# ── HTML: extract body markup from index.html ─────────────────────────────────
html = (WEB / "index.html").read_text(encoding="utf-8")


def _extract_button(html, id_):
    start = html.find(f'<button id="{id_}"')
    if start < 0:
        return ""
    end = html.index("</button>", start) + len("</button>")
    return html[start:end] + "\n"


def _extract_div(html, id_):
    start = html.find(f'<div id="{id_}"')
    if start < 0:
        return ""
    depth = 0  # noqa: E702
    for m in re.finditer(r"<(/?)div\b", html[start:]):
        depth += 1 if not m.group(1) else -1
        if depth == 0:
            return html[start : start + m.end() + 1]
    return ""


# Overlays sit before .wrap
_pre = html.split('<div class="wrap">')[0]
overlays_html = (
    _extract_button(_pre, "muteBtn")
    + '<div id="why-toast"></div>\n'
    + _extract_div(_pre, "coin-overlay")
    + _extract_div(_pre, "goal-overlay")
)

# Body: between .wrap opening and the <script> tag (or </body>)
body_start = html.index('<div class="wrap">') + len('<div class="wrap">')
# Find the closing </div> for .wrap — it's before the <script> tag
body_end_marker = '<script type="module"'
body_end = html.index(body_end_marker)
# Walk back to find the </div> that closes .wrap
body_chunk = html[body_start:body_end]
body = body_chunk.rsplit("</div>", 1)[0]

# ── JS: read and strip each module in dependency order ────────────────────────
# ui-render.js needs special handling: the state proxy object and initRender()
# aren't needed in the offline build (everything is in one scope).

# Also include onboarding.js (strip module syntax)
onboarding = strip_module((WEB / "onboarding.js").read_text(encoding="utf-8"))

ui_render = (WEB / "js" / "ui-render.js").read_text(encoding="utf-8")
ui_animations = (WEB / "js" / "ui-animations.js").read_text(encoding="utf-8")
ui_game = (WEB / "js" / "ui-game.js").read_text(encoding="utf-8")
ui_lobby = (WEB / "js" / "ui-lobby.js").read_text(encoding="utf-8")
app_js = (WEB / "js" / "app.js").read_text(encoding="utf-8")

# Strip module syntax from each, then remove the state proxy and initRender
# (offline build has everything in one scope, so no proxy needed)
ui_render_stripped = strip_module(ui_render)
# Strip state.xxx refs (single scope, bare vars are fine)
for var in [
    "room",
    "view",
    "fmt",
    "mode",
    "picked",
    "table",
    "feed",
    "lastEvent",
    "drawnCount",
    "sweepTable",
    "lastPossession",
    "cardNo",
    "prevHand",
    "facedown",
    "busyDeck",
    "picks",
]:
    ui_render_stripped = re.sub(r"\bstate\." + var + r"\b", var, ui_render_stripped)
# Remove the state proxy block
ui_render_stripped = re.sub(
    r"const state\s*=\s*\{.*?\};",
    "/* state proxy removed — single-scope offline build */",
    ui_render_stripped,
    flags=re.S,
)
# Remove initRender function
ui_render_stripped = re.sub(
    r"function initRender\(deps\)\s*\{.*?\}",
    "/* initRender removed — single-scope offline build */",
    ui_render_stripped,
    flags=re.S,
)
# Replace late-bound _renderXxx() calls with direct calls
for fn in ["renderBoard", "renderFeed", "renderFan", "renderTable", "renderDeck", "renderHand"]:
    ui_render_stripped = ui_render_stripped.replace(f"_{fn}(", f"{fn}(")
ui_render_stripped = ui_render_stripped.replace("_cardPendingFn()", "_cardPending")
ui_render_stripped = ui_render_stripped.replace("_runAnimations(", "runAnimations(")
# Remove late-bound variable declarations
ui_render_stripped = re.sub(r"^let _render\w+.*?$", "", ui_render_stripped, flags=re.M)
ui_render_stripped = re.sub(r"^let _runAnimations.*?$", "", ui_render_stripped, flags=re.M)
ui_render_stripped = re.sub(r"^let _cardPendingFn.*?$", "", ui_render_stripped, flags=re.M)

ui_animations_stripped = strip_module(ui_animations)
# Same state.xxx → xxx replacement (single scope)
for var in [
    "room",
    "view",
    "fmt",
    "mode",
    "picked",
    "table",
    "feed",
    "lastEvent",
    "drawnCount",
    "sweepTable",
    "lastPossession",
    "cardNo",
    "prevHand",
    "facedown",
    "busyDeck",
    "picks",
]:
    ui_animations_stripped = re.sub(r"\bstate\." + var + r"\b", var, ui_animations_stripped)

ui_game_stripped = strip_module(ui_game)
# In ui-game.js, replace state.xxx with bare xxx (single scope)
for var in [
    "room",
    "view",
    "fmt",
    "mode",
    "picked",
    "table",
    "feed",
    "lastEvent",
    "drawnCount",
    "sweepTable",
    "lastPossession",
    "cardNo",
    "prevHand",
    "facedown",
    "busyDeck",
    "picks",
]:
    ui_game_stripped = re.sub(r"\bstate\." + var + r"\b", var, ui_game_stripped)

ui_lobby_stripped = strip_module(ui_lobby)
# Same state.xxx → xxx replacement
for var in [
    "room",
    "view",
    "fmt",
    "mode",
    "picked",
    "table",
    "feed",
    "lastEvent",
    "drawnCount",
    "sweepTable",
    "lastPossession",
    "cardNo",
    "prevHand",
    "facedown",
    "busyDeck",
    "picks",
]:
    ui_lobby_stripped = re.sub(r"\bstate\." + var + r"\b", var, ui_lobby_stripped)

app_stripped = strip_module(app_js)
# Remove initRender call and import wiring (not needed in single scope)
app_stripped = re.sub(
    r"initRender\(\{.*?\}\);",
    "/* initRender not needed — single scope */",
    app_stripped,
    flags=re.S,
)

# Combine UI JS in dependency order
ui = "\n".join(
    [
        "// ── ui-render.js ──",
        ui_render_stripped,
        "// ── ui-animations.js ──",
        ui_animations_stripped,
        "// ── ui-game.js ──",
        ui_game_stripped,
        "// ── onboarding.js ──",
        onboarding,
        "// alias for the import {init as initOnboarding} that was in the original",
        "const initOnboarding = init;",
        "// ── ui-lobby.js ──",
        ui_lobby_stripped,
        "// ── app.js ──",
        app_stripped,
    ]
)

# A stand-in for net.js Room with the same surface, bot play only.
local_room = """
class Room {
  constructor({onView, onLobby, onError}) {
    Object.assign(this, {onView, onLobby, onError});
    this.game = null; this.seat = 0;
    this.local = true;      // never networked, so leave() has nothing to clean up
    this.isHost = true;
  }
  async leave() { this.game = null; }
  async create(mode, fmt, name) {
    if (fmt !== 'bot') {
      this.onError('النسخة المحلية دي ضد البوت بس.\\n' +
        'اللعب مع صاحبك محتاج الموقع مرفوع — راجع web/README.md');
      return null;
    }
    this.game = new Game({mode, matchType: 'ONE_V_ONE', names: [name || 'انت', 'البوت']});
    this.onLobby({code: 'BOT', started: true, size: 1, players: [
      {seat: 0, name: name || 'انت', bot: false}, {seat: 1, name: 'البوت', bot: true}]});
    this._publish(); this._runBot();
    return 'BOT';
  }
  async join() { this.onError('الدخول بكود محتاج الموقع مرفوع'); return null; }
  _publish() { if (this.game) this.onView(this.game.view(this.seat)); }
  _runBot() {
    const step = () => {
      if (!this.game || this.game.over) return;
      const actor = this.game.seats.map(s => s.index)
        .find(i => this.game.legalActions(i).length);
      if (actor === undefined || actor === this.seat) return;
      const a = botAction(this.game, actor);
      if (!a) return;
      this.game.apply(actor, a);
      this._publish();
      setTimeout(step, 700);
    };
    setTimeout(step, 700);
  }
  submit(action) {
    if (!this.game) return;
    try { this.game.apply(this.seat, action); }
    catch (e) { console.warn('illegal', e.message); this._publish(); return; }
    this._publish(); this._runBot();
  }
  rematch() {
    const names = this.game.seats.map(s => s.name);
    this.game = new Game({mode: this.game.mode, matchType: 'ONE_V_ONE', names});
    this._publish(); this._runBot();
  }
}
"""

# --- embed sounds as base64 data URIs so the offline file is self-contained ---
import base64 as _b64mod

_sounds_dir = WEB / "sounds"
_sound_js = "function _preloadSounds() {}"  # fallback if no sounds folder
if _sounds_dir.exists():
    _lines = ["async function _preloadSounds() {", "  try {", "    const ctx = _ctx();"]
    for _sf in sorted(_sounds_dir.glob("*.mp3")):
        _b64 = _b64mod.b64encode(_sf.read_bytes()).decode()
        _nm = repr(_sf.stem)
        _lines.append(
            f"    _bufs[{_nm}] = await ctx.decodeAudioData("
            f"Uint8Array.from(atob({repr(_b64)}),c=>c.charCodeAt(0)).buffer);"
        )
    _lines += ["  } catch(e) {}", "}"]
    _sound_js = "\n".join(_lines)

out = f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>أون جول — نسخة محلية</title>
<link href="https://fonts.googleapis.com/css2?family=Rakkas&family=Cairo:wght@400;600;700;900&family=Oswald:wght@400;600&display=swap" rel="stylesheet">
<style>{style}</style>
</head>
<body>
{overlays_html}
<div class="wrap">{body}</div>
<script>
// ============ generated by scripts/build_offline.py — do not edit ============
{rules}
{cards}
{engine}
{local_room}
{ui}
{_sound_js}
document.addEventListener('click',function _pc(){{_preloadSounds();document.removeEventListener('click',_pc);}},{{once:true}});
</script>
</body>
</html>
"""
target = ROOT / "owngoal-offline.html"
target.write_text(out, encoding="utf-8")
print(f"wrote {target.name} ({len(out) // 1024} KB, single file, no server needed)")
