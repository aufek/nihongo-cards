/* Essa Nihongo web app: a port of the Android app (MainActivity / CardActivity / Speaker). */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Data (Vocab.kt) ----------
  const cleanForSpeech = (s) => s.replace(/[〜~～]/g, '').trim();
  const codePoints = (s) => Array.from(s).length;
  /** Font size for the big Japanese text so long phrases still fit (bigTextSp). */
  const bigTextPx = (text, max = 84, min = 30) => Math.min(max, Math.max(min, 300 / Math.max(1, codePoints(text))));

  function makeCard(o) {
    const c = {
      id: o.id, japanese: o.japanese, romaji: o.romaji, english: o.english,
      emoji: o.emoji || '', letter: o.letter ?? null, letterRomaji: o.letterRomaji ?? null,
    };
    c.isLetterCard = c.letter !== null;
    // What gets read aloud: the letter, then the word when they differ.
    c.speechText = (c.letter && c.letter !== c.japanese)
      ? cleanForSpeech(c.letter) + '。' + cleanForSpeech(c.japanese)
      : cleanForSpeech(c.japanese);
    c.romajiLine = (c.letter && c.letterRomaji && c.letter !== c.japanese)
      ? c.letterRomaji + '  ·  ' + c.romaji : c.romaji;
    return c;
  }

  let vocab = null; // { cards: Map, decks: [] }

  function parseVocab(json) {
    const cards = new Map();
    for (const o of json.cards) cards.set(o.id, makeCard(o));
    const decks = json.decks.map((o) => ({
      title: o.title, subtitle: o.subtitle || '', emoji: o.emoji || '',
      color: /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : '#4A90E2',
      section: o.section || 'Topics', shuffle: !!o.shuffle,
      cards: o.cards.map((id) => cards.get(id)).filter(Boolean),
    }));
    return { cards, decks };
  }

  // ---------- Toast ----------
  let toastTimer = 0;
  function toast(msg, ms = 2000) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ---------- Speaker (Speaker.kt) ----------
  const Speaker = (() => {
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    let voice = null;
    let voicesLoaded = false;

    function pickVoice() {
      if (!synth) return;
      const voices = synth.getVoices() || [];
      if (!voices.length) return;
      voicesLoaded = true;
      const ja = voices.filter((v) => /^ja([-_]|$)/i.test(v.lang));
      // Prefer ja-JP, then a local (offline) voice, then a friendly default like Kyoko/O-Ren.
      ja.sort((a, b) => score(b) - score(a));
      voice = ja[0] || null;
    }
    function score(v) {
      let s = 0;
      if (/ja[-_]JP/i.test(v.lang)) s += 4;
      if (v.localService) s += 2;
      if (/kyoko|o-ren|otoya|google|haruka|nanami/i.test(v.name)) s += 1;
      return s;
    }
    if (synth) {
      pickVoice();
      if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', pickVoice);
      else synth.onvoiceschanged = pickVoice;
    }

    const isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    function explainMissing() {
      let how;
      if (!synth) how = 'This browser can’t read aloud. Try Safari or Chrome.';
      else if (isApple && /Mobile|iPhone|iPad/.test(navigator.userAgent))
        how = 'On iPhone: Settings › Accessibility › Spoken Content › Voices › Japanese, and download a voice (like Kyoko).';
      else if (isAndroid)
        how = 'In Settings, search “Text-to-speech”, open Speech Services by Google › Install voice data, and add Japanese.';
      else if (isApple)
        how = 'On a Mac: System Settings › Accessibility › Spoken Content › System voice › Manage Voices, and add a Japanese voice.';
      else
        how = 'Add a Japanese voice in your computer’s speech settings, or try Chrome or Edge.';
      toast('🔇 No Japanese voice yet. ' + how, 6500);
    }

    /** Must be called straight from a tap/click handler (iOS needs a user gesture). */
    function speak(text) {
      if (!synth) { explainMissing(); return; }
      if (!voicesLoaded) pickVoice();
      if (voicesLoaded && !voice) { explainMissing(); return; }
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (voice) { try { u.voice = voice; } catch (e) { /* lang alone still picks Japanese */ } }
      u.rate = 0.8;   // a little slower, like the Android app
      u.pitch = 1;
      u.onerror = (e) => {
        if (e && (e.error === 'language-unavailable' || e.error === 'voice-unavailable' || e.error === 'synthesis-unavailable')) explainMissing();
      };
      let started = false;
      u.onstart = () => { started = true; };
      synth.speak(u);
      // If nothing starts (no voices at all on this device), explain how to add one.
      setTimeout(() => {
        if (!started && !synth.speaking && !(synth.getVoices() || []).length) explainMissing();
      }, 1500);
      // Some Safari versions pause the queue after cancel(); nudge it.
      if (synth.paused) synth.resume();
    }
    function stop() { if (synth) synth.cancel(); }
    return { speak, stop };
  })();

  // ---------- Home (MainActivity.kt) ----------
  const SECTION_NAMES = { Topics: 'Topics', Newsletters: 'By newsletter' };

  function renderHome() {
    const list = $('deck-list');
    list.textContent = '';
    let lastSection = '';
    vocab.decks.forEach((deck, i) => {
      if (deck.section !== lastSection) {
        lastSection = deck.section;
        if (deck.section !== 'All') {
          const h = document.createElement('h2');
          h.className = 'section-header';
          h.textContent = SECTION_NAMES[deck.section] || deck.section;
          list.appendChild(h);
        }
      }
      const n = deck.cards.length;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'deck-tile';
      b.style.setProperty('--c', deck.color);
      b.dataset.deck = String(i);
      b.setAttribute('aria-label', `${deck.title}, ${n} cards`);
      b.innerHTML =
        '<span class="deck-emoji" aria-hidden="true"></span>' +
        '<span class="deck-texts"><div class="deck-name"></div><div class="deck-sub"></div></span>' +
        '<span class="deck-arrow" aria-hidden="true">▶</span>';
      b.querySelector('.deck-emoji').textContent = deck.emoji;
      b.querySelector('.deck-name').textContent = deck.title;
      const sub = b.querySelector('.deck-sub');
      sub.textContent = `${deck.subtitle}  ·  ${n} cards`;
      if (/[\u3040-\u30ff]/.test(deck.subtitle)) sub.lang = 'ja';
      b.addEventListener('click', () => { cameFromHome = true; location.hash = '#deck=' + i; });
      list.appendChild(b);
    });
  }

  // ---------- Study (CardActivity.kt) ----------
  const S = { deck: null, order: [], index: 0, back: false, animating: false };

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const current = () => S.deck.cards[S.order[S.index]];
  // Big text scales down on short screens so everything fits (full size at 700px+ tall).
  const fit = (px) => `min(${px}px, ${(px / 7).toFixed(2)}vh)`;

  function openDeck(i) {
    const deck = vocab.decks[i];
    if (!deck || !deck.cards.length) { showHome(); return; }
    S.deck = deck;
    S.order = deck.cards.map((_, k) => k);
    if (deck.shuffle) shuffle(S.order);
    S.index = 0;
    S.back = false;
    S.animating = false;
    document.documentElement.style.setProperty('--deck', deck.color);
    $('deck-title').textContent = `${deck.emoji} ${deck.title}`;
    $('home').hidden = true;
    $('study').hidden = false;
    document.title = `${deck.title} · Essa Nihongo`;
    bindCard();
    $('card').focus({ preventScroll: true });
  }

  function showHome() {
    Speaker.stop();
    S.deck = null;
    $('study').hidden = true;
    $('home').hidden = false;
    document.title = 'Essa Nihongo';
  }

  function bindCard() {
    const c = current();
    const n = S.deck.cards.length;
    $('counter').textContent = `${S.index + 1} / ${n}`;
    const fl = $('front-letter'), fw = $('front-word'), fe = $('front-emoji');
    if (c.isLetterCard) {
      fl.hidden = false;
      fl.textContent = c.letter;
      fl.style.fontSize = fit(120);
      const differs = c.letter !== c.japanese;
      fw.hidden = !differs;
      fw.textContent = differs ? c.japanese : '';
      fw.style.fontSize = fit(44);
      fw.style.color = S.deck.color;
    } else {
      fl.hidden = true;
      fw.hidden = false;
      fw.textContent = c.japanese;
      fw.style.fontSize = fit(bigTextPx(c.japanese));
      fw.style.color = '';
    }
    fe.textContent = c.emoji;
    fe.hidden = !c.emoji.trim();
    fe.style.fontSize = fit(c.isLetterCard ? 64 : 88);

    const jp = (c.isLetterCard && c.letter !== c.japanese) ? `${c.letter} → ${c.japanese}` : c.japanese;
    $('back-japanese').textContent = [c.emoji, jp].filter((s) => s.trim()).join('  ');
    $('back-romaji').textContent = c.romajiLine;
    $('back-english').textContent = c.english;
    showFace();
  }
  function showFace() {
    $('front').hidden = S.back;
    $('back').hidden = !S.back;
    $('card').setAttribute('aria-label',
      S.back ? `${current().romajiLine}: ${current().english}. Tap to flip back.`
             : `Flashcard ${current().japanese}. Tap to flip, swipe for the next card.`);
  }

  function anim(el, frames, ms) {
    if (reduceMotion || !el.animate) return Promise.resolve();
    return el.animate(frames, { duration: ms, easing: 'ease-in-out', fill: 'forwards' }).finished.catch(() => {});
  }

  async function flip() {
    if (S.animating || !S.deck) return;
    S.animating = true;
    const card = $('card');
    await anim(card, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)' }], 140);
    S.back = !S.back;
    showFace();
    await anim(card, [{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0deg)' }], 140);
    card.getAnimations && card.getAnimations().forEach((a) => a.cancel());
    S.animating = false;
  }

  async function move(step) {
    if (!S.deck || S.animating) return;
    const n = S.deck.cards.length;
    let next = S.index + step;
    if (next >= n) {
      toast('🎉 All done! Starting again.');
      if (S.deck.shuffle) shuffle(S.order);
      next = 0;
    } else if (next < 0) {
      next = n - 1;
    }
    Speaker.stop();
    S.animating = true;
    const card = $('card');
    const out = (step > 0 ? -1 : 1) * card.offsetWidth * 0.6;
    await anim(card, [{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${out}px)`, opacity: 0 }], 120);
    S.index = next;
    S.back = false;
    bindCard();
    await anim(card, [{ transform: `translateX(${-out}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], 140);
    card.getAnimations && card.getAnimations().forEach((a) => a.cancel());
    S.animating = false;
  }

  function reshuffle() {
    if (S.animating || !S.deck) return;
    shuffle(S.order);
    S.index = 0;
    S.back = false;
    bindCard();
    toast('🔀 Shuffled!');
  }

  const speakCurrent = () => { if (S.deck) Speaker.speak(current().speechText); };

  // Tap to flip, swipe left/right to move (GestureDetector equivalent).
  function attachGestures(el) {
    let sx = 0, sy = 0, st = 0, id = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      id = e.pointerId; sx = e.clientX; sy = e.clientY; st = Date.now();
    });
    el.addEventListener('pointerup', (e) => {
      if (id !== e.pointerId) return;
      id = null;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
      else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && Date.now() - st < 800) flip();
    });
    el.addEventListener('pointercancel', () => { id = null; });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------- Routing (#deck=N), so the phone's back gesture returns home ----------
  function route() {
    if (!vocab) return;
    const m = /^#deck=(\d+)$/.exec(location.hash);
    if (m) openDeck(parseInt(m[1], 10));
    else showHome();
  }
  let cameFromHome = false;
  function goHome() {
    if (cameFromHome && /^#deck=/.test(location.hash)) { cameFromHome = false; history.back(); }
    else { history.replaceState(null, '', location.pathname + location.search); showHome(); }
  }

  function wire() {
    $('back-btn').addEventListener('click', goHome);
    $('shuffle-btn').addEventListener('click', reshuffle);
    $('prev-btn').addEventListener('click', () => move(-1));
    $('next-btn').addEventListener('click', () => move(1));
    $('speak-btn').addEventListener('click', speakCurrent);
    attachGestures($('card'));
    document.addEventListener('keydown', (e) => {
      if ($('study').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'Escape') goHome();
      else if (e.key === 's' || e.key === 'S') speakCurrent();
    });
    // Block iOS double-tap zoom / pinch on the study screen.
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('hashchange', () => { if (!/^#deck=/.test(location.hash)) cameFromHome = false; route(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) Speaker.stop(); });
  }

  async function init() {
    wire();
    try {
      const res = await fetch('decks.json', { cache: 'no-cache' });
      vocab = parseVocab(await res.json());
    } catch (err) {
      $('deck-list').innerHTML = '<p class="loading">Couldn’t load the cards. Check your connection and reload.</p>';
      return;
    }
    renderHome();
    route();
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
  init();
})();
