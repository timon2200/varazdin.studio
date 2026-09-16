---
name: presentation-deck-builder
description: Automatska izrada 16:9 kinematografskih interaktivnih prezentacijskih mikrosajtova na temelju ponuda iz Ponude.app ili PDF ponuda, prilagođenih temi klijenta, s cPanel Git deploymentom na varazdin.studio.
---

# Presentation Deck Builder (varazdin.studio)

Ovaj skill omogućuje orkestratoru i rojevima agenata brzo i pouzdano generiranje, testiranje i objavu interaktivnih prezentacijskih mikrosajtova za klijente.

---

## 1. Kad se koristi ovaj skill
- Kad klijentu treba poslati interaktivni web-pitch deck umjesto običnog PDF-a.
- Kad postoji ponuda u aplikaciji `Ponude.app` ili PDF datoteka u `/Users/timonterzic/Documents/Ponude/`.
- Kad se prezentacija treba objaviti na `https://varazdin.studio/<client-slug>/`.

---

## 2. Brzo pokretanje (Jedna naredba)

Izvrši master orkestraciju koja automatski ekstrahira podatke iz ponude, generira 6-slajdni 16:9 deck, provodi QA audit i postavlja datoteke na `varazdin.studio`:

```bash
# Primjer s PDF ponudom i eco-utility temom:
python3 /Users/timonterzic/Documents/Ponude/scripts/orchestrate_presentation.py \
  "/Users/timonterzic/Documents/Ponude/Ponuda_Grad_Varazdin_Studio_Varazdin.pdf" \
  --slug "komunalni-projekt" \
  --theme "eco-utility"

# Primjer s Dark Luxury temom:
python3 /Users/timonterzic/Documents/Ponude/scripts/orchestrate_presentation.py \
  "/Users/timonterzic/Documents/Ponude/KB_Ponuda_Paket_16.pdf" \
  --slug "kb-pogon" \
  --theme "dark-luxury"
```

Dostupne teme:
- `eco-utility` (Zelena, bijela ciklorama, komunalni i eko projekti)
- `editorial-canvas` (Topli papir, logistika, industrija, Meridian 16 stil)
- `dark-luxury` (Tamnozelena/zlatna, filmska raskoš, kulturni i premium projekti)

---

## 3. Protokol roja agenata (5 uloga)

1. **`Ponude Extractor`**: Pokreće `python3 /Users/timonterzic/Documents/Ponude/scripts/fetch_ponuda.py` za dohvat strukturiranog JSON-a iz `Ponude.app` API-ja (`http://127.0.0.1:8765`) ili lokalnih PDF-ova.
2. **`Pitch Strategist`**: Definira 6-slajdni narativ (1: Hero kontrast, 2: Tehnologija, 3: Formati 16:9+9:16, 4: Metodologija, 5: Ponuda, 6: Autorizacija).
3. **`Croatian Narator`**: Piše tekst poštujući pravila naracije (`.agents/skills/naracija/SKILL.md` ili `/Users/timonterzic/.claude/skills/naracija/SKILL.md` — bez AI fraza, glagoli, činjenice u sredini odlomka).
4. **`Theme & Frontend Architect`**: Pokreće `python3 /Users/timonterzic/Documents/Ponude/scripts/generate_deck.py` za izradu 100% zero-dependency HTML/CSS/JS pozornice s gliderom, brojačem i WebGL slojevima.
5. **`QA Auditor`**: Pokreće `python3 /Users/timonterzic/Documents/Ponude/scripts/validate_deck.py` i jamči 60fps kvalitetu i ispravnost dijakritika prije `git push` objave.

---

## 4. Objava na varazdin.studio

Nakon što je generirana prezentacija u `varazdin.studio/website/<client-slug>/`:
```bash
cd "/Users/timonterzic/Documents/Studio Varazdin/varazdin.studio"
git add website/<client-slug>/
git commit -m "feat: dodana prezentacija za klijenta <client-slug>"
git push origin main
```
cPanel deployment automatski postavlja stranicu na `https://varazdin.studio/<client-slug>/`.
