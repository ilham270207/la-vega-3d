# REFERENCE.md — La Vega 3D (rebuild terekam, gta6-01)

> Dokumen referensi konsolidasi untuk Eleven (build dari awal di sesi terekam).
> Disusun Dustin (riset) 23 Nov 2026 ~20:45 WIB dari: repo lama
> `~/workspace/makefun/gta6-01-3d/` (khususnya `game/src/config.js`),
> `~/MEMORY.md` (bagian GTA 6 — semua arahan + referensi ilham 18:40–20:18 WIB),
> `~/workspace/makefun/contekan/CONTEKAN.md` (analisis top-20 + Karimbu).
> **Aturan: ini REFERENSI — baca, pahami, lalu TULIS ULANG kodenya sendiri di sesi
> ini. Jangan copy-paste file kode dari repo lama. Jangan copy kode/repo orang lain.**

## 0. Identitas game

- Judul: **La Vega 3D**. Kota: **La Vega** (pulau, kota pantai fiktif).
- Protagonis: **Jax Vega** (wheelman, baru turun dari feri, tanpa uang) + **Maya**
  (crew driver — protagonis kedua, bisa diganti). Pemberi misi: **La Rosa**
  (pemilik klub), **Manny** (mekanik garasi). Rival: geng **Vultures**.
- Polisi: **LVPD** (La Vega Police Department). Heli polisi: **LVPD Air** (nama
  sendiri, bukan "Air One" milik game lain).
- **DILARANG keras:** nama/aset GTA — NO Jason/Lucia/Leonida/Vice City/Rockstar.
  Semua nama, kota, cerita, art, suara harus orisinal.
- Repo baru ini = submission. Repo lama (`gta6-01-3d`) TIDAK pernah di-submit,
  hanya contekan. Akun: GitHub `ilham270207`.

## 1. Kompetisi + gate kit (angka PASTI — dari competition.yaml, diverifikasi)

- Kompetisi: `gta6-01` "Make GTA 6", $1,666 USDC, 100 tempat dibayar
  (1st $500, 2nd $250, 3rd $150, 4–10 $38, 11–25 $10, 26–50 $6, 51–100 $4).
- **Deadline entri: 24 Nov 2026 22:00 WIB** (entries_close 2026-11-24T15:00:00Z).
  Target submit: 24 Nov 12:00 WIB. Hasil: 10 Des 2026.
- **STRICT:** `strict_transcripts: true`, `strict_witness: None` (BUKAN flex).
  Submit memakai `recording_ids` (sealed recording) — TIDAK ada bundle.
  Rekaman ini (mulai 23 Nov ~20:31 WIB) adalah rekaman yang dipakai.
- Deliverables: `repo_url`, `commit_sha` (40 char penuh), `recording_ids`,
  `entry_message`, `entry_signature`, `LICENSE` (MIT), `main.ts` (Node 22).
  Kuota: max 5/hari, max 40 total. Repo harus publik, dibuat SETELAH kompetisi
  dibuka (17 Nov 2026), lisensi OSI, `main.ts` di root.
- **Gate (gagal = entri ditolak):**
  - `game/`: ≤ 993 file+direktori, ≤ **48 MiB** total, tiap path ≤ 1000 byte,
    `game/index.html` ≤ 1 MiB, file biasa saja (no symlink).
  - `screenshots/`: **3–4 gambar**, masing-masing ≤ 256 KiB, PNG/JPEG,
    sisi panjang ≤ 1280 px, sisi pendek ≥ 480 px.
  - `dossier.json` ≤ 1.5 MiB, teks ≤ 163.840 byte (160 KiB).
  - `main.ts` (Node 22) di root: copy `game/` + `screenshots/` ke `/output`,
    tulis `/output/dossier.json` via `vendor/makefun-game.ts` (kit, JANGAN diubah).
  - Library (three.js) di-vendor di bawah direktori bernama `vendor` atau sebagai
    `*.min.js` — dossier menghitungnya sebagai vendored, bukan source.
  - `index.html` + script yang di-load TIDAK boleh me-referensi apa pun di luar `game/`.
  - Game harus jalan offline dari file statis (desktop Chrome, keyboard+mouse).
- Juri: AI (OpenRouter z-ai/glm-5.3-flash), membandingkan 2 entri sekaligus lewat
  **screenshot + outline source** (dossier-view 1.536 token/entri). Ranking = win rate.
  **Screenshot dossier adalah penentu** — tiap screenshot harus menunjukkan
  dispatch board + misi + kota + HUD sekaligus. Top 10 finalis di-review manusia
  (mainin `game/` di desktop Chrome).
- Rubrik juri (bobot completeness): kota on-foot + mobil, traffic + pejalan kaki,
  curi mobil, wanted + polisi, misi + cerita, combat, HUD + minimap, start + save,
  polish.

## 2. Spesifikasi dunia (angka dari config.js repo lama — pakai sebagai baseline)

- World: **400 × 400 m** (satuan meter). Grid kota: **0..260**. Laut `x < 15`,
  pantai pasir `15..30`. Kota di barat-daya peta.
- Biome (chunk): **FOREST** x 0..260, z 260..400 (pohon rapat, jalan tanah);
  **DESERT** x 260..400, z 0..260 (pasir, kaktus, batu, highway panjang);
  **ROCKY HILLS** x 260..400, z 260..400 (batu besar, tebing, jalan tanah berliku).
  Map harus ENDLESS: pantai + laut sampai horizon di semua sisi, TIDAK ADA void.
- Jalan: 9 garis tengah di **39, 65, 91, 117, 143, 169, 195, 221, 247**
  (kedua sumbu). Lebar jalan **10 m**, trotoar **2,5 m**.
- Nama jalan NS: Shoreline Dr, Palm Row, Marina Blvd, Neon Ave, Casino Row,
  Market St, Harbor Blvd, Sunset Ave, Bayview Dr.
  Nama jalan EW: Ferry St, Club Row, Hotel Row, Pier Ave, City Hall Blvd,
  Garden St, Depot Rd, Forest Rd, Ridge Rd.
- Distrik (4 kuadran): **MARINA** (0,0–130,130), **DOWNTOWN** (130,0–260,130),
  **NEON ROW** (0,130–130,260), **SOUTH BEACH** (130,130–260,260).
  Standing 0–100% per distrik, **+8% per misi** selesai di distrik itu.
- Tempat kunci (koordinat x, z): La Rosa's Club (156,104), Manny's Garage (78,156),
  Old Cannery Warehouse (52,208), La Vega General / rumah sakit (208,52),
  Pier 9 Drop (8.2,130), The Docks (23.5,130), Palm Court Park (104,78),
  La Vega Beach (23,78), City Hall (182,182), Neon Palm Casino (117,65),
  Auto Palms / dealer (65,91), Vega Arms Gun Shop (143,117), Villa La Vega (52,52),
  Petro Vega / SPBU (30,200), La Vega Harbor (20,130), LVPD Station (130,156),
  Paws & Claws Pet Shop (78,130), Warung La Vega / restoran (195,130),
  Villa del Mar (221,221), La Vega Mall (104,156).
- Palet: rumput 0x8fce62, pasir 0xf2d492, laut 0x2f9fd8 / dalam 0x1e7fc0,
  jalan 0x4a505c (jangan terlalu gelap saat hujan), garis jalan 0xf5d76e,
  trotoar 0xc9c2b4, taman 0x69b455, dermaga 0xa97c50.
- Pemain: radius 0,45 m, jalan 4,2 m/s, lari 7,0 m/s, jangkauan pukul 2,2 m,
  damage pukul 34, health 100. **Semua NPC ~1,8 m**, berpakaian, grounded
  (kaki menapak tanah). Karakter: Jax 1,81 m, La Rosa 1,84 m.
- Wanted maks 5 bintang. Harga bensin $20, biaya repair dasar $50.

## 3. Kampanye — 12 misi + struktur 4 babak

### 3a. 12 misi (desain repo lama — nama, pemberi, reward, objektif)

Semua pemberi: **La Rosa**. Start: loadout PISTOL 36 + $0, jam mulai 12:00,
HUD "RANK 0 · NEWCOMER". Tipe step: steal / reach / deliver / evade /
killAll / defeat / checkpoint / reachWanted / buy / heat.

| # | Babak | Misi | Reward | Objektif (step) |
|---|---|---|---|---|
| 1 | I | First Wheels | $300 | Curi mobil parkir (E) → antar ke Manny's Garage. (Hadiah + pistol.) |
| 2 | I | Dock Run | $500 | Ambil paket di Pier 9 → antar ke La Rosa's Club. |
| 3 | I | The Vultures' Warning | $400 | Ke klub → usir 2 preman Vultures (fists only). |
| 4 | I | Neon Street Race | $900 | Ambil coupe balap di klub → 4 checkpoint (Neon Row utara/timur, South Beach, finish di klub), timer 150 dtk. |
| 5 | II | Shake the Tail | $400 | Hilangkan wanted 2 bintang (sembunyi, keluar dari pandangan polisi). |
| 6 | II | Warehouse Payback | $700 | Ke Old Cannery Warehouse → kalahkan 4 Vultures. |
| 7 | II | The Getaway Driver | $800 | Jemput kurir di La Vega General → antar ke Neon Palm Casino, 2:00. |
| 8 | II | Grand Theft Marina | $600 | Curi mobil sport merah di Auto Palms (siang bolong) → antar ke Manny's. |
| 9 | III | Clean Wheels | $0 | BELI mobil di Auto Palms (1 sedan $800 · 2 truk $1.000 · 3 sport $1.500) → masuk garasi. |
| 10 | III | The Distraction | $500 | Buat keributan sampai 3 bintang → hilangkan wanted. |
| 11 | III | The La Vega Score | $1.200 | 5 drop (Marina Gate → Palm Court Park → La Vega General → South Docks → klub), timer 150 dtk. |
| 12 | III | Harbor Heist | $8.000 | Ke harbor → ambil kargo (wanted naik 5 bintang) → hilangkan wanted → antar kargo ke klub. |

Babak repo lama: **ACT I Fresh Off the Ferry** (1–4), **ACT II Heat Rising**
(5–8), **ACT III The La Vega Score** (9–12). Dialog sebelum/sesudah misi ada
di config.js (La Rosa / Jax / Manny / kurir / Vulture) — pakai sebagai referensi
nada dialog (tulis ulang sendiri).

### 3b. Restrukturisasi 4 babak (perintah ilham 20:06 WIB — WAJIB)

Petakan 12 misi di atas ke 4 babak ini + TAMBAH yang belum ada:

- **Babak 1 — Beginning & Small Crimes:** Jax+Maya mulai dari bawah (pinggiran/
  slum): curi mobil, rampok minimarket, kerja kurir → modal awal + **UNLOCK SAFEHOUSE**.
- **Babak 2 — Gang Conflict & Underground Network:** pusat kota + pelabuhan;
  sabotase bisnis geng rival, penyelundupan lewat laut/udara; **UNLOCK gun shop +
  bengkel modifikasi**.
- **Babak 3 — Heist Setup (BARU, 3 misi setup):** rencanakan heist bank/toko
  perhiasan: (a) curi kendaraan pelarian, (b) retas keamanan, (c) rekrut kru.
- **Babak 4 — Climax & Final Escape:** eksekusi heist bareng Jax+Maya (co-op) →
  kejar-kejaran besar melintasi **JEMBATAN UTAMA di 5 BINTANG** ke titik akhir.
- Alur misi HARUS berfungsi end-to-end (lihat §7 bug #15): HUD "Next job" →
  ke La Rosa → tekan E → cutscene intro + dialog → objektif jalan → selesai →
  kartu outro + reward + standing → misi berikutnya muncul.

## 4. Fitur WAJIB (dari semua referensi ilham — HARUS ada, bukan pajangan)

### 4a. Protagonis & karakter
- **Multi-protagonis: Jax + Maya** (karakter orisinal, model sudah ada).
  Ganti via menu + tombol cepat; masing-masing posisi/model/animasi sendiri;
  uang + progres misi bersama. **Switcher HARUS berfungsi** (pilih Maya = jadi
  Maya, bukan pria berjas hitam). Karakter HARUS ke-render di portrait DAN landscape.
- Karakter menu (repo lama): Jax Vega (Wheelman), La Rosa (pemilik klub),
  Leo (crew muscle), Maya (crew driver). Pemain default: Jax.
- Kustomisasi fisik DI LOKASI (bukan menu instan): toko baju, salon, tato —
  perubahan terlihat di karakter.
- Animasi: blend tree (idle→jalan→jog→sprint→pivot), Foot/Hand IK (kaki di
  tangga/tanah tidak rata, tangan di setir), parkour (vault pagar pendek,
  panjat tembok, **BERENANG** di air, cover di balik tembok/mobil), upper-body
  layering (aim/tembak/reload sambil kaki jalan/lari), hit reaction, **ragdoll**
  (tertabrak mobil/ledakan/jatuh → tubuh lemas), animasi masuk/keluar kendaraan
  (buka pintu, duduk, starter, pecah kaca kalau terkunci), animasi berkendara
  (tangan putar setir, kepala menoleh saat mundur, badan miring di motor),
  interaksi (todor kasir, isi bensin, NPC santai: jalan sambil HP, duduk di
  pantai, dansa di klub). Retargeting animasi (satu rig untuk semua karakter) +
  animation LOD (NPC jauh lebih kasar).

### 4b. Interior yang bisa dimasuki
Klub La Rosa, toko (minimarket, toko baju, toko senjata), garasi/bengkel,
safehouse/apartemen, bank, toko perhiasan, SPBU, kantor polisi LVPD,
rumah sakit, dealer, gudang pelabuhan, restoran, mall, pet shop, villa.

### 4c. Kendaraan (semua harus RENDER — fallback prosedural kalau GLB gagal)
- Wajib ada: supercar, muscle, sedan/SUV, pikap 4x4/off-road, motor (sport +
  cruiser), SWAT van, ambulans, pemadam, **truk GLB** (bukan kotak polos), van,
  **bus kota** (rute + berhenti di halte), speedboat (bisa dikendarai),
  airboat (rawa), yacht, kapal nelayan, **helikopter bisa diterbangkan**
  (sipil + polisi), pesawat kecil (propeller/seaplane), jet pribadi di airport.
- Jet ski + pengendara HARUS di LAUT (bukan di jalan). Polisi heli = AI
  (wanted ≥4 bintang); heli sipil bisa diterbangkan pemain.
- Fisika berkendara: ban/suspensi/drivetrain, **bensin** (mobil mogok kalau
  habis — isi di SPBU), damage bodi pengaruhi performa, respray di bengkel
  hilangkan wanted, drift/near-miss scoring (DRIFT x3 +$150, NEAR MISS +$250).
- Polisi INGAT kendaraan yang dipakai (wanted menempel di kendaraan; ganti
  mobil saat tidak terlihat = wanted turun drastis).
- **Tabrakan mobil WAJIB:** player vs traffic, traffic vs traffic — berhenti/
  mental + damage COND + feedback. Jangan sampai mobil macet permanen.
  Juga cek tabrakan mobil vs pejalan kaki / tiang / bangunan.
- **Carjacking:** curi mobil BERISI → pintu terbuka, NPC sopir keluar
  (animasi keluar), lalu LARI ketakutan (lari cepat menjauhi pemain, ke
  trotoar/aman, lalu jalan normal). Curi mobil KOSONG → alarm bunyi
  "tin-tin-tin-tin" (Web Audio sintetis, bukan file berhak cipta), berhenti
  setelah beberapa detik / saat pemain kabur; alarm menarik perhatian polisi.
  **Mencuri mobil = INSTAN 1 bintang.**

### 4d. Dealer Auto Palms (katalog repo lama — nama + harga)
Sedan $800 (Vega Sedan), SUV $1.200 (Vega SUV), truk $1.000 (Vega Hauler),
sport $1.500 (Vega Comet), pikap $1.100 (Vega Pickup). Katalog GLB:
Countach Wedge $8.000 (flagship, gaya Lamborghini), Dominus GT $6.000,
Vega Formula (F1) $5.000, Marina Convertible $3.500, Sunset Roadster $3.200,
Retro Sportster $3.000, Pink Wedge Cabrio $2.800, Mustang Muscle $2.500,
City Hatch $2.200, Orange Sport Sedan $1.800, VIP Classic $1.500.
Panel dealer: 15 model + harga + top speed, klik/1–9,0 pilih, Enter/BUY,
B/Esc tutup, preview 3D live di depan pemain. **CC-BY attribution (9 file)
WAJIB ada di menu CREDIT.**
- Skala mobil (meter): sedan 4,6×1,9; SUV 4,7×2,0; truk 6,4×2,4; sport 4,4×1,9;
  bus 10×2,6; polisi 4,8×2,0. Top speed: sedan 32, SUV 35, truk 24, sport 44,
  wedge 52, F1 55, bus 22 (m/s).

### 4e. Senjata (5 tier)
FISTS (damage 34, jangkauan 2,2 m, gratis), PISTOL $600 (damage 50, mag 12,
reload 1,1 dtk, ammo/pack 24), SMG $1.500 (damage 22, mag 30, reload 1,5 dtk,
pack 60), SHOTGUN $2.500 (damage 110, mag 6, reload 2,0 dtk, pack 12),
RIFLE $4.000 (damage 80, mag 30, reload 1,7 dtk, pack 30).
**Inventaris terbatas:** bawa beberapa senjata utama (terlihat di badan/tas);
sisanya di bagasi mobil atau safehouse. Weapon wheel (radial, tahan buka) +
item penyembuh. Drive-by: tembak dari mobil (pistol/SMG). ADS ala Point Blank.

### 4f. Polisi & wanted (1–5 bintang)
- Eskalasi: patroli → blokade → heli → SWAT. 1 bintang = 1–2 unit;
  5 bintang = banyak cruiser + blokade + heli, kejar berkelompok dari
  berbagai arah (tetap jaga performa HP).
- **Polisi keluar dari mobil** kalau sudah dekat target (kejar jalan kaki);
  kalau jauh tetap di mobil. **Kantor polisi LVPD** (bangunan + mobil polisi
  parkir + spawn point polisi).
- **Dispatch board (contekan top-20, WAJIB):** panel dengan NAMA unit + jarak
  (meter) + taktik (PURSUING / RAMMING / ROADBLOCK / SPOTLIGHT / FLANKING /
  SEARCHING) + jumlah unit + baris narasi ("CORAL-48: shots fired...").
  **IN SIGHT / HIDDEN + bintang berkedip saat terlihat + search zone di minimap**
  (mekanik line-of-sight GTA V). Radio chatter polisi ~tiap 9 dtk saat wanted.
  **Spike strips** saat wanted tinggi. **Heli spotlight cone** + "Air One has
  you in the light".
- Polisi pintar: kejar prediktif, mode pencarian, wanted decay, roadblock ≥3,
  BUSTED saat tertangkap ($100 bail, bangun di La Vega General).
- Warga lapor polisi via HP (NPC rekam aksi pemain → medsos / lapor → wanted naik).
- **Rank bernama + RP bar:** Newcomer → Street Hustler → Wheelman → Crew Runner
  → Made Driver → La Vega Legend (repo lama). Contekan top: FIXER / WHEELMAN /
  DRIVER / SHOT CALLER / KINGPIN + progress RP.

### 4g. NPC & dunia hidup
- NPC: pejalan kaki (24+), rutinitas harian per jam/lokasi (pantai siang,
  klub malam, pelabuhan kerja), reaksi dinamis (panik saat tembakan, lari,
  marah kalau mobilnya ditabrak, sopir panik + langgar lampu merah).
- Aktivitas VISUAL (harus kelihatan): ngobrol berpasangan, duduk, belanja,
  berenang, jet ski, dansa di klub. Kepadatan tinggi di downtown, pantai, marina.
- Variasi model: pakai banyak model Quaternius (25 GLB, 23 CC0 + 2 CC-BY) —
  beda baju/postur/pria/wanita; teknik modular (kepala/rambut/atasan/celana/
  aksesori terpisah) + color tint via kode; low-poly (3.000–8.000 tris/NPC).
  Tipe per area: turis/pengunjung pantai (baju renang, kemeja Hawaii, kacamata,
  topi), pekerja kantor (jas + tas + HP), pengunjung klub (pakaian pesta),
  polisi (tactical belt), **SWAT** (helm balistik + rompi + hitam, wanted tinggi),
  paramedis + pemadam (respons chaos), geng (warna khas + bandana + tato),
  bodyguard (jas hitam + kacamata), kasir minimarket/SPBU (seragam/apron,
  BISA DIRAMPOK), penjaga toko senjata + mekanik (berminyak), pekerja
  pelabuhan/konstruksi (rompi + helm).
- **Animasi mati NPC:** jatuh + TERBARING, terpental kalau ditabrak keras
  (ragdoll), mayat tetap terbaring (jangan langsung hilang / bangkit lagi).
- **Loot uang NPC mati:** uang muncul di atas/di badan NPC mati (tumpukan uang /
  "$" hijau melayang); jalan mendekat = AUTO-COLLECT (tanpa tombol), jumlah
  acak $5–$50 (NPC spesial lebih), HUD uang bertambah + notif "+$25".
- Hewan: anjing, burung, ikan, buaya (rawa), camar (pantai), anjing peliharaan
  di pemukiman. (Bukan 170 spesies — beberapa saja, yang penting ada.)
- Geng + wilayah: geng jaga area industri/slum, serang kalau pemain bikin
  masalah di sana.
- Interaksi objek: lampu, kulkas, TV, rampok kasir, bobol brankas, intimidasi warga.
- Medsos dalam game ("La Vega Social"): NPC upload aksi pemain; notifikasi
  medsos + SMS di SISI KIRI layar.

### 4h. HUD (posisi — verifikasi semua ada + rapi)
- Minimap kiri bawah (bulat — **HARUS berfungsi penuh**: panah pemain bergerak
  real-time jalan/kendara/putar; blip polisi biru/merah real-time; marker misi;
  blip lain (mobil pemain, NPC kunci, distrik); skala akurat, update tiap frame,
  terbaca di HP). Di bawah minimap: bar HEALTH / ARMOR / STAMINA.
  Armor = BARU (repo lama belum ada).
- Bintang wanted kanan atas (berkedip saat dikejar, redup saat sembunyi dari LOS).
- Uang / senjata / amunisi kanan atas.
- Speedometer + bar bensin kanan bawah saat berkendara (+ nama mobil +
  CONDITION% + gear G1–G5 + NITRO%).
- Weapon wheel di tengah (radial). Crosshair tengah + prompt interaksi
  ("[E] Masuk Mobil", "[F] Rampok Kasir") dekat objek interaktif.
- Radio stasiun di HUD (Neon Tide FM 98.6, Mango Radio 101, Static Dub 88.1)
  + judul lagu. **Day counter** (DAY 1 · 12:00) + hari+jam+kota
  (mis. "FRI 17:41 · LA VEGA"). **Location intro card** saat masuk distrik
  baru (mis. "THE STRAND / LA VEGA"). **Label lokasi = distrik + nama jalan +
  standing** (mis. "MARINA / Palm Row / 58%").
- Dialog: portrait + nama + peran (mis. "LA ROSA · CLUB OWNER").
- **Mission staging:** MISSION n · STAGE x/y + timer + NEXT objective +
  progress bar. **Panah kuning besar di dalam dunia** menunjuk tujuan misi aktif.
- Hint kontekstual ("DUCK BY A STALL TO HIDE", "They can see you · break
  line of sight"). **Drift/near-miss scoring** berhadiah uang.
- **Menu:** NEW GAME / LOAD GAME / SETTINGS / CREDITS (+ WATCH TRAILER +
  character switcher + save slot + penjelasan tempat save). Backdrop = kota 3D
  senja full-screen (menara + sign hotel + palem + pantai), judul gradient
  oranye→kuning→pink + subtitle teal. Cutscene PEMBUKA saat NEW GAME saja
  (Jax: tiket feri + tanpa uang → La Vega → La Rosa; 2–3 kartu teks + sapuan
  kamera sinematik, bisa skip ENTER/tap, TIDAK di LOAD GAME).
  **Trailer baru** (La Vega, bukan Solmar): MP4 re-record ATAU mode trailer
  sinematik in-game di balik tombol WATCH TRAILER (30–60 dtk, bisa skip).
- **Sistem HP di UI:** ikon HP di UI (sentuh + klik, portrait + landscape);
  tekan → menu HP (kontak La Rosa/Manny/Crew, GPS, "La Vega Social"); saat
  terbuka, karakter main animasi PEGANG HP (satu tangan angkat, kepala menunduk);
  karakter berhenti; tutup → animasi normal kembali.
- **Dua MODE KONTROL:** (1) HP (sentuh): joystick + tombol sentuh rapi/
  terpisah, keyboard help DISEMBUNYIKAN; (2) PC (keyboard/mouse): keyboard help
  tampil, tombol sentuh disembunyikan/minimal. Auto-detect (sentuh → HP,
  keyboard/mouse → PC) + bisa diubah di Settings + tersimpan. Berlaku portrait
  DAN landscape.
- **Settings:** tab SETTINGS + CONTROLS (kartu grid binding LA VEGA — lihat §9),
  slider musik/efek/sensitivitas, quality Low/Med/High + **auto quality scaling**
  (ukur FPS 3 dtk pertama → turun otomatis + pill "Quality: medium for smoother
  play"), shadows toggle, HUD density Full/Compact, mute, RESET SAVE.
  Settings BISA DIBUKA dari pause (pause: RESUME / SETTINGS / SAVE / QUIT).
- **Loading:** progress % + timeout/fallback + lazy-load (jangan stuck
  "Loading La Vega…" di koneksi lambat).

### 4i. Toko & ekonomi (semua terintegrasi — uang misi/rampok/loot BISA dibelanjakan)
- **Auto Palms** (dealer mobil, §4d). **Vega Arms** (toko senjata, §4e).
- **Bisnis:** Neon Bar $2.000, Manny's Garage $1.500, Beach House $1.200
  (beli → penghasilan pasif). **Garage:** repair + isi bensin + respray
  ($50, hilangkan wanted) + nitro.
- **SPBU (Petro Vega):** isi bensin + repair. **Minimarket:** rampok kasir.
- **Bengkel modifikasi:** repaint + upgrade mesin. **Toko baju / salon / tato:**
  kustomisasi terlihat di karakter.
- **Safehouse/apartemen:** save manual, GANTI KARAKTER, sembunyi dari polisi,
  garasi pribadi + senjata tersimpan.
- **Bank + toko perhiasan:** target heist (Babak 3–4). **Restoran cepat saji:**
  makan = pulihkan health. **Klub:** La Rosa's. **Rumah sakit:** La Vega General
  (respawn BUSTED). **Kantor polisi LVPD:** lihat §4f.
- **Crew:** 3 kru pasif $1.500 (muscle/driver/hacker) + **abilities AKTIF**
  (portrait + keybind Z/X/C + cooldown — contekan Karimbu: SWAP PLATES,
  QUICK FIX, EYES OUT; buat versi La Vega sendiri).

### 4j. Cuaca, waktu, audio, save, performa
- Cuaca dinamis: matahari 50% / awan 25% / hujan 18% / badai 7%; grip −15%
  saat hujan; golden hour 16:30–19:00; siklus siang-malam (lampu jalan +
  jendela menyala malam, lampu mobil). Langit: sky dome gradient per fase
  (siang biru / senja rose-ungu / malam biru gelap / hujan abu-abu), awan
  tinted per fase, sun glow 1,6× saat senja, laut glint matahari, ACES
  exposure ~1,15.
- **Audio SFX + musik ROYALTY-FREE / CC0 SAJA** (sumber: Freesound.org CC0,
  Kenney.nl, Pixabay, OpenGameArt.org, Sonniss GDC Audio Bundle). JANGAN musik
  berhak cipta (contoh terlarang: Akon di trailer Corrupt Estate).
  SFX: mesin (sport/truk/motor), ban/drift, rem, tabrakan, kaca pecah, mesin
  mati, pintu, klakson, sirene polisi (wail & yelp), pompa bensin; senjata
  (pistol/AR/shotgun, reload, dry fire, impact aspal/logam/kaca/air, ledakan);
  lingkungan tropis (ombak, angin, hujan deras, petir, camar, jangkrik rawa,
  lalu lintas jauh, kerumunan, langkah di aspal/pasir/rumput/genangan, bass klub);
  UI/karakter (klik menu, notif HP/sosmed, kasir/uang, peringatan wanted,
  napas berat saat stamina habis, erangan sakit, pintu gedung, retas kunci).
  Musik: 3 stasiun radio (Neon Tide FM 98.6 synthwave/retro 80s, Mango Radio 101
  hip-hop/trap + Latin pop, Static Dub 88.1) + **dynamic action score**
  (auto-play saat kejar-kejaran/heist). File audio KECIL (gate 48 MiB) —
  sintesis Web Audio atau loop pendek.
- **Dubbing suara manusia NON-AI (ganti TTS):** klip suara manusia CC0 dari
  Freesound/OpenGameArt/Sonniss. Fokus BARKS (reaksi pendek): teriakan kaget,
  makian ringan, radio polisi, suara bertarung, sapaan NPC. Dialog misi tetap
  TEKS (subtitle). Obrolan latar NPC = gumaman/Simlish (tanpa skrip). Variasi
  pitch via Audacity. **speechSynthesis TTS TETAP DILARANG (dihapus 18:40 WIB).**
- **Save (3 slot, localStorage):** profil+karakter (karakter aktif Jax/Maya,
  posisi X/Y/Z, Health, Armor, penampilan: baju, rambut, tato); ekonomi+
  inventaris (uang, senjata, amunisi, item penyembuh); kendaraan pribadi
  (mobil/motor, modifikasi: warna, upgrade mesin, bensin, lokasi garasi);
  progres misi+dunia (misi utama selesai, misi sampingan, bangunan/safehouse
  terbuka, jam + cuaca terakhir). **AUTO-SAVE** tiap misi selesai / pembelian +
  **MANUAL SAVE** saat tidur/interaksi di safehouse. Save lama tetap bisa dibaca
  (migrasi aman).
- **Performa:** LOD, distance culling/streaming (render hanya dalam radius
  pandang), object pooling (recycle NPC + mobil traffic yang keluar pandang —
  jangan create/delete terus), occlusion culling, AI throttling (NPC jauh update
  lebih jarang), baked lighting, particle caps, auto quality scaling + pill HUD.
- **Cutscene:** kartu intro misi (act + nama + briefing + pemberi + reward) +
  kartu outro (JOB COMPLETE + reward + standing) di atas kota 3D live,
  auto-advance 2,8/3,2 dtk atau ENTER/tap skip; cinematic dolly (kamera rendah
  di belakang Jax, arc ke follow normal).

## 5. Contekan top entries (ide saja — JANGAN copy nama/brand mereka)

- Top 1–19 seri 12-0 (skor 993977); top 20–30 seri 993343. Total submission
  16.880 (23 Nov). Masuk top 20 = harus menang 12-0.
- Pola top 20: dispatch polisi + roadblock + heli 16/20; saves 9/20; weapon
  wheel 8/20; crew 8/20; garage/shop 7/20; district standing 7/20; radio 6/20;
  street race 6/20; misi 8–12 hampir semua.
- Fitur GTA V yang belum ada di game lama (prioritaskan): wanted berbasis
  line-of-sight, taktik polisi (PIT, ramming, roadblock, commandeer kendaraan
  sipil), ganti mobil saat tak terlihat = wanted turun, warga telepon polisi,
  penangkapan di bintang rendah (denda + sita amunisi/armor), hiding spots
  (terowongan, bukit, gang, garasi, semak).
- Karimbu #1 (menu): backdrop kota senja, judul gradient, 3 opsi, kartu save
  slot + penjelasan, tagline. **Kelemahan FATAL Karimbu: TIDAK ADA kontrol
  sentuh di HP (tidak bisa dimainkan) + karakter blocky polos.** Keunggulan
  kita yang HARUS dipertahankan: kontrol sentuh lengkap + karakter Quaternius
  berpakaian + switcher + WATCH TRAILER + jalan 10 m + trotoar 2,5 m.
- Karimbu settings: tab SETTINGS/CONTROLS, slider musik/efek/sensitivitas,
  Quality Low/Med/High, shadows, glow, HUD density, settings dari pause.
  **JANGAN copy binding Karimbu mentah** — binding La Vega beda (lihat §9).

## 6. Struktur file (repo lama — pakai sebagai pola, tulis ulang sendiri)

```
repo/
  main.ts            # Node 22, copy game/ + screenshots/ → /output, tulis dossier.json
  LICENSE            # MIT
  README.md          # template requirements (ikuti template kit)
  vendor/makefun-game.ts   # kit, JANGAN diubah
  game/
    index.html       # ≤ 1 MiB, ES modules, tanpa network request
    src/
      main.js        # boot + game loop
      game.js        # state + misi + interaksi
      city.js        # kota + bangunan + jalan + biome
      vehicles.js    # mobil + traffic + fisika
      humanoid.js    # karakter + NPC + animasi
      config.js      # WORLD, PLACES, CAR_MODELS, WEAPONS, MISSIONS
      settings.js    # settings + save
      audio.js       # SFX + radio (Web Audio, CC0)
      rng.js         # seed RNG
      quaternius.js  # loader karakter Quaternius
      quaternius-data.js  # data GLB (JANGAN embed base64 besar — muat via fetch)
      retarget.js    # retarget animasi Quaternius → rig karakter
      buycars.js     # dealer Auto Palms
    three/           # three.js 0.170.0 vendored (three.module.js + addons GLTFLoader,
                     # BufferGeometryUtils, SkeletonUtils)
    models/          # GLB CC0/CC-BY (karakter, mobil, pohon, senjata) — muat via fetch,
                     # BUKAN embed (embed bikin game/ ~53 MB dari ~11 MB)
  screenshots/       # 3–4 gambar (lihat §1)
```
- **Anggaran ukuran:** repo lama `game/` = 48 MB (DI AMBANG gate 48 MiB!) —
  repo baru saat ini ~19 MB (45 file, aset sudah di-copy Eleven).
  JANGAN embed base64 GLB besar. Jaga total `game/` JAUH di bawah 48 MiB.
- **Aset yang sudah ada di repo baru** (di-copy Eleven di sesi terekam):
  `game/three/` (three.module.js + addons), `game/models/cars/` (11 GLB dealer),
  `game/models/chars/` (jax-male, la-rosa-female, npc-female-2,
  npc-male-adventurer, npc-male-business), `game/models/qcars/` (pickup,
  police-car, sedan-2, sedan, sports-car, suv, taxi), `game/models/trees/`
  (palm-tree, pine), `game/models/weapons/` (pistol), `vendor/makefun-game.ts`,
  `LICENSE`.
- **Model karakter baru ilham (Male_0_k6kg.glb + Female_1_h08g.glb) DINONAKTIFKAN:**
  di HP render sebagai manekin telanjang T-pose (tekstur tidak ke-load,
  retarget tidak jalan). Pakai Quaternius. File GLB baru tetap di
  `game/models/` repo lama — butuh re-export (tekstur JPEG lebih kecil) +
  verifikasi HP ulang, BUKAN quick fix. Jangan aktifkan tanpa verifikasi.
- **GLB probe (Three.js Box3):** jax-male.glb native 4,83 m (vs la-rosa 1,81 m)
  — normalisasi ke 1,8 m + re-ground kaki di clone. Roda: geometry.translate()
  per mesh HARUS clone dulu (satu geometry dipakai 2 roda → roda #2 ikut
  bergeser). Pistol Quaternius ~18 m tanpa normalisasi → 0,18 m.
- Boot file:// butuh flag Chrome `--allow-file-access-from-files` (ES module +
  fetch); di HP pakai preview Pages; di PC `python3 -m http.server 8000`.

## 7. BUG LAMA — TIDAK BOLEH MUNCUL LAGI (daftar playtest M3b, 23 Nov)

Cek satu per satu sebelum kirim. Semua ini DITEMUKAN di playtest ilham
(18:27–19:44 WIB, 21 screenshot):

1. **Pesawat di jalan:** 2 fuselage + sayap parkir DI TENGAH JALAN kota.
   Pesawat HANYA di runway/tarmac airport. Cek SEMUA spawn pesawat.
2. **Map edge VOID:** setengah layar kosong biru di tepi peta. Map harus
   ENDLESS (pantai + laut sampai horizon, semua sisi); kendaraan/NPC tidak
   bisa masuk void.
3. **NPC melayang:** perempuan melayang horizontal di atas matras pink
   (aktivitas yoga/sunbathing). NPC HARUS grounded di pasir/matras.
4. **Placeholder/objek rusak/melayang:** kotak BIRU di pantai; objek MERAH
   di pinggir jalan/pantai; silinder abu-abu MELAYANG di dermaga; garis EMAS
   di gedung; kotak PINK di kejauhan; kotak MERAH tekstur rusak/corrupt
   (sisi kuning pixel). Tidak boleh ada.
5. **Tanah gelap + datar tanpa detail:** pantai gelap; tanah polos. Baseplate
   TIDAK BOLEH POLOS (variasi warna, tekstur per area, batu, semak, retakan).
6. **Bukit piramida hijau raksasa** (artifisial) + **dinding abu-abu melengkung
   raksasa** di jalan (bangunan glitch). Bukit harus natural berbatu; cek SEMUA
   bangunan (flicker, tembus pandang, bentuk rusak, tekstur hitam, melayang,
   posisi salah).
7. **Jet ski DI JALAN** (dengan pengendara). Jet ski + rider HARUS di LAUT.
   Cek juga spawn swim/play.
8. **Pohon kelapa frond papan datar** (lollipop). Perbaiki model palm (frond
   ramping melengkung terkulai, lebih banyak frond, batang agak melengkung,
   kelapa terlihat).
9. **Trapesium KUNING (ramp) di tengah jalan.** Stunt ramp HANYA di taman/
   area khusus, bukan di jalan. (Root cause lama: "Palm Court Jump" di (104,88).)
10. **Zebra cross TERLALU BANYAK** di sepanjang jalan. Hanya 3–5 titik di
    persimpangan utama. **Lampu merah HANYA di zebra cross itu** (bukan di
    sepanjang jalan).
11. **Sign "DONUTS" + "LA ROSA'S" teks tumpuk/terpotong.** Teks sign harus
    rapi, terbaca.
12. **NPC duduk aneh** (pose meditasi di rumput) + NPC berbaring di matras
    KUNING di beton abu-abu (bukan pantai). Sunbathing HANYA di pasir pantai;
    pose duduk normal.
13. **Character switcher RUSAK:** pilih Maya → jadi pria berjas hitam.
    Pilih Maya HARUS jadi Maya. Karakter HARUS render di portrait DAN landscape.
14. **Pohon di jalan (46 pohon) + NPC di jalan (9 NPC)** — di repo lama sudah
    diperbaiki (0/227 pohon, 0/24 NPC di jalan; spawn di trotoar, menyeberang
    hanya di persimpangan). JANGAN terulang: semua spawn cek onRoad/nearCrossRoad.
15. **MISI TIDAK BERFUNGSI (KRITIS):** ilham coba mulai misi tapi tidak jalan.
    Verifikasi alur lengkap end-to-end (HUD → La Rosa → E → cutscene → objektif
    → reward → misi berikutnya), SEMUA 12 misi. Cari root cause (trigger E?
    objektif tidak register? dialog? reward? progresi?).
16. **Mobil TEMBUS sesama mobil.** Tambah collision detection antar mobil +
    damage COND (lihat §4c).
17. **Animasi mati NPC KAKU.** NPC harus jatuh + terbaring, terpental kalau
    ditabrak keras (lihat §4g).
18. **Kendaraan GLB sebagian TIDAK RENDER** (hanya sedikit yang muncul).
    Semua kendaraan harus render (fallback prosedural kalau GLB gagal, jangan
    sampai hilang). Truk masih kotak (prosedural) — cari GLB truk CC0/CC-BY
    atau detailkan prosedural (kab, jendela, kargo, roda proper).
19. **Kota SEPI / aktivitas NPC tidak kelihatan.** NPC padat + aktivitas VISUAL
    (lihat §4g). Verifikasi rutinitas benar-benar trigger/terlihat.
20. **Kamera LIAR / goyang sendiri.** Stabil, smooth follow, rotasi manual
    nyaman, zoom halus, deadzone + smoothing benar. Benchmark: file Claude.
21. **Terminal bus:** kursi TERBALIK, halte DI ATAS zebra cross, TIDAK ADA BUS.
    Pindah ke trotoar, kursi menghadap jalan, tambah bus di rute.
22. **Tombol JUMP/PUNCH PUDAR** + keyboard help NUMPUK tombol sentuh di
    landscape. Dua MODE KONTROL (lihat §4h).
23. **Loading stuck "Loading La Vega…"** di koneksi lambat (LTE ilham ~296 K/s,
    kadang 295 B/s–6 KB/s; total download ~40 MB ≈ 2+ menit). Progress % +
    timeout/fallback + lazy-load (lihat §4h).
24. **Kotak kuning di pinggir jalan** + zebra cross kebanyakan (lihat #10).
25. **Awan gelap rendah + kolom vertikal krem di langit.** Awan harus di
    ketinggian wajar, tanpa kolom aneh.
26. **Mobil di rumput** (sedan di rumput, bukan jalan). Traffic harus di jalan;
    parkir paralel 8/8 di tepi trotoar.

## 8. Aturan main (jangan dilanggar)

- SEMUA kode ditulis di sesi terekam ini. Jangan copy file kode dari repo lama
  tanpa menulis/mengeditnya sendiri di sini. Jangan copy kode/repo orang lain.
- Aset CC0/CC-BY saja + atribusi di CREDITS (wajib untuk CC-BY). Jangan pakai
  musik/file berhak cipta. Jangan pakai nama/aset GTA.
- **speechSynthesis TTS DILARANG.** Dubbing = klip suara manusia CC0 (§4j).
- Push per milestone via gh.py + verifikasi tiap push (remote commit + tree
  identik + preview HTTP 200 + 0 console error). JANGAN kirim file ke ilham
  (Max yang kirim).
- **Deadline: game lengkap + dites MALAM INI (23 Nov malam).** Submit target
  24 Nov 12:00 WIB, hard deadline 22:00 WIB. Kalau ada yang tidak keburu,
  laporkan ke Max (APA + KENAPA), jangan skip diam-diam.
- Sebelum kirim: TEST SEMUA (boot file:// + https, 0 console error, semua
  fitur dites satu per satu, portrait + landscape + PC, karakter selalu render,
  kontrol jalan, UI rapi).

## 9. Binding kontrol La Vega (jujur — untuk tab CONTROLS)

WASD/arrow gerak & nyetir · mouse drag look/aim · F tembak · Q pukul ·
E masuk mobil / bicara · Space lompat (kaki) / handbrake (mobil) ·
Tab weapon wheel · Digit1–5 slot senjata · X reload · R ganti stasiun radio ·
H klakson · N nitro · T HP · B beli bisnis terdekat · P/Esc pause ·
mouse wheel / pinch zoom kamera · V jarak kamera mobil (tambah) ·
Z/X/C abilities kru (tambah, aktif) · M mute (BUKAN map!) · sentuh: joystick
+ GAS/BRAKE/ENTER/PUNCH/JUMP/FIRE/AIM + pause.
(JANGAN samakan dengan Karimbu: F/Q/E/R/M beda fungsi di game ini.)

## 10. Catatan implementasi build baru (rekaman 3, 23 Nov malam)

- Three.js 0.170.0 **minified** (`three.module.min.js` 691 KB) + addon minified (GLTFLoader, SkeletonUtils, BufferGeometryUtils — GLTFLoader butuh BufferGeometryUtils, jangan dihapus; import relatifnya diarahkan ke `*.min.js`).
- Import map di `game/index.html` memetakan `three` + dua addon ke file minified; semua `game/src/*.js` pakai bare specifier.
- Model GLB dimuat via `fetch` dari `game/models/` (bukan base64 embed) + fallback prosedural — game tetap boot kalau GLB gagal.
- `ECONOMY` di `config.js` = satu-satunya sumber harga (taksi, snack, armor, anjing, bail, fine, loot, safe, respray, kustomisasi).
- `stageShot('beach' | 'downtown' | 'harbor')` di `main.js` — staging screenshot dossier (golden hour + wanted 3 + dispatch board).
- Headlight mobil nyala otomatis saat malam (`vehicles.js` + `weather.isNight()`); crosshair muncul saat pegang senjata api di darat; marker emas misi 'steal' menunjuk mobil parkir terdekat; petugas berdiri di roadblock.
- Rekaman 1 (`01a2089a`) dan 2 (`01a208b3`) mati karena restart layanan — semua file ditulis ulang/diedit substansial di bawah rekaman 3 (`01a208d9`, PID 6177/6179, sejak 21:39 WIB) supaya `transcripts_witnessed` lolos.

---
*Sumber: config.js repo lama (misi, dunia, mobil, senjata, rank); competition.yaml
kit gta6-01 (gate + deliverables); CONTEKAN.md (top-20 + Karimbu); MEMORY.md
(arahan + referensi ilham 18:40–20:18 WIB + bug playtest M3b 18:27–19:44 WIB).*

## Fix round 3 (24 Nov 2026, recorded session 01a20a40)
- HD-B1: facadeTexture 256 px + mullion cross + floor separator + ~12% lit windows.
- HD-B2: proud ground-floor base + canopy + 2 posts + crown cornice + floor bands + pilaster 0.5.
- HD-B3: special builders — club (neon glow), casino (setback + neon), city hall (5 columns + portico), mall (canopy), hospital (rooftop box + red cross), garage (open bays), workshop (sawtooth roof).
- HD-B4: silhouette variants — 2-tier setback, bay window, roof terrace (+ cornice).
- HD-B5: 3D sign boards (flipped to face the street) on all named places + ~30% generic shops.
- HD-V1: GLB loader timeout 8 s -> 15 s, traffic cars load first (slow-connection fix).
- HD-V2: procedural variants — sport spoiler, taxi roof sign + checker, police white doors + light bar, pickup open bed.
- HD-V3: van split cab + cargo, separate window panels, hubs, taillights; bus 5 passenger windows + destination sign.
- HD-V4: truck chrome grill/bumper, marker strip, taillights, exhaust stack, mud flaps, hubs.
- Density: block sizes clamped to the ~11 m block (the old 7-14 m roll skipped ~70% of buildings) + garden blocks.
- Sea: specular glint + 8 animated wave strips; storm clouds never drop (stay high).
- Maya follow REMOVED (no auto partner spawn, no follow branch, swap disposes).
- GPS idle beam to La Rosa, visible stunt ramps + hint, updateSea wired, sea ambience (audio.js setSeaLevel).
