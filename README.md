# Essa Nihongo (web)

Installable web-app version of the Essa Nihongo Android flashcards. Plain static files, no build step.
All paths are relative, so it can be hosted in any folder on any static host (must be served over HTTPS
for the offline service worker; plain `file://` opens but won't work offline).

- `index.html`, `style.css`, `app.js` – the app (home deck list + flashcards)
- `decks.json` – same card data as the Android app (`app/src/main/assets/decks.json`)
- `manifest.webmanifest`, `sw.js` – install + offline support (bump `VERSION` in sw.js after edits)
- `icons/` – 180px apple-touch-icon, 192/512 icons, maskable 512, favicon

iPhone: open the link in Safari › Share › Add to Home Screen.
Read-aloud uses the device's Japanese voice (iPhone: Settings › Accessibility › Spoken Content › Voices › Japanese).

Local test: `python3 -m http.server` in this folder, then open http://localhost:8000/
