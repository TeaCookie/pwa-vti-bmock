# Indicator Lights PWA

A Progressive Web App featuring three realistic indicator lights built with vanilla HTML, CSS, and JavaScript.

## Features

- **Blue Light** - Split into two halves (left/right), each independently togglable by clicking
- **Yellow Light** - Automatically toggles on/off at random intervals between 5-15 seconds
- **Red Light** - Simple toggle on/off by clicking
- **Fully responsive** - Works on desktop and mobile
- **PWA ready** - Installable, works offline via Service Worker
- **Accessible** - Keyboard navigation, ARIA labels, reduced motion support
- **No build step** - Pure vanilla JS, deploys directly to Netlify

## Demo

Open `index.html` in a browser, or deploy to Netlify for HTTPS (required for PWA features).

## Project Structure

```
pwa-vti-bmock/
├── index.html          # Main HTML file
├── styles.css          # Styling for realistic indicator lights
├── app.js              # Light behavior logic
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker for offline support
├── netlify.toml        # Netlify deployment configuration
├── icons/
│   └── icon.svg        # Source SVG icon (used in manifest, works at any size)
└── README.md
```

## Deploy to Netlify

### Option 1: Drag & Drop
1. Go to [Netlify](https://app.netlify.com/drop)
2. Drag the entire project folder to the deploy area
3. Done! Your PWA is live with HTTPS

### Option 2: Git Integration
1. Push this repository to GitHub/GitLab/Bitbucket
2. Connect the repository in Netlify
3. Build settings:
   - Build command: `echo 'No build step required'`
   - Publish directory: `.`
4. Deploy!

### Option 3: Netlify CLI
```bash
npm install -g netlify-cli
netlify deploy --prod --dir .
```

## Local Development

Since this uses a Service Worker, you need HTTPS for full PWA features. Options:

### Using Netlify CLI (recommended)
```bash
netlify dev
```

### Using a local HTTPS server
```bash
# With Node.js
npx serve -s . -l 3000 --ssl-cert localhost.pem --ssl-key localhost-key.pem

# Or with Python (HTTP only - SW won't register)
python -m http.server 8000
```

For local HTTPS without Netlify, use `mkcert`:
```bash
mkcert -install
mkcert localhost
# Then serve with the generated certificates
```

## Browser Support

- Chrome/Edge 70+
- Firefox 65+
- Safari 13.1+
- All modern mobile browsers

## Accessibility

- Full keyboard navigation (Tab, Enter, Space)
- ARIA labels and live regions
- Respects `prefers-reduced-motion`
- High contrast mode support
- Semantic HTML structure

## Customization

### Colors
Edit CSS custom properties in `styles.css`:
```css
:root {
  --blue-on-left: #007bff;
  --blue-on-right: #00d4ff;
  --yellow-on: #ffd700;
  --red-on: #ff3333;
  /* ... */
}
```

### Yellow Light Timing
Edit `app.js`:
```javascript
const interval = Math.random() * 10000 + 5000; // 5-15 seconds
// Change to: Math.random() * (max - min) + min
```

## License

MIT License - Feel free to use and modify.