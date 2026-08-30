# OWN GOAL — أون جول

لعبة كوتشينة كورة شارع مصرية. كوتشينة ورق + نسخة أونلاين بأوضات بكود.

## تشغيل النسخة الأونلاين

```bash
pip install -r requirements.txt
python scripts/server.py     # http://localhost:8000
```

## الملفات

| | |
|---|---|
| `references/rules.json` | القوانين — المصدر الوحيد للحقيقة |
| `references/rulebook-ar.md` | دليل اللعبة كامل بالعربي |
| `scripts/engine.py` | محرك اللعبة (سلطة السيرفر) |
| `scripts/server.py` | السيرفر: أوضات، أكواد، WebSocket، بوت |
| `static/index.html` | الواجهة |
| `scripts/make_cards.py` | مولّد كروت الطباعة (3 ستايلات) |
| `scripts/simulate.py` | محاكي التوازن |
| `DEPLOY.md` | الرفع على استضافة مجانية |

## اختبارات

```bash
python scripts/validate_rules.py
python scripts/test_engine.py
OG_BOT_DELAY=0 python scripts/server.py --port 8127 &
python scripts/test_server.py --port 8127
```
