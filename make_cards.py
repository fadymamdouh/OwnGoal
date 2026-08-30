#!/usr/bin/env python3
"""
OWN GOAL card generator — "chalk on asphalt".

Reads the deck composition from references/rules.json and renders the full deck
as print-ready HTML. Change a colour or a line here and all 60 cards follow.

    python scripts/make_cards.py            # writes both files
    python scripts/make_cards.py --preview  # preview sheet only

Design direction: the goal kids chalk onto a side-street wall in Cairo. Asphalt
ground, chalk line art, one ink colour per card family. On a split card the
centre line IS a pitch halfway line, with the two faces facing off across it —
which is also literally how the card works.

Print spec: 63 x 88 mm cards, 3 mm bleed, 9 per A4 sheet, cut marks included.
"""

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RULES = json.loads((ROOT / "references" / "rules.json").read_text(encoding="utf-8"))

INK = {
    "attack":  "#E8552E",   # street-cone orange
    "defense": "#2FA98C",   # pitch teal
    "special": "#8C6FE0",   # floodlight violet
    "rare":    "#E0A62F",   # brass whistle
}
ASPHALT = "#1B1E1C"
ASPHALT_2 = "#232725"
CHALK = "#EDE7D9"
CHALK_DIM = "#8E8B80"

# --- chalk icon set: geometric, single stroke, no fills -----------------------
I = {
"PASS":'<circle cx="20" cy="26" r="6"/><path d="M4 14h18M8 9h14"/>',
"INTERCEPTION":'<path d="M4 24h20"/><path d="M18 18l6 6-6 6"/><path d="M28 10v28"/>',
"DRIBBLE":'<path d="M4 34c6 0 6-10 12-10s6 10 12 10"/><circle cx="32" cy="12" r="5"/>',
"TACKLE":'<path d="M4 32h14l4-8"/><path d="M4 32l2 6h12"/><circle cx="31" cy="27" r="6"/>',
"SHOT_GOAL":'<circle cx="14" cy="24" r="6"/><path d="M26 12h12v24H26z"/><path d="M32 12v24M26 24h12"/>',
"GOAL_KEEPER":'<path d="M10 34V18a4 4 0 018 0v-4a3 3 0 016 0v4a3 3 0 016 0v16z"/><path d="M10 34h20"/>',
"SUPER_SHOT":'<circle cx="26" cy="22" r="7"/><path d="M4 12l8 4-8 4M4 26l10 3-10 3"/><path d="M36 10l-4 6h5l-5 8"/>',
"BLOCK_SAVE":'<path d="M8 36V22a3 3 0 016 0v-6a3 3 0 016 0v6"/><circle cx="30" cy="14" r="6"/><path d="M20 22h6"/>',
"ASSIST":'<path d="M4 34c4-16 16-22 28-22"/><path d="M26 8l6 4-6 4"/><circle cx="8" cy="34" r="4"/>',
"GOAL":'<path d="M6 12h28v24H6z"/><path d="M14 12v24M22 12v24M30 12v24M6 20h28M6 28h28"/><circle cx="20" cy="24" r="5"/>',
"PENALTY":'<circle cx="20" cy="14" r="6"/><circle cx="20" cy="34" r="2"/><path d="M20 20v10" stroke-dasharray="3 3"/>',
"FOUL":'<path d="M8 18h16l8-4v14l-8-4H8z"/><path d="M8 18a6 6 0 000 6"/><path d="M32 8l4-4M36 14h6"/>',
"OFFSIDE":'<path d="M12 8v32"/><path d="M12 10l20 5-20 5z"/>',
"BLOCK":'<path d="M10 10v28M20 10v28M30 10v28"/><path d="M4 20h32"/>',
"BLOCK_SHOT":'<path d="M6 36c8-2 12-10 12-18"/><path d="M18 18l8 4"/><circle cx="32" cy="14" r="6"/>',
"OWN_GOAL":'<path d="M6 12h28v24H6z"/><path d="M14 12v24M22 12v24M30 12v24"/><path d="M34 24H16"/><path d="M22 18l-6 6 6 6"/>',
"CHAIN":'<path d="M6 16h14M20 16l-5-4M20 16l-5 4"/><path d="M34 30H20M20 30l5-4M20 30l5 4"/>',
"VAR":'<path d="M6 10h28v20H6z"/><path d="M16 34h12"/><path d="M17 16l8 4-8 4z"/>',
"RESHUFFLE":'<path d="M8 14h20M28 14l-5-4M28 14l-5 4"/><path d="M32 30H12M12 30l5-4M12 30l5 4"/><path d="M4 22h32" stroke-dasharray="2 4"/>',
"END_MATCH":'<circle cx="20" cy="22" r="14"/><path d="M20 12v10l7 5"/><path d="M20 4v4"/>',
}

# --- the deck ----------------------------------------------------------------
# ar: Arabic name · en: Latin name · line: commentary voice · rule: mechanics
C = {
"PASS":       ("باص","PASS","attack","الكرة تتنقل بينهم بهدوء... مفيش أي استعجال.","يتلغى بـ اعتراض · تسلل · بلوك · فاول"),
"INTERCEPTION":("اعتراض","INTERCEPTION","defense","ويقطعها!! في اللحظة المناسبة تمامًا!","يوقف باص وأسيست · بياخد الاستحواذ"),
"DRIBBLE":    ("مراوغة","DRIBBLE","attack","يراوغ الأول... والتاني!! والمدافع على الأرض!","يتلغى بـ تدخل · فاول"),
"TACKLE":     ("تدخل","TACKLE","defense","تدخل حاسم! الكرة أولًا ثم اللاعب!","يوقف مراوغة · بياخد الاستحواذ"),
"SHOT_GOAL":  ("شوطة","SHOT GOAL","attack","يسدد!! الكرة في الشبااااك!!","نجحت = هدف · لازم تكون آخر كارت في السلسلة"),
"GOAL_KEEPER":("حارس مرمى","GOAL KEEPER","defense","الحااارس!! ينقذ فريقه من هدف محقق!","يوقف شوطة · الاستحواذ محايد"),
"SUPER_SHOT": ("سوبر شوط","SUPER SHOT","rare","قذيفة!!! والحارس لم يتحرك من مكانه!","مالوش رد غير Block Save · ولا الفاول بيلغيه"),
"BLOCK_SAVE": ("صد سوبر شوط","BLOCK SAVE","rare","يبعدها بأطراف أصابعه!! إنقاذ كان مستحيلًا!","الرد الوحيد على سوبر شوط · الاستحواذ محايد"),
"ASSIST":     ("أسيست","ASSIST","attack","تمريرة سحرية!! تشق الدفاع نصفين!","2v2 · نجح؟ الاستحواذ لزميلك ويفتح كارت الجول"),
"GOAL":       ("جول","GOAL","attack","جوووول!! يا جماهير أون جول!! الشباك تهتز!","2v2 · بعد أسيست زميلك بس · يتلغى بـ تسلل·VAR·أون جول"),
"PENALTY":    ("بنالتي","PENALTY","rare","الحكم يشير إلى علامة الجزاء!! لا جدال فيها!","العبها بعد فاول عليك = هدف · يتلغى بـ أون جول أو VAR"),
"FOUL":       ("فاول","FOUL","defense","خطأ واضح ومتعمد! أوقف الهجمة بأي ثمن!","يوقف باص·مراوغة·أسيست بس · الاستحواذ يرجع للمهاجم"),
"OFFSIDE":    ("تسلل","OFFSIDE","defense","الراية مرفوعة! سابق للكرة بخطوة كاملة!","يوقف باص·أسيست·شوطة·جول · بياخد الاستحواذ"),
"BLOCK":      ("بلوك","BLOCK","defense","تصدى لها بجسده! والكرة تضيع بين الجميع!","مود الحظ بس · يوقف باص وأسيست · بلا استحواذ"),
"BLOCK_SHOT": ("صد تسديدة","BLOCK SHOT","defense","يرتمي أمام الكرة!! ويمنع هدفًا محققًا!","يوقف شوطة · الاستحواذ محايد"),
"OWN_GOAL":   ("هدف عكسي","OWN GOAL","rare","لااااا!! في شباكه!! كارثة بكل المقاييس!","النقطة تتحسب لك · يشتغل ضد شوطة·جول·بنالتي"),
"CHAIN":      ("استخلاص","CHAIN","special","يستخلصها!! وينهي الهجمة قبل أن تبدأ!","على كروت البناء بس · مبيلغيش أي كارت بيسجل"),
"VAR":        ("في إيه آر","VAR","special","الحكم يتوجه إلى الشاشة... الملعب كله واقف!","راجع هدف·بنالتي·تسلل · وش يأكد وضهر يلغي · مرة لكل حدث"),
"RESHUFFLE":  ("ريشافل","RESHUFFLE","special","تغيير تكتيكي! المدرب غير مرتاح!","بدّل كارتين من الديك · أو 2 مع زميلك في 2v2"),
"END_MATCH":  ("نهاية الماتش","END MATCH","special","صافرة النهاية!! ولا وقت بدل ضائع لأحد!","الماتش يخلص فورًا · متعادل؟ الفوز لخصمك"),
}

CUT = "outline:0.2mm dashed rgba(255,255,255,.18);outline-offset:-0.1mm"


def css(cutguide=CUT):
    return f"""
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;900&family=Rakkas&family=Oswald:wght@400;600&display=swap');
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#3a3d3b;font-family:'Cairo',sans-serif;padding:24px}}
.sheet{{width:210mm;height:297mm;background:#fff;margin:0 auto 20px;padding:4.5mm 10.5mm;
  display:grid;grid-template-columns:repeat(3,63mm);grid-template-rows:repeat(3,88mm);
  gap:0;page-break-after:always}}
.card{{width:63mm;height:88mm;background:{ASPHALT};color:{CHALK};position:relative;
  overflow:hidden;{cutguide}}}
.grain{{position:absolute;inset:0;opacity:.5;
  background:repeating-linear-gradient(48deg,transparent 0 3px,rgba(255,255,255,.02) 3px 4px)}}
.face{{position:absolute;left:0;width:100%;height:44mm;padding:4mm 4.4mm;
  display:flex;flex-direction:column;justify-content:space-between}}
.face.top{{top:0}}
.face.bot{{bottom:0;transform:rotate(180deg)}}
.full{{position:absolute;inset:0;padding:6mm 5mm;display:flex;flex-direction:column;
  align-items:center;text-align:center}}
.en{{font-family:'Oswald',sans-serif;font-size:6.4pt;letter-spacing:.22em;opacity:.7}}
.ar{{font-family:'Rakkas',cursive;font-size:19pt;line-height:1;direction:rtl}}
.ar.sm{{font-size:15pt}}
.full .ar{{font-size:25pt;margin:1.5mm 0}}
.line{{font-size:6.6pt;line-height:1.5;direction:rtl;font-weight:600;opacity:.92}}
.full .line{{font-size:7.6pt;margin-top:auto;padding:0 1mm}}
.rule{{font-size:5.4pt;line-height:1.45;direction:rtl;opacity:.62;font-weight:400}}
.full .rule{{margin-top:2.4mm;border-top:.2mm solid rgba(237,231,217,.22);padding-top:1.6mm;width:100%}}
.hdr{{display:flex;justify-content:space-between;align-items:flex-start;gap:2mm}}
.ico{{flex:0 0 auto}}
.mid{{position:absolute;top:44mm;left:0;width:100%;height:0;z-index:3}}
.mid:before{{content:'';position:absolute;top:0;left:3mm;right:3mm;height:.3mm;
  background:{CHALK};opacity:.32}}
.spot{{position:absolute;top:-4.6mm;left:50%;margin-left:-4.6mm;width:9.2mm;height:9.2mm;
  border-radius:50%;border:.3mm solid rgba(237,231,217,.32);background:{ASPHALT};
  display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;
  font-size:5.6pt;letter-spacing:.06em}}
.tag{{position:absolute;bottom:3.4mm;left:0;width:100%;text-align:center;
  font-family:'Oswald',sans-serif;font-size:5.2pt;letter-spacing:.3em;opacity:.4}}
.back{{background:{ASPHALT};display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:2mm}}
.back .ar{{font-family:'Rakkas',cursive;font-size:30pt;color:{CHALK}}}
.back .en{{font-size:7pt;letter-spacing:.5em}}
.preview{{display:flex;flex-wrap:wrap;gap:26px;justify-content:center;max-width:1180px;margin:0 auto}}
.prev-card{{transform:scale(1.85);transform-origin:top center;margin:0 34px 84px}}
.lbl{{color:#cfcabd;font-size:12px;text-align:center;font-family:'Oswald',sans-serif;
  letter-spacing:.18em;margin-top:6px}}
@media print{{body{{background:#fff;padding:0}}.sheet{{margin:0;box-shadow:none}}}}
"""


def icon(face, size=13, op=.92):
    ink = INK[C[face][2]]
    return (f'<svg class="ico" width="{size}mm" height="{size}mm" viewBox="0 0 40 44" '
            f'fill="none" stroke="{ink}" stroke-width="2.4" stroke-linecap="round" '
            f'stroke-linejoin="round" opacity="{op}">{I[face]}</svg>')


def face_html(f, pos):
    ar, en, kind, line, rule = C[f]
    ink = INK[kind]
    cls = "ar sm" if len(ar) > 9 else "ar"
    return (f'<div class="face {pos}"><div class="hdr"><div>'
            f'<div class="en" style="color:{ink}">{en}</div>'
            f'<div class="{cls}">{ar}</div></div>{icon(f)}</div>'
            f'<div><div class="line">{line}</div>'
            f'<div class="rule">{rule}</div></div></div>')


def split_card(a, d):
    return (f'<div class="card"><div class="grain"></div>{face_html(a,"top")}'
            f'<div class="mid"><div class="spot" style="color:{INK[C[d][2]]}">VS</div></div>'
            f'{face_html(d,"bot")}</div>')


def full_card(f):
    ar, en, kind, line, rule = C[f]
    ink = INK[kind]
    return (f'<div class="card"><div class="grain"></div><div class="full">'
            f'<div class="en" style="color:{ink}">{en}</div>'
            f'<div class="ar">{ar}</div>{icon(f, 21, .95)}'
            f'<div class="line">{line}</div><div class="rule">{rule}</div></div>'
            f'<div class="tag">OWN GOAL</div></div>')


def back_card():
    return ('<div class="card back"><div class="grain"></div>'
            f'<svg width="26mm" height="26mm" viewBox="0 0 40 44" fill="none" stroke="{CHALK}" '
            f'stroke-width="2" stroke-linecap="round" opacity=".85">{I["OWN_GOAL"]}</svg>'
            '<div class="ar">أون جول</div><div class="en">OWN GOAL</div></div>')


# =============================================================================
# Style 2 — risograph / vintage screenprint
# =============================================================================
# Two spot inks on uncoated stock, the way a riso or a two-colour screenprint
# actually works. The signature is MISREGISTRATION: the second pass lands a
# fraction off the first, and where the inks overlap they multiply into a third
# colour nobody mixed. Coarse dot screens instead of tints, no gradients ever.
#
# Ink 1  vermilion  #F1503F   attack, heat, the ball
# Ink 2  ultramarine #1B4E9B  defense, the keeper, the rules
# Overlap             deep aubergine, produced by multiply, never declared
# Stock  newsprint   #F2E8D2

PAPER = "#F2E8D2"
INK_1 = "#F1503F"
INK_2 = "#1B4E9B"
FAMILY_INK = {"attack": INK_1, "defense": INK_2, "special": INK_2,
              "rare": INK_1}


def css_riso(cutguide=CUT):
    return f"""
@import url('https://fonts.googleapis.com/css2?family=Rakkas&family=Cairo:wght@400;600;900&family=Oswald:wght@400;600&display=swap');
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#6E6A5E;font-family:'Cairo',sans-serif;padding:24px}}
.sheet{{width:210mm;height:297mm;background:#fff;margin:0 auto 20px;padding:4.5mm 10.5mm;
  display:grid;grid-template-columns:repeat(3,63mm);grid-template-rows:repeat(3,88mm);
  page-break-after:always}}
.card{{width:63mm;height:88mm;background:{PAPER};color:{INK_2};position:relative;
  overflow:hidden;{cutguide}}}
.tooth{{position:absolute;inset:0;pointer-events:none;opacity:.5;
  background-image:radial-gradient(circle at 50% 50%,rgba(120,100,70,.22) .35px,transparent .4px);
  background-size:1.4px 1.4px}}
.band{{position:absolute;left:0;width:100%;height:9mm;background:{INK_1};
  mix-blend-mode:multiply;display:flex;align-items:center;padding:0 4.2mm}}
.band.b2{{background:{INK_2}}}
.bandsc{{position:absolute;left:0;width:100%;height:3mm;mix-blend-mode:multiply;
  background-image:radial-gradient(circle,{INK_1} .9px,transparent 1px);background-size:2.4px 2.4px}}
.bandsc.b2{{background-image:radial-gradient(circle,{INK_2} .9px,transparent 1px)}}
.en{{font-family:'Oswald',sans-serif;font-weight:600;font-size:7.4pt;letter-spacing:.24em;color:{PAPER}}}
.face{{position:absolute;left:0;width:100%;height:44mm}}
.face.top{{top:0}}
.face.bot{{bottom:0;transform:rotate(180deg)}}
.fbody{{position:absolute;top:12mm;left:0;width:100%;padding:0 4.2mm;
  display:flex;justify-content:space-between;align-items:flex-start;gap:2mm}}
.ar{{font-family:'Rakkas',cursive;font-size:21pt;line-height:.95;direction:rtl;color:{INK_2}}}
.ar.sm{{font-size:16pt}}
.ar.hot{{color:{INK_1};mix-blend-mode:multiply}}
.reg{{position:relative;flex:0 0 auto}}
.reg svg{{display:block}}
.reg svg+svg{{position:absolute;top:.45mm;left:.55mm;mix-blend-mode:multiply}}
.ftext{{position:absolute;bottom:2.6mm;left:0;width:100%;padding:0 4.2mm}}
.line{{font-family:'Cairo',sans-serif;font-weight:900;font-size:7pt;line-height:1.32;
  direction:rtl;color:{INK_2}}}
.rule{{font-size:5.4pt;line-height:1.4;direction:rtl;color:{INK_2};opacity:.72;
  font-weight:600;margin-top:1.2mm;border-top:.25mm solid {INK_1};padding-top:1mm}}
.mid{{position:absolute;top:44mm;left:0;width:100%;height:0;z-index:4}}
.mid:before{{content:'';position:absolute;top:-.15mm;left:0;right:0;height:.35mm;
  background:{INK_1};mix-blend-mode:multiply}}
.spot{{position:absolute;top:-3.6mm;left:50%;margin-left:-3.6mm;width:7.2mm;height:7.2mm;
  border-radius:50%;background:{PAPER};border:.35mm solid {INK_1};display:flex;
  align-items:center;justify-content:center;font-family:'Oswald',sans-serif;
  font-weight:600;font-size:6pt;color:{INK_2};letter-spacing:.04em}}
.full{{position:absolute;inset:0;padding:13mm 5mm 4mm;display:flex;flex-direction:column;
  align-items:center;text-align:center}}
.full .ar{{font-size:27pt;margin-bottom:1.5mm}}
.full .line{{font-size:8pt;margin-top:auto}}
.full .rule{{width:100%;text-align:center}}
.rare{{position:absolute;top:11mm;left:0;width:100%;text-align:center;
  font-family:'Oswald',sans-serif;font-weight:600;font-size:5.6pt;letter-spacing:.34em;color:{INK_1}}}
.back{{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2mm}}
.back .ar{{font-size:34pt;color:{INK_1};mix-blend-mode:multiply}}
.back .en{{color:{INK_2};font-size:8pt;letter-spacing:.5em}}
.stripe{{position:absolute;left:0;width:100%;height:4mm;mix-blend-mode:multiply;
  background:repeating-linear-gradient(90deg,{INK_2} 0 3mm,transparent 3mm 6mm)}}
.preview{{display:flex;flex-wrap:wrap;justify-content:center;max-width:1180px;margin:0 auto}}
.prev-card{{transform:scale(1.85);transform-origin:top center;margin:0 34px 84px}}
.lbl{{color:{PAPER};font-size:12px;text-align:center;font-family:'Oswald',sans-serif;
  letter-spacing:.2em;margin-top:6px}}
@media print{{body{{background:#fff;padding:0}}.sheet{{margin:0}}}}
"""


def icon_riso(face, size=13):
    """Drawn twice: ink 2 on register, ink 1 knocked half a millimetre off."""
    def one(colour):
        return (f'<svg width="{size}mm" height="{size}mm" viewBox="0 0 40 44" fill="none" '
                f'stroke="{colour}" stroke-width="2.6" stroke-linecap="round" '
                f'stroke-linejoin="round">{I[face]}</svg>')
    return f'<div class="reg">{one(INK_2)}{one(INK_1)}</div>'


def face_riso(f, pos):
    ar, en, kind, line, rule = C[f]
    hot = kind in ("attack", "rare")
    band = "band" if hot else "band b2"
    sc = "bandsc" if hot else "bandsc b2"
    cls = "ar sm" if len(ar) > 9 else "ar"
    if hot:
        cls += " hot"
    return (f'<div class="face {pos}">'
            f'<div class="{band}" style="top:0"><span class="en">{en}</span></div>'
            f'<div class="{sc}" style="top:9mm"></div>'
            f'<div class="fbody"><div class="{cls}">{ar}</div>{icon_riso(f)}</div>'
            f'<div class="ftext"><div class="line">{line}</div>'
            f'<div class="rule">{rule}</div></div></div>')


def split_riso(a, d):
    return (f'<div class="card">{face_riso(a,"top")}'
            f'<div class="mid"><div class="spot">VS</div></div>'
            f'{face_riso(d,"bot")}<div class="tooth"></div></div>')


def full_riso(f):
    ar, en, kind, line, rule = C[f]
    hot = kind in ("attack", "rare")
    band = "band" if hot else "band b2"
    sc = "bandsc" if hot else "bandsc b2"
    tag = '<div class="rare">rare · one of a kind</div>' if kind == "rare" else ""
    cls = "ar hot" if hot else "ar"
    return (f'<div class="card"><div class="{band}" style="top:0">'
            f'<span class="en">{en}</span></div>'
            f'<div class="{sc}" style="top:9mm"></div>{tag}'
            f'<div class="full"><div class="{cls}">{ar}</div>{icon_riso(f, 22)}'
            f'<div class="line">{line}</div><div class="rule">{rule}</div></div>'
            f'<div class="stripe" style="bottom:0"></div><div class="tooth"></div></div>')


def back_riso():
    return ('<div class="card back"><div class="stripe" style="top:0"></div>'
            f'<div class="reg">'
            f'<svg width="26mm" height="26mm" viewBox="0 0 40 44" fill="none" stroke="{INK_2}" '
            f'stroke-width="2.2" stroke-linecap="round">{I["OWN_GOAL"]}</svg>'
            f'<svg width="26mm" height="26mm" viewBox="0 0 40 44" fill="none" stroke="{INK_1}" '
            f'stroke-width="2.2" stroke-linecap="round">{I["OWN_GOAL"]}</svg></div>'
            '<div class="ar">أون جول</div><div class="en">OWN GOAL</div>'
            '<div class="stripe" style="bottom:0"></div><div class="tooth"></div></div>')


# =============================================================================
# Style 3 — street (from the designer's reference sheet)
# =============================================================================
# Faithful to Street_Football_Card_Game.html: dark asphalt cards, 3mm rounded
# corners, per-family gradient grounds, a glow halo behind the icon, a type
# badge and copy count in the header, gradient rules and a bottom bar.
#
# Three deliberate changes from that reference:
#   1. Power badges deleted — the power system no longer exists.
#   2. Emoji icons replaced with the drawn chalk-line icon set (emoji render
#      differently on every device and print as fuzzy colour bitmaps).
#   3. Placeholder Arabic replaced with the commentary flavour lines, plus the
#      real mechanical rule under each one, and the Arabic card name added.

ST = {
    "attack":  ("#D7263D", "#8B0000", "#FF6B35", "#2a0a0a", "#1a0505", "#0d0000", "ATTACK"),
    "defense": ("#1B4F72", "#0D2137", "#2ECC71", "#040e1a", "#081525", "#030b14", "DEFENSE"),
    "special": ("#7D3C98", "#4A235A", "#F1C40F", "#130820", "#0e0518", "#070311", "SPECIAL"),
    "rare":    ("#B8860B", "#6B4E00", "#F1C40F", "#241705", "#170e02", "#0d0700", "RARE"),
}
NOISE = ("url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'"
         "%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' "
         "numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' "
         "height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")")

QTY = {}
for _spec in RULES["physical_cards"]:
    for _f in _spec["faces"]:
        QTY[_f] = _spec["copies"]


def css_street(cutguide=CUT):
    fams = ""
    for k, (c, dk, glow, g1, g2, g3, _lbl) in ST.items():
        fams += f"""
.card.{k}{{background:linear-gradient(155deg,{g1} 0%,{g2} 40%,{g3} 100%)}}
.{k} .badge{{background:{c};color:#fff}}
.{k} .title{{color:{glow}}}
.{k} .divider{{background:linear-gradient(90deg,transparent,{c},transparent)}}
.{k} .halo{{background:radial-gradient(circle,{c}44 0%,transparent 70%)}}
.{k} .botbar{{background:linear-gradient(90deg,{dk},{glow},{dk})}}
.{k} .accent{{background:linear-gradient(90deg,transparent,{glow},transparent)}}"""
    return f"""
@import url('https://fonts.googleapis.com/css2?family=Rakkas&family=Cairo:wght@400;600;700;900&family=Oswald:wght@400;600&display=swap');
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#111;font-family:'Cairo',sans-serif;color:#F0E6D3;padding:20px}}
@page{{size:A4 portrait;margin:8mm}}
.sheet{{display:grid;grid-template-columns:repeat(3,63.5mm);gap:3mm;padding:4mm;
  justify-content:center;page-break-after:always}}
.card{{width:63.5mm;height:88.9mm;border-radius:3mm;overflow:hidden;display:flex;
  flex-direction:column;position:relative;page-break-inside:avoid;{cutguide}}}
.card:before{{content:'';position:absolute;inset:0;background-image:{NOISE};
  z-index:10;pointer-events:none;border-radius:3mm}}
.card:after{{content:'';position:absolute;inset:1.5mm;border-radius:2mm;
  border:.3mm solid rgba(255,255,255,.06);pointer-events:none;z-index:9}}
.hdr{{padding:2.5mm 3mm 1.5mm;display:flex;align-items:center;justify-content:space-between;
  flex-shrink:0}}
.badge{{font-family:'Oswald',sans-serif;font-size:6.5px;letter-spacing:.16em;padding:1px 3px;
  border-radius:1mm;font-weight:600;opacity:.9}}
.qty{{font-size:6.5px;color:#A89880;font-family:'Oswald',sans-serif;letter-spacing:.1em}}
.title{{text-align:center;font-family:'Oswald',sans-serif;font-weight:400;letter-spacing:.22em;
  font-size:7.5px;line-height:1;padding:0 3mm;flex-shrink:0;opacity:.75}}
.title-ar{{text-align:center;font-family:'Rakkas',cursive;font-size:22px;direction:rtl;
  color:#F0E6D3;line-height:1;margin-top:.4mm;flex-shrink:0}}
.divider{{height:.3mm;margin:1.5mm 4mm;flex-shrink:0}}
.iconzone{{flex:1;display:flex;align-items:center;justify-content:center}}
.halo{{width:18mm;height:18mm;border-radius:50%;display:flex;align-items:center;
  justify-content:center}}
.footer{{padding:1.5mm 3mm 2mm;flex-shrink:0}}
.desc{{font-family:'Cairo',sans-serif;font-size:9px;line-height:1.5;text-align:center;
  direction:rtl;font-weight:700;color:#F0E6D3;opacity:.95}}
.rule{{font-family:'Cairo',sans-serif;font-weight:600;font-size:6.5px;line-height:1.45;
  text-align:center;direction:rtl;color:#A89880;margin-top:1.2mm}}
.botbar{{height:2mm;margin-top:1.5mm;border-radius:0 0 2.5mm 2.5mm;flex-shrink:0}}
.card.split{{background:#1A1A2E}}
.split-divider{{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);
  height:.8mm;z-index:20;background:linear-gradient(90deg,transparent 0%,#D7263D 20%,
  #fff 50%,#2ECC71 80%,transparent 100%)}}
.half{{height:50%;display:flex;flex-direction:column;overflow:hidden;position:relative}}
.half.top{{background:linear-gradient(170deg,#2a0a0a 0%,#1a0505 100%);border-radius:3mm 3mm 0 0}}
.half.bot{{background:linear-gradient(170deg,#040e1a 0%,#0d2535 100%);transform:rotate(180deg);
  border-radius:3mm 3mm 0 0}}
.half .title{{font-size:6.5px}}
.half .title-ar{{font-size:17px}}
.half .divider{{margin:1mm 4mm}}
.half .desc{{font-size:8px}}
.half .rule{{font-size:6px;margin-top:.8mm}}
.sbody{{flex:1;display:flex;align-items:center;justify-content:center;padding:0 2.5mm}}
.accent{{height:1.2mm;flex-shrink:0}}
.back{{background:#1A1A2E;align-items:center;justify-content:center;gap:2mm}}
.back .title{{font-size:11px;letter-spacing:.5em;opacity:1;color:#FF6B35}}
.back .title-ar{{font-size:40px;margin-top:1.5mm}}
.preview{{display:flex;flex-wrap:wrap;justify-content:center;max-width:1180px;margin:0 auto}}
.prev-card{{transform:scale(1.85);transform-origin:top center;margin:0 34px 84px}}
.lbl{{color:#888;font-size:12px;text-align:center;font-family:'Oswald',sans-serif;
  letter-spacing:.2em;margin-top:6px}}
{fams}
@media print{{body{{background:#fff;padding:0}}}}
"""


def icon_street(face, kind, size=11):
    glow = ST[kind][2]
    return (f'<svg width="{size}mm" height="{size}mm" viewBox="0 0 40 44" fill="none" '
            f'stroke="{glow}" stroke-width="2.6" stroke-linecap="round" '
            f'stroke-linejoin="round">{I[face]}</svg>')


def half_street(f, pos):
    ar, en, kind, line, rule = C[f]
    return (f'<div class="half {pos}">'
            f'<div class="hdr"><span class="badge">{ST[kind][6]}</span>'
            f'<span class="qty">x{QTY[f]}</span></div>'
            f'<div class="title">{en}</div><div class="title-ar">{ar}</div>'
            f'<div class="divider"></div>'
            f'<div class="sbody"><div class="halo">{icon_street(f, kind, 9)}</div></div>'
            f'<div class="footer"><div class="desc">{line}</div>'
            f'<div class="rule">{rule}</div></div>'
            f'<div class="accent"></div></div>')


def split_street(a, d):
    return (f'<div class="card split">{half_street(a,"top")}'
            f'<div class="split-divider"></div>{half_street(d,"bot")}</div>')


def full_street(f):
    ar, en, kind, line, rule = C[f]
    return (f'<div class="card {kind}"><div class="hdr">'
            f'<span class="badge">{ST[kind][6]}</span><span class="qty">x{QTY[f]}</span></div>'
            f'<div class="title">{en}</div><div class="title-ar">{ar}</div>'
            f'<div class="divider"></div>'
            f'<div class="iconzone"><div class="halo">{icon_street(f, kind, 12)}</div></div>'
            f'<div class="footer"><div class="desc">{line}</div>'
            f'<div class="rule">{rule}</div></div><div class="botbar"></div></div>')


def back_street():
    return ('<div class="card special back">'
            '<div class="iconzone"><div class="halo">'
            + icon_street("OWN_GOAL", "special", 16) +
            '</div></div><div class="title">OWN GOAL</div>'
            '<div class="title-ar">أون جول</div><div class="botbar"></div></div>')


STYLES = {
    "chalk":  (css, split_card, full_card, back_card),
    "riso":   (css_riso, split_riso, full_riso, back_riso),
    "street": (css_street, split_street, full_street, back_street),
}


def deck_cards(style="street"):
    """Every physical card in print order, split cards counted once."""
    _, split, full, _b = STYLES[style]
    out = []
    for spec in RULES["physical_cards"]:
        faces = spec["faces"]
        for _ in range(spec["copies"]):
            out.append(split(faces[0], faces[1]) if spec["type"] == "split"
                       else full(faces[0]))
    return out


def page(title, body, cutguide=CUT, style="street"):
    sheet_css = STYLES[style][0](cutguide)
    return (f'<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
            f'<title>{title}</title><style>{sheet_css}</style></head>'
            f'<body>{body}</body></html>')


def build_print(cutguide=CUT, style="street"):
    cards = deck_cards(style) + [STYLES[style][3]()]
    sheets = []
    for i in range(0, len(cards), 9):
        chunk = cards[i:i + 9]
        chunk += ['<div class="card" style="background:#fff;outline:none"></div>'] * (9 - len(chunk))
        sheets.append('<div class="sheet">' + "".join(chunk) + "</div>")
    return page("OWN GOAL — print sheets", "".join(sheets), cutguide, style)


def build_preview(style="street"):
    _c, split, full, back = STYLES[style]
    picks = [
        (split("PASS", "INTERCEPTION"), "split · pass / interception"),
        (split("SUPER_SHOT", "BLOCK_SAVE"), "split · rare"),
        (full("OWN_GOAL"), "full · rare"),
        (full("VAR"), "full · special"),
        (full("FOUL"), "full · defense"),
        (back(), "card back"),
    ]
    body = '<div class="preview">' + "".join(
        f'<div class="prev-card">{c}<div class="lbl">{l}</div></div>' for c, l in picks
    ) + "</div>"
    return page("OWN GOAL — design preview", body, "", style)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "out"))
    ap.add_argument("--style", default="street", choices=["street", "riso", "chalk"])
    ap.add_argument("--final", action="store_true",
                    help="drop the dashed cut guides (use once you move to a real printer)")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"owngoal-cards-preview-{a.style}.html").write_text(
        build_preview(a.style), encoding="utf-8")
    (out / f"owngoal-cards-print-{a.style}.html").write_text(
        build_print("" if a.final else CUT, a.style), encoding="utf-8")
    n = len(deck_cards(a.style))
    print(f"{n} cards + 1 back written to {out} in {a.style} style")
