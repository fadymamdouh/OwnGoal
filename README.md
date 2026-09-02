# ⚽ OWN GOAL — أون جول

**A 60-card football card game in Egyptian Arabic.** Two modes, 1v1 or 2v2, first to
3 goals. Playable as a single offline HTML file, as a static site on GitHub Pages
with Firebase, or against a Python WebSocket server. The rules live in one JSON
file and everything else is generated from it.

**العب على طول:** [fadymamdouh.github.io/OwnGoal](https://fadymamdouh.github.io/OwnGoal/)
· أو نزّل [`owngoal-offline.html`](owngoal-offline.html) واشتغل من غير نت خالص.

---

## الفكرة في سطر

كل هجمة بتتحسم بكارت واحد صح. **بس نص كروت الديك مقسومة** — هجوم من ناحية ودفاع
من التانية — ولما تلعب أي ناحية الكارت كله بيتحرق. يعني كل باص بتلعبه، بتحرق بيه
اعتراض كنت هتحتاجه بعد شوية. دي التكلفة اللي اللعبة كلها قايمة عليها.

## المكونات

**60 كارت** — 27 مقسوم و33 كامل — وعملة معدنية لقرارات الـ VAR. كل لاعب في إيده
**4 كروت** طول الماتش، مبتكبرش ومبتصغرش، لأن المدافع **مجبور يلعب كارت** حتى لو
مالوش رد. دي مش قاعدة قتال، دي قاعدة اقتصاد.

## المودين

| | مود الحظ | مود التكتيك |
|---|---|---|
| السحب | كارت واحد | من 1 لـ 3 |
| اللعب | كارت واحد | نفس العدد اللي سحبته |
| الدفاع | يرد على كل كارت | يرد على **آخر كارت** بس |
| الشوطة | أي وقت | **لازم آخر كارت في السلسلة** |
| المرتدة | مفيش | الكروت الفاضلة تبقى هجمتك فورًا |
| Block | شغال | مقفول |

المودين **مبيتخلطوش** في نفس الماتش. مود الحظ هو التجربة الأساسية المقصودة.

الدليل الكامل — بالأمثلة وجدول الحسم وتسلسل 2 ضد 2 — في
[`references/rulebook-ar.md`](references/rulebook-ar.md).

## تلعب إزاي

### 1. ملف واحد، بلا نت

نزّل [`owngoal-offline.html`](owngoal-offline.html) ودوس عليه. المحرك الحقيقي
جواه، وفيه بوت تلعب ضده. أسرع طريقة تجرب اللعبة.

### 2. لينك على GitHub Pages + Firebase

اللعب مع أصحابك من غير سيرفر. التفاصيل في [`web/README.md`](web/README.md).
لازم تنشر [`database.rules.json`](database.rules.json) في كونسول Firebase — من
غيرها أي لاعب يقدر يقرا إيد خصمه.

### 3. سيرفر Python

```bash
pip install -r requirements.txt
python scripts/server.py            # ثم افتح http://localhost:8000
```

السيرفر هو الحكم، فالكروت كلها مخبية عن الكلاينت. الرفع على Render مشروح في
[`DEPLOY.md`](DEPLOY.md).

> **فيه كلاينتين ومتلغبطهومش.** `web/index.html` هو نسخة Firebase وهي الوحيدة
> اللي تشتغل على استضافة static. `static/index.html` بتكلم `/ws` ومحتاجة سيرفر
> Python — لو حطيتها على Pages هتطلعلك `WebSocket connection failed`.

## القواعد مصدرها ملف واحد

[`references/rules.json`](references/rules.json) هو **المصدر الوحيد للحقيقة**.
الكروت، جدول الحسم، الاستحواذ، المودين، كل حاجة. أي حاجة تانية مولّدة منه:

```bash
python scripts/export_rules_js.py    # -> web/rules.js
python scripts/export_web.py         # -> static/cards.js, web/cards.js
python scripts/build_offline.py      # -> owngoal-offline.html
```

فلو غيرت قاعدة، شغّل التلاتة، وإلا الريبو يبقى مش متسق مع نفسه. الـ CI بيعمل ده
لوحده على كل push.

## الاختبارات

```bash
python scripts/validate_rules.py     # القواعد سليمة؟ لازم 0 errors
python scripts/test_engine.py        # 1200 ماتش — محرك بايثون
node web/test-engine.mjs             # 1000 ماتش — محرك المتصفح
node web/test-rulebook.mjs           # المحرك مطابق للدليل؟ 76 فحص
python scripts/test_server.py        # WebSocket، reconnect، حركة غلط
```

فيه **محركين** لازم يفضلوا متطابقين: [`scripts/engine.py`](scripts/engine.py)
للسيرفر و[`web/engine.js`](web/engine.js) للمتصفح. لو عدّلت قاعدة في واحد،
عدّلها في التاني، والاتنين ليهم test suite.

`test-rulebook.mjs` بيسأل سؤال مختلف عن الباقي: مش "هل المحرك متسق مع نفسه"،
لأ — "هل اللي المحرك بيعمله هو نفس اللي الدليل بيوعد اللاعب بيه". لعبة تقدر تكون
متسقة تمامًا ومع ذلك مش اللعبة اللي انت كتبتها.

## شكل الريبو

```
references/rules.json          المصدر الوحيد للقواعد
references/rulebook-ar.md      الدليل الكامل للاعبين
references/open-questions.md   القرارات المقفولة (L1-L27) والمخاطر المقبولة
references/simulation-findings.md  أرقام من المحاكاة

scripts/engine.py              المحرك (بايثون)
scripts/server.py              سيرفر FastAPI + WebSocket
scripts/make_cards.py          أوراق الطباعة
scripts/simulate.py            محاكاة ماتشات بالجملة

web/                           كلاينت Firebase — نسخة GitHub Pages
web/engine.js                  المحرك (متصفح)
static/                        كلاينت سيرفر البايثون

owngoal-offline.html           اللعبة كلها في ملف واحد (مولّد)
SKILL.md                       ملف تعريف المشروع لأي مساعد AI
```

## الحالة

`rules.json` على **v1.2.0** وحالته `COMPLETE` — 1 ضد 1 و2 ضد 2 الاتنين مكتملين
ومحاكيين، وجاهزين لـ **بلاي تست على الورق** وللطباعة وللبيلد الديجيتال.

الـ validator بيطلع **0 errors** و3 warnings. الـ warnings كلها نفس الحكاية:
الباص والأسيست بيتردّ عليهم بنسبة 90-95%، يعني هجمات شبه بلا قيمة. ده **دين
تصميم مسجّل**، مش عيب في الكود، ومكتوب في
[`references/open-questions.md`](references/open-questions.md) مع باقي المخاطر
المقبولة — وكل واحدة فيها مكتوب إنها **تتقاس في أول بلاي تست حقيقي**.

محدش لعب اللعبة دي على طرابيزة لحد الآن. المحاكاة مش بتقولك اللاعبين بيحسّوا
بإيه.

---

<div dir="ltr">

## For contributors

`references/rules.json` is the single source of truth. Read
[`SKILL.md`](SKILL.md) before changing any rule — it explains which rulings are
closed, which risks are accepted on purpose, and why the two engines must move
in lockstep. Run `scripts/validate_rules.py` and both engine suites plus
`web/test-rulebook.mjs` before opening a PR.

</div>
