# PresentationPage Sales Activity Slide — Sticky AM Row + Red Focus Stroke — 2026-03-30

## Request
Slide 3 (Sales Activity) di `/presentation`: ketika AM di-expand dan user scroll ke bawah, baris nama AM dan header kolom aktivitas (#, Tanggal, Pelanggan & Catatan, Tipe Aktivitas, Kategori, KPI) harus tetap tampil (sticky). Ditambah focus stroke warna merah di sekeliling blok konten AM yang sedang di-expand.

## Root Cause / Blocker
Body scroll div (`overflow-x-auto`) menciptakan scroll container di dua arah (karena CSS spec: `overflow-x: non-visible` → `overflow-y` terimplikasi menjadi `auto` juga). Elemen dengan `position: sticky` di dalam overflow container akan sticky relatif terhadap container tersebut — bukan terhadap outer `flex-1 overflow-y-auto` scroll container. Karena div body tidak punya height constraint dan terus mengembang, sticky tidak pernah aktif secara visual.

## Fix

**`artifacts/telkom-am-dashboard/src/features/performance/PresentationPage.tsx`**

### 1. Tambah state & refs untuk pengukuran tinggi
```typescript
const actToolbarRef = useRef<HTMLDivElement>(null);
const [actToolbarH, setActToolbarH] = useState(93);
const actAmSumRowRef = useRef<HTMLDivElement>(null);
const [actAmSumRowH, setActAmSumRowH] = useState(62);
// + ResizeObserver effects for both
```

### 2. Tambah ref ke sticky toolbar div
```jsx
<div ref={actToolbarRef} className="sticky top-0 z-10 ...">
```

### 3. Hapus `overflow-x-auto` dari body wrapper div
```jsx
// BEFORE: <div className="overflow-x-auto" ref={actBodyScrollRef} onScroll={onActBodyScroll}>
// AFTER:  <div ref={actBodyScrollRef}>
```
Tanpa `overflow-x-auto`, sticky elements di dalamnya dapat stick ke `flex-1 overflow-y-auto` outer container.

### 4. Outer AM wrapper — red focus stroke + z-index saat expanded
```jsx
<div ... style={isExpanded?{outline:"2px solid #B91C1C",outlineOffset:"-1px",borderRadius:6,marginBottom:6}:{}}>
```
Menggunakan `outline` (bukan `border`) sehingga tidak mempengaruhi layout.

### 5. AM summary row sticky saat expanded
```jsx
<div
  ref={amIdx===0?actAmSumRowRef:undefined}  // measure first AM row
  style={{
    gridTemplateColumns: ACT_GRID_COLS,
    ...(isExpanded ? {
      position: "sticky",
      top: actToolbarH,        // tepat di bawah sticky toolbar
      zIndex: 12,
      boxShadow: "0 2px 8px rgba(0,0,0,0.09)"
    } : {})
  }}
  className={cn("...", isExpanded ? "bg-card border-b border-primary/20" : "hover:bg-secondary/40")}
>
```
`bg-card` (fully opaque) untuk mencegah konten di bawahnya menerobos.

### 6. Sub-header (#, Tanggal, ..., KPI) sticky di bawah AM row
```jsx
<div style={{
  ...,
  position: "sticky",
  top: actToolbarH + actAmSumRowH,  // toolbar + AM row height
  zIndex: 11
}} className="... bg-secondary border-b border-border">
```
`bg-secondary` (fully opaque) untuk opaque background saat sticky.

## Hasil
- Scroll ke bawah dalam konten AM yang di-expand → nama AM tetap muncul di atas, lalu header #/Tanggal/Pelanggan/... tepat di bawahnya
- Blok AM yang di-expand memiliki outline merah sebagai visual focus indicator
- Sticky bekerja karena tidak ada `overflow-x-auto` wrapper yang memblokir propagasi sticky ke outer scroll container
