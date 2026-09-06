// onboarding.js — carousel (first visit) + rules modal (always available)
// Uses CSS variables from the main game and imports card data from cards.js

import {CARDS, ICONS, FAMILY, GLOW, QTY} from './cards.js';

const LS_KEY = 'og_onboarding_done';

// ─── Slide content ───────────────────────────────────────────────────────────
const SLIDES = [
  {
    icon: 'logo', // special: render the logo image
    titleAr: 'أون جول',
    titleEn: 'OWN GOAL',
    bodyAr: '٦٠ كارت كورة. أول واحد يجيب ٣ أجوال يكسب.\nكل هجمة بتتحسم بكارت واحد صح.',
    bodyEn: '60 football cards. First to 3 goals wins.\nEvery attack is decided by one right card.',
  },
  {
    icon: '🔀',
    titleAr: 'الكارت المقسوم',
    titleEn: 'Split Cards',
    bodyAr: 'نص كروتك مقسومة — هجوم من ناحية ودفاع من التانية.\nلما تلعب أي ناحية الكارت كله بيتحرق.\nكل باص بتلعبه بتحرق بيه اعتراض كنت هتحتاجه.',
    bodyEn: 'Half your cards are split — attack on one side, defense on the other.\nPlay either side and the whole card is burned.\nEvery Pass you play burns an Interception you\'ll need later.',
  },
  {
    icon: '⚔️',
    titleAr: 'الهجوم والدفاع',
    titleEn: 'Attack vs Defense',
    bodyAr: 'المهاجم بيلعب كارت هجومي. المدافع لازم يرد بكارت — حتى لو ملوش رد صح.\nالكارت الصح بيوقف الهجمة، الغلط بيتحرق ببلاش.',
    bodyEn: 'Attacker plays an attack card. Defender must answer with a card — even with no valid counter.\nThe right card stops the attack; the wrong one burns for nothing.',
  },
  {
    icon: '🔗',
    titleAr: 'السلسلة',
    titleEn: 'The Chain',
    bodyAr: 'الهجمة مش كارت واحد — دي سلسلة.\nباص ← مراوغة ← شوطة. كل كارت لازم يتردّ عليه.\nنجحت السلسلة لحد الشوطة؟ جووووول!',
    bodyEn: 'An attack is a chain: Pass → Dribble → Shot.\nEach card must be answered.\nSurvive to the Shot? GOOOAL!',
  },
  {
    icon: '📺',
    titleAr: 'الـ VAR والخاصة',
    titleEn: 'VAR & Specials',
    bodyAr: 'الفاول بيرجّع الاستحواذ للمهاجم + بيفتح كارت بنالتي = هدف مؤكد إلا لو اترد عليه بأون جول أو VAR.\nالـ VAR بيراجع الأهداف والبنالتي بعملة — ٥٠/٥٠.\nالأون جول بيحوّل الهدف لصالح اللي لعبه ضدك.',
    bodyEn: 'Foul returns possession to attacker + triggers Penalty = guaranteed goal unless countered by Own Goal or VAR.\nVAR reviews Goals & Penalties with a coin flip — 50/50.\nOwn Goal converts a goal against you.',
  },
  {
    icon: '👥',
    titleAr: '١ ضد ١ و ٢ ضد ٢',
    titleEn: '1v1 & 2v2',
    bodyAr: '١ ضد ١: كروت الأسيست والجول مش موجودة — الشوطة هي اللي بتسجّل.\n٢ ضد ٢: الأسيست بتنقل الاستحواذ لزميلك، وبيلعب كارت الجول عشان يسجّل.\nفي المودين: كل لاعب في إيده ٤ كروت — مبتكبرش ومبتصغرش.',
    bodyEn: '1v1: Assist & Goal cards are removed — Shot is what scores.\n2v2: Assist passes possession to your teammate, who plays Goal to score.\nIn both modes: each player holds exactly 4 cards — never more, never less.',
  },
];

// ─── Rules content (bilingual) ──────────────────────────────────────────────
const RULES_SECTIONS = [
  {
    id: 'overview',
    titleAr: 'نظرة عامة', titleEn: 'Overview',
    bodyAr: `٦٠ كارت كورة بالمصري. مودين: حظ أو تكتيك. ١ ضد ١ أو ٢ ضد ٢. أول واحد يجيب ٣ أجوال يكسب.\n\nكل لاعب في إيده ٤ كروت طول الماتش — مبتكبرش ومبتصغرش. قبل ما تلعب، بتسحب كارت، وبعدين بتلعب كارت. المدافع لازم يرد بكارت حتى لو ملوش رد صح.\n\nنص الكروت مقسومة — وش هجوم وضهر دفاع. لما تلعب أي ناحية، الكارت كله بيتحرق. دي التكلفة اللي اللعبة كلها بتدور حواليها.`,
    bodyEn: `60 football cards in Egyptian Arabic. Two modes: Luck or Strategy. 1v1 or 2v2. First to 3 goals wins.\n\nEach player holds 4 cards throughout — it never grows or shrinks. Before playing, draw a card, then play a card. The defender must always answer, even with no valid counter.\n\nHalf the cards are split — attack on one face, defense on the other. Play either face and the whole card is discarded. This trade-off is the core of the game.`,
  },
  {
    id: 'chain',
    titleAr: 'السلسلة (الهجمة)', titleEn: 'The Chain (Attack)',
    bodyAr: `الهجمة سلسلة كروت: باص ← مراوغة ← شوطة. مش لازم تلعبهم بالترتيب ده، بس الشوطة هي اللي بتسجّل الهدف.\n\nفي مود الحظ: بتسحب ١ وبتلعب ١، والمدافع بيرد على كل كارت.\nفي مود التكتيك: بتسحب ١-٣ وبتلعب نفس العدد، والمدافع بيرد على آخر كارت بس.`,
    bodyEn: `An attack is a chain: Pass → Dribble → Shot. You don't have to play them in order, but a Shot is what scores the goal.\n\nLuck mode: draw 1, play 1, defender answers every card.\nStrategy mode: draw 1–3, play that many, defender answers only the last card.`,
  },
  {
    id: 'resolution',
    titleAr: 'جدول الحسم', titleEn: 'Resolution Table',
    bodyAr: `كل كارت هجومي ليه كارت دفاعي واحد بيردّ عليه:\n\n• باص ← اعتراض · تسلل · بلوك · فاول\n• مراوغة ← تدخل · فاول\n• أسيست ← اعتراض · تسلل · بلوك · فاول (٢ ضد ٢ بس)\n• شوطة ← حارس مرمى · صد تسديدة · تسلل\n• سوبر شوط ← صد سوبر شوط (الرد الوحيد)\n• جول ← تسلل · VAR · أون جول (٢ ضد ٢ بس)\n\nالفاول بيوقف الهجمة لكن بيرجّع الاستحواذ للمهاجم + بيفتح كارت البنالتي. البنالتي هدف مؤكد إلا لو اترد عليه بأون جول أو VAR.`,
    bodyEn: `Each attack has specific counters:\n\n• Pass → Interception · Offside · Block · Foul\n• Dribble → Tackle · Foul\n• Assist → Interception · Offside · Block · Foul (2v2 only)\n• Shot → Goal Keeper · Block Shot · Offside\n• Super Shot → Block Save (only counter)\n• Goal → Offside · VAR · Own Goal (2v2 only)\n\nFoul stops the attack but returns possession to the attacker + triggers Penalty. Penalty = guaranteed goal unless countered by Own Goal or VAR.`,
  },
  {
    id: 'specials',
    titleAr: 'الكروت الخاصة', titleEn: 'Special Cards',
    bodyAr: `• VAR — بيراجع الأهداف والبنالتي والتسلل بعملة (٥٠/٥٠). وش بيأكد القرار وضهر بيلغيه. مرة واحدة لكل حدث.\n• أون جول — مبيوقفش الشوطة، بيحوّل الهدف لصالح اللي لعبه. بيشتغل ضد شوطة وجول وبنالتي. نسخة واحدة في الديك.\n• تسلل — بيلغي الهجمة ويسلّم الكورة للمدافع. بيوقف باص وأسيست وشوطة وجول.\n• ريشافل — بتبدّل كارتين من الديك. أو في ٢ ضد ٢ بتبادل كارتين مع زميلك.\n• نهاية الماتش — بتنهي اللعبة فورًا. متعادل؟ الفوز لخصمك.\n• استخلاص — بيشتغل على كروت البناء بس (باص ومراوغة وأسيست). بياخد الاستحواذ أو بيرجعهولك لو اتلعب بعد باص.`,
    bodyEn: `• VAR — Reviews Goals, Penalties & Offside with a coin flip (50/50). Heads confirms, tails cancels. Once per event.\n• Own Goal — Doesn't stop a shot, converts the goal to the side that played it. Works against Shot, Goal & Penalty. One copy in deck.\n• Offside — Cancels the attack and gives possession to the defender. Stops Pass, Assist, Shot & Goal.\n• Reshuffle — Swap 2 cards from the deck. Or in 2v2, swap 2 cards with your teammate.\n• End Match — Ends the game immediately. Tied? Your opponent wins.\n• Chain — Works on building cards only (Pass, Dribble, Assist). Takes possession or returns it to you if played after a Pass.`,
  },
  {
    id: 'formats',
    titleAr: '١ ضد ١ و ٢ ضد ٢', titleEn: '1v1 & 2v2',
    bodyAr: `١ ضد ١:\n• كروت الأسيست والجول مش موجودة في الديك.\n• الشوطة هي الكارت الوحيد اللي بيسجّل.\n• لاعب واحد بيهاجم والتاني بيدافع.\n\n٢ ضد ٢:\n• الديك الكامل (٦٠ كارت) بيتستخدم.\n• الأسيست بينقل الاستحواذ لزميلك — زميلك بيكمل الهجمة.\n• كارت الجول لازم يتلعب بعد أسيست ناجح — ده اللي بيسجّل في ٢ ضد ٢.\n• الشوطة لسه بتسجّل عادي زي ١ ضد ١.\n• الفريقين بيتبادلوا الهجوم والدفاع.`,
    bodyEn: `1v1:\n• Assist and Goal cards are removed from the deck.\n• Shot is the only card that scores.\n• One player attacks, the other defends.\n\n2v2:\n• The full deck (60 cards) is used.\n• Assist transfers possession to your teammate — teammate continues the attack.\n• Goal card must be played after a successful Assist — this is what scores in 2v2.\n• Shot still scores normally as in 1v1.\n• Teams alternate between attacking and defending.`,
  },
  {
    id: 'cards',
    titleAr: 'الكروت كلها', titleEn: 'All Cards',
    bodyAr: '', bodyEn: '',
    isCardList: true,
  },
  {
    id: 'modes',
    titleAr: 'المودين', titleEn: 'Modes',
    bodyAr: `مود الحظ (الأساسي):\n• اسحب ١، العب ١\n• المدافع يرد على كل كارت\n• الشوطة في أي وقت\n• البلوك شغال\n\nمود التكتيك:\n• اسحب ١-٣، العب نفس العدد\n• المدافع يرد على آخر كارت بس\n• الشوطة لازم آخر كارت\n• البلوك مقفول\n• الكروت الفاضلة = مرتدة فورية`,
    bodyEn: `Luck Mode (default):\n• Draw 1, play 1\n• Defender answers every card\n• Shot allowed any time\n• Block is active\n\nStrategy Mode:\n• Draw 1–3, play that many\n• Defender answers only the last card\n• Shot must be the last card\n• Block is disabled\n• Leftover cards become an instant counter-attack`,
  },
];

// ─── Physical cards data (split info) ────────────────────────────────────────
const PHYSICAL_CARDS = [
  { faces: ['PASS', 'INTERCEPTION'], type: 'split' },
  { faces: ['DRIBBLE', 'TACKLE'], type: 'split' },
  { faces: ['SHOT_GOAL', 'GOAL_KEEPER'], type: 'split' },
  { faces: ['SUPER_SHOT', 'BLOCK_SAVE'], type: 'split' },
];
const SPLIT_MAP = {};
PHYSICAL_CARDS.forEach(pc => {
  if (pc.type === 'split') {
    SPLIT_MAP[pc.faces[0]] = pc.faces[1];
    SPLIT_MAP[pc.faces[1]] = pc.faces[0];
  }
});

// ─── CSS ─────────────────────────────────────────────────────────────────────
const STYLE = `
/* ─── Onboarding carousel ─── */
.og-onboarding{position:fixed;inset:0;z-index:9000;background:#0d0d16;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Cairo',sans-serif;color:var(--ink,#F0E6D3);overflow:hidden;touch-action:pan-y}
.og-onboarding[hidden]{display:none}
.og-slides{position:relative;width:100%;max-width:420px;flex:1;display:flex;align-items:center;overflow:hidden}
.og-slide{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px;text-align:center;opacity:0;transform:translateX(60px);transition:opacity .35s ease,transform .35s ease;pointer-events:none}
.og-slide.active{opacity:1;transform:translateX(0);pointer-events:auto}
.og-slide.exit-left{opacity:0;transform:translateX(-60px)}
.og-slide-icon{font-size:64px;margin-bottom:12px;filter:drop-shadow(0 0 18px rgba(255,107,53,.4))}
.og-slide-logo{width:140px;height:140px;border-radius:20px;object-fit:contain;margin-bottom:12px;filter:drop-shadow(0 0 24px rgba(255,107,53,.5))}
.og-slide h2{font-family:'Rakkas',cursive;font-size:32px;color:#FF6B35;margin:0 0 4px}
.og-slide h3{font-family:'Oswald',sans-serif;font-size:16px;font-weight:400;color:var(--muted,#A89880);margin:0 0 20px;letter-spacing:.5px}
.og-slide p{font-size:14px;line-height:1.7;margin:0 0 8px;max-width:340px;white-space:pre-line}
.og-slide .og-body-en{font-size:12px;color:var(--muted,#A89880);line-height:1.6;direction:ltr;text-align:center;white-space:pre-line}
.og-dots{display:flex;gap:8px;padding:16px 0}
.og-dot{width:10px;height:10px;border-radius:50%;background:rgba(240,230,211,.2);border:none;cursor:pointer;transition:background .25s,transform .25s}
.og-dot.active{background:#FF6B35;transform:scale(1.3)}
.og-nav{display:flex;gap:12px;padding:0 24px 32px;width:100%;max-width:420px}
.og-nav button{flex:1;padding:14px 0;border:none;border-radius:10px;font-family:'Cairo',sans-serif;font-size:16px;font-weight:700;cursor:pointer;transition:background .2s,transform .1s}
.og-nav button:active{transform:scale(.96)}
.og-btn-skip{background:rgba(240,230,211,.08);color:var(--ink,#F0E6D3)}
.og-btn-next{background:#FF6B35;color:#0d0d16}
.og-btn-start{background:#2ECC71;color:#0d0d16;flex:2!important}
/* ─── Rules modal ─── */
.og-rules-overlay{position:fixed;inset:0;z-index:8000;background:rgba(13,13,22,.97);display:flex;flex-direction:column;font-family:'Cairo',sans-serif;color:var(--ink,#F0E6D3);overflow:hidden}
.og-rules-overlay[hidden]{display:none}
.og-rules-header{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid rgba(240,230,211,.08);flex-shrink:0}
.og-rules-logo{width:36px;height:36px;border-radius:8px;object-fit:contain}
.og-rules-header h2{font-family:'Rakkas',cursive;font-size:24px;color:#FF6B35;margin:0;flex:1}
.og-rules-close{background:rgba(240,230,211,.08);border:none;color:var(--ink,#F0E6D3);width:36px;height:36px;border-radius:8px;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.og-rules-search{margin:12px 20px 0;padding:10px 14px;background:rgba(240,230,211,.06);border:1px solid rgba(240,230,211,.1);border-radius:8px;color:var(--ink,#F0E6D3);font-family:'Cairo',sans-serif;font-size:14px;width:calc(100% - 40px)}
.og-rules-search::placeholder{color:var(--muted,#A89880)}
.og-rules-tabs{display:flex;gap:0;margin:12px 20px 0;flex-shrink:0;border-bottom:1px solid rgba(240,230,211,.08);overflow-x:auto;-webkit-overflow-scrolling:touch}
.og-rules-tab{background:none;border:none;border-bottom:2px solid transparent;color:var(--muted,#A89880);font-family:'Cairo',sans-serif;font-size:12px;font-weight:600;padding:8px 10px;cursor:pointer;white-space:nowrap;transition:color .2s,border-color .2s}
.og-rules-tab.active{color:#FF6B35;border-bottom-color:#FF6B35}
.og-rules-body{flex:1;overflow-y:auto;padding:20px;-webkit-overflow-scrolling:touch}
.og-rules-section{display:none}.og-rules-section.active{display:block}
.og-rules-section h3{font-family:'Oswald',sans-serif;font-size:14px;font-weight:400;color:var(--muted,#A89880);margin:0 0 16px;letter-spacing:.5px;direction:ltr}
.og-rules-bilingual{display:grid;grid-template-columns:1fr;gap:20px}
@media(min-width:600px){.og-rules-bilingual{grid-template-columns:1fr 1fr;gap:32px}}
.og-rules-ar{font-size:14px;line-height:1.8;white-space:pre-line}
.og-rules-en{font-size:12px;line-height:1.7;color:var(--muted,#A89880);direction:ltr;text-align:left;white-space:pre-line}
/* card list with real card design */
.og-card-list{display:flex;flex-direction:column;gap:6px}
.og-card-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(240,230,211,.04);border-right:3px solid transparent;transition:background .15s}
.og-card-item[hidden]{display:none}
.og-card-item:hover{background:rgba(240,230,211,.08)}
.og-card-icon{width:32px;height:32px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.og-card-icon svg{width:32px;height:32px}
.og-card-info{flex:1;min-width:0}
.og-card-name{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.og-card-name-ar{font-size:14px;font-weight:700}
.og-card-name-en{font-size:11px;color:var(--muted,#A89880);direction:ltr}
.og-card-rule{font-size:11px;color:var(--muted,#A89880);margin-top:2px;line-height:1.5}
.og-card-meta{display:flex;gap:6px;flex-shrink:0;align-items:center}
.og-card-qty{font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:rgba(240,230,211,.08);color:var(--ink,#F0E6D3)}
.og-card-split-tag{font-size:10px;padding:2px 8px;border-radius:6px;background:rgba(255,107,53,.12);color:#FF6B35;white-space:nowrap}
.og-no-results{text-align:center;padding:40px 0;color:var(--muted,#A89880);font-size:14px}
/* ─── Lobby rules button ─── */
.og-rules-btn{background:rgba(240,230,211,.06);border:1px solid rgba(240,230,211,.1);color:var(--ink,#F0E6D3);padding:10px 20px;border-radius:10px;font-family:'Cairo',sans-serif;font-size:14px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:background .2s,border-color .2s}
.og-rules-btn:hover{background:rgba(240,230,211,.1);border-color:rgba(240,230,211,.2)}
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function injectStyle() {
  if (document.getElementById('og-onboarding-style')) return;
  const s = document.createElement('style');
  s.id = 'og-onboarding-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  for (const c of kids) {
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else if (c) el.appendChild(c);
  }
  return el;
}

function cardIcon(id, size = 32) {
  const svg = ICONS[id];
  if (!svg) return '';
  const kind = CARDS[id]?.kind || 'attack';
  const fill = 'none';
  const stroke = FAMILY[kind] || '#888';
  return `<svg viewBox="0 0 40 44" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`;
}

// ─── Onboarding Carousel ─────────────────────────────────────────────────────
export function shouldShowOnboarding() {
  try { return !localStorage.getItem(LS_KEY); } catch { return true; }
}
export function markOnboardingDone() {
  try { localStorage.setItem(LS_KEY, '1'); } catch {}
}

export function showOnboarding(onDone) {
  injectStyle();
  let idx = 0;
  const root = h('div', { className: 'og-onboarding' });
  const slidesWrap = h('div', { className: 'og-slides' });

  const slideEls = SLIDES.map((s, i) => {
    let iconEl;
    if (s.icon === 'logo') {
      iconEl = h('img', { className: 'og-slide-logo', src: 'logo.png', alt: 'OWN GOAL' });
    } else {
      iconEl = h('div', { className: 'og-slide-icon' }, s.icon);
    }
    const sl = h('div', { className: `og-slide ${i === 0 ? 'active' : ''}` },
      iconEl,
      h('h2', null, s.titleAr),
      h('h3', null, s.titleEn),
      h('p', null, s.bodyAr),
      h('p', { className: 'og-body-en' }, s.bodyEn),
    );
    slidesWrap.appendChild(sl);
    return sl;
  });
  root.appendChild(slidesWrap);

  const dotsWrap = h('div', { className: 'og-dots' });
  const dots = SLIDES.map((_, i) => {
    const d = h('button', { className: `og-dot ${i === 0 ? 'active' : ''}`, onClick: () => goTo(i) });
    dotsWrap.appendChild(d);
    return d;
  });
  root.appendChild(dotsWrap);

  const nav = h('div', { className: 'og-nav' });
  const skipBtn = h('button', { className: 'og-btn-skip', onClick: finish }, 'تخطي / Skip');
  const nextBtn = h('button', { className: 'og-btn-next', onClick: () => goTo(idx + 1) }, 'التالي / Next');
  const startBtn = h('button', { className: 'og-btn-start', onClick: finish }, 'يلا نلعب! / Start');
  startBtn.style.display = 'none';
  nav.append(skipBtn, nextBtn, startBtn);
  root.appendChild(nav);

  let tx = 0;
  slidesWrap.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  slidesWrap.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) goTo(idx + (dx < 0 ? 1 : -1));
  }, { passive: true });

  function goTo(n) {
    n = Math.max(0, Math.min(n, SLIDES.length - 1));
    if (n === idx) return;
    slideEls[idx].className = `og-slide ${n > idx ? 'exit-left' : ''}`;
    dots[idx].className = 'og-dot';
    idx = n;
    slideEls[idx].className = 'og-slide active';
    dots[idx].className = 'og-dot active';
    const isLast = idx === SLIDES.length - 1;
    skipBtn.style.display = isLast ? 'none' : '';
    nextBtn.style.display = isLast ? 'none' : '';
    startBtn.style.display = isLast ? '' : 'none';
  }

  function finish() {
    markOnboardingDone();
    root.hidden = true;
    root.remove();
    if (onDone) onDone();
  }

  document.body.appendChild(root);
  return root;
}

// ─── Rules Modal ─────────────────────────────────────────────────────────────
let rulesEl = null;

export function openRules() {
  injectStyle();
  if (rulesEl) { rulesEl.hidden = false; return; }
  rulesEl = h('div', { className: 'og-rules-overlay' });

  // header with logo
  const header = h('div', { className: 'og-rules-header' },
    h('img', { className: 'og-rules-logo', src: 'logo.png', alt: '' }),
    h('h2', null, 'القواعد / Rules'),
    h('button', { className: 'og-rules-close', onClick: closeRules }, '✕'),
  );
  rulesEl.appendChild(header);

  // search
  const search = h('input', { className: 'og-rules-search', type: 'text', placeholder: 'ابحث عن كارت… / Search cards…' });
  search.addEventListener('input', () => filterCards(search.value));
  rulesEl.appendChild(search);

  // tabs
  const tabsWrap = h('div', { className: 'og-rules-tabs' });
  const sectionEls = [];
  const tabEls = [];

  RULES_SECTIONS.forEach((sec, i) => {
    const tab = h('button', { className: `og-rules-tab ${i === 0 ? 'active' : ''}`, onClick: () => switchTab(i) }, sec.titleAr);
    tabsWrap.appendChild(tab);
    tabEls.push(tab);

    const secEl = h('div', { className: `og-rules-section ${i === 0 ? 'active' : ''}` });
    secEl.dataset.id = sec.id;

    if (sec.isCardList) {
      secEl.appendChild(buildCardList());
    } else {
      secEl.appendChild(h('h3', null, sec.titleEn));
      secEl.appendChild(h('div', { className: 'og-rules-bilingual' },
        h('div', { className: 'og-rules-ar' }, sec.bodyAr),
        h('div', { className: 'og-rules-en' }, sec.bodyEn),
      ));
    }
    sectionEls.push(secEl);
  });

  rulesEl.appendChild(tabsWrap);
  const body = h('div', { className: 'og-rules-body' });
  sectionEls.forEach(s => body.appendChild(s));
  rulesEl.appendChild(body);

  function switchTab(n) {
    tabEls.forEach((t, i) => {
      t.className = `og-rules-tab ${i === n ? 'active' : ''}`;
      sectionEls[i].className = `og-rules-section ${i === n ? 'active' : ''}`;
    });
    if (RULES_SECTIONS[n].isCardList) search.focus();
  }

  document.body.appendChild(rulesEl);
}

export function closeRules() {
  if (rulesEl) rulesEl.hidden = true;
}

function buildCardList() {
  const wrap = h('div', { className: 'og-card-list' });
  const order = ['PASS','INTERCEPTION','DRIBBLE','TACKLE','SHOT_GOAL','GOAL_KEEPER',
    'SUPER_SHOT','BLOCK_SAVE','ASSIST','GOAL','PENALTY','FOUL','OFFSIDE','BLOCK',
    'BLOCK_SHOT','OWN_GOAL','CHAIN','VAR','RESHUFFLE','END_MATCH'];

  order.forEach(id => {
    const c = CARDS[id];
    if (!c) return;
    const qty = QTY[id] || 0;
    const kind = c.kind || 'attack';
    const borderColor = FAMILY[kind] || '#888';
    const isSplit = !!SPLIT_MAP[id];
    const splitPartner = SPLIT_MAP[id];

    // icon
    const iconDiv = document.createElement('div');
    iconDiv.className = 'og-card-icon';
    iconDiv.innerHTML = cardIcon(id, 32);

    // info
    const nameDiv = h('div', { className: 'og-card-name' },
      h('span', { className: 'og-card-name-ar' }, c.ar),
      h('span', { className: 'og-card-name-en' }, c.en),
    );
    const ruleDiv = h('div', { className: 'og-card-rule' }, c.rule);
    const infoDiv = h('div', { className: 'og-card-info' }, nameDiv, ruleDiv);

    // meta
    const metaDiv = h('div', { className: 'og-card-meta' });
    metaDiv.appendChild(h('span', { className: 'og-card-qty' }, `×${qty}`));
    if (isSplit) {
      const partnerName = CARDS[splitPartner]?.ar || splitPartner;
      metaDiv.appendChild(h('span', { className: 'og-card-split-tag' }, `🔀 ${partnerName}`));
    }

    const item = h('div', { className: 'og-card-item' }, iconDiv, infoDiv, metaDiv);
    item.style.borderRightColor = borderColor;
    item.dataset.search = `${c.ar} ${c.en} ${id} ${c.rule || ''}`.toLowerCase();
    wrap.appendChild(item);
  });
  return wrap;
}

function filterCards(q) {
  q = q.trim().toLowerCase();
  const list = rulesEl?.querySelector('.og-card-list');
  if (!list) return;
  let found = 0;
  list.querySelectorAll('.og-card-item').forEach(el => {
    const match = !q || el.dataset.search.includes(q);
    el.hidden = !match;
    if (match) found++;
  });
  let nr = list.querySelector('.og-no-results');
  if (!found && !nr) {
    nr = h('div', { className: 'og-no-results' }, 'مفيش نتيجة / No results');
    list.appendChild(nr);
  } else if (found && nr) { nr.remove(); }
  // auto-switch to cards tab when searching
  if (q) {
    const ci = RULES_SECTIONS.findIndex(s => s.isCardList);
    if (ci >= 0) {
      rulesEl.querySelectorAll('.og-rules-tab').forEach((t, i) => {
        t.className = `og-rules-tab ${i === ci ? 'active' : ''}`;
      });
      rulesEl.querySelectorAll('.og-rules-section').forEach((s, i) => {
        s.className = `og-rules-section ${i === ci ? 'active' : ''}`;
      });
    }
  }
}

// ─── Lobby button ────────────────────────────────────────────────────────────
export function createRulesButton() {
  injectStyle();
  return h('button', { className: 'og-rules-btn', onClick: openRules },
    h('span', null, '📖'),
    h('span', null, 'القواعد / Rules'),
  );
}

// ─── Auto-init ───────────────────────────────────────────────────────────────
export function init() {
  if (shouldShowOnboarding()) {
    showOnboarding();
  }
}
