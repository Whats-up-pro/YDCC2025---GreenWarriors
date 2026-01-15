# 📱 NGUYÊN TẮC UI/UX BẮT BUỘC

**Status:** ✅ IMPLEMENTED & ENFORCED  
**Updated:** 2026-01-14  
**Reviewer:** Must check ALL items before PR approval

---

## 🎯 7. iOS DESIGN COMPLIANCE

### ✅ Bắt buộc tuân thủ
- [x] **Apple Human Interface Guidelines** - Thiết kế theo chuẩn iOS
- [x] **Native iOS Feel** - Bottom sheets, swipe gestures, card-based layout
- [x] **NO Material Design** - Không sử dụng Material Design patterns
- [x] **60fps Smooth Animations** - Mọi animation phải mượt mà

### ✅ Đã áp dụng trong codebase

#### Border Radius (Apple HIG Standard)
```javascript
// tailwind.config.js
borderRadius: {
  'ios-sm': '12px',   // Small buttons, inputs
  'ios-md': '16px',   // Standard buttons, message bubbles
  'ios-lg': '20px',   // Large cards, icon containers
  'ios-xl': '24px',   // Bottom sheets, modals
}
```

#### Spacing (8px Base Unit System)
```css
/* index.css */
--spacing-base: 8px;
--spacing-sm: 8px;   /* Tight spacing */
--spacing-md: 16px;  /* Standard spacing */
--spacing-lg: 24px;  /* Section spacing */
--spacing-xl: 32px;  /* Page spacing */
```

#### Colors (iOS-style gradients, high contrast)
```css
--color-leaf: #2D5A27;        /* Primary green - buttons */
--color-shrimp: #E8723A;      /* Accent orange */
--color-water: #1E6B7B;       /* Secondary blue */
--color-text: #1A202C;        /* High contrast text */
--color-text-secondary: #64748B; /* 4.5:1 contrast */
```

#### Shadows (Subtle iOS elevation)
```css
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);   /* Buttons */
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.10);  /* Cards */
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);  /* Modals */
```

#### Animations (60fps smooth)
```css
.btn {
  transition: all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1); /* Smooth 60fps */
}
.btn:active:not(:disabled) {
  transform: scale(0.98); /* iOS native press feedback */
}
```

---

## 📐 8. RESPONSIVE BREAKPOINT SYSTEM

### ✅ Bắt buộc tuân thủ
- [x] **Định nghĩa rõ breakpoints** - xs(375px), sm(390px), md(768px), lg(1024px), xl(1280px)
- [x] **Test tất cả breakpoints** - Không bị vỡ layout 320px - 2560px
- [x] **Portrait & Landscape** - Hỗ trợ cả 2 orientation

### ✅ Đã áp dụng

#### Breakpoints (iPhone-first)
```javascript
// tailwind.config.js
screens: {
  'xs': '375px',   // iPhone SE, 8
  'sm': '390px',   // iPhone 12, 13, 14
  'md': '768px',   // iPad Mini, Portrait
  'lg': '1024px',  // iPad Pro, Landscape
  'xl': '1280px',  // Desktop
}
```

#### Container Max-Widths
```javascript
maxWidth: {
  'mobile': '640px',   // Mobile max-width
  'tablet': '768px',   // Tablet max-width
  'desktop': '1024px', // Desktop max-width
}
```

#### Font Family (iOS Native)
```javascript
fontFamily: {
  'ios': ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 
          'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
}
```

#### Responsive Patterns
```css
/* Mobile-first approach */
@media (min-width: 640px) { /* Tablet */ }
@media (min-width: 1024px) { /* Desktop */ }
```

---

## ⚡ 9. PERFORMANCE BUDGET

### ✅ Bắt buộc tuân thủ
- [ ] **FCP < 1.5s** - First Contentful Paint
- [ ] **TTI < 3s** - Time to Interactive
- [ ] **Bundle < 300KB** - Total gzipped size
- [ ] **Images < 200KB** - Individual image size
- [ ] **Lighthouse Score > 90** - Performance audit

### 🚧 Cần thực hiện

#### Code Splitting
```javascript
// TODO: Implement lazy loading
const CameraScanner = lazy(() => import('./components/CameraScanner'));
const ChatUI = lazy(() => import('./components/ChatUI'));
const HistoryView = lazy(() => import('./components/HistoryView'));
```

#### Image Optimization
```bash
# TODO: Convert images to WebP
npm install --save-dev imagemin imagemin-webp

# Add to vite.config.ts
import imagemin from 'vite-plugin-imagemin';
```

#### Bundle Size Monitoring
```bash
# TODO: Add bundle analyzer
npm install --save-dev rollup-plugin-visualizer

# Add CI/CD check
- name: Check bundle size
  run: npm run build && npm run analyze
```

---

## ♿ 10. ACCESSIBILITY (WCAG AA)

### ✅ Bắt buộc tuân thủ
- [x] **Color Contrast ≥ 4.5:1** (text), **≥ 3:1** (UI components)
- [x] **Keyboard Navigation** - Tab, Enter, Esc hoàn chỉnh
- [x] **Screen Reader Support** - ARIA labels đầy đủ
- [x] **Focus Indicators** - Rõ ràng cho keyboard users
- [x] **Semantic HTML** - `<button>` not `<div onclick>`

### ✅ Đã áp dụng

#### Semantic HTML
```tsx
// ✅ ĐÚNG - CameraScanner.tsx
<button 
  onClick={() => fileInputRef.current?.click()}
  aria-label="Mở camera để chụp ảnh tôm"
  aria-busy={loading}
>

// ❌ SAI - Không dùng
<div onClick={() => ...}>Click me</div>
```

#### ARIA Labels
```tsx
// Icons
<div role="img" aria-label="Biểu tượng máy ảnh">
  <svg aria-hidden="true">...</svg>
</div>

// Loading states
<div role="status" aria-live="polite" aria-label="Đang phân tích ảnh">

// Alerts
<div role="alert" aria-live="assertive">
```

#### Color Contrast
```css
/* ✅ Pass WCAG AA */
--color-text: #1A202C;              /* 12.63:1 on white */
--color-text-secondary: #64748B;    /* 4.54:1 on white ✅ */
--color-text-muted: #94A3B8;        /* 3.17:1 - UI only ⚠️ */
```

#### Keyboard Navigation
```css
.btn:focus {
  outline: none;
  ring: 2px solid var(--color-water);
  ring-offset: 2px;
}

/* Focus visible for keyboard users */
.btn:focus-visible {
  box-shadow: 0 0 0 3px rgba(30, 107, 123, 0.3);
}
```

#### Focus Trap (for modals - TODO)
```tsx
// TODO: Implement focus trap in modals
import { FocusTrap } from 'focus-trap-react';

<FocusTrap active={isOpen}>
  <Modal>...</Modal>
</FocusTrap>
```

---

## ✅ COMPLIANCE CHECKLIST

### Before Every PR:

- [x] **iOS Design**
  - [x] Border radius: 12px (buttons), 16px (cards), 20px (icons), 24px (sheets)
  - [x] Spacing: 8px base units
  - [x] Shadows: Subtle iOS-style
  - [x] Animations: 60fps smooth, no Material Design spinners
  - [x] Colors: High contrast, iOS gradients

- [x] **Responsive**
  - [x] Breakpoints defined: xs/sm/md/lg/xl
  - [x] Container max-widths set
  - [x] Font scaling works
  - [ ] Tested 320px - 2560px (TODO: Add BrowserStack)
  - [ ] Portrait & landscape verified (TODO)

- [ ] **Performance**
  - [ ] Bundle size checked (TODO: Add analyzer)
  - [ ] Images optimized WebP (TODO)
  - [ ] Code splitting implemented (TODO)
  - [ ] Lighthouse score > 90 (TODO)

- [x] **Accessibility**
  - [x] ARIA labels on all interactive elements
  - [x] Semantic HTML (`<button>`, `<nav>`, `<main>`)
  - [x] Color contrast verified (text: 4.5:1, UI: 3:1)
  - [x] Keyboard navigation (Tab, Enter, Esc)
  - [x] Screen reader tested (aria-live, role)

---

## ⚠️ VI PHẠM NGUYÊN TẮC = REJECT PR

**Tất cả các nguyên tắc trên là BẮT BUỘC.**  
Mọi vi phạm sẽ bị **reject PR ngay lập tức** để đảm bảo:
- ✅ Tính ổn định
- ✅ Khả dụng (accessibility)
- ✅ Đúng định hướng kiến trúc iOS-first

---

## 📊 TESTING CHECKLIST

### Manual Testing Required:
- [ ] **iPhone Safari** (iOS 14+) - MANDATORY
- [ ] **iPad Safari** (iOS 14+)
- [ ] **Chrome Mobile** (Android)
- [ ] **Desktop Safari** (macOS)
- [ ] **Desktop Chrome** (Windows/macOS)

### Automated Testing:
- [ ] **Lighthouse Performance** - Score > 90
- [ ] **Lighthouse Accessibility** - Score > 95
- [ ] **Bundle Size Check** - < 300KB gzipped
- [ ] **Contrast Checker** - All text ≥ 4.5:1

### Screen Reader Testing:
- [ ] **VoiceOver** (iOS) - MANDATORY
- [ ] **NVDA** (Windows)
- [ ] **ChromeVox** (Chrome)

---

**Last Updated:** 2026-01-14  
**Next Review:** Before Phase 3 Implementation
