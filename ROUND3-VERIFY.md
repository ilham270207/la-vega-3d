# ROUND3-VERIFY.md — Verifikasi independen FIX ROUND 3 (Lucas, 24 Nov ~04:30 WIB)

**Tujuan:** bikin rebuild BENAR-BENAR mirip file sebelum record (build lama M3b + Claude v9.8).
**Yang diverifikasi:** commit `9eb0752` (Fix R3-C) — head `main` saat verifikasi. R3-A (`896c786`), R3-B (`98bfc69`), R3-C (`9eb0752`) sudah di-push.
**Metode:** headless Chrome (file://, CDP) + baca kode. JANGAN percaya klaim tanpa bukti — round 2 diklaim 39/39 PASS tapi ilham tetap menemukan masalah di playtest.
**Bukti ilham:** 6 screenshot playtest round 2 (24 Nov 04:00 WIB, `~/workspace/user/files/10002544*.jpg`).

**KRITERIA TEGAS ilham (04:21 WIB):** "semua harus HD detail untuk kendaraan dan bangunan seperti di file sebelum nya, bukan malah memperparah."
- **Kendaraan FAIL** kalau masih kotak polos (kap/kabin/jendela/roda/bumper tidak terbaca).
- **Bangunan FAIL** kalau masih kotak polos (fasad/jendela/atap/pintu tidak terbaca sebagai arsitektur).
- Bandingkan langsung dengan file lama + beri skor detail. Kalau fix Eleven masih lebih jelek dari file lama = FAIL kritis, jangan diloloskan.

---

## RINGKASAN HASIL (headless playtest 3c, commit 9eb0752 — SELESAI 04:27 WIB)

**Hasil: 11/12 PASS, 1 FAIL (FAIL itu BUG PROBE, bukan bug game — lihat baris 8).**

| # | Item | Hasil | Bukti |
|---|------|-------|-------|
| 1 | Boot (game jalan, tanpa error) | ✅ PASS | Boot 10,9 dtk, 0 console error/exception |
| 2 | Cutscene: tombol sentuh TIDAK menutupi kartu judul | ✅ PASS | `touchVisible: false` saat cutscene, `overlap: false`, kartu "LA VEGA — A CITY THAT OWES YOU A LIVING" utuh (rect 354,98–926,211). Screenshot `01-cutscene-touch.png` — kartu bersih, TIDAK ADA tombol sentuh di atasnya |
| 3 | Laut: TIDAK banjir (sea berhenti di x=15) | ✅ PASS | Sea span x -1100..15, overlap tanah 0 m; pasir x15..48. **TAPI visual:** screenshot `01-cutscene-touch.png` — pasir = kotak oranye DATAR, laut = bidang biru muda DATAR, tanpa transisi bertahap (lihat FAIL VISUAL V1 di bawah) |
| 4 | Awan: BUKAN bola | ✅ PASS | `clouds=12, kinds=Sprite, geometry=BufferGeometry, y=102..153` — flat sprite, bukan SphereGeometry |
| 5 | Pohon lollipop: TIDAK ADA | ✅ PASS | Sphere crowns di atas trunk: 0. **TAPI:** bush bola tunggal masih ada (terlihat di `03-downtown-street.png` — bola hijau di kiri) — bukan di atas trunk, tapi tetap bola |
| 6 | Maya: TIDAK mengikuti Jax | ✅ PASS | `partner` = null (tidak ada partner di dunia). Follow branch dihapus, auto-spawn dihapus, switch dispose |
| 7 | Minimap: peta beneran (bukan grid) | ✅ PASS | Canvas 9310 byte dataURL; screenshot: blok gedung hijau + jalan + marker pink — terbaca sebagai peta kota, BUKAN grid hijau |
| 8 | 12 misi ada | ✅ PASS (probe salah) | Playtest baca `__laVega.missions.defs` → null karena MissionManager TIDAK punya properti `defs`. **Misi ADA: `config.js` = 12 entri (`MISSIONS`, line 205), `MissionManager` (`missions.js:28` `get nextMission()`)**. FAIL di log playtest = BUG PROBE Lucas, bukan bug game |
| 9 | Fitur baru jalan | ✅ PASS (runtime) | Businesses [neonBar, garageShares, beachHouse], phone=true, save=true, weather [sun, cloud, rain, storm], traffic=52 mobil, NPC=75. **TAPI:** misi 2–12 belum pernah dimainkan end-to-end (hanya misi 1) |
| 10 | Kendaraan HD detail (kriteria tegas) | ⚠️ SEBAGIAN | Sedan membaik (kaca gelap + shoulder line + hubcap). **Van/bus MASIH 1 kotak tinggi** di commit 9eb0752 — lihat F1. **Eleven SUDAH perbaiki di working tree (belum commit):** pickup open-bed + kaca depan miring (loader.js) — BELUM terverifikasi |
| 11 | Bangunan HD detail (kriteria tegas) | ⚠️ SEBAGIAN | Fasad `facadeTexture()` (grid + frame + emissive) bekerja — terlihat di `03-downtown-street.png`. **Tapi bentuk masih kotak, belum ada builder per tipe** di commit 9eb0752 — lihat F2. **Eleven SUDAH perbaiki di working tree (belum commit):** pilaster 0.5 m + base band lantai dasar + canopy pintu (city.js) — BELUM terverifikasi |

### TEMUAN VISUAL (dari 4 screenshot playtest 3c — `~/workspace/makefun/lucas-verify-round3c/`)

| # | Temuan | Screenshot | Status |
|---|--------|-----------|--------|
| V1 | **Pantai masih "kotak oranye + bidang biru"** — pasir = persegi panjang oranye DATAR, laut = bidang biru muda DATAR, tanpa gradasi/ombak/transisi. Banjir SUDAH hilang (sea berhenti di x=15) tapi pantai belum terbaca natural seperti file lama (sand ring + 8 wave strip animasi) | `01-cutscene-touch.png` | ❌ FAIL VISUAL — P1 |
| V2 | **Atap dari atas = kotak abu-abu gelap semua** — dari y=140, gedung cuma persegi panjang abu-abu datar, tanpa variasi warna/material atap, AC tidak kelihatan. Kota terbaca sebagai grid datar | `04-city-high.png` | ❌ FAIL VISUAL — P1 |
| V3 | **Fasad bekerja** — jendela grid pink/putih terbaca di gedung hitam, sign "NEON CUT SALON" terbaca, AC di atap (kotak + silinder gelap) terlihat. Bangunan TERBACA sebagai bangunan dari dekat | `03-downtown-street.png` | ✅ PASS (jarak dekat) |
| V4 | **Minimap terbaca sebagai peta** — blok gedung hijau + jalan + marker pink + laut/pasir di tepi. BUKAN grid hijau lagi | semua screenshot | ✅ PASS |
| V5 | **Pohon pinus = kerucut hijau** (lebih baik dari lollipop), tapi **bola hijau (bush) masih ada** di tepi jalan | `03-downtown-street.png` | ⚠️ SEBAGIAN — P1 |

### Catatan proses (PENTING)
- **Playtest pertama (3a) GAGAL boot** — `SyntaxError: Identifier 'rockM' has already been declared` di `city.js:993`. Penyebab: Eleven sedang mengedit file saat Chrome memuatnya (state transien tengah-edit, BUKAN bug di commit). `rockM` hanya dideklarasi 1× di semua commit R3 (diperkenalkan di `92f0feb`); `node --check` lolos semua file src. **Pelajaran:** Eleven jangan edit file saat Lucas sedang playtest — verifikasi harus terhadap commit yang stabil, bukan working tree yang berubah.
- **Playtest 3b (commit 9eb0752):** boot PASS 10,9 dtk; cutscene PASS. Crash di cek laut karena `THREE` bukan global halaman (script memakai `new THREE.Box3()` — salah Lucas, bukan salah game). Diperbaiki di 3c (baca `geometry.parameters` + `position` langsung).

### ELEVEN MASIH KERJA — R3-D (belum di-commit, 04:27 WIB)
Eleven sedang mengerjakan perbaikan HD lanjutan di working tree (belum commit/push — **BELUM TERVERIFIKASI**):
- **`game/src/city.js` (+65 baris):** pilaster 0.5 m menonjol (dulu 0.35 inset, tak terlihat dari jauh) + **base band lantai dasar** 3.6 m menonjol 0.1 m (plinth toko) + **canopy pintu** di 2 tiang untuk gedung tinggi/komersial. Ini menjawab F2 (bangunan) — tapi BELUM di-playtest.
- **`game/src/loader.js` (+151 baris):** **varian PICKUP** (cab + bak terbuka berdinding, bukan sedan) + **kaca depan miring** (rotation.x 0.5) + **kaca belakang miring** (rotation.x -0.45) + kabin lebih sempit. Ini menjawab F1 (kendaraan) — tapi BELUM di-playtest.
- **`ROUND3-GAPS.md` (+265 baris):** Dustin/Eleven tambah **BAGIAN A — HD DETAIL** (prioritas #1 ilham 04:21 WIB).
- **TUGAS LUCAS BERIKUTNYA:** begitu Eleven commit + push R3-D, playtest ulang (script `lucas-verify-round3.mjs` siap) — verifikasi V1/V2/F1/F2/F4 terhadap commit baru. JANGAN kirim ZIP ke ilham sebelum R3-D lolos.

---

## SKOR HD DETAIL — Kendaraan & Bangunan (kriteria tegas ilham)

### Kendaraan — skor detail vs file lama (skala 0–10, file lama = 10)

| Aspek | File lama (acuan) | Rebuild R3 (9eb0752) | Skor |
|---|---|---|---|
| Sedan/prosedural | GLB Quaternius (model 3D asli, roda bisa spin, cat) + fallback: kabin kaca, kap, grille chrome, bumper, lampu emissive, 4 roda | GLB diutamakan + fallback: kaca GELAP (R3-B), shoulder line, hubcap, roda 0.38, lampu besar | **7/10** — bagus, tapi masih kotak (belum ada lengkung/slope kap) |
| Van/bus | Bus 10 m: window band kaca, headlight emissive, 6 roda | Body SATU kotak tinggi (tall 2.0–2.6) + dark band — dari samping = kotak biru + kotak hitam | **3/10 — FAIL KRITIS** — bentuk belum dipecah (kab depan + badan + atap), persis yang ilham lihat di screenshot 5 |
| Truk | Cab + glasshouse + ribbed cargo box + chrome grill/bumper + lampu | Cab + kaca gelap (R3-B ganti warna kaca saja) | **5/10** — struktur ada, tapi ribbed cargo + chrome belum setara file lama |
| GLB di koneksi lambat | GLB + fallback prosedural | GLB paralel + timeout 8 dtk; di koneksi ilham (3–8 KB/s) GLB besar kemungkinan gagal → fallback kotak yang terlihat | **Risiko** — fallback HARUS cukup bagus karena GLB sering tidak ke-load |

**Verdict kendaraan: BELUM HD.** Sedan membaik (7/10), tapi van/bus (3/10) masih kotak polos — ilham pasti langsung melihatnya. **FAIL kritis** sampai van/bus dipecah jadi 2–3 bagian (kab depan miring + badan + atap) + kaca depan miring + roda kelihatan.

### Bangunan — skor detail vs file lama (skala 0–10, file lama = 10)

| Aspek | File lama (acuan) | Rebuild R3 (9eb0752) | Skor |
|---|---|---|---|
| Fasad/jendela | `windowsTex()`: canvas texture grid jendela + frame gelap + mullion cross + floor separator + pilaster strips; terbaca dari jauh | `facadeTexture()` (R3-A): grid + frame + highlight putih + emissive (2/3 jendela nyala malam) di 4 sisi + pintu + step | **8/10** — sudah setara file lama untuk fasad generik |
| Arsitektur per tipe | **16 builder dedikasi**: club (glow strip pink + pintu emissive), casino (upper box setback + neon cyan), city hall (portico 5 kolom + kubah hijau), mall (canopy + forecourt), garage (open bays), warehouse (sawtooth roof 3 gigi + cerobong), hospital (windowsTex + rooftop box) | SATU builder generik `makeBuilding()` + `makeVilla()`; named places cuma beda style/tinggi/sign | **4/10 — FAIL** — bentuk bangunan masih sama semua, cuma warna/tinggi beda |
| Atap | Slope/dome/flat + rooftop props (AC + fan silinder + concrete box + water tank) | AC + tank + penthouse setback (R3-A, h≥12) | **7/10** — bagus, tapi fan silinder AC ala Claude belum ada |
| Tanda/sign | Sign kanvas per tempat (NEON PALM, AUTO PALMS, dll) | Sign texture per tempat | **7/10** — ada, cukup |

**Verdict bangunan: BELUM HD.** Fasad generik sudah bagus (8/10), tapi arsitektur per tipe masih 4/10 — semua gedung bentuknya sama. **FAIL** sampai minimal 7 builder khusus dibuat (club, casino, city hall, mall, garage, warehouse, hospital) dengan bentuk yang benar-benar beda, bukan cuma warna.

---

## ANALISIS GAP — YANG KURANG & PERLU DITAMBAHKAN
*(Bangun di atas `ROUND3-GAPS.md` Dustin — 10 gap. Bagian ini menambah temuan KHUSUS dari 3 file acuan yang belum dicakup Dustin.)*

### GAP-CL-1 — Awan Claude: teknik instancing + posisi TINGGI (sudah diperbaiki R3-B, tapi catat spesifikasinya)
- **Di Claude** (`Solmar_Heat_3D_v9_8_ib9b.html`, bagian `SKY: sun, moon, stars, clouds`):
  - 20 awan × 6 bola = 120 instance (`T.I(SPH, clM, NC*6)` — InstancedMesh, 1 draw call).
  - Tiap bola DIPIPIHKAN: scale `(34+rnd()*26, 12+rnd()*8, 22+rnd()*14)` — y-scale (12–20) ≈ 1/3 x-scale (34–60). Bukan bola bulat.
  - Posisi: radius 420–720 dari pusat, **y = 130–300 (TINGGI)**, 6 bola per awan tersebar ±45m horizontal, ±7m vertikal.
  - Rotasi lambat (`clG.rotation.y += dt*0.004`), warna berubahตาม waktu (siang putih → senja oranye → malam gelap).
  - Matahari = bola radius 26 di jarak 620 + glow radius 60 (opacity 0.2). Bulan radius 20 + halo 34 + 12 kawah (bola pipih scale z 0.4). Bintang = 420 instance bola di radius 760.
- **Di rebuild R3-B:** 12 flat sprite (canvas texture 7 radial gradient), scale w×0.28, y 100–155. ✅ Arahnya BENAR (pipih + tinggi + jauh). **Tapi:** sprite selalu menghadap kamera (billboard) — dari samping tetap datar; Claude pakai bola pipih 3D yang punya volume dari semua sudut. **P1:** kalau sprite terbaca datar/aneh, ganti ke instancing Claude (6 bola pipih per awan, y 130–300).
- **Yang BELUM ada di rebuild:** kapal + mercusuar di laut (Claude: `put(ship,-150,630,0)`, `put(lighthouse,200,600,0)` + beam berputar `rotation.y += dt*1.2`). **P2:** tambah mercusuar + kapal sebagai landmark laut.

### GAP-CL-2 — Palem Claude: batang 5 segmen melengkung (bukan 2 segmen)
- **Di Claude:** `palm=(g,x,z)=>{...for(let i=0;i<5;i++){const o=.035*py*py, sl=.07*py, m=cy(.27-i*.026, .31-i*.026, 1.3, ...)` — batang 5 segmen, tiap segmen bergeser makin besar (lengkung parabolik `o=.035*py*py`), warna coklat selang-seling, + daun + kelapa.
- **Di rebuild** (`loader.js:buildPalm()`): 2 segmen miring + 8 frond kotak + kelapa. **P1:** tambah jadi 4–5 segmen dengan offset parabolik supaya lengkungnya kelihatan seperti Claude (bukan 2 segmen lurus yang patah di tengah).

### GAP-CL-3 — AC atap Claude: kipas silinder di atas tiap unit
- **Di Claude** (`function buildings`): `nAC=2+floor(H(1)*4)` (2–5 unit) + tiap unit punya **kipas silinder** (`B.cyl(mats.dark, x, y+1.12, z, .42, .06, 10)`) + **concrete box 3.2×2.6×3.2** di atap.
- **Di rebuild:** AC ada (2–4 unit) tapi TANPA kipas silinder. **P2:** tambah kipas silinder gelap di atas tiap unit AC + concrete box atap.

### GAP-OLD-1 — Gelombang animasi + sand ring (sudah diperbaiki R3-A, tapi bandingkan)
- **Di build lama** (`city.js:143-219`): sea di `y = -0.25` (DI BAWAH ground), sand ring/apron `ShapeGeometry` 1040×1040 berlubang (y=-0.05), **8 animated wave strips** putih transparan (opacity 0.35) di x 13.5–15.5 yang bergerak menyusuri pantai, + biome ground patches (forest/desert/hills) + instanced grass tufts (90) + pebbles (50).
- **Di rebuild R3-A:** sea berhenti di x=15 (y=0.05) + pasir x15..48 + 3 foam strip + 9 batu laut + 12 dune. ✅ Akar banjir SUDAH diperbaiki. **Tapi:** sea masih di y=0.05 (DI ATAS ground y=0), bukan y=-0.25 seperti file lama. Foam strip menggantikan wave strips. **P1:** kalau pantai masih terbaca "air di atas tanah", turunkan sea ke y=-0.25 seperti file lama.
- **Yang BELUM ada:** biome ground patches (forest/desert/hills) + instanced tufts/pebbles. **P1:** tambah patch + tufts supaya tanah tidak datar.

### GAP-OLD-2 — Broadleaf 5-blob + roadside (Dustin sudah catat — tegaskan prioritas)
- **Di build lama** (`city.js:1160-1172`): broadleaf = 5-blob canopy tidak beraturan (5 bola offset/tinggi beda, 2 warna hijau) + trunk TEBAL (0.22–0.32). Komentar: "(was 3 perfect spheres on a thin 0.16 trunk = a lollipop)". Roadside broadleaf tiap 11 m, 40% tiap sisi, di trotoar luar.
- **Di rebuild:** 70 bush bola tunggal + planter bola masih ada. **P0:** hapus semua bola tunggal → `buildBroadleaf()` (5-blob + trunk tebal) + tanam roadside.

### GAP-OLD-3 — Minimap file lama: bangunan + marker misi + polisi
- **Di build lama** (`game.js:4017+`): minimap 168×168 bulat, background kaca gelap, sea/land/biome (muted), park, jalan putih 1.6px, **GEDUNG (putih 0.28 alpha dari `city.mapBuildings`)**, marker misi (diamond emas berdenyut), polisi (merah saat wanted).
- **Di rebuild R3-C:** gedung dari `city.colliders` (abu-abu #55684f) + jalan lineWidth 2. ✅ Sudah setara. **P2:** tambah marker misi diamond emas berdenyut + polisi merah (file lama punya, rebuild belum tentu ada).

### GAP-CE-1 — Corrupt Estate (dari `lucas-ce-compare.md`, sudah dicakup Dustin)
- Tiang listrik CE: 10 m, 2 crossarm, 5 isolator, trafo 1/3, 3 kabel, bisa roboh (nabrak ≥7 m/s dalam 3,6 m → jatuh + percikan + ZAP arc + kabel hilang + collider dicabut). Rebuild sudah punya (72 tiang + kabel + roboh) — verifikasi visual di playtest.
- Jalan CE 14 m (2× rebuild 7 m), trotoar 4,5 m. **P1:** ilham minta jalan dilebarin (cek apakah rebuild sudah).
- Lampu jalan CE: 4/chunk, tiang 5 m + box glow. Lampu lalin CE: 4/persimpangan, instanced. **P1.**
- NPC CE: shop/phone/FISHING di air (bawa joran!) — rebuild sudah punya 5 nelayan. ✅
- Atmosfer CE: ACES tone mapping, fog dekat (390–540), langit malam → siang → senja. Rebuild sudah punya ACES. ✅

### GAP-FITUR — Fitur baru rangkuman: yang ADA di kode vs yang TERLIHAT
- 12 misi ADA (`config.js`, 12 entri) — tapi **hanya misi 1 terverifikasi dimainkan**. Misi 2–12 belum pernah dimainkan end-to-end. **P0:** mainkan misi 2–12 satu per satu di headless playtest.
- Bisnis beli ADA (Neon Bar $2.000, saham Manny $1.500, Beach House $1.200) — tapi prompt `[E] Buy` cuma muncul dalam 4,5 m dari pintu. **P1:** tambah penanda permanen (ikon `$` / beacon emas) + notifikasi pertama kali dekat.
- Polisi/dispatch, ekonomi, phone, save, weather, traffic, NPC, senjata: ADA di kode. **P1:** verifikasi masing-masing benar-benar jalan di playtest (bukan cuma "ada di kode").

---

## DAFTAR FAIL KRITIS (untuk Max — jangan diloloskan)

| # | FAIL | Bukti | Prioritas | Status |
|---|------|-------|-----------|--------|
| F1 | **Van/bus masih kotak polos** (HD detail) | `loader.js:buildProceduralVan()` — body SATU kotak tinggi (tall 2.0–2.6) + dark band; R3-B cuma ganti warna kaca | **P0** — ilham pasti langsung lihat; kriteria tegas | 🔄 Eleven SUDAH perbaiki di working tree (pickup open-bed + kaca miring) — BELUM commit, BELUM terverifikasi |
| F2 | **Bangunan belum ada arsitektur per tipe** (HD detail) | SATU `makeBuilding()` generik; file lama punya 16 builder dedikasi | **P0** — ilham: "bangunan masih polos, belum ada model" | 🔄 Eleven SUDAH perbaiki di working tree (pilaster + base band + canopy) — BELUM commit, BELUM terverifikasi |
| F3 | **Misi 2–12 belum terverifikasi dimainkan** | Hanya misi 1 yang pernah dimainkan end-to-end | **P0** — jangan klaim "mesinnya sama" | ⏳ Belum dikerjakan |
| F4 | **Bola tunggal (bush/planter) masih ada** | 70 bush bola + planter bola di `city.js`; terlihat di `03-downtown-street.png` | **P0** — sumber lollipop yang tersisa | ⏳ Belum dikerjakan |
| V1 | **Pantai masih kotak oranye + bidang biru datar** | `01-cutscene-touch.png` — pasir persegi panjang oranye datar, laut bidang biru datar, tanpa gradasi/ombak | **P1** — banjir hilang, tapi belum natural | ⏳ Belum dikerjakan |
| V2 | **Atap dari atas = kotak abu-abu gelap semua** | `04-city-high.png` — dari y=140 gedung cuma persegi panjang abu-abu datar | **P1** — kota terbaca grid datar dari atas | ⏳ Belum dikerjakan |

## YANG SUDAH BENAR (jangan diutak-atik)
- ✅ Cutscene: tombol sentuh disembunyikan (R3-C, terverifikasi playtest 3b + 3c).
- ✅ Maya follow: DIHAPUS total (R3-C, kode + runtime: partner = null).
- ✅ Laut: sea berhenti di x=15, overlap tanah 0 m (R3-A, kode + runtime).
- ✅ Awan: flat sprite, bukan bola (R3-B, kode + runtime: 12 Sprite, y 102–153).
- ✅ Fasad: `facadeTexture()` grid + frame + emissive (R3-A, kode + visual `03-downtown-street.png`).
- ✅ Minimap: footprint gedung dari colliders (R3-C, kode + visual — terbaca sebagai peta).
- ✅ Boot: 10,9 dtk, 0 console error (playtest 3b + 3c).
- ✅ 12 misi ADA (`config.js`, 12 entri) + MissionManager; bisnis/phone/save/weather/traffic/NPC jalan di runtime.

---

## STATUS VERIFIKASI
- **Playtest 3c (commit 9eb0752): SELESAI 04:27 WIB — 11/12 PASS.** Satu-satunya FAIL di log (`missions=null`) adalah BUG PROBE Lucas (baca properti `defs` yang tidak ada di MissionManager) — misi 12 ADA di `config.js`, dikonfirmasi.
- **Skor HD (commit 9eb0752):** sedan 7/10, van/bus 3/10 (FAIL), truk 5/10, fasad 8/10, arsitektur per tipe 4/10 (FAIL).
- **Eleven R3-D (working tree, belum commit):** city.js + loader.js + ROUND3-GAPS.md Bagian A — menjawab F1/F2. **Lucas akan playtest ulang begitu Eleven commit + push.** JANGAN kirim ZIP ke ilham sebelum R3-D lolos verifikasi (aturan ilham 04:26 WIB: Max verifikasi dulu, baru kirim kalau lolos Max + Lucas).
- **File ini ditulis oleh Lucas** (sesi terekam, rekaman 01a20a40). Gap analysis Dustin ada di `ROUND3-GAPS.md` (komit `e85ae9e` + update Bagian A oleh Eleven, belum commit).
- **Script playtest:** `~/workspace/makefun/lucas-verify-round3.mjs` (siap dipakai ulang untuk R3-D). Screenshot 3c: `~/workspace/makefun/lucas-verify-round3c/` (00-menu, 01-cutscene-touch, 02-beach-sea-edge, 03-downtown-street, 04-city-high, 05-minimap-view).
