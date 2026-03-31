# PresentationPage — Keyboard Shortcuts untuk Mode Presentasi — 2026-03-31

## Request
Tambah shortcut keyboard yang membantu saat menggunakan `/presentation` sebagai layar presentasi: fokus ke search bar, expand/collapse semua baris, lompat ke slide, fullscreen, dan overlay bantuan shortcut.

## Shortcut yang Diimplementasi

| Key | Fungsi | Berlaku di |
|---|---|---|
| `←` `→` | Slide sebelumnya / berikutnya | Semua slide |
| `1` `2` `3` | Langsung lompat ke slide 1 / 2 / 3 | Semua slide |
| `E` | Expand semua baris AM (tekan lagi = collapse semua) | Semua slide |
| `/` | Fokus ke search bar | Semua slide |
| `Esc` | Collapse semua + hapus pencarian | Semua slide |
| `F` | Toggle fullscreen | Semua slide |
| `?` | Tampilkan / sembunyikan overlay daftar shortcut | Semua slide |

> Semua shortcut (kecuali `←` `→`) **nonaktif** saat kursor ada di input/search bar sehingga tidak konflik dengan mengetik.

## Implementasi

**`artifacts/telkom-am-dashboard/src/features/performance/PresentationPage.tsx`**

### 1. Global handler di `EmbedPerforma` (slide 0 = Performa)
```typescript
// State baru:
const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
const perfSearchRef = useRef<HTMLInputElement>(null);
const filteredAmDataRef = useRef<typeof filteredAmData>([]);

// Keyboard handler (useEffect dengan deps [currentSlide, toggleFullscreen]):
// - ArrowLeft/Right → navigasi slide
// - 1/2/3 → lompat ke slide langsung
// - F → toggleFullscreen()
// - ? → setShortcutHelpOpen toggle
// - E → expand/collapse semua row di filteredAmData (slide 0 only)
// - Escape → collapse all + clear searchQuery (slide 0 only)
// - / → perfSearchRef.current?.focus() (slide 0 only)
```

### 2. Keyboard handler di `FunnelSlide` (slide 1)
```typescript
const funnelSearchRef = useRef<HTMLInputElement>(null);

// useEffect keyboard listener (unmounts saat slide 1 tidak aktif):
// - E → handleToggleAll() (expand/collapse semua AM)
// - Escape → collapse all + clear search
// - / → funnelSearchRef.current?.focus()
```
Karena FunnelSlide hanya ter-mount saat `currentSlide === 1`, listener otomatis cleanup saat slide berganti.

### 3. Keyboard handler di `ActivitySlide` (slide 2)
```typescript
const actSearchRef = useRef<HTMLInputElement>(null);

// useEffect keyboard listener (unmounts saat slide 2 tidak aktif):
// - E → setActExpandAll(p => p === true ? false : true)
// - Escape → setActExpandAll(false); setExpandedAm({}); setActSearch("")
// - / → actSearchRef.current?.focus()
```
Pola yang sama — auto-cleanup saat slide berganti.

### 4. Overlay bantuan shortcut (`?`)
Modal overlay `z-[200]` dengan backdrop blur, menampilkan semua shortcut dalam tiga kelompok: Navigasi Slide, Tabel & Data, Tampilan. Klik di luar overlay untuk tutup.

### 5. Tombol `?` di navbar
```jsx
<button onClick={() => setShortcutHelpOpen(p => !p)} title="Keyboard shortcuts (?)">?</button>
```
Muncul di sebelah kanan tombol fullscreen (hidden di mobile).

## Pola Teknis
- **Slide isolation**: Handler per-slide di dalam function component yang conditional-rendered → otomatis cleanup saat tidak aktif
- **Input guard**: `if (inInput) return;` mencegah shortcut aktif saat mengetik
- **Stale-closure avoidance** untuk slide 0: `filteredAmDataRef` di-update via `useEffect` terpisah sehingga `handleKey` selalu membaca data terbaru tanpa perlu di-declare dalam deps
- **Ref pattern**: Semua search input mendapat `ref` untuk akses fokus langsung

## Hasil
- `E` → expand semua AM di slide yang aktif dalam satu keypress ✓
- `/` → search bar langsung aktif (tanda biru muncul) tanpa klik mouse ✓
- `Esc` → semua expand collapse + search bersih ✓
- `1` `2` `3` → pindah slide instan ✓
- `F` → fullscreen toggle ✓
- `?` → overlay daftar shortcut muncul ✓
