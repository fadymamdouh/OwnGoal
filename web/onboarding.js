// onboarding.js — carousel (first visit) + rules modal (always available)
// Drop into web/ and import from index.html or the build script.
// Uses the same CSS variables as the main game (--ink, --attack, etc.)

const LS_KEY = 'og_onboarding_done';

// ─── Slide content ───────────────────────────────────────────────────────────
const SLIDES = [
  {
    icon: '⚽',
    titleAr: 'أون جول',
    titleEn: 'OWN GOAL',
    bodyAr: '٦٠ كارت كورة. أول واحد يجيب ٣ أجوال يكسب. كل هجمة بتتحسم بكارت واحد صح.',
    bodyEn: '60 football cards. First to 3 goals wins. Every attack is decided by one right card.',
  },
  {
    icon: '🔀',
    titleAr: 'الكارت المقسوم',
    titleEn: 'Split Cards',
    bodyAr: 'نص كروتك مقسومة — هجوم من ناحية ودفاع من التانية. لما تلعب أي ناحية الكارت كله بيتحرق. كل باص بتلعبه بتحرق بيه اعتراض كنت هتحتاجه.',
    bodyEn: 'Half your cards are split — attack on one side, defense on the other. Play either side and the whole card is burned. Every Pass you play burns an Interception you\'ll need later.',
  },
  {
    icon: '⚔️',
    titleAr: 'الهجوم والدفاع',
    titleEn: 'Attack vs Defense',
    bodyAr: 'المهاجم بيلعب كارت هجومي. المدافع لازم يرد بكارت — حتى لو ملوش رد صح. الكارت الصح بيوقف الهجمة، الغلط بيتحرق ببلاش.',
    bodyEn: 'Attacker plays an attack card. Defender must answer with a card — even with no valid counter. The right card stops the attack; the wrong one burns for nothing.',
  },
  {
    icon: '🔗',
    titleAr: 'السلسلة',
    titleEn: 'The Chain',
    bodyAr: 'الهجمة مش كارت واحد — دي سلسلة. باص ← دربلة ← شوط. كل كارت لازم يتردّ عليه. نجحت السلسلة لحد الشوط؟ جووووول!',
    bodyEn: 'An attack is a chain. Pass → Dribble → Shot. Each card must be answered. Survive to the Shot? GOOOAL!',
  },
  {
    icon: '📺',
    titleAr: 'الـ VAR والخاصة',
    titleEn: 'VAR & Specials',
    bodyAr: 'الـ VAR بيراجع الأجوال والبنالتي بعملة — ٥٠/٥٠. الأون جول بيحوّل الجول لصالح اللي لعبه ضدك. وكارت نهاية الماتش بينهي اللعبة فورًا.',
    bodyEn: 'VAR reviews Goals and Penalties with a coin flip — 50/50. Own Goal converts a goal against you. End Match ends the game immediately.',
  },
];

// ─── Rules content (bilingual) ──────────────────────────────────────────────
const RULES_SECTIONS = [
  {
    id: 'overview',
    titleAr: 'نظرة عامة', titleEn: 'Overview',
    bodyAr: `٦٠ كارت كورة بالمصري. مودين: حظ أو تكتيك. ١ ضد ١ أو ٢ ضد ٢. أول واحد يجيب ٣ أجوال يكسب.\n\nكل لاعب في إيده ٤ كروت طول الماتش — مبتكبرش ومبتصغرش. قبل ما تلعب، بتسحب كارت، وبعدين بتلعب كارت. المدافع لازم يرد بكارت حتى لو ملوش رد صح.`,
    bodyEn: `60 football cards in Egyptian Arabic. Two modes: Luck or Strategy. 1v1 or 2v2. First to 3 goals wins.\n\nEach player holds 4 cards throughout the match — it never grows or shrinks. Before playing, draw a card, then play a card. The defender must always play a card, even with no valid counter.`,
  },
  {
    id: 'split-cards',
    titleAr: 'الكروت المقسومة', titleEn: 'Split Cards',
    bodyAr: `٢٧ كارت من الـ ٦٠ مقسومين — وش هجوم وضهر دفاع. لما تلعب أي ناحية، الكارت كله بيتحرق.\n\nده معناه إن كل باص بتلعبه بتحرق بيه اعتراض. وكل دربلة بتحرق تاكل. دي التكلفة اللي اللعبة كلها بتدور حواليها.`,
    bodyEn: `27 of the 60 cards are split — attack on one face, defense on the other. Play either face and the entire card is discarded.\n\nThis means every Pass you play burns an Interception. Every Dribble burns a Tackle. This trade-off is the core tension of the game.`,
  },
  {
    id: 'chain',
    titleAr: 'السلسلة (الهجمة)', titleEn: 'The Chain (Attack)',
    bodyAr: `الهجمة سلسلة كروت: باص ← دربلة ← شوط ← جول. مش لازم تلعبهم بالترتيب ده، بس الشوط هو اللي بيجيب الجول.\n\nفي مود الحظ: بتسحب ١ وبتلعب ١، والمدافع بيرد على كل كارت. في مود التكتيك: بتسحب ١-٣ وبتلعب نفس العدد، والمدافع بيرد على آخر كارت بس.`,
    bodyEn: `An attack is a chain of cards: Pass → Dribble → Shot → Goal. You don't have to play them in this order, but a Shot is what scores.\n\nLuck mode: draw 1, play 1, defender answers every card. Strategy mode: draw 1–3, play that many, defender answers only the last card.`,
  },
  {
    id: 'resolution',
    titleAr: 'جدول الحسم', titleEn: 'Resolution Table',
    bodyAr: `كل كارت هجومي ليه كارت دفاعي واحد بيردّ عليه:\n\n` +
      `• باص ← اعتراض\n• أسيست ← اعتراض\n• دربلة ← تاكل\n• شوط/جول ← حارس\n• سوبر شوت ← بلوك سيف\n• فاول عند الشوط = بنالتي (جول مؤكد)\n\nالفاول مش بيوقف الهجمة — بيرجّع الاستحواذ للمهاجم اللي اتفاول عليه.`,
    bodyEn: `Each attack card has one specific counter:\n\n` +
      `• Pass → Interception\n• Assist → Interception\n• Dribble → Tackle\n• Shot/Goal → Goal Keeper\n• Super Shot → Block Save\n• Foul at Shot stage = Penalty (guaranteed goal)\n\nA Foul doesn't stop the attack — it hands possession back to the attacker who was fouled.`,
  },
  {
    id: 'specials',
    titleAr: 'الكروت الخاصة', titleEn: 'Special Cards',
    bodyAr: `• VAR — بيراجع الأجوال والبنالتي بعملة (٥٠/٥٠). لو كسبت المراجعة الجول بيتلغي.\n• أون جول — مبيوقفش الشوط، بيحوّل الجول لصالح اللي لعبه. نسخة واحدة في الديك.\n• أوفسايد — بيلغي الهجمة ويسلّم الكورة للمدافع.\n• ريشفل — بتبدّل كروتك كلها بأربعة جداد.\n• نهاية الماتش — بتنهي اللعبة فورًا. اللي عنده أجوال أكتر يكسب.\n• سلسلة — بتخلي هجمتك تستمر كارت زيادة.`,
    bodyEn: `• VAR — Reviews Goals and Penalties with a coin flip (50/50). Win the review and the goal is cancelled.\n• Own Goal — Doesn't stop a shot, it converts the goal to the side that played it. One copy in the deck.\n• Offside — Cancels the attack and gives possession to the defender.\n• Reshuffle — Swap your entire hand for 4 new cards.\n• End Match — Ends the game immediately. Whoever has more goals wins.\n• Chain — Extends your attack by one extra card.`,
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

// Card data for the searchable list — names only, the full data lives in cards.js
const ALL_CARDS = [
  { id:'PASS', ar:'باص', en:'Pass', kind:'attack', split:'INTERCEPTION' },
  { id:'INTERCEPTION', ar:'اعتراض', en:'Interception', kind:'defense', split:'PASS' },
  { id:'DRIBBLE', ar:'دربلة', en:'Dribble', kind:'attack', split:'TACKLE' },
  { id:'TACKLE', ar:'تاكل', en:'Tackle', kind:'defense', split:'DRIBBLE' },
  { id:'SHOT_GOAL', ar:'شوط/جول', en:'Shot / Goal', kind:'attack', split:'GOAL_KEEPER' },
  { id:'GOAL_KEEPER', ar:'حارس', en:'Goal Keeper', kind:'defense', split:'SHOT_GOAL' },
  { id:'SUPER_SHOT', ar:'سوبر شوت', en:'Super Shot', kind:'attack', split:'BLOCK_SAVE' },
  { id:'BLOCK_SAVE', ar:'بلوك سيف', en:'Block Save', kind:'defense', split:'SUPER_SHOT' },
  { id:'ASSIST', ar:'أسيست', en:'Assist', kind:'attack' },
  { id:'GOAL', ar:'جول', en:'Goal', kind:'attack' },
  { id:'FOUL', ar:'فاول', en:'Foul', kind:'defense' },
  { id:'BLOCK', ar:'بلوك', en:'Block', kind:'defense' },
  { id:'BLOCK_SHOT', ar:'بلوك شوت', en:'Block Shot', kind:'defense' },
  { id:'CHAIN', ar:'سلسلة', en:'Chain', kind:'special' },
  { id:'VAR', ar:'VAR', en:'VAR', kind:'special' },
  { id:'RESHUFFLE', ar:'ريشفل', en:'Reshuffle', kind:'special' },
  { id:'END_MATCH', ar:'نهاية الماتش', en:'End Match', kind:'special' },
  { id:'OWN_GOAL', ar:'أون جول', en:'Own Goal', kind:'special' },
  { id:'OFFSIDE', ar:'أوفسايد', en:'Offside', kind:'special' },
  { id:'PENALTY', ar:'بنالتي', en:'Penalty', kind:'special' },
];

// ─── CSS (injected once) ─────────────────────────────────────────────────────
const STYLE = `
/* ─── Onboarding carousel ─── */
.og-onboarding {
  position: fixed; inset: 0; z-index: 9000;
  background: #0d0d16;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-family: 'Cairo', sans-serif; color: var(--ink, #F0E6D3);
  overflow: hidden; touch-action: pan-y;
}
.og-onboarding[hidden] { display: none; }
.og-slides {
  position: relative; width: 100%; max-width: 420px; flex: 1;
  display: flex; align-items: center; overflow: hidden;
}
.og-slide {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 32px 24px; text-align: center;
  opacity: 0; transform: translateX(60px);
  transition: opacity .35s ease, transform .35s ease;
  pointer-events: none;
}
.og-slide.active {
  opacity: 1; transform: translateX(0); pointer-events: auto;
}
.og-slide.exit-left {
  opacity: 0; transform: translateX(-60px);
}
.og-slide-icon {
  font-size: 64px; margin-bottom: 12px;
  filter: drop-shadow(0 0 18px rgba(255,107,53,.4));
}
.og-slide h2 {
  font-family: 'Rakkas', cursive; font-size: 32px;
  color: #FF6B35; margin: 0 0 4px;
}
.og-slide h3 {
  font-family: 'Oswald', sans-serif; font-size: 16px; font-weight: 400;
  color: var(--muted, #A89880); margin: 0 0 20px; letter-spacing: .5px;
}
.og-slide p {
  font-size: 15px; line-height: 1.7; margin: 0 0 8px;
  max-width: 340px;
}
.og-slide .og-body-en {
  font-size: 13px; color: var(--muted, #A89880); line-height: 1.6;
  direction: ltr; text-align: center;
}
/* dots */
.og-dots {
  display: flex; gap: 8px; padding: 16px 0;
}
.og-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: rgba(240,230,211,.2); border: none; cursor: pointer;
  transition: background .25s, transform .25s;
}
.og-dot.active {
  background: #FF6B35; transform: scale(1.3);
}
/* buttons */
.og-nav {
  display: flex; gap: 12px; padding: 0 24px 32px; width: 100%; max-width: 420px;
}
.og-nav button {
  flex: 1; padding: 14px 0; border: none; border-radius: 10px;
  font-family: 'Cairo', sans-serif; font-size: 16px; font-weight: 700;
  cursor: pointer; transition: background .2s, transform .1s;
}
.og-nav button:active { transform: scale(.96); }
.og-btn-skip {
  background: rgba(240,230,211,.08); color: var(--ink, #F0E6D3);
}
.og-btn-next {
  background: #FF6B35; color: #0d0d16;
}
.og-btn-start {
  background: #2ECC71; color: #0d0d16; flex: 2 !important;
}

/* ─── Rules modal ─── */
.og-rules-overlay {
  position: fixed; inset: 0; z-index: 8000;
  background: rgba(13,13,22,.96);
  display: flex; flex-direction: column;
  font-family: 'Cairo', sans-serif; color: var(--ink, #F0E6D3);
  overflow: hidden;
}
.og-rules-overlay[hidden] { display: none; }
.og-rules-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px; border-bottom: 1px solid rgba(240,230,211,.08);
  flex-shrink: 0;
}
.og-rules-header h2 {
  font-family: 'Rakkas', cursive; font-size: 24px; color: #FF6B35;
  margin: 0; flex: 1;
}
.og-rules-close {
  background: rgba(240,230,211,.08); border: none; color: var(--ink, #F0E6D3);
  width: 36px; height: 36px; border-radius: 8px; font-size: 20px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.og-rules-search {
  margin: 12px 20px 0; padding: 10px 14px;
  background: rgba(240,230,211,.06); border: 1px solid rgba(240,230,211,.1);
  border-radius: 8px; color: var(--ink, #F0E6D3);
  font-family: 'Cairo', sans-serif; font-size: 14px; width: calc(100% - 40px);
}
.og-rules-search::placeholder { color: var(--muted, #A89880); }
/* tabs */
.og-rules-tabs {
  display: flex; gap: 0; margin: 12px 20px 0; flex-shrink: 0;
  border-bottom: 1px solid rgba(240,230,211,.08);
  overflow-x: auto; -webkit-overflow-scrolling: touch;
}
.og-rules-tab {
  background: none; border: none; border-bottom: 2px solid transparent;
  color: var(--muted, #A89880); font-family: 'Cairo', sans-serif;
  font-size: 13px; font-weight: 600; padding: 8px 14px; cursor: pointer;
  white-space: nowrap; transition: color .2s, border-color .2s;
}
.og-rules-tab.active {
  color: #FF6B35; border-bottom-color: #FF6B35;
}
/* body */
.og-rules-body {
  flex: 1; overflow-y: auto; padding: 20px;
  -webkit-overflow-scrolling: touch;
}
.og-rules-section { display: none; }
.og-rules-section.active { display: block; }
.og-rules-section h3 {
  font-family: 'Oswald', sans-serif; font-size: 14px; font-weight: 400;
  color: var(--muted, #A89880); margin: 0 0 16px; letter-spacing: .5px;
  direction: ltr;
}
.og-rules-bilingual {
  display: grid; grid-template-columns: 1fr; gap: 20px;
}
@media(min-width:600px) {
  .og-rules-bilingual { grid-template-columns: 1fr 1fr; gap: 32px; }
}
.og-rules-ar {
  font-size: 15px; line-height: 1.8; white-space: pre-line;
}
.og-rules-en {
  font-size: 13px; line-height: 1.7; color: var(--muted, #A89880);
  direction: ltr; text-align: left; white-space: pre-line;
}
/* card list */
.og-card-list { display: flex; flex-direction: column; gap: 8px; }
.og-card-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 8px;
  background: rgba(240,230,211,.04);
  transition: background .15s;
}
.og-card-item[hidden] { display: none; }
.og-card-item:hover { background: rgba(240,230,211,.08); }
.og-card-badge {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.og-card-badge.attack { background: var(--attack, #D7263D); }
.og-card-badge.defense { background: var(--defense-glow, #2ECC71); }
.og-card-badge.special { background: var(--special, #7D3C98); }
.og-card-name-ar { font-size: 15px; font-weight: 600; flex: 1; }
.og-card-name-en {
  font-size: 12px; color: var(--muted, #A89880);
  direction: ltr; text-align: left;
}
.og-card-split-tag {
  font-size: 10px; padding: 2px 8px; border-radius: 4px;
  background: rgba(255,107,53,.15); color: #FF6B35;
}
.og-no-results {
  text-align: center; padding: 40px 0;
  color: var(--muted, #A89880); font-size: 14px;
}

/* ─── Lobby rules button ─── */
.og-rules-btn {
  background: rgba(240,230,211,.06); border: 1px solid rgba(240,230,211,.1);
  color: var(--ink, #F0E6D3); padding: 10px 20px; border-radius: 10px;
  font-family: 'Cairo', sans-serif; font-size: 14px; font-weight: 600;
  cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
  transition: background .2s, border-color .2s;
}
.og-rules-btn:hover {
  background: rgba(240,230,211,.1); border-color: rgba(240,230,211,.2);
}
`;

// ─── Build helpers ───────────────────────────────────────────────────────────
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

  // slides
  const slidesWrap = h('div', { className: 'og-slides' });
  const slideEls = SLIDES.map((s, i) => {
    const sl = h('div', { className: `og-slide ${i === 0 ? 'active' : ''}` },
      h('div', { className: 'og-slide-icon' }, s.icon),
      h('h2', null, s.titleAr),
      h('h3', null, s.titleEn),
      h('p', null, s.bodyAr),
      h('p', { className: 'og-body-en' }, s.bodyEn),
    );
    slidesWrap.appendChild(sl);
    return sl;
  });
  root.appendChild(slidesWrap);

  // dots
  const dotsWrap = h('div', { className: 'og-dots' });
  const dots = SLIDES.map((_, i) => {
    const d = h('button', {
      className: `og-dot ${i === 0 ? 'active' : ''}`,
      onClick: () => goTo(i),
    });
    dotsWrap.appendChild(d);
    return d;
  });
  root.appendChild(dotsWrap);

  // nav
  const nav = h('div', { className: 'og-nav' });
  const skipBtn = h('button', { className: 'og-btn-skip', onClick: finish }, 'تخطي / Skip');
  const nextBtn = h('button', { className: 'og-btn-next', onClick: () => goTo(idx + 1) }, 'التالي / Next');
  const startBtn = h('button', { className: 'og-btn-start', onClick: finish }, 'يلا نلعب! / Start');
  startBtn.style.display = 'none';
  nav.append(skipBtn, nextBtn, startBtn);
  root.appendChild(nav);

  // swipe
  let tx = 0;
  slidesWrap.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  slidesWrap.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) goTo(idx + (dx < 0 ? 1 : -1));
  }, { passive: true });

  function goTo(n) {
    n = Math.max(0, Math.min(n, SLIDES.length - 1));
    if (n === idx) return;
    const dir = n > idx ? 'exit-left' : '';
    slideEls[idx].className = `og-slide ${dir}`;
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

  // header
  const header = h('div', { className: 'og-rules-header' },
    h('h2', null, 'القواعد / Rules'),
    h('button', { className: 'og-rules-close', onClick: closeRules }, '✕'),
  );
  rulesEl.appendChild(header);

  // search
  const search = h('input', {
    className: 'og-rules-search',
    type: 'text',
    placeholder: 'ابحث عن كارت… / Search cards…',
  });
  search.addEventListener('input', () => filterCards(search.value));
  rulesEl.appendChild(search);

  // tabs
  const tabsWrap = h('div', { className: 'og-rules-tabs' });
  const sectionEls = [];
  const tabEls = [];

  RULES_SECTIONS.forEach((sec, i) => {
    const tab = h('button', {
      className: `og-rules-tab ${i === 0 ? 'active' : ''}`,
      onClick: () => switchTab(i),
    }, sec.titleAr);
    tabsWrap.appendChild(tab);
    tabEls.push(tab);

    const secEl = h('div', { className: `og-rules-section ${i === 0 ? 'active' : ''}` });
    secEl.dataset.id = sec.id;

    if (sec.isCardList) {
      secEl.appendChild(buildCardList());
    } else {
      secEl.appendChild(h('h3', null, sec.titleEn));
      const bi = h('div', { className: 'og-rules-bilingual' },
        h('div', { className: 'og-rules-ar' }, sec.bodyAr),
        h('div', { className: 'og-rules-en' }, sec.bodyEn),
      );
      secEl.appendChild(bi);
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
    // focus search if switching to cards
    if (RULES_SECTIONS[n].isCardList) search.focus();
  }

  document.body.appendChild(rulesEl);
}

export function closeRules() {
  if (rulesEl) rulesEl.hidden = true;
}

function buildCardList() {
  const wrap = h('div', { className: 'og-card-list' });
  ALL_CARDS.forEach(c => {
    const item = h('div', { className: 'og-card-item' },
      h('span', { className: `og-card-badge ${c.kind}` }),
      h('span', { className: 'og-card-name-ar' }, c.ar),
      h('span', { className: 'og-card-name-en' }, c.en),
      ...(c.split ? [h('span', { className: 'og-card-split-tag' }, '🔀 مقسوم')] : []),
    );
    item.dataset.search = `${c.ar} ${c.en} ${c.id}`.toLowerCase();
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
  // show/hide no-results
  let nr = list.querySelector('.og-no-results');
  if (!found && !nr) {
    nr = h('div', { className: 'og-no-results' }, 'مفيش نتيجة / No results');
    list.appendChild(nr);
  } else if (found && nr) {
    nr.remove();
  }
  // auto-switch to cards tab when searching
  if (q) {
    const cardsIdx = RULES_SECTIONS.findIndex(s => s.isCardList);
    if (cardsIdx >= 0) {
      rulesEl.querySelectorAll('.og-rules-tab').forEach((t, i) => {
        t.className = `og-rules-tab ${i === cardsIdx ? 'active' : ''}`;
      });
      rulesEl.querySelectorAll('.og-rules-section').forEach((s, i) => {
        s.className = `og-rules-section ${i === cardsIdx ? 'active' : ''}`;
      });
    }
  }
}

// ─── Lobby button helper ─────────────────────────────────────────────────────
export function createRulesButton() {
  injectStyle();
  return h('button', { className: 'og-rules-btn', onClick: openRules },
    h('span', null, '📖'),
    h('span', null, 'القواعد / Rules'),
  );
}

// ─── Auto-init: call from your entry point ──────────────────────────────────
export function init() {
  if (shouldShowOnboarding()) {
    showOnboarding();
  }
}
