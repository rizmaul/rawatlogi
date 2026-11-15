# Rawatlogi

Studio konten affiliate berbasis bukti untuk X dan Threads, dengan katalog produk, foto, riset ilmiah, draf, dan kalender posting manual.

## Memulai

Proyek aktif: `C:/Users/rizki.m_mekari/Documents/Personal/affiliate-evidence-studio`.

```powershell
npm install
npm run setup
npm run dev
```

Gunakan Node 24. Dashboard: http://127.0.0.1:5173. API: http://127.0.0.1:8787. Setup menerapkan migrasi lokal tanpa menghapus data produk, serta membuat kunci enkripsi di `.dev.vars` yang diabaikan Git.

## Alur riset dan penulisan

1. Tambahkan produk dan tautan affiliate. Foto JPEG, PNG, atau WebP hingga 5 MB dapat diunggah melalui formulir produk.
2. Di Research library atau Writing studio, pilih **New research session** atau **New writing session**.
3. Pilih produk dari galeri bergambar dengan pencarian dan paginasi, delapan produk per halaman.
4. Isi arahan opsional untuk AI, lalu buat saran pertanyaan/topik. Topik juga bisa ditulis dan diedit sendiri.
5. Mulai sesi: setiap topik memiliki pekerjaan, progres, hasil, dan status tersendiri. Maksimal sepuluh topik per batch.
6. Tinjau sumber dan klaim. Hasil riset tidak otomatis menjadi klaim yang disetujui.
7. Tinjau draf X dan Threads, jadwalkan di kalender WIB, lalu posting secara manual.

Produk tetap menjadi pusat hubungan antara informasi produk, sumber ilmiah, sesi, klaim, draf, jadwal, dan tautan hasil publikasi.

## API

Workspace settings mengatur base URL, model, effort, protokol, format JSON, batas token, dan API key. Key disimpan terenkripsi di backend, tidak dikembalikan ke browser. **Save & test connection** menguji konfigurasi melalui worker yang juga menjalankan generasi.

Instalasi ini memakai gateway `https://rkapi.com/v1`, model `deepseek-v4.1-flash`, dan effort `max`. Endpoint Responses gateway mengalami error upstream saat diuji; endpoint Chat Completions berhasil dengan model dan effort yang sama, sehingga protokol instalasi ini dipilih secara eksplisit sebagai Chat Completions. Protokol tetap bisa diubah di Settings. Tidak ada fallback model atau penurunan effort otomatis.

Generasi tidak lagi memakai Codex CLI atau login ChatGPT. Konfigurasi Codex global pengguna tidak diubah.

## Dokumentasi

- [Cloudflare deployment and Git setup](docs/cloudflare-deployment.md)
- [Panduan lengkap API dan sesi](docs/api-sessions.md)
- [Alur riset dan penulisan](docs/workflow.md)
- [Arsitektur dan data](docs/architecture.md)
- [Setup dan operasi](docs/operations.md)
- [MCP server: kontrol oleh Claude / AI lain](docs/mcp.md)
- [Brand Rawatlogi: design system, playbook media sosial, kanvas Claude Design](brand/README.md)

## Verifikasi dan batasan

`npm run build` memeriksa sintaks worker, TypeScript, dan build UI. `npm test` mencakup kontrak provider, enkripsi settings, sesi dengan D1 terisolasi, penyimpanan gambar, routing, paginasi, dan aturan tinjauan klaim.

Semua aksi tersedia sebagai MCP tools di `/mcp` (bearer token di `.dev.vars`), lihat [docs/mcp.md](docs/mcp.md). Pada `--env production`, dashboard dan API bersifat publik tanpa login; `/mcp` tetap memerlukan bearer token. Link localhost tidak dapat dibagikan ke komputer lain. Worker harus berjalan agar antrean diproses. Riset mengambil publikasi nyata dari Europe PMC/PubMed; fallback PubMed dapat hanya menyediakan metadata, yang ditandai jelas. Tidak ada scraping Shopee, posting otomatis, atau pembuatan gambar AI.

Ekspor JSON versi 2 mencakup record, jobs, dan sesi; tidak mencakup key, pengaturan API, atau berkas gambar. Simpan state Wrangler dan `.dev.vars` untuk backup lengkap. UI restore belum tersedia.

Draft voice and real-X-post research: [writing voice research](docs/writing-voice-research.md). New writing jobs use a conversational writer plus a separate evidence-aware editor; this adds one generation call per job.
