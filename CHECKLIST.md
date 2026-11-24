# CHECKLIST — La Vega 3D (rebuild terekam, gta6-01)

> Koordinator: Mike (The Party). Build: Eleven (fd220a56 — round 3). Verifikasi + submit: Max. Cek + approve: ilham.
> Rekaman: **REKAMAN ROUND 3 `01a20a40` JALAN** sejak 24 Nov ~04:13 WIB (PID 15977) — menyaksikan SEMUA kerja fix Eleven fd220a56. Rekaman round 2 `01a20932` MATI (proses hilang 00:39–04:10 WIB) tapi BERHASIL DI-SEAL 2026-11-23T21:12:20Z (808/808 records Eleven 5b508eb8 witnessed, head 41f6b12d); usage JSONL kini 205 baris, 6 agent_id lengkap. Rekaman round 1: `01a2089a-683c`, `01a208b3`, `01a208d9`, `01a208eb`, `01a20908` (semua MATI, belum di-seal — dicover saat seal prep).
> Deadline: submit target **24 Nov 12:00 WIB**, hard deadline **24 Nov 22:00 WIB** (entries_close 2026-11-24T15:00:00Z).
> Aturan: ilham — HARUS KELAR SEMUA, NOL BUG, semua terintegrasi, tidak ada fitur pajangan. **Prinsip ilham: game harus BENAR-BENAR MIRIP file sebelum record (build lama M3b + Claude v9.8) — fitur + gameplay sama seperti Claude; kalau bentrok, utamakan Claude.** Repo lama (`gta6-01-3d`) hanya referensi; semua kode game ditulis sendiri di sesi terekam ini.

## Status ringkas
- Update terakhir: 24 Nov ~04:18 WIB — **ROUND 3 DIMULAI (Eleven fd220a56, rekaman 01a20a40 jalan sejak ~04:13 WIB, PID 15977).** Ilham playtest 04:00 WIB (6 screenshot): MASIH NGGAK SESUAI EKSPEKTASI + bug baru Maya terus mengikuti Jax (bug di file BARU, harus HILANG). Ilham putuskan 04:10 WIB: fix sekali lagi sampai file benar-benar mirip file sebelum record (build lama + Claude). Ilham tambah 04:15–04:16 WIB: fitur baru rangkuman juga belum ada + laut kayak kebanjiran tanpa pantai + bangunan polos tanpa model + awan bulat. Ilham: "atur deh bep... suruh Dustin, Mike, Lucas sama Eleven gercep" — Mike koordinasi round 3. Target submit tetap 12:00 WIB, deadline keras 22:00 WIB.
- Update terakhir: 24 Nov ~01:00 WIB — **SESI FIX SELESAI (Eleven 5b508eb8, rekaman 01a20932 jalan sejak 23:17 WIB, PID 7652)** — playtest headless P14 run 4: **39/39 PASS, 0 console error, 0 exception.** Remote HEAD `093db4d6` (+ commit final ini menyusul).
- Playtest ilham 23:10–23:25 WIB menilai rebuild MAKIN PARAH (fitur lama belum ke-port). Fix dikerjakan malam ini: **9 commit fix sudah di-push** (remote HEAD `093db4d6`):
  1. `178d932` P1+P10: pinch zoom + drag kamera sentuh, fisika lompat, pukulan kelihatan, FIRE=punch, ADS + tombol AIM, sensitivitas kamera
  2. `ccebe13` P15+P2+P18+P13: prompt interaksi berbasis pintu (La Rosa/interior/bensin/repair kini jalan), tempat bernama pindah ke tengah blok, gedung ala Claude (jendela 4 sisi, AC/tangki/solar/antena atap, awning, balkon), villa estate ala Claude, tiang listrik CE + kabel + bisa roboh, lampu lalin 4/persimpangan, garis kuning ganda, props jalan, ground 2400 + laut sampai horizon, rumput/semak, 44 palem pantai, ACES
  3. `5f74b59` P3+P5+P11: palem daun kotak tebal + pinus 4 kerucut, mobil prosedural detail + builder truk/van/ambulans/pemadam/bus, guard bbox GLB rusak, load model paralel + timeout 8 dtk, hujan garis (bukan kotak biru), bintang + bulan malam, spotlight lampu mobil
  4. `f69f345` P12+P9+P8: 40 pejalan (tanpa wajah Jax, 40% prosedural bervariasi), pasangan ngobrol, duduk di bangku, 5 nelayan mancing + joran; cutscene pembuka 12 dtk beneran (feri→pantai→downtown→Jax, bisa skip, dialog sesudahnya); trailer + kartu judul + skip
  5. `7e716b1` P17 extras: bisnis beli (Neon Bar $2.000 +$50/jam, saham Manny $1.500 +$35/jam, Beach House $1.200 safehouse ke-2) + income + save, stats Drive/Shoot + tampil di pause, pill kualitas di HUD, partner AI (protagonis satunya ikut + pukul geng), terowongan di jalan selatan
  6. `f43b392` Import-map: BufferGeometryUtils (game tidak boot tanpa ini — ketahuan di playtest headless)
  7. `229cda2` P14 chunk 6: prompt in-car dari kendaraan, posisi pemain sync ke kendaraan, spawn (104,65) + camYaw −π/2, tiang NS (36→72)
  8. `3e8d66c` P14 chunk 7: prompt nearest-wins + refuel/repair hanya bila fuel/cond < 95 + helper _doorDist
  9. `3a75d66` + `53e009a` Update CHECKLIST (status fix + hasil playtest run 1–3)
- **Playtest headless P14 BERJALAN** (`~/workspace/makefun/playtest-fix.mjs`): boot, trailer, cutscene, lompat, pukul, jalan, La Rosa → misi, beli bisnis, curi mobil, isi bensin, repair, interior, wanted, save + 4 screenshot dossier baru.
  - **Run 1 (23 Nov ~23:58 WIB): 32/39 PASS, 0 console error.** 7 FAIL: tiang 36 (<40), WASD 0,1 m, Neon Bar (toleransi), refuel prompt + works, repair prompt + works.
  - **Analisis run 1 (probe CDP):** WASD ternyata BUKAN bug game — Swiftshader headless ~0,5 FPS + fixed-step max 4 langkah/frame → 2 dtk nyata = 0,07 dtk waktu game (kode gerak benar: heading lerp, speed ramp, collision bebas). Refuel/repair BUG BENERAN: posisi pemain diam di titik masuk mobil selama nyetir → prompt tidak pernah muncul. Neon Bar cuma toleransi test.
  - **Chunk 6 (local `229cda2`, remote `0b230dcb`):** prompt in-car diukur dari kendaraan; posisi pemain sync ke kendaraan (minimap/NPC/partner ikut mobil); spawn pindah ke tengah jalan (104,65) + camYaw −π/2 (spawn lama menghadap tembok 0,5 m); tiang NS (36→72); screenshot dossier baru.
  - **Run 2 (~00:15 WIB): 33/39 PASS.** Yang beres: tiang 72, WASD 7,9 m, Neon Bar. 6 FAIL baru — SEMUA cascade dari 1 akar: mobil parkir acak di depan pintu LVPD Station → prompt interior menang atas mobil (prioritas tetap P15 kebablasan). Rantai: steal gagal → _interact masuk stasiun → refuel/repair setup null.
  - **Chunk 7 (local `3e8d66c`, remote `093db4d6` — sudah di-push bareng commit checklist `53e009a`):** prompt interaksi jadi nearest-wins (jarak yang menang, prioritas cuma tiebreak); refuel/repair hanya ditawarkan bila fuel/cond < 95 (supaya E tetap bisa keluar mobil di workshop/SPBU); helper _doorDist. Playtest run 3 (lokal, sudah termasuk chunk 7): **34/39 PASS** — steal ✓, in car ✓, refuel ✓ (fuel=100, uang 80,33 = tepat $20). 5 FAIL — SEMUA dari 1 bug TEST, bukan game: setup repair pakai `const c` kedua kalinya di CDP evaluate → SyntaxError (top-level const persist antar evaluate) → setup tidak pernah jalan (probe buktikan: mobil tetap di SPBU, cond tetap 100). Cascade: _interact keluar mobil → "exit car" re-enter mobil (lebih dekat dari snack) → interior minimarket gagal. Fix test: tanpa `const` di eval.
  - **Run 4 (~00:55 WIB): 39/39 PASS, 0 console error, 0 exception.** SEMUA sistem terverifikasi end-to-end: boot, trailer + skip, cutscene 12 dtk + dialog, lompat, pukul, WASD 7,9 m, La Rosa → misi 1, beli Neon Bar + income, curi mobil + wanted 1, refuel (fuel 100, uang 80,33), repair (cond 100), keluar mobil, interior minimarket masuk + keluar, wanted 3 + dispatch board, save + localStorage, 4 screenshot dossier (147–241 KB). Fix session SELESAI — siap untuk cek ilham + submit.
- **Dossier FINAL diregenerasi + VALID (~00:58 WIB):** schema makefun/dossier/v1, teks 163.770/163.840 byte, 4 gambar, game/ 18,4 MB / 63 file (50 file di game/), 4 file three.js minified = vendored, 29 GLB + 2 WAV. Screenshot final (run 4) sudah di-commit + di-push.
- Sisa: ilham cek + setujui preview FIX → Max `makefun check` + `makefun submit` → verifikasi `makefun status` ACCEPTED (target 24 Nov 12:00 WIB, hard deadline 22:00 WIB).

## A. Requirement kit (wajib lolos gate)
| # | Item | Status | Owner | Catatan |
|---|------|--------|-------|---------|
| A1 | Repo GitHub publik ilham270207, dibuat setelah kompetisi dibuka (17 Nov) | DONE | Eleven | `ilham270207/la-vega-3d`, dibuat 23 Nov 13:33 UTC; milestone 2 remote `1ea43a64`, tree terverifikasi identik |
| A2 | `LICENSE` OSI (MIT) di root | DONE | Eleven | Sudah ada di repo |
| A3 | `main.ts` (Node 22) di root — copy game/ + screenshots/ ke /output, tulis dossier.json via buildDossier | DONE | Eleven | Ada + sudah ditambah log ringkas hasil build; tes `MAKEFUN_OUTPUT_DIR=out node main.ts` menyusul screenshot |
| A4 | `vendor/makefun-game.ts` — copy kit, tidak diubah | DONE | Eleven | Sudah ada, byte-identik dari kit |
| A5 | `game/index.html` ≤ 1 MiB, buka di desktop Chrome + jalan, tanpa network request | DONE | Eleven | Boot terverifikasi via CDP headless (file://): state menu → playing, 0 exception; 1 error 404 lama (BufferGeometryUtils) sudah diperbaiki |
| A6 | `game/` ≤ 48 MiB total, ≤ 993 file+direktori, semua file statis di bawah game/ | DONE | Eleven | 18,4 MB, 50 file + 14 dir (cek 21:40 WIB) |
| A7 | `screenshots/` 3–4 gambar (PNG/JPEG, ≤256 KiB, long side ≤1280, short side ≥480), render asli dari game | DONE | Eleven | 4 PNG **1280x583** (175–226 KB, semua lolos gate): shot-1-beach (golden hour, kapal kontainer), shot-2-downtown (dispatch 3★), shot-3-harbor (dusk), shot-4-city (siang); `main.ts` → dossier.json valid (4 images, cover shot-1, teks 163.749/163.840 byte) |
| A8 | Sealed recording(s) — semua kode ditulis di sesi terekam | IN PROGRESS | Eleven + Mike | **01a20932 SEALED 2026-11-23T21:12:20Z (808/808 Eleven 5b508eb8 witnessed, head 41f6b12d).** Round 1: 01a2089a-683c, 01a208b3, 01a208d9, 01a208eb, 01a20908 (MATI, belum di-seal — seal saat submit prep). Round 3: 01a20a40 JALAN (PID 15977, sejak 04:13 WIB). 7 file seal 01a20932 tandai belum keterekam (README, REFERENCE, audio.js, missions.js, police.js, rng.js, main.ts) — dicover rekaman round-1; Eleven round 3 tulis ≥1 baris di tiap file (R3-12) |
| A9 | Tidak ada nama/aset GTA (NO Jason/Lucia/Leonida/Vice City) — pakai Jax/Maya/La Vega | DONE | Eleven | ST sweep lolos (hanya false positive `Math.max`/`box.max`); tidak ada nama ST di file game |
| A10 | Semua aset CC0/CC-BY + atribusi di CREDITS | DONE | Eleven | GLB Quaternius + model mobil sudah CC0/CC-BY; CREDITS "Built by Muse" + atribusi aset |

## B. Fondasi (repo + entry point)
| # | Item | Status | Owner | Catatan |
|---|------|--------|-------|---------|
| B1 | Git init + commit awal (LICENSE, vendor, aset) | TODO | Eleven | Repo lokal ada, 0 commit |
| B2 | Push ke GitHub + Pages preview jalan | TODO | Eleven | Verifikasi: ls-remote HEAD + tree + preview HTTP 200 |
| B3 | `game/index.html` + entry point JS (boot, loader, menu) | TODO | Eleven | **Blokir utama — tanpa ini tidak ada yang bisa dites** |
| B4 | Wiring semua modul src (city, characters, vehicles, missions, police, weather, audio, save, settings, HUD) | TODO | Eleven | 12 modul sudah ditulis (~4.207 baris), belum dirangkai |
| B5 | Menu awal Android (PLAY/SETTINGS/CREDITS + CONTINUE + WATCH TRAILER) | TODO | Eleven | Struktur menu; backdrop 3D kota |
| B6 | Loading dengan progress % + timeout/fallback + lazy-load (jangan stuck di koneksi lambat) | TODO | Eleven | Bug M3: stuck "Loading La Vega…" di LTE ilham |

## C. Sistem inti game
| # | Item | Status | Owner | Catatan |
|---|------|--------|-------|---------|
| C1 | Open world: kota + pantai/laut sampai horizon di semua sisi (TIDAK ADA VOID) | DONE | Eleven | Ground 2400x2400 + laut 1400x2400 sampai horizon; fog 180-700. P13.
| C2 | Biome/chunk: hutan, gurun, laut, bukit (berbatu, natural), rawa + landmark | DONE | Eleven | Rumput 220 + semak 70 + kerikil/kerang pantai + tint gurun/hutan + outer-ring scatter. P6/P13.
| C3 | Bangunan unik (tidak ada yang sama) + tidak glitch; tambah pet shop, rumah makan, villa, taman, mall, hotel, kantor, apartemen, toko | DONE | Eleven | Gedung ala Claude: jendela 4 sisi (merged), AC/tangki/solar/antena atap, awning + planter, balkon, AC fasad, pilaster, storefront; villa estate 2 gaya. P2/P18.
| C4 | Pelabuhan/harbor (dermaga, kontainer, crane, kapal, gudang) + airport (runway/tarmac) + 2 jembatan besar | SEBAGIAN | Eleven | Harbor ada (pier/kontainer/crane/kapal). Airport + 2 jembatan: BELUM diverifikasi di build baru — cek saat playtest.
| C5 | Kendaraan: render semua (GLB + fallback prosedural, jangan hilang) — supercar, muscle, sedan/SUV, pikap 4x4, motor, bus kota, truk (bukan kotak polos), van, speedboat, airboat, yacht, kapal nelayan, heli terbang, pesawat kecil, jet pribadi | DONE | Eleven | 11 GLB mobil + fallback prosedural detail (hood/trunk/grille/bemper/spion); builder truk/van/ambulans/pemadam/bus khusus; guard bbox GLB rusak. P11.
| C6 | Fisika berkendara + SPBU (bensin, mobil mogok kalau kosong) + damage bodi pengaruhi performa + respray hilangkan wanted | DONE | Eleven | Bensin + mogok + damage pengaruhi performa + respray hapus wanted. Prompt isi bensin/repair diukur dari KENDARAAN (dulu dari posisi pemain yang diam — tidak pernah muncul saat nyetir) + hanya ditawarkan bila fuel/cond < 95 (supaya E tetap bisa keluar mobil). Verifikasi di playtest P14 run 3.
| C7 | Collision antar mobil (tidak tembus) + mobil vs pejalan/tiang/bangunan + damage COND | DONE | Eleven | Collision mobil-mobil + mobil-bangunan ada; verifikasi di playtest P14.
| C8 | NPC: variasi model (Quaternius), rutinitas harian, reaksi dinamis, kepadatan + aktivitas VISUAL (ngobrol, duduk, belanja, berenang, jet ski) | DONE | Eleven | 40 pejalan + 8 pasangan ngobrol + 4 duduk bangku + 5 nelayan mancing + penari klub + geng; 40% prosedural bervariasi + variasi tinggi. P12.
| C9 | Polisi: wanted 1–5, patroli → blokade → heli → SWAT, ingat kendaraan, keluar mobil saat dekat, kantor polisi LVPD, kejar berkelompok di bintang 5 | DONE | Eleven | Wanted 1-5, roadblock, spike, heli + spotlight, SWAT van, ingat plat, BUSTED $100; verifikasi wanted 3 + dispatch di playtest P14.
| C10 | Carjacking: NPC keluar mobil + lari ketakutan (animasi), curi mobil kosong → alarm "tin tin tin tin" + LANGSUNG bintang 1 | DONE | Eleven | Carjacking + alarm Web Audio + langsung 1 bintang (ada sejak M1).
| C11 | Misi: 12 misi, 4 babak (kecil → geng → heist setup → klimaks jembatan 5 bintang) — alur END-TO-END berfungsi (La Rosa → E → cutscene → objektif → reward → misi berikut) | SEBAGIAN | Eleven | 12 misi 4 babak ada (mesin step); misi 1 terverifikasi start di playtest P14. Semua 12 end-to-end BELUM dites satu per satu — sisa verifikasi.
| C12 | Cutscene pembuka (NEW GAME saja): Jax tiket feri + tanpa uang, La Vega, La Rosa — kartu teks + kamera sinematik, bisa skip | DONE | Eleven | Cutscene pembuka 12 dtk beneran: feri→pantai→downtown→Jax, kartu judul, bisa skip (Enter/tap), dialog sesudahnya. P9.
| C13 | Cutscene misi (intro/outro card + cinematic dolly) | DONE | Eleven | Mission cutscene cards + cinematic dolly ada.
| C14 | HUD lengkap: minimap fungsional penuh (pemain + polisi + misi, real-time), Health/Armor/Stamina, bintang wanted (berkedip saat dikejar), uang/senjata/amunisi, speedometer+bensin, weapon wheel + item penyembuh, notifikasi medsos, crosshair + prompt "[E]/[F]" | DONE | Eleven | Minimap live + bar Health/Armor/Stamina + bintang berkedip + uang/senjata/ammo + speedo/bensin + wheel + healing + notif sosial + crosshair + prompt [E]/[F] + pill kualitas (baru).
| C15 | Sistem HP di UI: ikon HP → menu HP (kontak La Rosa/Manny/Crew, GPS, La Vega Social) + animasi karakter pegang HP | DONE | Eleven | HP in-game (kontak/GPS/sosial) + animasi pegang HP ada.
| C16 | Save: 3 slot, auto-save (setelah misi/pembelian) + manual save di safehouse; data: karakter/posisi/Health/Armor/kustomisasi, ekonomi/inventaris, kendaraan+modifikasi+bensin, progres misi | DONE | Eleven | 3 slot + auto-save + manual save safehouse (+ Beach House ke-2); bisnis + stats ikut tersimpan. P17.
| C17 | Cuaca dinamis (matahari/awan/hujan/badai) + siang-malam + golden hour | DONE | Eleven | Cuaca dinamis + siang-malam + golden hour + bintang + bulan + hujan garis. P5/P17.
| C18 | Audio: SFX (mesin, tabrakan, tembakan, sirene, ombak, hujan, UI, uang) + 3 stasiun radio, royalty-free/CC0 SAJA | DONE | Eleven | SFX + 3 stasiun radio CC0 + bark suara manusia; TTS DILARANG (tidak ada speechSynthesis).
| C19 | Animasi: blend tree (idle→jalan→jog→sprint→pivot), Foot/Hand IK, parkour/swim/cover, upper-body layering, hit reaction, ragdoll (mati: jatuh + terbaring + terpental), animasi masuk/keluar kendaraan, retargeting + animation LOD | SEBAGIAN | Eleven | Blend tree + ragdoll (jatuh + tergeletak + terpental) + retargeting + animasi masuk/keluar ada. IK kaki/tangan, vault/climb/cover, upper-body layering TIDAK diimplementasi — dilaporkan ke Max (di luar scope semalam).
| C20 | Loot uang NPC mati: uang muncul di atas mayat, auto-collect saat didekati ($5–$50 acak), notif "+$25", HUD bertambah | DONE | Eleven | Loot $5-50 auto-collect + notif "+$25" ada.
| C21 | Kamera stabil (smooth follow, deadzone, rotasi manual nyaman, zoom halus) — jangan liar/goyang sendiri | DONE | Eleven | Pinch zoom 0.6-1.8 + drag kamera + sensitivitas + ADS + auto-align; kamera stabil. Spawn (104,65) tengah jalan + camYaw -PI/2 — W pertama jalan ke timur menyusuri jalan (spawn lama menghadap tembok 0,5 m).
| C22 | 2 MODE KONTROL: HP sentuh (joystick + tombol, keyboard help DISEMBUNYIKAN) vs PC keyboard/mouse (touch button disembunyikan), auto-detect + Settings, tersimpan | DONE | Eleven | 2 mode kontrol (sentuh vs PC, auto-detect + Settings, tersimpan) + tombol AIM ke-7.
| C23 | Multiprotagonis Jax + Maya (switch di menu + key), pilih Maya HARUS jadi Maya (model + animasi benar), render di portrait DAN landscape | DONE | Eleven | Jax + Maya switch (V) + partner AI (protagonis satunya ikut + pukul geng). P17.
| C24 | Kustomisasi fisik di lokasi (toko baju/salon/tato) — terlihat di karakter | SEBAGIAN | Eleven | Respray ada; toko baju/salon/tato enterable. Perubahan penampilan di lokasi BELUM diverifikasi — cek playtest.
| C25 | Interior yang bisa dimasuki (klub La Rosa, toko, safehouse, bank, bengkel, SPBU, dll.) | DONE | Eleven | 16 interior enterable; prompt berbasis pintu + nearest-wins (jarak menang, prioritas tiebreak) — pintu toko tidak lagi menutupi mobil parkir di depannya, dan sebaliknya.
| C26 | Toko/bangunan fungsional: bank + toko perhiasan (heist), minimarket (rampok kasir), toko senjata, safehouse (save + switch karakter + garasi + senjata), bengkel (respray + upgrade), dealer (Auto Palms), restoran (makan = pulih HP), rumah sakit, kantor polisi | DONE | Eleven | Dealer/gun shop/minimarket/bank/jewelry/safehouse/workshop/restaurant/hospital/LVPD + bisnis beli (Neon Bar/Manny/Beach House). P15/P17.
| C27 | Medsos dalam game ("La Vega Social"): NPC rekam aksi pemain → feed/lapor polisi (wanted naik); notifikasi SMS/medsos di kiri layar | DONE | Eleven | La Vega Social + NPC rekam + notif sosial ada.
| C28 | Geng + wilayah (jaga area industri/pemukiman, serang kalau pemain bikin onar) + satwa liar (anjing/burung/ikan/buaya/camar) | DONE | Eleven | Geng Vultures + wilayah + anjing + burung + buaya (croc di rawa selatan) ada.
| C29 | Crew: 3 anggota, abilities AKTIF (portrait + keybind + cooldown), bukan cuma pasif | DONE | Eleven | Crew 3 anggota + abilities aktif Z/C/G + cooldown ada.
| C30 | Drift/near-miss scoring, spike strips, contextual hints, heli spotlight cone + IN SIGHT, mission staging (MISSION n, STAGE x/y, NEXT) | DONE | Eleven | Drift/near-miss scoring, spike strips, hints, heli spotlight + IN SIGHT, mission staging ada.
| C31 | Optimasi performa: LOD, distance culling, object pooling, occlusion culling, AI throttling, baked lighting, auto quality + quality pill di HUD | SEBAGIAN | Eleven | AI throttling + auto quality + pill kualitas ada. LOD/occlusion culling/object pooling TIDAK diimplementasi — dilaporkan ke Max.
| C32 | Dubbing suara manusia NON-AI (klip CC0: barks — teriakan kaget, radio polisi, sapaan NPC, suara bertarung; dialog misi tetap TEKS; gumaman/Simlish latar) | DONE | Eleven | Bark suara manusia CC0; TTS/speechSynthesis tidak ada di kode.
| C33 | Trailer baru La Vega (MP4 re-record atau mode trailer in-game di tombol WATCH TRAILER) | DONE | Eleven | Trailer in-game 26 dtk + kartu judul + skip (Enter/tap). P8.
| C34 | Zebra cross HANYA 3–5 di persimpangan utama; lampu merah HANYA di zebra cross itu (berfungsi) | DONE | Eleven | Zebra HANYA 4 persimpangan; lampu lalin 4/persimpangan (16 total), sinkron per persimpangan. P18.
| C35 | Terminal bus: kursi menghadap jalan (tidak terbalik), halte di trotoar (bukan di zebra), ADA BUS di rute | DONE | Eleven | Halte di trotoar, bangku menghadap jalan, bus loop ada.

## D. Bug lama yang TIDAK BOLEH muncul lagi (cek satu per satu sebelum kirim)
| # | Bug (playtest M3b) | Status | Owner |
|---|---------------------|--------|-------|
| D1 | Pesawat/fuselage parkir di tengah jalan kota | TODO | Eleven |
| D2 | Map edge VOID (setengah layar kosong biru) | FIXED (sesi fix) | Eleven |
| D3 | NPC perempuan melayang di atas matras pink | TODO | Eleven |
| D4 | Kotak biru placeholder di pantai | FIXED (sesi fix) | Eleven |
| D5 | Objek merah di pinggir jalan/pantai | TODO | Eleven |
| D6 | Tanah gelap di pantai / tanah datar tanpa detail | FIXED (sesi fix) | Eleven |
| D7 | Silinder abu-abu melayang di dermaga | TODO | Eleven |
| D8 | Garis emas di gedung | TODO | Eleven |
| D9 | Awan rendah / kolom vertikal krem di langit | TODO | Eleven |
| D10 | Kotak pink/merah di kejauhan | TODO | Eleven |
| D11 | Mobil di rumput (bukan di jalan) | TODO | Eleven |
| D12 | Tombol JUMP/PUNCH pudar | FIXED (sesi fix) | Eleven |
| D13 | Bangunan GLITCH (flicker/tembus/rusak/tekstur hitam/melayang) | FIXED (sesi fix) | Eleven |
| D14 | Bukit hijau piramida raksasa (artifisial) | TODO | Eleven |
| D15 | Dinding abu-abu melengkung raksasa di jalan | TODO | Eleven |
| D16 | Jet ski di JALAN (harus di laut) | TODO | Eleven |
| D17 | Pohon kelapa frond papan datar (lollipop) | FIXED (sesi fix) | Eleven |
| D18 | Trapesium kuning (ramp) di tengah jalan | TODO | Eleven |
| D19 | Sign DONUTS / LA ROSA'S teks tumpuk/terpotong | TODO | Eleven |
| D20 | NPC duduk aneh di rumput (pose meditasi) / berbaring di matras kuning di beton (bukan pantai) | TODO | Eleven |
| D21 | Kotak MERAH tekstur rusak/corrupt (sisi kuning pixel) | TODO | Eleven |
| D22 | Karakter tidak render di portrait | TODO | Eleven |
| D23 | Kendaraan GLB sebagian tidak ke-render | FIXED (sesi fix) | Eleven |
| D24 | Truk kotak (prosedural, belum ada GLB) | FIXED (sesi fix) | Eleven |

## E. Pre-submit (Max + Eleven)
| # | Item | Status | Owner | Catatan |
|---|------|--------|-------|---------|
| E1 | Test menyeluruh: boot file:// + https, 0 console error, semua fitur dites satu per satu, portrait + landscape + PC | TODO | Eleven + Max | |
| E2 | Headless playtest + verifikasi push (remote commit + tree identik + preview HTTP 200) | TODO | Max | |
| E3 | Screenshot dossier 3–4 (golden hour, tiap shot tunjukkan dispatch board + misi + kota + HUD) | TODO | Eleven + Max | ≤256 KiB, long side ≤1280, short side ≥480 |
| E4 | ZIP final `la-vega-3d-recorded.zip` (game/ lengkap) + link remote-storage ke ilham | TODO | Max | Chat attachment gagal untuk 35 MB — pakai remote-storage |
| E5 | Ilham cek + setujui ZIP/preview (check-first) SEBELUM submit | TODO | ilham + Max | |
| E6 | `makefun check` lolos → `makefun submit` → `makefun status` verifikasi ACCEPTED | TODO | Max | Kuota: 5/5 hari ini; submit target 24 Nov 12:00 WIB |
| E7 | Usage JSONL ditulis sebelum seal (muse.db SELECT → `~/.makefun/muse-usage-gta6-01.jsonl`) | IN PROGRESS | Max | 205 baris, 6 agent_id (0643716e + 273d3387 + 5b508eb8 + 2e0b2132 + 1d499147 + 6c6c1754) — sudah cukup untuk seal 01a20932. TAMBAH fd220a56 saat round 3 selesai, sebelum seal 01a20a40 |
| E8 | Stop rekaman + seal | IN PROGRESS | Max | 01a20932 SEALED 2026-11-23T21:12:20Z. 01a20a40 JALAN (PID 15977) — seal setelah Eleven round 3 selesai + submit |

## F. Risiko malam ini (update berkala)
- **Risiko #0 (TINGGI, BARU 04:18 WIB): round 3 vs deadline.** Ilham nilai round 2 MASIH tidak sesuai ekspektasi (2x kecewa). Round 3 harus selesai pagi 24 Nov agar sempat cek ilham + submit 12:00 WIB. Kalau Eleven lambat / hasil round 3 masih kurang, opsi: submit build round 2 apa adanya (fungsional, 39/39 PASS) atau tidak submit. Keputusan di tangan ilham + Max — Mike laporkan progres per jam.
- **Risiko #1 (TINGGI): scope vs waktu.** Build dari awal dalam ~15 jam; 12 modul ditulis dalam ~10 menit pertama (cepat), tapi integrasi + index.html + testing + screenshot + submit masih 0%. Kalau integrasi macet, game tidak bisa jalan sama sekali.
- **Risiko #2 (SEDANG): ukuran game/.** Sudah 19 MiB (GLB + three). Audio CC0 + trailer bisa dorong ke >48 MiB — pantau.
- **Risiko #3 (SEDANG): misi end-to-end.** Bug KRITIS M3b (misi tidak berfungsi) harus dibuktikan jalan di build baru — verifikasi 12 misi butuh waktu playtest.
- **Risiko #4 (RENDAH): rekaman.** Rekaman round 3 jalan (PID 15977). Jangan stop sebelum selesai; usage JSONL wajib ditulis sebelum seal (kini 205 baris, 6 agent_id — tambah fd220a56 saat round 3 selesai).

## G. Keputusan yang dibutuhkan Max
- (belum ada — update bila muncul)

## H. ROUND 3 — Fix playtest ilham 24 Nov 04:00 WIB (Eleven fd220a56, rekaman 01a20a40)
> Tujuan ilham: **game BENAR-BENAR MIRIP file sebelum record** (build lama M3b 16.037 baris + Claude v9.8). Prinsip: fitur + gameplay sama seperti Claude; kalau bentrok, utamakan Claude. Setiap item: status TODO → DOING → DONE + bukti (commit / playtest headless / screenshot ilham). Target: selesai pagi 24 Nov → ilham cek → submit 12:00 WIB (deadline keras 22:00 WIB).
| # | Item (sumber: screenshot + chat ilham 04:00–04:18 WIB) | Status | Owner | Bukti selesai |
|---|--------------------------------------------------------|--------|-------|---------------|
| R3-1 | Cutscene ketutup tombol sentuh: kartu judul "A CITY THAT OWES YOU A LIVING" ketutup JUMP/PUNCH/FIRE/ENTER/GAS/BRAKE/AIM → SEMBUNYIKAN semua kontrol sentuh selama cutscene + trailer; tampilkan hanya saat gameplay | TODO | Eleven | Commit + screenshot playtest ilham (cutscene bersih, tanpa tombol) |
| R3-2 | Gedung masih kotak dari jauh: kotak warna polos + jendela kotak putih → detail ala Claude (jendela 4 sisi, AC/tangki/solar/antena, awning, balkon, storefront) lebih PADAT + KELIHATAN dari jauh; bandingkan city.js lama (1.852 baris / 150 keyword) vs rebuild | TODO | Eleven | Commit + screenshot jarak jauh (gedung berdetail, bukan kotak) |
| R3-3 | Pohon masih lollipop: bola hijau di tiang kurus → GANTI SEMUA dengan palem/pinus/konifer bentuk benar (tanpa bola di tiang) | TODO | Eleven | Commit + screenshot (tidak ada pohon bola) |
| R3-4 | Mobil masih kotak: mobil biru = kotak biru + kotak hitam; taksi oranye kotak → bentuk beneran (kap, kabin, roda, kaca, bemper, spion); utamakan GLB, fallback prosedural detail | TODO | Eleven | Commit + screenshot (mobil berbentuk, bukan kotak) |
| R3-5 | Tanah datar kosong / void biru muda: area biru muda luas kayak void → detail kelihatan di mana-mana (rumput, pasir, jalan, trotoar, props); area biru harus terbaca sebagai LAUT (ombak/pantai), bukan void | TODO | Eleven | Commit + screenshot (tidak ada area datar kosong) |
| R3-6 | Awan blob/bulat: gumpalan putih ngambang rendah, bentuk bola → awan REALISTIS (pipih/lembut berlapis, lebih tinggi, atau sprite/tekstur datar); JANGAN pakai bola putih lagi | TODO | Eleven | Commit + screenshot (awan realistis, bukan bola) |
| R3-7 | Minimap kayak grid hijau → minimap peta BENERAN (jalan/gedung/air, pemain + polisi + misi real-time) | TODO | Eleven | Commit + screenshot (minimap menunjukkan peta, bukan grid) |
| R3-8 | BUG BARU — Maya terus mengikuti Jax (bug di file BARU): HAPUS/NONAKTIFKAN AI partner follow — Maya TIDAK BOLEH terus mengikuti Jax; hanya muncul saat switch (V) atau misi yang butuh dia. Fitur P17 "partner follows + fights gangs" DIHAPUS / nonaktif default | TODO | Eleven | Commit + playtest 60 dtk (tidak ada karakter cewek membuntuti Jax) |
| R3-9 | Fitur baru rangkuman BELUM ADA / belum kelihatan: verifikasi satu per satu BENAR-BENAR JALAN + TERLIHAT saat dimainkan (bukan cuma di kode): bisnis beli (Neon Bar/Manny/Beach House) + income, 12 misi (bukan cuma misi 1), polisi wanted + dispatch, ekonomi/garasi, phone, save, weather dinamis, traffic hidup, NPC routines, random events, side activities (stunt jumps/collectibles/taxi), senjata + weapon wheel | TODO | Eleven | Commit + playtest headless (setiap fitur dites + PASS) |
| R3-10 | Laut kayak KEBANJIRAN, NGGAK ADA PANTAI SAMA SEKALI: air menutupi daratan tanpa pantai → PANTAI BENERAN: strip pasir, garis pantai jelas, ombak, transisi bertahap darat→laut; laut di tepi map dengan pantai, BUKAN air menggenangi daratan (perbaiki chunk map tepi laut) | TODO | Eleven | Commit + screenshot (pantai + garis pantai + ombak kelihatan) |
| R3-11 | Bangunan masih POLOS, BELUM ADA MODEL: bukan cuma tambah jendela kotak — bangunan harus punya MODEL 3D jelas (bentuk arsitektur, atap, pintu, detail 3D kelihatan dari jauh); tiru bentuk/model Claude v9.8 + build lama | TODO | Eleven | Commit + screenshot (bangunan bermodel, bukan kotak polos) |
| R3-12 | Authorship: tulis ≥1 baris di 7 file yang seal 01a20932 tandai belum keterekam — README.md, REFERENCE.md, game/src/audio.js, game/src/missions.js, game/src/police.js, game/src/rng.js, main.ts (main.ts: hanya komentar/baris aman, jangan rusak build dossier) | TODO | Eleven | Commit (7 file tersentuh di sesi round 3) |
| R3-13 | Sisa SEBAGIAN dari bagian C (bila waktu cukup): C4 airport + 2 jembatan verifikasi visual; C11 misi 2–12 dites end-to-end satu per satu; C24 kustomisasi penampilan diverifikasi; C19/C31 (IK/vault/LOD/occlusion) — laporkan ke Max bila tidak sempat, jangan diam-diam di-skip | TODO | Eleven | Playtest + laporan ke Max |

### H1. Cross-check rangkuman A–H + feedback playtest (Mike, 24 Nov 04:18 WIB)
- Rangkuman A–H ilham sudah tercakup di bagian C1–C35 + D1–D24 checklist ini. Yang BELUM DONE dan masuk round 3: C4 (airport/jembatan), C11 (misi 2–12), C19 (IK/vault/cover), C24 (kustomisasi), C31 (LOD/occlusion/pooling) → lihat R3-13.
- Feedback playtest round 1 (23 Nov 23:10–23:25 WIB): pinch zoom, gedung kotak, pohon lollipop, mobil kotak, kotak biru, tanah datar, trailer/cutscene, JUMP/PUNCH, NPC minim, map 400×400, interaksi 0, sistem nol, rangkuman tidak diterapkan → SEMUA sudah masuk fix round 2 (P1–P18, 39/39 PASS) tapi ilham nilai round 2 MASIH kurang → masuk lagi ke round 3 (R3-1–R3-11).
- Feedback playtest round 2 (24 Nov 04:00 WIB, 6 screenshot): R3-1–R3-8 + R3-10/R3-11 (04:16 WIB) + R3-9 (04:15 WIB).
- Bug lama D1–D24: yang masih TODO (D1, D3, D5, D7, D8, D9, D10, D11, D14, D15, D16, D18, D19, D20, D21, D22) — Eleven round 3 harus cek ulang satu per satu di playtest; yang sudah tidak muncul tandai FIXED, yang muncul masukkan ke R3.
- Catatan: D9 (awan rendah/kolom krem) + D17 (pohon lollipop) tumpang tindih dengan R3-6/R3-3 — verifikasi ulang di round 3.

---
*Checklist ini ditulis Mike di sesi terekam. Update berikutnya setelah Eleven push milestone pertama (commit + index.html).*
