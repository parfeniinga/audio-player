"use strict";
/* Securitate: fără innerHTML / eval / SQL. Tot textul variabil intră în DOM
   doar prin textContent (nu poate fi interpretat ca HTML => fără XSS).
   Datele din localStorage / IndexedDB / JSON sunt validate înainte de folosire. */
(() => {
  const GENURI = ["Rock", "Pop", "Metal", "Rap", "Hip-Hop", "Jazz", "Electronic", "Clasic", "Altele"];
  const MAX = 10 * 1024 * 1024;

  const $ = (s) => document.querySelector(s);
  const curat = (v, rez) => {
    const t = typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100) : "";
    return t || rez;
  };
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "click") e.addEventListener("click", v);
      else e.setAttribute(k, v);
    }
    for (const c of kids) if (c) e.append(c);
    return e;
  }
  const golește = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
  const mb = (b) => (b / 1048576).toFixed(2) + " MB";

  /* ---------- IndexedDB (melodii încărcate local) ---------- */
  function deschideDb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("mp3player", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("melodii", { keyPath: "id", autoIncrement: true });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function tx(mod, fn) {
    const db = await deschideDb();
    return new Promise((res, rej) => {
      const t = db.transaction("melodii", mod);
      const rq = fn(t.objectStore("melodii"));
      t.oncomplete = () => res(rq && rq.result);
      t.onerror = () => rej(t.error);
    });
  }

  /* ---------- Încărcare melodii (catalog + locale) ---------- */
  async function incarcaMelodii() {
    const out = [];
    try {
      const r = await fetch("melodii.json", { cache: "no-cache" });
      const d = await r.json();
      if (d && typeof d === "object" && !Array.isArray(d)) {
        for (const [f, m] of Object.entries(d)) {
          if (!/^[^\/\\]+\.mp3$/i.test(f) || !m || typeof m !== "object") continue;
          out.push({
            id: "c:" + f, local: false, fisier: f,
            nume: curat(m.nume, f.replace(/\.mp3$/i, "")),
            gen: GENURI.includes(m.gen) ? m.gen : "Altele",
            src: "audio/" + encodeURIComponent(f),
          });
        }
      }
    } catch (e) { /* catalog indisponibil (ex. deschis ca file://) */ }
    try {
      const toate = await tx("readonly", (s) => s.getAll());
      for (const r of toate || []) {
        if (!(r.blob instanceof Blob) || !Number.isInteger(r.id)) continue;
        out.push({
          id: "u:" + r.id, local: true, dbId: r.id, marime: r.blob.size,
          nume: curat(r.nume, "Fără nume"),
          gen: GENURI.includes(r.gen) ? r.gen : "Altele",
          src: URL.createObjectURL(r.blob),
        });
      }
    } catch (e) { /* IndexedDB indisponibil */ }
    return out;
  }

  /* ---------- Playlisturi (localStorage) ---------- */
  function incarcaPl() {
    try {
      const d = JSON.parse(localStorage.getItem("playlisturi") || "[]");
      if (!Array.isArray(d)) return [];
      return d.filter((p) => p && typeof p.id === "string" && /^pl_[a-z0-9]+$/.test(p.id)).map((p) => ({
        id: p.id,
        nume: curat(p.nume, "Playlist fără nume"),
        piese: Array.isArray(p.piese) ? p.piese.filter((x) => typeof x === "string").slice(0, 500) : [],
      }));
    } catch (e) { return []; }
  }
  function salveazaPl(l) {
    try { localStorage.setItem("playlisturi", JSON.stringify(l)); }
    catch (e) { alert("Nu s-a putut salva playlistul."); }
  }
  const idNou = () => "pl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- Componente ---------- */
  function butonDescarca(m) {
    const nume = (m.local ? m.nume.replace(/[^\w\- ]+/g, "_") + ".mp3" : m.fisier);
    return el("a", { class: "btn", href: m.src, download: nume, text: "Descarcă" });
  }
  function cardMelodie(m, extra) {
    const durata = el("span", { text: "Se calculează..." });
    const audio = el("audio", { controls: "", preload: "metadata", src: m.src });
    audio.addEventListener("loadedmetadata", () => {
      const d = Math.floor(audio.duration);
      if (Number.isFinite(d)) durata.textContent = Math.floor(d / 60) + ":" + String(d % 60).padStart(2, "0");
    });
    const meta = el("p", { class: "meta" }, "Durata: ", durata, m.marime ? " | Dimensiune: " + mb(m.marime) : "");
    const actiuni = el("div", { class: "actions" }, butonDescarca(m), ...(extra || []));
    return el("div", { class: "item" },
      el("div", { class: "row" }, el("h3", { text: m.nume }), el("span", { class: "badge", text: m.gen })),
      meta, audio, actiuni);
  }
  const vid = (text) => el("div", { class: "gol", text });

  /* ---------- Pagini ---------- */
  async function paginaIndex() {
    const sel = $("#gen");
    sel.append(el("option", { value: "", text: "Alege genul muzical" }));
    GENURI.forEach((g) => sel.append(el("option", { value: g, text: g })));
    const msg = (t) => { $("#mesaj").textContent = t; };

    $("#formUpload").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const nume = curat(f.nume_melodie.value, "");
      const gen = f.gen.value;
      const fisier = f.fisier.files[0];
      if (!nume || !GENURI.includes(gen) || !fisier) return msg("Completează toate câmpurile.");
      if (!/\.mp3$/i.test(fisier.name)) return msg("Sunt acceptate doar fișiere .mp3.");
      if (fisier.size <= 0 || fisier.size > MAX) return msg("Fișierul trebuie să aibă maximum 10 MB.");
      const h = new Uint8Array(await fisier.slice(0, 3).arrayBuffer());
      const ok = (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0);
      if (!ok) return msg("Fișierul nu pare a fi un MP3 valid.");
      try {
        await tx("readwrite", (s) => s.add({ nume, gen, blob: fisier.slice(0, fisier.size, "audio/mpeg") }));
        f.reset(); msg("Melodia a fost adăugată."); afiseaza();
      } catch (err) { msg("Nu s-a putut salva melodia în browser."); }
    });

    async function afiseaza() {
      const c = $("#colectie"); golește(c);
      const melodii = await incarcaMelodii();
      if (!melodii.length) return c.append(vid("Colecția este încă goală"));
      melodii.forEach((m) => {
        const extra = [];
        if (m.local) extra.push(el("button", { class: "btn rau", type: "button", text: "Șterge", click: async () => {
          if (!confirm("Sigur vrei să ștergi acest fișier?")) return;
          await tx("readwrite", (s) => s.delete(m.dbId));
          const pl = incarcaPl().map((p) => ({ ...p, piese: p.piese.filter((x) => x !== m.id) }));
          salveazaPl(pl); afiseaza();
        } }));
        c.append(cardMelodie(m, extra));
      });
    }
    afiseaza();
  }

  async function paginaLista() {
    const c = $("#genuri");
    const melodii = await incarcaMelodii();
    if (!melodii.length) return c.append(el("section", { class: "card" }, vid("Nu există melodii încă")));
    const grupe = {};
    melodii.forEach((m) => (grupe[m.gen] = grupe[m.gen] || []).push(m));
    Object.keys(grupe).sort().forEach((g) => {
      const sec = el("section", { class: "card" },
        el("div", { class: "row" }, el("h2", { text: g }), el("span", { class: "badge", text: grupe[g].length + (grupe[g].length === 1 ? " melodie" : " melodii") })));
      grupe[g].forEach((m) => sec.append(cardMelodie(m)));
      c.append(sec);
    });
  }

  async function paginaPlaylisturi() {
    const melodii = await incarcaMelodii();
    const dupaId = new Map(melodii.map((m) => [m.id, m]));
    const casete = (cont, lista) => {
      if (!lista.length) return cont.append(el("p", { class: "sub", text: "Nu există melodii disponibile." }));
      lista.forEach((m) => cont.append(el("label", {}, el("input", { type: "checkbox", value: m.id }), el("span", { text: m.nume }))));
    };
    const bifate = (cont) => [...cont.querySelectorAll("input:checked")].map((i) => i.value).filter((v) => dupaId.has(v));

    const noi = $("#alegeNoi");
    casete(noi, melodii);
    $("#formPlaylist").addEventListener("submit", (e) => {
      e.preventDefault();
      const nume = curat($("#nume_playlist").value, "");
      if (!nume) return;
      const l = incarcaPl();
      l.push({ id: idNou(), nume, piese: [...new Set(bifate(noi))] });
      salveazaPl(l); e.target.reset(); afiseaza();
    });

    function afiseaza() {
      const c = $("#playlisturi"); golește(c);
      const l = incarcaPl();
      if (!l.length) return c.append(vid("Nu ai creat încă niciun playlist."));
      l.forEach((p) => {
        const piese = p.piese.filter((x) => dupaId.has(x));
        const art = el("article", { class: "card" },
          el("div", { class: "row" },
            el("div", {}, el("h3", { class: "fm", text: p.nume }), el("p", { class: "meta", text: piese.length + (piese.length === 1 ? " piesă" : " piese") })),
            el("button", { class: "btn rau", type: "button", text: "Șterge playlistul", click: () => {
              if (!confirm("Sigur vrei să ștergi acest playlist?")) return;
              salveazaPl(incarcaPl().filter((x) => x.id !== p.id)); afiseaza();
            } })));
        if (!piese.length) art.append(el("p", { class: "sub", text: "Acest playlist nu conține melodii." }));
        piese.forEach((id) => art.append(cardMelodie(dupaId.get(id), [
          el("button", { class: "btn rau", type: "button", text: "Elimină din playlist", click: () => {
            const x = incarcaPl(); const t = x.find((q) => q.id === p.id);
            if (t) t.piese = t.piese.filter((q) => q !== id);
            salveazaPl(x); afiseaza();
          } }),
        ])));
        const disp = melodii.filter((m) => !p.piese.includes(m.id));
        if (disp.length) {
          const cont = el("div", { class: "alege" }); casete(cont, disp);
          art.append(el("details", {}, el("summary", { text: "Adaugă melodii în acest playlist" }), cont,
            el("button", { class: "btn", type: "button", text: "Adaugă selecția", click: () => {
              const x = incarcaPl(); const t = x.find((q) => q.id === p.id);
              if (t) t.piese = [...new Set([...t.piese, ...bifate(cont)])];
              salveazaPl(x); afiseaza();
            } })));
        }
        c.append(art);
      });
    }
    afiseaza();
  }

  const pagina = document.body.dataset.pagina;
  if (pagina === "index") paginaIndex();
  else if (pagina === "lista") paginaLista();
  else if (pagina === "playlisturi") paginaPlaylisturi();
})();
