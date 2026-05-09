/**
 * AI検索UI 強化モジュール（DOMイベントインターセプション版）
 *
 * window.runAi 等のIIFE内関数に依存せず、DOM操作のみで統合する。
 *
 * ① AIにおまかせ強化: #aiGo クリックをインターセプト → /api/ai-search で解析タグ注入
 * ② ナビちゃん強化: MutationObserver でメッセージ検知 → 解析タグ・曲カード注入
 * ③ BGMチャンネル強化: radioGo.onclick をラップ → ジャンルキーワード自動付加 + 同ジャンル連続再生
 *
 * 組み込み: </body> 直前
 *   <script src="ai-search-ui.js" defer></script>
 */

(function () {
  'use strict';

  const API_BASE = window.__BGM_API_BASE__ || '';
  const DEBOUNCE_MS = 220;
  const API_TIMEOUT_MS = 2500;

  // ─── 定数 ────────────────────────────────────────────────────────────────

  const MOOD_LABELS = {
    chill: 'チル・リラックス', tense: '緊迫・スリル',
    bright: '爽やか・明るい', emotional: 'エモい・感動',
    cinematic: 'シネマティック', dark: 'ダーク',
    warm: '温かい', mystical: '神秘的',
  };

  const USE_CASE_LABELS = {
    youtube_explanation: 'YouTube解説', vlog: 'Vlog・日常',
    gaming: 'ゲーム実況', corporate: '企業VP',
    cooking: '料理動画', sleep: '睡眠用',
    meditation: '瞑想・ヨガ', workout: 'スポーツ',
  };

  const GENRE_DISPLAY = {
    'lo-fi': 'Lo-Fi', 'jazz': 'Jazz', 'ambient': 'Ambient',
    'cinematic': 'Cinematic', 'electronic': 'Electronic',
    'j-pop': 'J-Pop / シティポップ', 'hip-hop-rnb': 'Hip-Hop / R&B',
    'folk-acoustic': 'Acoustic / Folk', 'rock': 'Rock',
    'corporate-bgm': 'Corporate BGM', 'japanese-anime': '和風 / Anime',
    'childrens': 'キッズ',
  };

  // _detectRadioGenre（既存コード）が認識するキーワードと1対1
  const GENRE_INJECT_KW = {
    'lo-fi': 'lo-fi', 'jazz': 'jazz', 'ambient': 'ambient',
    'cinematic': 'cinematic', 'electronic': 'electronic',
    'j-pop': 'j-pop', 'hip-hop-rnb': 'hip-hop',
    'folk-acoustic': 'folk', 'rock': 'rock',
    'corporate-bgm': 'corporate', 'japanese-anime': 'anime',
    'childrens': 'kids',
  };

  // 自由テキスト → ジャンルID 検出テーブル
  const EXTENDED_GENRE_MAP = {
    'lo-fi':         ['ローファイ','lo-fi','lofi','チルホップ','深夜作業','作業用','勉強'],
    'jazz':          ['ジャズ','jazz','おしゃれ','カフェ','コーヒー','スムース'],
    'ambient':       ['アンビエント','ambient','瞑想','睡眠','ヨガ','自然','癒し','静か'],
    'cinematic':     ['シネマティック','cinematic','オーケストラ','orchestra','壮大','映画','感動','epic'],
    'electronic':    ['エレクトロニック','electronic','テクノ','techno','ハウス','house','ダンス','edm','シンセ'],
    'j-pop':         ['シティポップ','city pop','j-pop','jpop','爽やか','ポップ','夏','青春'],
    'hip-hop-rnb':   ['ヒップホップ','hip-hop','hiphop','trap','ラップ','r&b'],
    'folk-acoustic': ['フォーク','folk','アコースティック','acoustic','ギター','弾き語り','朝','散歩'],
    'rock':          ['ロック','rock','バンド','metal','メタル'],
    'corporate-bgm': ['コーポレート','corporate','企業','ビジネス','プレゼン','vp'],
    'japanese-anime':['アニメ','anime','和風','和楽器','侍','神社','琴','太鼓'],
    'childrens':     ['キッズ','kids','こども','子供','子ども','可愛い','かわいい'],
  };

  const DYNAMIC_TIPS = [
    { q: '動画の背景で喋りの邪魔にならないおしゃれなLo-Fi', label: '🎧 解説BGM・Lo-Fi' },
    { q: 'ゲーム実況のホラーシーン 緊張感のある曲', label: '👻 ホラーゲーム緊張' },
    { q: '料理動画完成シーンの達成感がある明るい曲', label: '🍳 料理完成シーン' },
    { q: 'キャンプ動画の朝に合う穏やかな自然を感じる曲', label: '⛺ キャンプの朝' },
    { q: '企業VP洗練されたプロフェッショナルな曲', label: '💼 企業VP・プレゼン' },
    { q: '深夜作業集中できるチルなヒップホップ', label: '🌙 深夜作業集中' },
  ];

  const TRIGGER_SUGGESTIONS = [
    { re: /vlog|日常|散歩|旅行/, q: 'キャンプ動画の朝に合う穏やかな曲', label: '⛺ キャンプの朝' },
    { re: /料理|クッキング|食べ/, q: '料理が完成した瞬間の達成感がある曲', label: '🍳 料理完成' },
    { re: /ゲーム|gaming|game|実況/, q: 'ホラーゲームの追いかけっこで緊迫した曲', label: '👻 ホラー実況' },
    { re: /解説|勉強|作業|集中/, q: '深夜作業・勉強BGMに最適な集中できる曲', label: '📚 勉強・集中' },
    { re: /企業|ビジネス|プレゼン/, q: '企業紹介動画に合う洗練された曲', label: '💼 企業VP' },
    { re: /チル|リラックス|chill/, q: '一人の夜に聴きたいlo-fiな曲', label: '🌙 チルナイト' },
    { re: /エモ|感動|切ない/, q: '卒業式スライドショーに合う感動的な曲', label: '🎓 感動・エモ' },
    { re: /壮大|シネマ|映画/, q: 'クライマックスに使えるオーケストラ曲', label: '🎬 シネマティック' },
  ];

  // ─── ユーティリティ ───────────────────────────────────────────────────────

  function escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function detectGenresFromText(text) {
    const tl = text.toLowerCase();
    const found = [];
    for (const [genre, kws] of Object.entries(EXTENDED_GENRE_MAP)) {
      if (kws.some(k => tl.includes(k))) found.push(genre);
    }
    return found;
  }

  async function callAiSearch(query, limit = 10) {
    if (!API_BASE) throw new Error('no api');
    const res = await fetch(`${API_BASE}/api/ai-search?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  }

  // ─── ① AIにおまかせ強化 ────────────────────────────────────────────────────

  function enhanceTips() {
    const tips = document.getElementById('aitips');
    if (!tips) return;
    const existing = new Set([...tips.querySelectorAll('.aitip')].map(t => t.dataset.q));
    DYNAMIC_TIPS.forEach(({ q, label }) => {
      if (existing.has(q)) return;
      const span = document.createElement('span');
      span.className = 'aitip';
      span.dataset.q = q;
      span.textContent = label;
      span.addEventListener('click', () => {
        const p = document.getElementById('aiPrompt');
        if (p) { p.value = q; p.focus(); }
        document.getElementById('aiGo')?.click();
      });
      tips.appendChild(span);
    });
  }

  function updateTipsForInput(value) {
    const tips = document.getElementById('aitips');
    if (!tips) return;
    tips.querySelectorAll('.aitip.js-dyn').forEach(el => el.remove());
    if (!value || value.trim().length < 3) return;
    TRIGGER_SUGGESTIONS.filter(s => s.re.test(value)).slice(0, 2).forEach(({ q, label }) => {
      const span = document.createElement('span');
      span.className = 'aitip js-dyn';
      span.dataset.q = q;
      span.textContent = label;
      span.style.cssText = 'border-color:rgba(29,233,182,.5);color:rgba(29,233,182,.9)';
      span.addEventListener('click', () => {
        const p = document.getElementById('aiPrompt');
        if (p) { p.value = q; p.focus(); }
        document.getElementById('aiGo')?.click();
      });
      tips.insertBefore(span, tips.firstChild);
    });
  }

  let _lastAiPrompt = '';
  let _lastParsed = null;

  function injectParsedTags(parsed) {
    _lastParsed = parsed;
    if (!parsed) return;
    const banner = document.querySelector('.aibanner');
    if (!banner) return;
    let tagsEl = banner.querySelector('.aibtags');
    if (!tagsEl) {
      tagsEl = document.createElement('div');
      tagsEl.className = 'aibtags';
      (banner.querySelector('div') || banner).appendChild(tagsEl);
    }
    tagsEl.querySelectorAll('.aibchip').forEach(c => c.remove());
    const chips = [];
    if (parsed.target_bpm) chips.push({ key:'bpm', text:`♩ BPM ${parsed.target_bpm}` });
    if (parsed.mood)       chips.push({ key:'mood', text:`🎭 ${MOOD_LABELS[parsed.mood] ?? parsed.mood}` });
    if (parsed.genre)      chips.push({ key:'genre', text:`🎵 ${parsed.genre}` });
    if (parsed.use_case)   chips.push({ key:'case', text:`📹 ${USE_CASE_LABELS[parsed.use_case] ?? parsed.use_case}` });
    if (parsed.instrument_exclude?.includes('vocal')) chips.push({ key:'excl', text:'🚫 ボーカルなし' });
    chips.forEach(({ key, text }) => {
      const chip = document.createElement('span');
      chip.className = 'aibchip'; chip.dataset.nlkey = key; chip.textContent = text;
      tagsEl.appendChild(chip);
    });
  }

  function setupAiGoListener() {
    const goBtn = document.getElementById('aiGo');
    if (!goBtn) return;
    goBtn.addEventListener('click', () => {
      const q = document.getElementById('aiPrompt')?.value?.trim() || '';
      if (!q) return;
      _lastAiPrompt = q;
      // APIが存在する場合のみ解析タグを注入
      setTimeout(async () => {
        try {
          const data = await Promise.race([
            callAiSearch(q, 5),
            new Promise((_, r) => setTimeout(() => r(new Error('to')), API_TIMEOUT_MS)),
          ]);
          if (data?.parsed) injectParsedTags(data.parsed);
        } catch (_e) {}
      }, 300);
    }, true); // capture: runAi の前に実行
  }

  function setupAiPromptListener() {
    const promptEl = document.getElementById('aiPrompt');
    if (!promptEl) return;
    let t = null;
    promptEl.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => updateTipsForInput(promptEl.value), DEBOUNCE_MS);
    });
  }

  // ─── ② ナビちゃん強化 ─────────────────────────────────────────────────────

  function injectNaviTags(bubble, parsed) {
    if (!parsed || !bubble) return;
    const tags = [];
    if (parsed.target_bpm) tags.push(`♩ BPM ${parsed.target_bpm}`);
    if (parsed.mood)       tags.push(MOOD_LABELS[parsed.mood] ?? parsed.mood);
    if (parsed.genre)      tags.push(parsed.genre);
    if (parsed.instrument_exclude?.includes('vocal')) tags.push('ボーカルなし');
    if (!tags.length) return;

    const strip = document.createElement('div');
    strip.style.cssText = 'margin-top:8px;opacity:.85';
    tags.forEach(t => {
      const c = document.createElement('span');
      c.style.cssText = 'font-size:11px;background:rgba(123,94,167,.15);border:1px solid rgba(123,94,167,.35);border-radius:12px;padding:3px 9px;margin-right:4px;display:inline-block';
      c.textContent = t;
      strip.appendChild(c);
    });
    bubble.appendChild(strip);
  }

  function injectNaviSongs(bubble, songs) {
    if (!songs?.length || !bubble || bubble.querySelector('.navi-song-list')) return;
    const hint = document.createElement('div');
    hint.textContent = '▼ AIが追加でマッチした曲';
    hint.style.cssText = 'font-size:11px;opacity:.7;margin-top:10px';
    const list = document.createElement('div');
    list.className = 'navi-song-list';
    songs.slice(0, 5).forEach(song => {
      const btn = document.createElement('button');
      btn.className = 'navi-song-card';
      btn.innerHTML = `
        <div class="navi-song-thumb">${song.image_url ? `<img src="${escHtml(song.image_url)}" alt="" loading="lazy">` : ''}</div>
        <div class="navi-song-info">
          <div class="navi-song-title">${escHtml(song.title)}</div>
          <div class="navi-song-meta">${escHtml(song.genre ?? '')}${song.bpm ? ` · BPM ${Math.round(song.bpm)}` : ''}</div>
        </div>
        <span class="navi-song-play">▶</span>`;
      btn.addEventListener('click', () => {
        if (typeof window.play === 'function') window.play(song.id);
        else window.location.href = `/songs/${escHtml(song.slug)}.html`;
      });
      list.appendChild(btn);
    });
    bubble.appendChild(hint);
    bubble.appendChild(list);
  }

  function enhanceNaviChan() {
    const messagesEl = document.getElementById('naviMessages');
    if (!messagesEl) return;
    let apiPromise = null;
    new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.classList.contains('user')) {
            const txt = node.querySelector('.navi-msg-bubble')?.textContent?.trim();
            if (txt && txt.length > 2) {
              apiPromise = Promise.race([
                callAiSearch(txt, 5),
                new Promise((_, r) => setTimeout(() => r(new Error('to')), API_TIMEOUT_MS)),
              ]).catch(() => null);
            }
          }
          if (node.classList.contains('navi') && !node.querySelector('.navi-typing')) {
            const bubble = node.querySelector('.navi-msg-bubble');
            const cap = apiPromise; apiPromise = null;
            if (!bubble || !cap) continue;
            cap.then(data => {
              if (!data) return;
              if (data.parsed?.confidence > 0.3) injectNaviTags(bubble, data.parsed);
              if (data.songs?.length) injectNaviSongs(bubble, data.songs);
            }).catch(() => {});
          }
        }
      }
    }).observe(messagesEl, { childList: true });
  }

  // ─── ③ BGMチャンネル強化 ─────────────────────────────────────────────────

  let _lastRadioGenre = null; // 最後に開始したチャンネルのジャンルID

  // ── ジャンルヒント表示 ──

  function getOrCreateHintEl() {
    let el = document.getElementById('aiRadioHint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'aiRadioHint';
      el.style.cssText = [
        'margin-top:8px','padding:7px 12px','border-radius:8px',
        'background:rgba(200,90,30,.09)','border:1px solid rgba(200,90,30,.2)',
        'font-size:12px','color:var(--accent,#c85a1e)','display:none',
      ].join(';');
      const goBtn = document.getElementById('radioGo');
      goBtn?.parentNode?.insertBefore(el, goBtn);
    }
    return el;
  }

  function showRadioHint(genres) {
    const el = getOrCreateHintEl();
    if (!genres?.length) { el.style.display = 'none'; return; }
    const names = genres.slice(0, 3).map(g => GENRE_DISPLAY[g] ?? g).join(' / ');
    el.textContent = `🎵 検出ジャンル: ${names}（このジャンル中心で流し続けます）`;
    el.style.display = 'block';
  }

  // ── radioGo.onclick をラップしてジャンルキーワードを付加 ──

  function enhanceRadioButton() {
    const goBtn = document.getElementById('radioGo');
    const input = document.getElementById('radioCustom');
    if (!goBtn || !input) return;

    const origOnclick = goBtn.onclick;
    goBtn.onclick = function (e) {
      const txt = input.value.trim();
      if (!txt) {
        origOnclick?.call(this, e);
        return;
      }
      const genres = detectGenresFromText(txt);
      if (genres.length) {
        _lastRadioGenre = genres[0];
        const kw = GENRE_INJECT_KW[genres[0]] || genres[0];
        const alreadyHasKw = txt.toLowerCase().includes(kw);
        if (!alreadyHasKw) input.value = txt + ' ' + kw;
        origOnclick?.call(this, e);
        // 元のテキストに戻す（UIの残像を残さない）
        setTimeout(() => { input.value = txt; }, 80);
      } else {
        _lastRadioGenre = null;
        origOnclick?.call(this, e);
      }
    };
  }

  // .rmcard クリック時にジャンルを記憶
  function trackPresetCardGenre() {
    document.querySelectorAll('#radioModal .rmcard').forEach(card => {
      card.addEventListener('click', () => {
        const genres = card.dataset.genres?.split(',').filter(Boolean) || [];
        _lastRadioGenre = genres[0] || null;
      }, true); // capture: 既存onclick より先に実行
    });
  }

  // ── 再生中プレイヤーに「同ジャンルをもっと流す」ボタンを注入 ──

  function injectSameGenreBtn(genreId) {
    if (!genreId) return;
    const pinfo = document.querySelector('.pinfo');
    if (!pinfo) return;
    pinfo.querySelector('.ai-same-genre-btn')?.remove();

    const btn = document.createElement('button');
    btn.className = 'ai-same-genre-btn';
    btn.style.cssText = [
      'margin-top:4px','font-size:11px','padding:2px 9px',
      'border:1px solid rgba(200,90,30,.35)','border-radius:10px',
      'background:rgba(200,90,30,.08)','color:var(--accent,#c85a1e)',
      'cursor:pointer','display:inline-block','line-height:1.9','white-space:nowrap',
    ].join(';');
    btn.textContent = `🎵 ${GENRE_DISPLAY[genreId] ?? genreId} をもっと流す`;
    btn.addEventListener('click', () => {
      const input = document.getElementById('radioCustom');
      const goBtn = document.getElementById('radioGo');
      if (!input || !goBtn) return;
      _lastRadioGenre = genreId;
      const kw = GENRE_INJECT_KW[genreId] || genreId;
      input.value = kw;
      // モーダルを開かずに直接起動できるよう、onclickを経由
      goBtn.click();
    });
    pinfo.appendChild(btn);
  }

  function setupNowPlayingObserver() {
    const pName = document.getElementById('pName');
    if (!pName) return;
    let lastTitle = '';
    new MutationObserver(() => {
      const title = pName.textContent?.trim();
      if (!title || title === lastTitle || title === '—') return;
      lastTitle = title;
      // BGMチャンネル中のみ
      const radioInd = document.getElementById('radioInd');
      if (!radioInd?.classList.contains('on')) {
        document.querySelector('.pinfo .ai-same-genre-btn')?.remove();
        return;
      }
      injectSameGenreBtn(_lastRadioGenre);
    }).observe(pName, { childList: true, characterData: true, subtree: true });
  }

  function setupRadioCustomListener() {
    const input = document.getElementById('radioCustom');
    if (!input) return;
    let t = null;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const genres = detectGenresFromText(input.value);
        showRadioHint(genres);
      }, DEBOUNCE_MS);
    });
    // モーダルが閉じたらヒントリセット
    const modal = document.getElementById('radioModal');
    if (modal) {
      new MutationObserver(() => {
        if (!modal.classList.contains('on')) showRadioHint(null);
      }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // ─── 初期化 ──────────────────────────────────────────────────────────────

  function init() {
    enhanceTips();
    setupAiGoListener();
    setupAiPromptListener();
    enhanceNaviChan();
    enhanceRadioButton();
    trackPresetCardGenre();
    setupNowPlayingObserver();
    setupRadioCustomListener();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AiSearchEnhancer = { getParsed: () => _lastParsed };
})();
