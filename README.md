# MP3 Player (versiune statică pentru GitHub Pages)

Pagini: `index.html`, `lista.html`, `playlisturi.html`. Fără server, fără baze de date.

## Publicare
1. Încarcă tot folderul într-un repository GitHub.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
3. Site-ul apare la `https://UTILIZATOR.github.io/NUME-REPO/`.

Local, pornește un server (`python3 -m http.server`), nu deschide fișierul direct (`file://`), altfel `melodii.json` nu se încarcă.

## Melodii noi în catalog
Pune MP3-ul în `audio/` și adaugă-l în `melodii.json` (nume + gen dintre cele permise).

## Securitate
- **SQL injection:** nu există SQL, nici server; datele sunt în `melodii.json`, IndexedDB și localStorage.
- **XSS:** niciun `innerHTML`/`eval`; textul intră în pagină doar prin `textContent`. Datele citite sunt validate (tip, lungime, listă de genuri).
- **CSP** (în fiecare pagină): doar scripturi și stiluri locale, fără CDN, fără `form-action`, fără `base`. Pe Pages nu poți seta header-e HTTP, de aceea e prin `<meta>`.
- **Upload:** doar `.mp3`, max. 10 MB, verificare semnătură (ID3 / frame sync). Fișierul rămâne în browserul utilizatorului.
- Fișierele `.php` nu rulează pe GitHub Pages; poți să le ștergi din repository.

## Atenție la drepturi de autor
Melodiile din `audio/` (HUGEL, O-Zone, Satoshi) sunt protejate. Într-un repository public le poate descărca oricine. Folosește doar muzică pe care ai dreptul s-o distribui.
