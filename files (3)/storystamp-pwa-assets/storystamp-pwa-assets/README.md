# StoryStamp PWA Assets

## Quick Setup

Add these to your HTML `<head>`:

```html
<!-- Favicon -->
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png">

<!-- Apple Touch Icon -->
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">

<!-- PWA Manifest -->
<link rel="manifest" href="/manifest.json">

<!-- Theme Color -->
<meta name="theme-color" content="#1a202c">
<meta name="msapplication-TileColor" content="#1a202c">
```

## File Structure

Put these in your public folder:

```
public/
├── favicon.ico
├── favicon.svg
├── manifest.json
└── icons/
    ├── icon-16x16.png
    ├── icon-32x32.png
    ├── icon-48x48.png
    ├── icon-72x72.png
    ├── icon-96x96.png
    ├── icon-128x128.png
    ├── icon-144x144.png
    ├── icon-152x152.png
    ├── icon-192x192.png
    ├── icon-256x256.png
    ├── icon-384x384.png
    ├── icon-512x512.png
    ├── icon-maskable-192x192.png
    ├── icon-maskable-384x384.png
    ├── icon-maskable-512x512.png
    ├── apple-touch-icon.png
    ├── favicon-16x16.png
    └── favicon-32x32.png
```

## Files Included

### Icons
- `icon-{size}.png` - Standard app icons (16px to 512px)
- `icon-maskable-{size}.png` - Android adaptive icons with safe zone padding
- `apple-touch-icon.png` - iOS home screen icon (180x180)
- `favicon.ico` - Multi-size ICO for browsers
- `favicon.svg` - Scalable favicon

### Logos
- `logo-wordmark.svg` - Full logo with "StoryStamp" text (dark)
- `logo-wordmark-white.svg` - White version for dark backgrounds
- `icon-512.svg` - Square icon master file
- `storystamp-logo-v2-refined.svg` - Original SS logo mark

## Colors

- Background: `#1a202c` (dark slate)
- Text: `#2d3748` (dark gray) or `white`
- Check: `#38a169` (green)
- X: `#e53e3e` (red)
