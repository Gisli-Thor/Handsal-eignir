# Legacy system output — structural notes

Distilled from example PDFs produced by the system being replaced
("Fasteignasölukerfi HomeEd"), added 2026-08-21. The PDFs themselves are
gitignored (they contain real personal data — names, kennitölur, phones);
this file records only their structure, field inventory, and phrasing so
M3 (offers/fyrirvarar) and M4 (söluyfirlit) can match the real documents.

Local files (not committed): two söluyfirlit, one kauptilboð, one gagntilboð,
one kaupsamningur (scanned, 12 pages, no text layer — re-inspect visually
when building the kaupsamningur template in M4).

## Kauptilboð / Gagntilboð (3 pages)

**The two use the identical form — only the title differs.** A gagntilboð is
the same document re-issued in the negotiation chain (supports SPEC §7's
parent-chain model).

Layout, top to bottom:

1. **Parties block** — seljandi row(s) and kaupandi row(s), each with:
   kennitala, símanúmer, **hlutfall (%)**. Multiple buyers with unequal
   splits occur in practice (e.g. 54%/46%). Buyer email printed beneath.
   → Offer model needs *multiple buyer contacts with ownership percentages*,
   not a single buyer link.
2. **Property/reference header** — fastanúmer, númer íbúðar, eignarhlutur í
   húsi %, eignarhlutur í lóð %, **dags. söluyfirlits** (the offer
   cross-references the söluyfirlit version date), fasteignamat,
   brunabótamat, vátryggingafélag seljanda *and* kaupanda, yfirlýsing
   húsfélags (date), dags. kauptilboðs, dags. þinglýsingarvottorðs,
   útgáfudagur afsals, aflýsingardagur, **afhendingardagur** — free text in
   practice ("Desember 2026", "við kaupsamningi"), not always a date.
3. **Units table** (repeated per eignarhluti — an offer can cover several
   rows, e.g. apartment + stæði í bílageymslu under one fastanúmer):
   fastanúmer, landnúmer, eignarhluti, byggingarár, birt stærð, brunabótamat,
   húsmat, lóðamat, fasteignamat, byggingarstig (B1/B4…), matsstig, lýsing.
   Totals row.
4. **Lýsing eignar** — free text + þinglýst document references with
   registry numbers: eignarheimild (afsal), lóðarleigusamningur,
   eignaskiptayfirlýsing (format like `441-A-007480/2025`).
   Standard sentence that parties have reviewed and initialed the
   söluyfirlit, which "skoðast sem hluti af kauptilboði þessu".
5. **Special terms** — free-text block (new-build handover conditions,
   húsfélag statements, first-buyer stimpilgjald discount, etc.).
6. **Fyrirvarar** — free text in the legacy system but with consistent
   internal structure that validates SPEC §7's typed model. Real examples:
   - Sale-of-own-property: names the property + fastanúmer, "niðurstaða
     liggi fyrir innan 30 daga frá samþykki", consequence: seller may
     rescind by unilateral written declaration.
   - Greiðslumat/financing: buyer must deliver greiðslumat to the agency
     "eigi síðar en 20 dögum frá samþykki", else seller may rescind; agency
     authorized to verify the assessment with the bank.
   → deadline is expressed in *days from acceptance*; generated text should
   include the consequence clause.
7. **Kaupverð** — numerals AND **in words** ("Áttatíuogníumilljónir…").
   → need an ISK number-to-Icelandic-words formatter.
8. **Payment structure A/B/C** (totals of the three must equal kaupverð —
   matches SPEC's greiðslutilhögun sum validation):
   - **A. Greiðslutilhögun útborgunar** — numbered line items, description +
     amount; due dates usually embedded in the description ("við undirritun
     kaupsamnings", "gegn útgáfu afsals … 60 dögum eftir afhendingu", or an
     explicit date).
   - **B. Yfirteknar skuldir** — assumed existing loans.
   - **C. Veðbréf** — new mortgage notes issued at kaupsamningur: veðréttur,
     veðhafi ("Viðurkennd lánastofnun"), vísitala, fyrsti gjalddagi,
     gjalddagar á ári, vextir, fjárhæð, fjöldi afborgana.
   - **D.** veðheimild boilerplate sentence.
9. **Áætlaður kostnaður kaupanda** — fee table (fjöldi × eining = verð):
   þinglýsingargjald per document (kr. 3.800), þjónustu-/umsýslugjald m/vsk,
   stimpilgjald **per buyer** (0,4% of fasteignamat per 50% share for
   individuals, 1,6% for lögaðilar, 50% first-buyer discount per lög nr.
   138/2013), with a total.
10. **Numbered standard legal terms** — 22–25 clauses citing lög nr. 40/2002
    (fasteignakaup) and referencing attached documents; near-identical
    between the two examples (boilerplate template text, lightly customized
    per agency).
11. **Gildistími** — final bold line: "bindandi og stendur til **kl. HH:MM
    þann D.M.YYYY**" — expiry has date *and time* (SPEC's gildistími
    timestamp is right; the form needs a time input, not just a date).

## Söluyfirlit (2 pages)

Header cites its legal basis: "samið með vísan til 11. gr. laga nr. 70/2015
um sölu fasteigna og skipa", plus print date and generating system name.

1. **Key-facts panel**: fasteign (address), fasteignanúmer (F-prefixed),
   ásett verð, sveitarfélag (postal code + name), byggingargerð, herbergi,
   **stofur**, svefnherbergi, baðherbergi, heildarfermetrar, afhending
   (free text), **skoðunarmaður + skoðunardagur** (the agent who inspected
   and when), **sölutegund** (Einkasala/almenn sala), áhvílandi alls og í %,
   yfirtekin lán, áætluð afborgun á mánuði, álögð fasteignagjöld, vatns- og
   fráveitugjöld, húsfélagsgjald á mánuði + þar af framkvæmdagjald,
   brunatrygging (premium), svalir (text), lóð (text), **ástand vatnslagna /
   raflagna / frárennslislagna / glugga+glers / þaks** (condition-of-systems
   free-text fields), upphitun, inngangur.
2. **Þjóðskrá units table** — same shape as the offer's units table, plus
   byggingarstig ("B4 - Fullgerð bygging") and matsstig, and the line
   "Skráning samkv. Þjóðskrá Íslands."; lóðarréttindi/kvaðir
   (leigulóð + lóðarleiga á ári).
3. **Eigendur table** — name, kennitala, tengsl ("Þinglýstur eigandi"),
   símanúmer, hlutfall %.
4. **Marketing description** — headline + long body + room-by-room "Nánari
   lýsing", then agent contact block (name, löggiltur fasteignasali, phone,
   email).
5. **Veðskuldir table** (page 2): veðréttur, veðhafi, útgáfudagur, næsti
   gjalddagi, gjalddagar á ári, vextir, grunnvísitala, upphafleg fjárhæð,
   eftirstöðvar án vísitölu, eftirstöðvar m/verðbótum miðað við skil,
   áætluð afborgun á mánuði, fjöldi afborgana, **YAS flag**
   (Y=yfirtekið, A=aflýsist, S=samkomulag) + totals row.
6. **Signature lines**: "Lesið og móttekið (Kaupandi)" /
   "Lesið og staðfest (Seljandi)" — the söluyfirlit is signed by both.

## Schema gaps vs. current M2 model (feed into M3/M4 design)

- `Property` lacks: stofur count, condition fields (vatnslagnir, raflagnir,
  frárennslislagnir, gluggar/gler, þak), upphitun, svalir/lóð descriptions,
  inngangur, sölutegund, álögð fasteignagjöld, vatns-/fráveitugjöld,
  húsfélagsgjald (+framkvæmdagjald), brunatrygging premium, skoðunarmaður/
  skoðunardagur, landnúmer, byggingarstig/matsstig, húsmat/lóðamat split,
  þinglýst document references (eignarheimild/lóðarleigusamningur/
  eignaskiptayfirlýsing numbers), afhending free text.
- Multiple **units per listing** (apartment + parking as separate matsverð
  rows sharing a fastanúmer) — M2 models one Property per Listing; the
  söluyfirlit/tilboð tables need either a units sub-table or explicit
  parking/storage rows.
- `EncumbranceLoan` lacks: veðréttur (lien position), YAS status, vísitala,
  útgáfudagur, gjalddagar á ári, næsti gjalddagi, upphafleg fjárhæð,
  eftirstöðvar m/vb, áætluð afborgun, fjöldi afborgana.
- Offer (M3) needs: multiple buyers with hlutfall, seller/buyer insurance
  companies, A/B/C payment split (not just line items — B assumed debts and
  C new veðbréf are separate sections), amount-in-words, estimated buyer
  cost table, gildistími with time-of-day, afhendingardagur as free text,
  cross-reference to söluyfirlit version, þinglýsingar/stimpilgjald
  calculation rules (0,8%/0,4%/1,6%, first-buyer 50% discount).
- Both documents carry long standard legal boilerplate — template text
  stored per tenant (SPEC §12 note: real legal templates come from the
  customer; keep drafts clearly marked).
