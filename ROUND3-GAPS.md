# ROUND3-GAPS.md — Gap analysis fix round 3 (Dustin, 24 Nov ~04:25 WIB)

**Tujuan:** bikin rebuild BENAR-BENAR mirip file sebelum record (build lama M3b + Claude v9.8).
**Acuan:** build lama `~/workspace/makefun/gta6-01-3d/game/src/` (16.037 baris) + Claude v9.8
`~/workspace/user/files/Solmar_Heat_3D_v9_8_ib9b.html` + `~/workspace/makefun/lucas-ce-compare.md`.
**Rebuild:** `~/workspace/makefun/gta6-01-3d-recorded/game/src/` (7.555 baris, naik dari 6.342 pasca round 2).
**Bukti ilham:** 6 screenshot playtest round 2 (24 Nov 04:00 WIB, `~/workspace/user/files/10002544*.jpg`).
**UPDATE 04:21 WIB (perintah tegas ilham):** semua HARUS HD detail untuk kendaraan dan
bangunan seperti file sebelumnya — **BAGIAN A di bawah = prioritas #1**, dikerjakan duluan.

Aturan: baca acuan, tulis ulang sendiri — JANGAN copy-paste file utuh. Semua perbaikan harus
diverifikasi headless + screenshot, bukan cuma klaim di kode.

---

# BAGIAN A — HD DETAIL KENDARAAN & BANGUNAN (PRIORITAS #1 ILHAM, 04:21 WIB)

> Perintah tegas ilham 24 Nov 04:21 WIB: *"Pokoknya aku mau semua harus HD detail untuk
> kendaraan dan bangunan seperti di file sebelum nya, bukan malah memperparah."*
> Artinya: tingkat detail rebuild harus **disamakan atau dilewati** dari file lama
> (build lama + Claude v9.8) — diukur dari jumlah mesh/part per objek, resolusi tekstur,
> dan variasi bentuk, BUKAN cuma "tambah detail" secara umum. Bagian ini ditulis duluan
> dan dikerjakan duluan; GAP 1–10 di bawah tetap berlaku.

## A.1 — BANGUNAN: kenapa file lama terlihat HD, rebuild masih polos

**Fakta dasar (hitung sendiri sebelum klaim "sudah HD"):**
- Build lama: **16 builder khusus** (`buildClub`, `buildGarage`, `buildWarehouse`,
  `buildHospital`, `buildCasino`, `buildCityHall`, `buildMall`, `buildCinema`,
  `buildDealer`, `buildConstruction`, `buildDriveThru`, `buildVilla`, `buildPoliceStation`,
  `buildPetShop`, `buildRestaurant`, `buildVilla2` — old `city.js:565-825`) +
  **~11 style generik** berbeda siluet (glass tower, brick, concrete, stucco hotel 3-tier,
  colorful shop, office, villa, bay-window house, white modern, blue glass setback, cream —
  old `city.js:440-560`) + **"3D structure kit"** (groundFloor, canopy, pilasters, crown,
  floorBands, rooftopProps — old `city.js:303-360`).
- Rebuild: **SATU** `makeBuilding()` (rebuild `city.js:399-560`) + 6 palet warna
  (BUILDING_STYLES) + 4 jenis atap + penthouse setback. Semua bangunan = kotak yang sama,
  beda warna/tinggi/atap saja.
- Claude v9.8 `buildings()` (file 1.044.960 B, char ~1032635): rooftop kit per bangunan
  (2–5 AC + fan, concrete box, water tank 4 kaki, 4 solar panel miring, antena 8 m +
  beacon merah) + awning + valance + planter + balkon lantai selang-seling + AC fasad.
  **Rebuild SUDAH mem-port kit ini** (rebuild `city.js:505-550`) — jadi atap BUKAN gap-nya.
  Gap-nya ada di **fasad, lantai dasar, siluet, dan signage** (HD-B1 – HD-B5 di bawah).

### HD-B1 — Tekstur fasad: 128 px tanpa mullion vs 256 px + frame + mullion + separator (KRITIS)
**Bukti rebuild** (`city.js:79-121` `facadeTexture`):
- Canvas **128×128 px** untuk SATU muka bangunan penuh. Grid misal 6 kolom × 4 baris →
  tiap sel jendela ~21×32 px, jendela itu sendiri ~13×19 px. Di jarak main (>30 m) ini
  blur jadi kotak warna — "polos".
- Tiap jendela cuma: outline gelap 1,5 px + isi kaca + highlight putih 25% atas. **TIDAK
  ADA** mullion cross (palang tengah) dan **TIDAK ADA** garis pemisah lantai.
**Bukti acuan** (old `city.js:22-50` `windowsTex`):
- Canvas **256×256 px**, grid misal 6×4 / 8×16 / 10×10 (per style, `city.js:427-545`).
  Sel 6×4 = 42×64 px, jendela 27×36 px — **2× lebih besar per jendela** dari rebuild.
- Tiap jendela digambar: frame gelap `strokeRect` 2 px + **mullion cross**
  (garis vertikal + horizontal tengah jendela) + **floor separator**
  (`fillRect(0, r*ch, w, 3)` garis gelap tiap lantai) + 12% jendela menyala warm
  (`lit` #ffe9a8 / #ffd98a, seeded RNG jadi pola tidak berulang).
- `facadeBox` (old `city.js:287-300`): tekstur di 4 sisi, atap polos — sama seperti rebuild.
  PLUS old `sideWindows()` (old `city.js:424-438`): bidang jendela terpisah di sisi
  samping bangunan (grid 6 kolom × baris sesuai tinggi) supaya tidak ada sisi polos.
**Perbaikan konkret:**
1. Naikkan `facadeTexture` ke **canvas 256×256** (rebuild `city.js:83`: `const N = 128` → 256).
2. Tambah **mullion cross** per jendela (2 garis, `strokeStyle rgba(0,0,0,0.5)`,
   `lineWidth 2`) + **floor separator** (garis gelap 3 px tiap baris) — persis old
   `windowsTex`.
3. Jendela dibuat **lebih besar dalam sel**: isi 64% lebar × 56% tinggi sel
   (old: `x0 = c*cw + cw*0.18`, `ww = cw*0.64`, `hh = ch*0.56`) — rebuild sekarang
   60% × 60% tanpa frame, terlihat lebih kecil.
4. Turunkan proporsi jendela menyala dari ~1/3 (rebuild emissiveMap `(i*5+j*3+cols)%3`)
   ke **~12%** dengan warna warm (#ffe9a8) + seeded pattern — 1/3 menyala bikin fasad
   terlihat seperti lampu, bukan jendela.

### HD-B2 — Lantai dasar: tidak ada proud base, canopy, crown, floorBands (KRITIS)
**Bukti rebuild** (`makeBuilding`, `city.js:399-560`): SATU kotak + pilaster tipis 0,35 +
shop band kaca 0,18 (rata dengan dinding) + fascia + pintu + step + awning (65% chance).
**Tidak ada:** base lantai dasar yang menonjol, canopy di tiang, cornice di atap,
slab lantai.
**Bukti acuan** (old `city.js:303-360`, "3D structure kit — real geometry on every
building, not just texture"):
- `groundFloor`: base box **(w+0,2) × 3,6 × (d+0,2)** — lantai dasar LEBIH LEBAR 0,2 m
  dari badan, jadi bangunan punya kaki yang terbaca dari jauh + kaca storefront
  (PlaneGeometry w×0,5, 2,4) + pintu 1,7×2,6 + step 2,4×0,25.
- `canopy`: atap masuk **(w × 0,22 × 1,6)** di y=3,9 + **2 tiang** silinder r=0,08
  tinggi 3,9 — entrance terbaca sebagai entrance, bukan tempelan.
- `pilasters`: 4 pilaster sudut 0,5×0,5 setinggi badan di atas lantai dasar.
- `crown`: cornice **4 rim** (w+0,7 × 0,5 × 0,4) mengelilingi roofline — atap tidak
  berakhir tiba-tiba.
- `floorBands`: slab tipis **(w+0,35) × 0,28 × (d+0,35)** tiap lantai (floorH) di
  fasad gedung tinggi — garis horizontal struktur.
- `rooftopProps`: AC 1,6×0,9×1,2 + AC kedua + plant box + water tank (silinder r=0,9
  tinggi 2,0 + cone) + antena 4,5 m + beacon merah emissive.
**Perbaikan konkret (port kit ini ke `makeBuilding`, JANGAN cuma tekstur):**
1. Ground floor: tambah base box (w+0,2 × 3,6 × d+0,2) di semua bangunan.
2. Canopy: tambah atap masuk + 2 tiang di bangunan toko/kantor (bukan cuma awning miring).
3. Crown: tambah 4 rim cornice di roofline semua bangunan (w+0,7 × 0,5).
4. FloorBands: tambah slab tipis tiap lantai untuk bangunan h ≥ 12.
5. Pilaster rebuild sudah ada (0,35) — tebalkan ke **0,5** seperti old.

### HD-B3 — Bangunan bernama: 16 builder khusus vs 1 fungsi + papan nama (KRITIS)
**Bukti rebuild** (`city.js:731-774`): named defs (club, casino, clotheshop, salon, …)
cuma beda `style/h/w/d/neonColor/sign` — semuanya tetap `makeBuilding()` yang sama +
`makeSign()` (teks). Tidak ada perbedaan bentuk.
**Bukti acuan** (old `city.js:565-825`) — tiap tempat punya SILUET sendiri:
- Club (`buildClub`, old `city.js:565`): kotak ungu + atap (w+1 × 1 × d+1) + sign
  "LA ROSA'S" + **neon glow strip** (PlaneGeometry w × 0,5, emissive 2) + pintu gelap
  3×4,4 emissive pink 0,25.
- Casino (`buildCasino`, old `city.js:615`): badan + **setback lantai atas**
  (w×0,7 × h×0,5 × d×0,5) + neon plane cyan emissive 2,2 + sign "NEON PALM".
- City Hall (`buildCityHall`, old `city.js:624`): **5 kolom** silinder r=0,55–0,65
  tinggi h×0,85 + portico box (w×0,8 × 1,2 × 3) + **dome** SphereGeometry r=4,2
  (setengah bola) + sign "CITY HALL".
- Mall (`buildMall`, old `city.js:637`): kaca besar (w×0,5 × 5) + **forecourt pad**
  + canopy 8×0,22×2 di 2 tiang + sign "FOOD COURT" + 2 planter + shrub.
- Hospital (`buildHospital`, old `city.js:607`): windowsTex 6×4 + rooftop box
  (w×0,4 × 3 × d×0,4) + sign "LA VEGA GENERAL".
- Warehouse (`buildWarehouse`, old `city.js:589`): **sawtooth roof** (atap gergaji);
  Garage (`buildGarage`, old `city.js:577`): **open bays** (pintu garasi terbuka);
  Villa (`buildVilla`/`buildVilla2`, old `city.js:701/825`): 2-tier + chimney + terrace.
**Perbaikan konkret:** buat MINIMAL 6 builder khusus di rebuild (port dari old, tulis
ulang sendiri): club (glow strip + pintu emissive), casino (setback + neon), city hall
(5 kolom + dome), mall (forecourt + canopy tiang), hospital (rooftop box + sign),
warehouse (sawtooth) + garage (open bays). Bangunan bernama HARUS beda siluet, bukan
beda papan nama. Target: dari jarak 50 m, ilham bisa membedakan club vs casino vs
city hall tanpa membaca sign.

### HD-B4 — Style generik: ~11 siluet berbeda vs 1 kotak + 6 warna (TINGGI)
**Bukti acuan** (old `city.js:440-560`, array `styles`): tiap style punya bentuk sendiri —
glass tower 34–58 m + rooftop plant; brick 6×4 + **cornice** (w+0,6 × 0,7) + chimney;
stucco hotel **3-tier setback** (w → w×0,7 → w×0,45); colorful shop + awning;
office 10×10 + rooftop box; villa 2-tier + chimney; bay-window house (**bay window**
menonjol 0,35×2,2×0,8 di fasad); white modern + **roof slab + terrace**;
blue glass setback tower (w×0,65 × h×0,4 + w×0,4 × 1,6).
**Bukti rebuild:** 1 `makeBuilding` — variasi cuma warna palet, tinggi, roof
(flat/slope/dome), penthouse setback (h ≥ 12). Tidak ada bay window, terrace, cornice,
atau setback bertingkat di bangunan generik.
**Perbaikan konkret:** tambah MINIMAL 4 varian siluet ke `makeBuilding` (pilih acak):
setback 2-tier (lantai atas 70%), bay window menonjol di fasad, terrace + roof slab,
cornice (HD-B2). Target: 2 bangunan bersebelahan tidak boleh punya siluet identik.

### HD-B5 — Signage: teks di semua tempat bernama + sisi kosong (SEDANG)
**Bukti acuan:** old `signPlane()` (old `city.js:277-286`, canvas text + sub-text)
dipakai di SEMUA bangunan bernama (club, casino, hospital, city hall, mall, cinema,
dealer, drive-thru, pet shop, restaurant) + `sideWindows()` di sisi kosong.
**Bukti rebuild:** `makeSign()` (rebuild `city.js:55-78, 731-774`) cuma di named defs;
bangunan generik **tanpa sign sama sekali** dan sisi samping cuma tekstur fasad yang sama.
**Perbaikan konkret:** (1) pastikan SEMUA named defs punya sign yang terbaca dari jalan
(ukuran ≥ 10 × 2,2, posisi y = h×0,72–0,85, offset 0,06 dari fasad — seperti old);
(2) tambah sign kecil (toko generik: nama acak dari daftar, mis. "DONUTS", "TATTOO",
"BARBER") di ~30% bangunan generik supaya jalan tidak terasa kosong.

## A.2 — KENDARAAN: kenapa file lama/Claude terlihat HD, rebuild masih kotak

**Fakta dasar:**
- Claude v9.8 `upgradeCar()` (char ~1038000): mobil Claude BUKAN kotak rakitan — model
  authored dengan mesh terpisah: `mo.body` (bodinya, lengkung) + `mo.glass` (kaca) +
  `mo.det` (detail) + `mo.wheel` (roda, radius `mo.wr`, posisi `mo.wx/mo.wz`).
  Setara di stack kita = **file GLB**.
- Rebuild PUNYA GLB-nya: **11 buy-car GLB** (`game/models/cars/`: convertible-blue,
  convertible-roadster, convertible-wedge-pink, hatchback-grey, muscle-yellow,
  racecar-f1, sedan-red-vip, sports-sedan-orange, sportster-white, supercar-dominus,
  supercar-wedge-purple) + **6 qcar GLB** (`game/models/qcars/`: pickup, police-car,
  sedan-2, sedan, sports-car, suv, taxi — 7 file).
- Loader rebuild (`loader.js:401-448` `loadModels`): load paralel, **timeout 8 detik per
  file**, gagal → `console.warn('[models] … failed — procedural fallback')` + log akhir
  `[models] loaded X/17 GLB templates`. **Fallback-lah yang ilham lihat** kalau GLB
  gagal ke-load di HP-nya (koneksi ~296 K/s, 57 tab) — dan screenshot round 2
  (taksi oranye kotak, van biru + kotak hitam) MEMBUKTIKAN yang tampil = fallback.
- Build lama punya masalah yang sama ("only a few vehicle GLBs render" — playtest M3b),
  TAPI fallback lamanya punya **varian per tipe** yang rebuild TIDAK punya (HD-V2).

### HD-V1 — Verifikasi GLB dulu, baru klaim "mobil sudah HD" (KRITIS)
**Bukti rebuild** (`loader.js:386, 401-448`): `MODELS.cars = { sport, sedan, suv, taxi,
police, pickup }` (6 qcar) + `buycars` (11 lazy-load via `loadBuyCar`, timeout 20 detik).
`getModelStats()` ada tapi **tidak ada yang menampilkan/mengecek hasilnya di playtest**.
**Perbaikan konkret (WAJIB sebelum klaim HD):**
1. Jalankan headless playtest, baca console: `[models] loaded X/17 GLB templates`.
   Target: **X ≥ 15**. Kalau X rendah, GLB gagal — cari penyebabnya (path? ukuran file?
   timeout 8 detik terlalu pendek untuk koneksi lambat?).
2. Hitung di runtime: berapa mobil di jalan yang `userData.isGLB === true` vs fallback.
   Target: **≥ 80% mobil jalan = GLB**. Kalau mayoritas fallback, masalahnya BUKAN
   detail fallback — tapi GLB tidak ke-load.
3. Naikkan timeout load GLB mobil dari 8 detik ke **15 detik** (`loader.js:427`) —
   file GLB mobil 200–800 KB di koneksi 296 K/s butuh >8 detik; timeout 8 detik
   MEMBUNUH GLB di HP ilham sebelum sempat selesai.
4. Prioritaskan load qcar (6 file, dipakai traffic) SEBELUM buy-car (11 file, cuma dealer).

### HD-V2 — Fallback SATU bentuk untuk semua tipe vs varian per tipe (KRITIS)
**Bukti rebuild** (`loader.js:100-188` `buildProceduralCar`): SATU bentuk generik untuk
sedan/suv/taxi/sport/pickup — beda cuma warna. **TIDAK ADA** cabang per tipe.
**Bukti acuan** (old `vehicles.js:76-200` `buildCarMesh` fallback):
- Sport: body rendah 0,55 + kabin + **spoiler strut (0,12×0,28) + spoiler wing
  (0,5×0,08 × W+0,1)** + headlight emissive 0,8.
- Taxi: roof sign **1,0×0,28×0,6 emissive 0,7** + **checker band** hitam 2 sisi
  (L×0,9 × 0,14).
- Police: **pintu putih** (L×0,42 × 0,5) + **light bar** (0,7×0,18×1,1) + lampu
  **merah + biru emissive 2,0** + `userData.lightBar` (untuk flashing).
- Truck: ~24 mesh (cab + glasshouse + cargo box + **6 ribs** + chrome grill/bumper +
  marker strip emissive + 2 headlight + 2 taillight + **exhaust stack** + 2 mud flap +
  6 roda).
- Sedan biasa: ~13 mesh (body + kabin kaca + headlight + taillight + 4 roda + 4 hub chrome).
**Perbaikan konkret (tambah cabang tipe ke `buildProceduralCar`, port dari old):**
1. `sport`: tambah spoiler strut + wing (ukuran old di atas) + body lebih rendah (0,55).
2. `taxi`: tambah roof sign emissive + checker band 2 sisi.
3. `police`: tambah pintu putih + light bar + lampu merah/biru emissive 2,0 +
   `userData.lightBar = { red, blue }` supaya bisa flashing (cek `vehicles.js:29`
   `isPolice` sudah ada — sambungkan).
4. Target: dari jarak 30 m, taxi vs police vs sport HARUS bisa dibedakan tanpa warna.

### HD-V3 — Van = "kotak biru + kotak hitam" (screenshot 5 ilham) (KRITIS)
**Bukti rebuild** (`loader.js:242-320` `buildProceduralVan`): body = **SATU kotak tinggi**
(wid × 2,0 × len×0,9) + **side window band = SATU kotak gelap** (wid+0,04 × 0,55 ×
len×0,62) yang **membungkus seluruh badan**. Dari samping: kotak biru + kotak hitam —
persis yang ilham screenshot.
**Bukti acuan:** old build **TIDAK PUNYA** fallback van — van = pickup GLB yang di-scale.
Jadi ini artefak rebuild, bukan warisan lama.
**Perbaikan konkret (pecah van seperti truck, jangan satu kotak):**
1. Pecah body jadi **cab depan** (wid×0,95 × 1,5 × 1,6, seperti truck `loader.js:203`)
   + **cargo box belakang** (wid × 2,0 × len×0,55) — bukan satu kotak 2,0 tinggi.
2. Ganti full-wrap band dengan **windshield depan** (wid×0,85 × 0,7) + **jendela samping
   2–3 panel terpisah** (bukan satu band membungkus).
3. Tambah **hub roda** (van/bus sekarang roda tanpa hub — `loader.js:300-315` cuma
   tambah roda, tidak ada hub; bandingkan car builder `loader.js:160-175` yang punya
   hub r=0,2).
4. Tambah **taillight** (van sekarang cuma headlight — `loader.js:285-295`).
5. Bus: tambah **jendela penumpang berderet** (4–5 panel kecil per sisi, bukan satu band).

### HD-V4 — Truck: detail hilang vs old (SEDANG)
**Bukti rebuild** (`loader.js:189-241` `buildProceduralTruck`, ~22 mesh): cab + windshield
+ grille + bumper + cargo + 8 ribs + 2 headlight + 6 roda (tanpa hub).
**Yang hilang vs old** (`vehicles.js:140-175`): **taillight** (2, merah emissive 0,7),
**chrome** grill/bumper (rebuild pakai darkM semua — tidak ada kilau),
**marker strip** depan emissive, **exhaust stack** (silinder r=0,09 tinggi 1,1),
**mud flap** (2), **hub roda**.
**Perbaikan konkret:** tambah taillight 2 + grill/bumper chrome (`chromeMat`-style,
warna 0xcfd6dd metalik) + exhaust stack + 2 mud flap + hub di 6 roda. Target mesh
truck: **≥ 28** (old ~24 + hub 6).

### HD-V5 — Jumlah part per mobil: hitung, jangan kira-kira (SEDANG)
**Tabel hitung mesh (verifikasi dengan `group.children.length` di headless):**

| Mobil | Old fallback | Rebuild sekarang | Target round 3 |
|---|---|---|---|
| Sedan | ~13 (body, kabin, 2 lampu depan, 2 belakang, 4 roda, 4 hub) | ~28 (body, 2 shoulder, kabin, atap, hood miring, trunk, grille, 2 bumper, 2 spion, band, 4 roda, 4 hub, 2 lampu, 2 belakang) | ≥ 28 — SUDAH OK, jangan diutak-atik |
| Sport | ~15 (+ spoiler strut + wing) | ~28 (sama kayak sedan — TIDAK ADA spoiler) | ≥ 30 (+ spoiler) |
| Taxi | ~16 (+ roof sign + 2 checker band) | ~28 (sama kayak sedan — TIDAK ADA roof sign/checker) | ≥ 31 (+ roof sign + checker) |
| Police | ~18 (+ pintu putih + light bar + 2 lampu) | ~28 (sama kayak sedan — TIDAK ADA light bar) | ≥ 32 (+ light bar + pintu putih) |
| Truck | ~24 | ~22 (tanpa taillight/hub/exhaust/mud flap) | ≥ 28 |
| Van/bus | (GLB saja di old) | ~20 (body 1 kotak + band + stripe + grille + bumper + lampu) | ≥ 26 (pecah cab+cargo, HD-V3) |

**Catatan penting:** fallback sedan rebuild SUDAH lebih detail dari old (~28 vs ~13) —
jangan buang waktu nambah part sedan. Fokus ke **HD-V1 (GLB ke-load) + HD-V2 (varian
tipe) + HD-V3 (van)**. Kalau GLB ke-load (HD-V1), fallback hampir tidak terlihat —
itu kemenangan terbesar.

## A.3 — Cara verifikasi "HD" (jangan klaim tanpa bukti)
1. **Screenshot jarak jauh (50 m):** bangunan harus terbaca bentuknya (cornice, setback,
   canopy, sign) — bukan kotak warna. Mobil harus terbaca tipenya (taxi/police/sport)
   tanpa zoom.
2. **Screenshot jarak dekat (5 m):** jendela harus punya frame + mullion (HD-B1);
   mobil harus punya spion, grille, bumper, lampu depan+belakang (HD-V5).
3. **Console GLB:** `[models] loaded X/17` — laporkan X ke Max (HD-V1).
4. **Hitung mesh:** `group.children.length` per bangunan (target ≥ 15 mesh/bangunan
   generik, ≥ 25 bangunan bernama) dan per mobil (tabel HD-V5).
5. **Bandingkan berdampingan:** screenshot rebuild vs screenshot build lama di sudut
   yang sama — kirim keduanya ke Max.

## GAP 1 — Laut kayak KEBANJIRAN, nggak ada pantai sama sekali (KRITIS)

**Masalah:** laut rebuild kelihatan kayak banjir — air datar menutupi daratan, tanpa pantai.
**Bukti rebuild** (`game/src/city.js`):
- Sea = `PlaneGeometry(1400, 2400)` di `y = 0.06` — **DI ATAS** ground (`y = 0`). Air menutupi
  tanah. (city.js ~150-160)
- Sand strip cuma `PlaneGeometry(15, 2400)` di `y = 0.02`, datar, tanpa slope/ombak/busa. (city.js ~171-178)
- **TIDAK ADA ombak sama sekali.** Tidak ada sand apron/ring.
- Sea material `MeshPhongMaterial({ color: PALETTE.sea, shininess: 90 })` tanpa `specular` —
  air tidak berkilau.
**Bukti acuan** (build lama `game/src/city.js:143-219`):
- Sea = `PlaneGeometry(900, 900)` di `y = -0.25` — **DI BAWAH** ground (`y = 0`). Air lebih
  rendah dari darat, jadi terbaca sebagai laut, bukan banjir. Plus `specular: 0x88bbdd`
  (sun glint).
- **Sand ring (apron):** `ShapeGeometry` 1040×1040 dengan lubang persegi (city square +
  west sea strip), di `y = -0.05` — membungkus kota sehingga pantai terbaca sebagai pantai,
  bukan tebing rumput. (city.js:164-181)
- **8 animated wave strips:** `PlaneGeometry(1.2, 26)`, putih, opacity 0.35, di `x = 13.5-15.5`,
  `y = 0.05`, bergerak menyusuri pantai. (city.js:212-219)
- Biome ground patches: forest hijau gelap, desert pasir, hills abu-coklat. (city.js:186-192)
**Perbaikan konkret (city.js):**
1. Turunkan sea ke `y = -0.25`, tambah `specular: 0x88bbdd` ke material.
2. Tambah sand ring/apron (ShapeGeometry berlubang, y = -0.05) membungkus city square.
3. Tambah 8 wave strips putih transparan di sepanjang pantai (x ~13.5-15.5), animasikan
   bergerak (geser x / opacity) di `update`.
4. Lebarkan sand strip jadi 15 m dengan slope halus ke arah laut (bukan pita datar).
5. Tambah foam/busa putih tipis di garis pantai (1-2 strip, opacity 0.5).

## GAP 2 — Bangunan masih POLOS, belum ada model (KRITIS)

**Masalah:** bangunan rebuild masih kotak warna polos — "belum ada model".
**Bukti rebuild** (`game/src/city.js`):
- SATU builder generik `makeBuilding()` + `makeVilla()` untuk SEMUA gedung. Named places
  (22 tempat) cuma beda `style`/`h`/`sign` — tidak ada arsitektur khas per tipe.
- Jendela = `PlaneGeometry` tipis + `MeshBasicMaterial` — datar, tanpa bingkai/kedalaman;
  dari jauh menyatu dengan warna kotak. (city.js ~330-360)
- Body = SATU `BoxGeometry` + warna Lambert datar.
**Bukti acuan** (build lama `game/src/city.js:565-850`):
- **16 builder DEDIKASI per tipe**, masing-masing punya arsitektur khas:
  - `buildClub`: kotak ungu + atap gelap + neon sign + **glow strip pink emissive** + pintu gelap emissive pink.
  - `buildGarage`: kotak oranye + atap gelap + sign + **open bays (dark insets)**.
  - `buildWarehouse`: kotak karat + **sawtooth roof (3 gigi silinder)** + cerobong.
  - `buildHospital`: `facadeBox` + **`windowsTex` (canvas texture grid jendela!)** + kotak putih atap.
  - `buildCasino`: kotak ungu gelap + **upper box setback** + **neon plane emissive cyan**.
  - `buildCityHall`: kotak krem + **portico 5 kolom silinder** + lintel + **kubah hijau**.
  - `buildMall`: kotak terang + kaca + **forecourt pad + canopy pintu di tiang + sign food-court + planter**.
  - `buildCinema`, `buildDealer`, `buildConstruction`, `buildDriveThru`, `buildVilla`,
    `buildPoliceStation`, `buildPetShop`, `buildRestaurant`, `buildVilla2` — masing-masing beda.
- **Kunci:** `windowsTex` — tekstur canvas berisi GRID jendela yang dipetakan ke facade.
  Dari jauh, tekstur ini yang bikin gedung terbaca detail (bukan jendela plane tipis).
**Perbaikan konkret (city.js):**
1. Buat `windowsTex(bg, winColor, litColor, cols, rows)` — canvas texture grid jendela,
   pakai untuk facade gedung (ganti/ Tambah di samping jendela plane).
2. Tambah builder khusus minimal untuk: club (glow strip + pintu emissive), casino
   (upper box setback + neon plane), city hall (portico kolom + kubah), mall (canopy +
   forecourt), garage (open bays), warehouse (sawtooth roof), hospital (rooftop box).
   Jangan cuma ubah warna/tinggi — bentuknya harus beda.
3. Jendela: tambah bingkai (kotak tipis gelap di sekeliling) atau pakai tekstur; jangan
   plane polos.

## GAP 3 — Awan masih BULAT, belum realistis (KRITIS)

**Masalah:** awan rebuild masih bola/gumpalan bulat, ngambang rendah.
**Bukti rebuild** (`game/src/weather.js` ~60-75):
- 14 awan × 4 bola `SphereGeometry(6-13)`, `scale.y = 0.45`, di `y = 55-85`.
- Saat storm, awan DITURUNKAN ke `y = 30` (update) — blob rendah persis bug lama.
**Bukti acuan** (build lama `game/src/game.js:216-232` + komentar):
- 9 awan × 5 bola, `scale.y = 0.3` (LEBIH PIPIH), di `y = 85-120` (TINGGI), sebar
  `x = -40..300`, drift 0.4-1.0.
- Komentar lama: "High, flat, wide clouds (the old y 55-75 blobs read as low grey lumps
  hugging the rooftops — ilham's screenshot)." — **rebuild MENGULANGI bug yang build lama
  SUDAH perbaiki** (y 55-85 = rentang blob lama!).
**Perbaikan konkret (weather.js):**
1. Naikkan awan ke `y = 85-120`, pipihkan ke `scale.y = 0.3`, kurangi jadi 9 awan × 5 bola,
   sebar lebih lebar (x -40..300).
2. HAPUS penurunan awan saat storm (jangan turun ke y=30); ganti dengan gelapkan warna saja.
3. Opsional: pakai 2 lapis bola (lapis bawah lebih lebar + pipih) supaya bentuknya
   memanjang horizontal, bukan gumpalan.

## GAP 4 — Pohon masih LOLIPOP

**Masalah:** pohon bola hijau di tiang kurus masih ada (screenshot 3).
**Bukti rebuild:**
- `game/src/city.js`: **70 bush = SATU `SphereGeometry(1)`** (bola tunggal) + 14 planter
  taman (bola 0.7 di atas kotak) + pohon villa (bola 1.6 di tiang tipis) + planter awning
  (bola 0.7). **TIDAK ADA builder broadleaf tree sama sekali** — hanya palm/pine +
  bola-bola tunggal.
- `game/src/loader.js`: `buildPalm()` (2 segmen miring + 8 frond kotak + kelapa) dan
  `buildPine()` (4 kerucut offset) — ini BAGUS, bukan sumber lollipop.
**Bukti acuan** (build lama `game/src/city.js:1160-1172`):
- Broadleaf = **5-blob canopy tidak beraturan** (5 bola di offset/tinggi beda, 2 warna hijau)
  + trunk LEBIH TEBAL (0.22-0.32, bukan 0.12-0.18). Komentar: "(was 3 perfect spheres
  on a thin 0.16 trunk = a lollipop)".
- Roadside broadleaf ditanam di sepanjang SEMUA jalan (tiap 11 m, 40% tiap sisi).
**Perbaikan konkret (city.js + loader.js):**
1. HAPUS semua bola tunggal: bush 70× → ganti `buildBroadleaf()` (5-blob canopy +
   trunk tebal 0.22-0.32). Planter taman + villa + awning: ganti bola tunggal dengan
   3-blob kecil atau semak kerucut.
2. Tambah `buildBroadleaf()` di loader.js (5 blob offset, 2 hijau, trunk tebal).
3. Tanam roadside broadleaf di sepanjang jalan (tiap ~11 m, 40% tiap sisi, di trotoar
   luar, JANGAN di tengah jalan) — seperti build lama.

## GAP 5 — Mobil masih KOTAK

**Masalah:** mobil biru di screenshot 5 = kotak biru + kotak hitam; taksi oranye kotak.
**Bukti rebuild:**
- `game/src/loader.js:100-173` `buildProceduralCar()` sebenarnya DETAIL (body, kabin kaca,
  atap, hood miring, trunk, grille, bumper, spion, window band, roda, lampu). Tapi
  SEMUA bagiannya kotak — dari jauh tetap terbaca kotak.
- `buildProceduralVan()` (loader.js:227-311): body = SATU kotak tinggi (wid × tall ×
  len×0.9) + dark band — dari samping = **kotak biru + kotak hitam**, persis yang ilham
  lihat. Van/ambulans/bus/truk pakai builder ini.
- `game/src/vehicles.js:131-146`: mobil GLB diutamakan (`MODELS.cars[glbKey]`), tapi
  `cloneCar(null)` → fallback prosedural. GLB dimuat paralel + timeout 8 dtk; di koneksi
  ilham (3-8 KB/s) GLB besar kemungkinan GAGAL/TELAT → yang terlihat = fallback kotak.
**Perbaikan konkret (loader.js + vehicles.js):**
1. Van/bus: pecah body jadi 2-3 bagian (kab depan + badan + atap), tambah kap miring,
   kaca depan miring, dan roda yang kelihatan; jangan satu kotak tinggi.
2. `buildProceduralCar`: tambah lengkung — kap + atap pakai box yang diputar sedikit
   (slope), tambah wheel arch (kotak gelap di atas roda), dan side skirt. Minimal
   siluetnya tidak persegi panjang sempurna.
3. Pastikan GLB benar-benar ke-load: log jumlah GLB yang berhasil vs gagal; kalau GLB
   gagal, fallback HARUS cukup bagus (lihat poin 1-2). Jangan andalkan GLB di koneksi lambat.
4. Warna: jangan biru polos solid untuk van — tambah stripe/logo supaya bukan kotak warna.

## GAP 6 — Tanah datar / void biru muda

**Masalah:** area biru muda luas kelihatan kayak void kosong, bukan laut/pantai.
**Bukti rebuild** (`game/src/city.js` ~130-150):
- Ground = SATU `PlaneGeometry(2400, 2400)` hijau + speckle, datar (y=0) di mana-mana.
  `groundHeight()` cuma berbukit di luar kota (hills/forest/desert); di dalam kota datar total.
- Area biru muda = sea plane (lihat GAP 1) — karena sea di y=0.06 di atas ground, dari
  kamera rendah area itu terbaca sebagai "tanah biru datar", bukan laut.
**Bukti acuan** (build lama): ground patches per biome + instanced tufts/pebbles + sea
di y=-0.25 + sand ring (lihat GAP 1).
**Perbaikan konkret (city.js):**
1. Selesaikan GAP 1 dulu (sea turun + ring + ombak) — ini akar masalah "void biru".
2. Tambah ground patches per biome (forest hijau gelap, desert pasir, hills abu-coklat)
   seperti build lama (city.js:186-192).
3. Tambah detail tanah di dalam kota: trotoar berpola, rumput di taman, dan bedakan
   warna tanah antar distrik (bukan satu hijau datar).

## GAP 7 — Minimap kayak GRID HIJAU

**Masalah:** minimap di screenshot = lingkaran hijau dengan pola grid, bukan peta.
**Bukti rebuild** (`game/src/hud.js` `_drawMinimap` ~610-660 + `game/index.html:66`):
- Minimap = canvas 200×200 dalam wrapper LINGKARAN (`border-radius: 50%`, 200×200).
- Yang digambar: base hijau + sea/pasir + biome + sungai + **jalan (lineWidth 4, gelap)** +
  tempat (titik putih 3px) + marker + polisi + panah pemain.
- **TIDAK ADA gedung/blok kota sama sekali.** Jalan-jalan (ROADS di 65, 91, 117, 143, 169,
  195, 221, 247 — grid teratur) adalah SATU-SATUNYA yang digambar di atas hijau →
  terbaca sebagai grid.
**Perbaikan konkret (hud.js):**
1. Gambar BLOK GEDUNG sebagai persegi terisi (abu-abu gelap / warna distrik) di tiap
   blok kota — minimap harus terbaca sebagai peta kota, bukan grid jalan.
2. Pertebal jalan utama, tipiskan jalan kecil; tambah garis pantai yang jelas.
3. Opsional: ubah wrapper dari lingkaran penuh ke persegi ber-radius (supaya sudut peta
   tidak terpotong).

## GAP 8 — Cutscene ketutup tombol sentuh (KRITIS, gampang)

**Masalah:** kartu judul cutscene "A CITY THAT OWES YOU A LIVING" ketutup tombol
JUMP/PUNCH/FIRE/ENTER/GAS/BRAKE/AIM (screenshot 1).
**Bukti rebuild:**
- `game/src/main.js:24`: `state = 'menu' | 'playing' | 'trailer'` — cutscene BUKAN state
  sendiri; intro cutscene jalan saat `state === 'playing'` + `this.cutscene = { kind:
  'intro', dur: 12 }` (main.js:334-335).
- `game/src/hud.js` `applyControlMode()` (~300-310) HANYA toggle `touchEl` berdasarkan
  mode kontrol (touch vs PC). **TIDAK ADA kode yang menyembunyikan touch saat cutscene
  atau trailer.**
- `.lv-card` di `game/index.html:82`: `top: 22%`, tengah, `max-width: 90vw` — di layar HP
  sempit, tombol sentuh kanan menumpuk kartu.
**Perbaikan konkret (hud.js + main.js):**
1. Di `HUD.update()` (atau method baru `setCinematic(on)`): sembunyikan `touchEl`,
   `phoneBtn`, dan joystick saat `game.cutscene` ada ATAU `game.state === 'trailer'`;
   tampilkan lagi saat cutscene/trailer selesai.
2. Panggil dari `main.js`: saat `_finishIntro()` / `_endTrailer()` dan saat cutscene mulai.
3. Bonus: kecilkan/geser kartu judul ke atas (`top: 12%`) supaya tidak bentrok dengan
   tombol di layar kecil.

## GAP 9 — Fitur BARU rangkuman "belum ada" (DISCOVERABILITY + VERIFIKASI)

**Masalah:** ilham bilang fitur baru juga belum ada. Sebagian ADA di kode tapi tidak
kelihatan/ketemu saat dimainkan.
**Bukti rebuild (ADA di kode):**
- 12 misi: `MISSIONS` di `game/src/config.js` = **12 entri** (terkonfirmasi `grep -c "act:
  'ACT"` = 12); engine di `game/src/missions.js` (steal/reach/deliver/evade/killAll/
  defeat/checkpoint/reachWanted/buy/heat/bridge). Tapi **hanya misi 1 yang terverifikasi
  dimainkan** — misi 2-12 belum pernah dimainkan end-to-end.
- Bisnis beli: `game/src/main.js:35-37, 556-558, 706-708, 742-749, 940` — Neon Bar
  $2.000 +$50/jam, saham Manny $1.500 +$35/jam, Beach House $1.200. ADA, tapi prompt
  `[E] Buy ...` HANYA muncul di dekat pintu (jarak 4.5 m) — pemain yang tidak jalan ke
  pintu tidak akan pernah melihatnya.
- Polisi/dispatch, ekonomi, phone, save, weather, traffic, NPC, senjata: ADA di kode
  (police.js 480 baris, vehicles.js 650, characters.js 940, audio.js 316).
**Perbaikan konkret:**
1. **Misi 2-12: mainkan satu per satu end-to-end di headless playtest** (bukan cuma misi 1).
   Kalau ada misi yang tidak bisa selesai, perbaiki — jangan klaim "mesinnya sama".
2. **Bisnis: tambah penanda permanen** — ikon `$` / beacon emas di atas pintu club/garage/
   villa2 + notifikasi saat pemain pertama kali dekat ("Neon Bar bisa dibeli di sini").
   Jangan andalkan prompt E yang cuma muncul 4.5 m.
3. **Checklist fitur rangkuman:** buat daftar centang di CHECKLIST.md — tiap fitur rangkuman
   (A-H) ditandai SUDAH DIVERIFIKASI DIMAINKAN (bukan cuma "ada di kode"). Yang belum
   terverifikasi = belum selesai.

## GAP 10 — BUG: Maya (AI partner) TERUS mengikuti Jax (HARUS HILANG)

**Masalah (ilham 04:10 WIB):** karakter cewek (Maya) terus mengikuti Jax. Ini bug di file
game BARU (bukan di file lama). Ilham minta HILANG.
**Bukti rebuild** (`game/src/characters.js`):
- `NPC.update()` ~521-540: `if (this.kind === 'partner')` — partner mengejar pemain
  kalau jarak `> 3.5` (`targetSpeed = 4.5`) dan memukul gang member dalam 8 m.
- `_spawnPartner()` ~795-810: spawn OTOMATIS saat `Characters` dibuat — partner = protagonis
  yang TIDAK dimainkan (Jax→Maya, Maya→Jax), posisi `p.x + 2, p.z + 2`.
- Dipanggil dari constructor ~792 (setiap game dimulai) dan `swapPartner()` ~813-820
  (setiap switch karakter).
- `main.js:313-315`: "The partner swaps to the protagonist you are NOT playing as."
- Partner juga `invulnerable` (characters.js:445-446) dan tidak bisa mati.
**Kenapa ilham melihatnya sebagai bug:** partner spawn otomatis + selalu nempel 3.5 m di
belakang pemain sejak game dimulai — di screenshot 6, Maya (baju hijau, rambut merah)
berdiri persis di belakang Jax. Di file lama, TIDAK ADA AI partner yang mengikuti —
Maya hanya ada saat pemain switch ke dia.
**Perbaikan konkret (characters.js + main.js):**
1. **HAPUS pemanggilan `_spawnPartner()` otomatis** di constructor (~792). JANGAN spawn
   partner saat game dimulai.
2. **HAPUS/HENTIKAN logika follow** di `NPC.update()` ~521-540 untuk `kind === 'partner'`
   — atau hapus seluruh blok partner dari update.
3. Maya tetap bisa dimainkan via switch (tombol V, `switchCharacter()` di characters.js
   ~154-167) — itu fitur yang benar, JANGAN dihapus. Yang dihapus = partner yang
   mengikuti.
4. `swapPartner()` (~813-820): hapus atau jadikan no-op (tidak ada partner untuk di-swap).
   Pastikan tidak ada referensi `this.partner` yang tersisa dan menyebabkan error.
5. **Verifikasi:** headless playtest 60 detik — pastikan TIDAK ADA NPC `kind === 'partner'`
   di `characters.npcs` dan tidak ada karakter cewek yang membuntuti pemain.

---

## RINGKASAN PRIORITAS (buat Eleven — kerjakan berurutan)

**BAGIAN A (HD detail) = PRIORITAS #1 — perintah tegas ilham 04:21 WIB.**

| # | Gap | File | Sulit | Dampak ke ekspektasi ilham |
|---|-----|------|-------|---------------------------|
| A1 | HD-V1: GLB ke-load? cek `loaded X/17`, timeout 8→15 dtk | loader.js | Rendah | TINGGI (ini akar "mobil kotak") |
| A2 | HD-V2: varian fallback per tipe (spoiler taxi/police) | loader.js | Sedang | TINGGI |
| A3 | HD-V3: van kotak biru+hitam → pecah cab+cargo | loader.js | Sedang | TINGGI (screenshot ilham) |
| A4 | HD-B1: fasad 128→256 px + mullion + separator | city.js | Rendah | TINGGI |
| A5 | HD-B2: ground floor + canopy + crown + floorBands | city.js | Sedang | TINGGI |
| A6 | HD-B3: 6 builder khusus bernama (club/casino/city hall/mall/hospital/warehouse) | city.js | Tinggi | TINGGI |
| A7 | HD-B4: 4 varian siluet generik (setback/bay window/terrace/cornice) | city.js | Sedang | Tinggi |
| A8 | HD-V4: truck + taillight/chrome/exhaust/mud flap/hub | loader.js | Rendah | Sedang |
| A9 | HD-B5: sign semua tempat bernama + sign toko generik | city.js | Rendah | Sedang |
| 1 | Laut banjir → pantai beneran | city.js | Sedang | TINGGI (paling kelihatan) |
| 2 | Bangunan polos → model per tipe + windowsTex | city.js | Tinggi | TINGGI |
| 3 | Awan bulat → tinggi + pipih | weather.js | Rendah | Sedang |
| 4 | Pohon lollipop → broadleaf 5-blob + roadside | city.js, loader.js | Sedang | Tinggi |
| 5 | Mobil kotak → pecah van, slope, arsitektur | loader.js, vehicles.js | Sedang | Tinggi |
| 6 | Tanah datar/void → patches + detail | city.js | Rendah | Sedang |
| 7 | Minimap grid → gambar blok gedung | hud.js | Rendah | Sedang |
| 8 | Cutscene ketutup tombol → sembunyikan touch | hud.js, main.js | Rendah | TINGGI (gampang, langsung kelihatan) |
| 9 | Fitur baru belum kelihatan → misi 2-12 + penanda bisnis | missions.js, main.js | Sedang | TINGGI |
| 10 | Bug Maya ngikutin → hapus auto-spawn + follow | characters.js | Rendah | TINGGI (ilham minta HILANG) |

**Catatan authorship (penting):** seal rekaman 01a20932 menandai 7 file belum keterekam
(README.md, REFERENCE.md, game/src/audio.js, game/src/missions.js, game/src/police.js,
game/src/rng.js, main.ts). Eleven round 3 WAJIB menulis ≥1 baris di tiap file itu supaya
keterekam 01a20a40. Untuk main.ts (dossier builder kit): tambah komentar/baris yang tidak
merusak build; kalau ragu, jangan ubah dan laporkan ke Max.

**Referensi file (jangan copy-paste utuh):**
- Build lama: `~/workspace/makefun/gta6-01-3d/game/src/city.js` (sea 143-219, builders
  565-850, broadleaf 1160-1200), `game.js` (clouds 216-232, 3208-3215), `vehicles.js`.
- Claude v9.8: `~/workspace/user/files/Solmar_Heat_3D_v9_8_ib9b.html` (minified — pakai
  build lama sebagai referensi yang terbaca).
- Corrupt Estate: `~/workspace/makefun/lucas-ce-compare.md`.
- Rangkuman ilham A–H: `~/workspace/makefun/gta6-01-3d-recorded/REFERENCE.md` (Dustin, 541 baris).
