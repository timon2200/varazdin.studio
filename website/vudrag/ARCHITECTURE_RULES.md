# Spatial Moodboard — Arhitektonska pravila i Zero-UI specifikacija

Ovaj dokument propisuje pravila razvoja za prostorni moodboard sustav u mapi `varazdin.studio/website/vudrag/`.

---

## 1. Zero-UI filozofija i čisto vizualno platno

1. **Zabrana vizualnog UI nereda na platnu:**
   - Niti jedan statički gumb, alatna traka, brojač u kutu ili lebdeći tekst ne smije biti postavljen na platno.
   - Kartice sa slikama i videozapisima moraju biti 100% čiste: **bez znački formata (WEBP, MP4), bez oznaka 'FILM', bez naslova i timecodeova preko slike.**
   - Videozapisi se automatski i tiho pokreću na hover miša.
   - Povećanje u puni zaslon (Lightbox) otvara se dvostrukim klikom na karticu ili kroz naredbu u traci.

2. **STROGA ZABRANA TOAST KARTICA, PILULA I OKVIRA (Pure Ghost Text Only):**
   - **STRIKTNO JE ZABRANJENO** prikazivati obavijesti u obliku plutajućih kartica, kutijica s pozadinom, pilula ili obruba (npr. tamni box sa sjenom *'Switched to: trakoscan'*).
   - Sve statusne poruke i potvrde izvršenih naredbi prikazuju se isključivo kao **čisti, sirovi tekst bez pozadine, bez obruba i bez sjene** u donjem desnom kutu (`rgba(255, 255, 255, 0.45)`, 13px, sans-serif).
   - Za svaku povratnu radnju koja se može poništiti tekst mora diskretno prikazati kraticu za undo (npr. *„Switched to Trakošćan · ⌘Z”* ili *„Media deleted · ⌘Z to undo”*).

---

## 2. Centralizirana Spacebar Shaper 3D komandna traka

Sve akcije, alati i navigacija **ISKLJUČIVO** se izvode putem Shaper 3D stila trake koja se otvara pritiskom na tipku **Spacebar** (ili `⌘ K`):

- **Stil:** Široka prozirna tamna staklena traka centrirana u prozoru, s poljem pretrage iznad popisa i gradijentnim zatamnjenjem te zamućenjem pri dnu. Aktivna ploča ima jedva vidljiv rub; odabir se glatko pomiče između redaka s prigušenim svijetloplavim obrisom.
- **Pretraživač:**
  - **Neovisan o redoslijedu riječi:** pretrage poput `board novi` ili `vudrag switch` ili `imge add` rade trenutno.
  - **Tolerantan na tipfelere:** koristi Damerau-Levenshtein i podnizno pretraživanje (npr. `vudrg`, `borad`, `swich`, `vidio`, `slka`, `centrr`).
  - **Dvojezični sinonimi:** hrvatski i engleski ključni pojmovi mapirani su na sve akcije (*slika / image / photo*, *video / film*, *link / url*, *novi / create / new*, *prebaci / switch*...).
- **Pravilo sažetog sučelja:** Traka prikazuje samo plutajuće polje `Search...` i jednoredne nazive opcija. Bez kategorijskih naslova, opisa ispod naziva, statusnih oznaka i podnožja. Za zadane ploče prikazuju se kratki nazivi `Film`, `Trakošćan`, `Garda`, `Streetwear`; puni nazivi ostaju pretraživi. Nazivi radnji su kratki: `New Board`, `Images`, `Video`. Prečaci se prikazuju kao male oznake desno od radnji kada su dio vizualne reference.

---

## 3. Popis ugrađenih naredbi i mogućnosti

| Kategorija | Naredba / Akcija | Prečac | Opis |
|---|---|---|---|
| **Ploče (Boards)** | *Film / Trakošćan / Garda / Streetwear* | — | Trenutno prebacivanje između zadanih ploča; korisničke ploče prikazuju vlastiti naziv |
| **Akcije** | *New Board* | `⌘ N` | Otvara inline unos imena nove ploče i odmah je kreira |
| **Akcije** | *Images* | `⌘ I` | Otvara birač slika s automatskom WebP optimizacijom |
| **Akcije** | *Video* | `⌘ V` prikazna oznaka | Otvara birač videozapisa s MP4 kompresijom |
| **Akcije** | *Add Link* | `⌘ L` | Otvara inline unos URL-a (direktne slike, videozapisi, YouTube, web stranice) |
| **Odabir & Grupiranje** | *Select All* | `⌘ A` / `Ctrl A` | Odabire sve kartice i mape na trenutnoj ploči |
| **Odabir & Grupiranje** | *Deselect All* | `Esc` | Poništava trenutačni odabir |
| **Odabir & Grupiranje** | *Group Selected* | `G` | Spaja sve odabrane medije u novu mapu (folder stack) na njihovom težištu |
| **Odabir & Grupiranje** | *Rearrange Selected Grid* | — | Uredno preslaguje odabrane kartice u kompaktnu proporcionalnu mrežu |
| **Odabir & Grupiranje** | *Ungroup Selected* | `E` | Raspakirava odabranu mapu natrag u pojedinačne kartice |
| **Uređivanje** | *Undo* | `⌘ Z` / `Ctrl Z` | Vraća posljednju promjenu na trenutačnoj ploči |
| **Uređivanje** | *Redo* | `⌘ ⇧ Z` / `Ctrl Y` | Ponavlja vraćenu promjenu |
| **Uređivanje** | *Scale Up (Enlarge)* | `⌘ +` / `+` | Povećava odabrane kartice za +15% |
| **Uređivanje** | *Scale Down (Shrink)* | `⌘ -` / `-` | Smanjuje odabrane kartice za -15% |
| **Uređivanje** | *Reset Card Size* | — | Vraća izvorne dimenzije odabranih kartica |
| **Uređivanje** | *Delete Media* | `Delete` / `Backspace` | Briše sve odabrane kartice; `⌘ Z` vraća obrisano |
| **Pogled & Navigacija** | *Center View* | `R` | Centriranje kamere i reset zoom faktora |
| **Pogled & Navigacija** | *Fit All* | `⌘ 0` | Automatsko kadriranje svih kartica na trenutnoj ploči |
| **Pogled & Navigacija** | *Arrange Grid* | — | Organsko raspoređivanje svih kartica na ploči u mrežu |
| **Pogled & Navigacija** | *Reset Layout* | — | Vraćanje početnog rasporeda |
| **Pogled & Navigacija** | *Fullscreen* | `F` | Uključivanje/isključivanje cijelog ekrana |
| **Upravljanje** | *Export JSON* | — | Preuzimanje JSON datoteke rasporeda i koordinata |
| **Upravljanje** | *Import JSON* | — | Uvoz kartica iz JSON datoteke |
| **Pretraga medija** | *Jump to [Kadar / Slika]* | `Jump` | Upisivanjem naziva kadra kamera glatko leti i fokusira se na tu karticu |

---

## 3.1. Pravila interakcije i kretanja platnom (Zero-UI Gestures)

1. **Navigacija platnom bez alata za hvatanje:**
   - **Mac Trackpad:** Gesta s dva prsta (Two-finger swipe) glatko pomiče platno u svim smjerovima; Pinch-to-zoom mijenja razinu približavanja.
   - **Windows / Miš:** Srednja tipka miša (klik i povlačenje kotačića / Middle Mouse Drag) pomiče platno.
   - **Kursor:** Nema trajnog `cursor: grab` stanja; platno zadržava prirodni sistemski kursor.
2. **Pravokutni gumeni odabir (Marquee Rubber-Band Selection):**
   - Povlačenje lijevom tipkom miša po praznom platnu iscrtava poluprozirni stakleni pravokutnik (`#selection-marquee`) sa suptilnim cijan obrubom i automatski označava sve zahvaćene kartice.
   - Pojedinačni klik na prazno platno poništava odabir.
   - `Shift` / `⌘` / `Ctrl` + klik na karticu dodaje ili uklanja pojedinačnu karticu iz višestrukog odabira.
3. **Grupne operacije u sinkronicitetu:**
   - Povlačenje bilo koje kartice unutar selekcije pomiče sve označene medije u istom smjeru uz zadržavanje njihovog međusobnog razmaka i zajednički zamašnjak (fling inertia).
   - Spuštanje više označenih kartica na mapu dodaje sve odabrane medije u tu mapu.
   - Prečac `G` spaja označene kartice u novu mapu na njihovom težištu.
   - Naredba *Rearrange Selected Grid* organizira samo označeni skup kartica u grid bez diranja ostatka ploče.
4. **Suptilna promjena veličine kartica (Zero-UI Resize Affordance):**
   - **Vizualni afordans:** Kartica ima 8 suptilnih hvataljki (4 kutna kvadratića `nw`, `ne`, `se`, `sw` i 4 rubne linije `n`, `s`, `e`, `w`). U mirovanju su nevidljivi (`opacity: 0`), na hoveru kartice se suptilno ocrtavaju (`opacity: 0.45`), a na odabranoj kartici svijetle cijan tonom (`opacity: 0.95`).
   - **Fizika i rotacija:** Povlačenje hvataljki radi u lokalnom koordinatnom sustavu rotirane kartice, zadržavajući suprotni kut fiksiranim na platnu.
   - **Omjer stranica:** Zadano se zadržava prirodni omjer medija; tipka `Shift` omogućava slobodno rastezanje.
   - **Grupno skaliranje:** Povlačenje hvataljke na jednoj odabranoj kartici proporcionalno skalira sve ostale označene kartice oko njihovih središta.
   - **Čisti Ghost Status & Undo:** Trenutne dimenzije (`w × h px`) ispisuju se u sirovom tekstualnom statusu u kutu, uz punu podršku za `⌘ Z` povratak na prethodnu veličinu.

---

## 4. Zero-UI Custom Video Player Specifikacija (Lightbox)

Svi videozapisi u Lightboxu koriste prilagođeni **Zero-UI video player** umjesto nativnih pregledničkih kontrola:

- **Auto-Hide / Ghost HUD:** Sve kontrole automatski i glatko nestaju nakon 2.2 sekunde neaktivnosti miša tijekom reprodukcije. Kursor također postaje nevidljiv (`cursor: none`). Na pomak miša kontrole se trenutno vraćaju.
- **Središnji pulsni glifovi:** Klikom na video ili prečacima prikazuje se animirani frosted glif s efektom skaliranja (Play, Pause, Step ±5s, promjena brzine/glasnoće).
- **Hairline Scrubber & Hover Bubble:** Linija trajanja ima visinu od 3px u mirovanju i 6px na hoveru, s lebdećim vremenskim balonom (`JetBrains Mono`) i podrškom za glatko povlačenje mišem.
- **Floating Controls HUD:**
  - *Lijevo:* Play/Pause, Step Back/Forward 5s, Timecode (`00:17 / 01:12`).
  - *Desno:* Multiplikator brzine (1.0×, 1.25×, 1.5×, 2.0×, 0.5×), Loop prekidač, sklopivi klizač glasnoće na hover i Fullscreen.
- **Prečaci na tipkovnici unutar playera:**
  - `Space` / `K` — Play / Pause
  - `F` — Fullscreen prebacivanje
  - `M` — Mute / Unmute
  - `←` / `J` — Premotavanje -5s
  - `→` / `L` — Premotavanje +5s
  - `↑` / `↓` — Glasnoća ±10%
  - `0`–`9` — Skok na 0%–90% trajanja
  - `Esc` — Izlaz iz punog zaslona ili zatvaranje Lightboxa

---

## 5. Uputa za buduće programere i agente

Ako dodajete bilo koju novu značajku (npr. promjenu boje pozadine, novi filter, AI generiranje medija, izvoz PDF-a):
1. **NIKADA NE DODAJTE GUMB NA EKRAN.**
2. Registrirajte novu funkciju unutar `getMasterCommandList()` u `index.html` s odgovarajućim ključnim riječima, ikonom i kategorijom.
3. Dodajte tipkovnički prečac u `canvasShortcuts` u `index.html` i osigurajte da ne preuzima tipke tijekom unosa teksta ili reprodukcije videa.
