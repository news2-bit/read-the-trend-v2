const PROXY             = 'https://corsproxy.io/?url=';
const TRENDS_RSS        = geo => `https://trends.google.com/trending/rss?geo=${geo}`;
const GEO_API           = 'https://ipapi.co/json/';
const POLLINATIONS_AUTH = 'https://enter.pollinations.ai/authorize';
const POLLINATIONS_API  = 'https://gen.pollinations.ai/v1/chat/completions';
const LS_COUNTRY        = 'trending_country';
const LS_LANG           = 'trending_lang';
const LS_MODEL          = 'trending_model';
const LS_POLLEN_KEY     = 'pollinations_key';
const LANG_NAMES        = { en:'English', de:'German', es:'Spanish', fr:'French', it:'Italian', zh:'Chinese' };

// --- DOM refs ---

const countrySelect  = document.getElementById('countrySelect');
const langSelect     = document.getElementById('langSelect');
const refreshBtn     = document.getElementById('refreshBtn');
const loader         = document.getElementById('loader');
const errorDiv       = document.getElementById('error');
const trendsGrid     = document.getElementById('trendsGrid');
const meta           = document.getElementById('meta');
const updatedAt      = document.getElementById('updatedAt');
const detectedBadge  = document.getElementById('detectedBadge');
const modelSelect    = document.getElementById('modelSelect');
const connectBtn     = document.getElementById('connectBtn');
const connectedBadge = document.getElementById('connectedBadge');
const disconnectBtn  = document.getElementById('disconnectBtn');

const modal          = document.getElementById('modal');
const modalBackdrop  = document.getElementById('modalBackdrop');
const modalClose     = document.getElementById('modalClose');
const modalTrendName = document.getElementById('modalTrendName');
const modalTraffic   = document.getElementById('modalTraffic');
const step2Btn       = document.getElementById('step2Btn');
const step2Loader    = document.getElementById('step2Loader');
const step2Result    = document.getElementById('step2Result');
const step3Section   = document.getElementById('step3Section');
const step3Btn       = document.getElementById('step3Btn');
const step3Loader    = document.getElementById('step3Loader');
const step3Result    = document.getElementById('step3Result');

// --- Auth ---

function updateAuthUI() {
  const hasKey = !!localStorage.getItem(LS_POLLEN_KEY);
  connectBtn.hidden     = hasKey;
  connectedBadge.hidden = !hasKey;
}

function handleIncomingKey() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const key = fragment.get('api_key');
  if (key) {
    localStorage.setItem(LS_POLLEN_KEY, key);
    history.replaceState(null, '', location.pathname);
  }
}

connectBtn.addEventListener('click', () => {
  const params = new URLSearchParams({ redirect_url: location.href });
  window.location.href = `${POLLINATIONS_AUTH}?${params}`;
});

disconnectBtn.addEventListener('click', () => {
  localStorage.removeItem(LS_POLLEN_KEY);
  updateAuthUI();
});

// --- Language ---

langSelect.value = localStorage.getItem(LS_LANG) || 'en';
langSelect.addEventListener('change', () => localStorage.setItem(LS_LANG, langSelect.value));

modelSelect.value = localStorage.getItem(LS_MODEL) || 'perplexity-fast';
modelSelect.addEventListener('change', () => localStorage.setItem(LS_MODEL, modelSelect.value));

// --- Trends ---

function showLoader(on) {
  loader.hidden = !on;
  refreshBtn.disabled = on;
  countrySelect.disabled = on;
}

function showError(msg) {
  errorDiv.textContent = msg;
  errorDiv.hidden = false;
}

function clearError() {
  errorDiv.hidden = true;
  errorDiv.textContent = '';
}

async function detectCountry() {
  const saved = localStorage.getItem(LS_COUNTRY);
  if (saved) { setCountry(saved, false); return; }
  try {
    const res  = await fetch(GEO_API);
    const data = await res.json();
    setCountry(data.country_code || 'US', true);
  } catch {
    setCountry('US', false);
  }
}

function setCountry(code, detected) {
  const option = countrySelect.querySelector(`option[value="${code}"]`);
  if (option) {
    countrySelect.value = code;
    detectedBadge.hidden = !detected;
  } else {
    countrySelect.value = 'US';
    detectedBadge.hidden = true;
  }
}

async function fetchTrends(geo) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const url = encodeURIComponent(TRENDS_RSS(geo));
    const res = await fetch(`${PROXY}${url}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Failed to fetch trends (HTTP ${res.status})`);
    const text = await res.text();
    const xml  = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('Could not parse trends data.');
    return xml.querySelectorAll('item');
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out. Try refreshing.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function getText(el, tag, ns) {
  const node = ns ? el.getElementsByTagNameNS(ns, tag)[0] : el.querySelector(tag);
  return node ? node.textContent.trim() : '';
}

// --- Markdown renderer ---

function fmt(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>');
}

function md2html(md) {
  const lines = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .split('\n');

  const out = [];
  let inList = false;

  function openList()  { if (!inList) { out.push('<ul>'); inList = true; } }
  function closeList() { if (inList)  { out.push('</ul>'); inList = false; } }

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if      ((m = line.match(/^### (.+)/)))    { closeList(); out.push(`<h3>${fmt(m[1])}</h3>`); }
    else if ((m = line.match(/^## (.+)/)))     { closeList(); out.push(`<h2>${fmt(m[1])}</h2>`); }
    else if ((m = line.match(/^# (.+)/)))      { closeList(); out.push(`<h1>${fmt(m[1])}</h1>`); }
    else if ((m = line.match(/^[*-] (.+)/)))   { openList();  out.push(`<li>${fmt(m[1])}</li>`); }
    else if ((m = line.match(/^\d+\. (.+)/)))  { openList();  out.push(`<li>${fmt(m[1])}</li>`); }
    else if (line.trim() === '')               { closeList(); }
    else                                       { closeList(); out.push(`<p>${fmt(line)}</p>`); }
  }
  closeList();
  return out.join('\n');
}

// --- Pollinations call ---

async function callAI(model, prompt) {
  const key = localStorage.getItem(LS_POLLEN_KEY);
  if (!key) throw new Error('Connect Pollinations first (button above).');

  const res = await fetch(POLLINATIONS_API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })
  });

  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem(LS_POLLEN_KEY);
    updateAuthUI();
    throw new Error('Session expired. Please reconnect Pollinations.');
  }
  if (!res.ok) throw new Error(`API error ${res.status}`);

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? 'No response.';
}

// --- Modal ---

let currentTrend = null;

function openModal(trend) {
  currentTrend = trend;
  modalTrendName.textContent = trend.name;
  modalTraffic.textContent   = trend.traffic ? `${trend.traffic} searches` : '';

  step2Btn.disabled   = false;
  step2Btn.textContent = '🔍 Search the Web';
  step2Loader.hidden  = true;
  step2Result.hidden  = true;
  step2Result.innerHTML = '';

  step3Section.hidden = true;
  step3Btn.disabled   = false;
  step3Btn.textContent = '✍️ Write Article';
  step3Loader.hidden  = true;
  step3Result.hidden  = true;
  step3Result.innerHTML = '';

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
  currentTrend = null;
}

modalBackdrop.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Step 2 — web research

step2Btn.addEventListener('click', async () => {
  if (!currentTrend) return;
  const lang     = langSelect.value;
  const langName = LANG_NAMES[lang];
  const { name, traffic, newsTitle, newsSource } = currentTrend;
  const context  = newsTitle ? ` Related news: "${newsTitle}" (${newsSource}).` : '';
  const prompt   =
    `Search the web and write a detailed summary in ${langName} about why "${name}" is currently trending` +
    (traffic ? ` (approx. ${traffic} searches)` : '') + `.${context} Cover: what it is, who's involved, why it's trending right now, and the latest key facts. Be factual and comprehensive.`;

  step2Btn.disabled    = true;
  step2Btn.textContent = '⏳ Searching…';
  step2Loader.hidden   = false;
  step2Result.hidden   = true;
  step3Section.hidden  = true;

  try {
    const text = await callAI(modelSelect.value, prompt);
    step2Result.innerHTML = md2html(text);
    step2Result.hidden    = false;
    step2Btn.textContent  = '✓ Done';
    step3Section.hidden   = false;
  } catch (err) {
    step2Result.innerHTML = `<p class="result-error">${err.message}</p>`;
    step2Result.hidden    = false;
    step2Btn.textContent  = '🔍 Search the Web';
    step2Btn.disabled     = false;
  } finally {
    step2Loader.hidden = true;
  }
});

// Step 3 — write article

step3Btn.addEventListener('click', async () => {
  if (!currentTrend) return;
  const lang     = langSelect.value;
  const langName = LANG_NAMES[lang];
  const { name } = currentTrend;
  const research = step2Result.innerText;
  const prompt   =
    `Based on this research about "${name}":\n\n${research}\n\n` +
    `Write a comprehensive, engaging article in ${langName} about "${name}". Structure it with:\n` +
    `- A compelling headline\n- An introduction paragraph\n- 2-3 main sections with subheadings\n- A conclusion\n\nMake it informative and well-written.`;

  step3Btn.disabled    = true;
  step3Btn.textContent = '⏳ Writing…';
  step3Loader.hidden   = false;
  step3Result.hidden   = true;

  try {
    const text = await callAI(modelSelect.value, prompt);
    step3Result.innerHTML = md2html(text);
    step3Result.hidden    = false;
    step3Btn.textContent  = '✓ Done';
  } catch (err) {
    step3Result.innerHTML = `<p class="result-error">${err.message}</p>`;
    step3Result.hidden    = false;
    step3Btn.textContent  = '✍️ Write Article';
    step3Btn.disabled     = false;
  } finally {
    step3Loader.hidden = true;
  }
});

// --- Render trends ---

function renderTrends(items) {
  trendsGrid.innerHTML = '';
  if (!items.length) {
    trendsGrid.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:.875rem">No trends found for this country.</p>';
    return;
  }

  const NS = 'https://trends.google.com/trending/rss';

  items.forEach((item, i) => {
    const name       = getText(item, 'title');
    const traffic    = getText(item, 'approx_traffic', NS);
    const newsTitle  = getText(item, 'news_item_title', NS);
    const newsUrl    = getText(item, 'news_item_url', NS);
    const newsSource = getText(item, 'news_item_source', NS);
    const picture    = getText(item, 'picture', NS);

    const card = document.createElement('div');
    card.className = 'trend-card';

    const thumb = picture
      ? `<img class="thumb" src="${picture}" alt="" loading="lazy" onerror="this.remove()">`
      : '';

    const newsBlock = newsTitle
      ? `<a class="news-link" href="${newsUrl}" target="_blank" rel="noopener">${newsTitle}</a>
         ${newsSource ? `<div class="news-source">${newsSource}</div>` : ''}`
      : '';

    card.innerHTML = `
      <div class="card-top">
        <span class="rank">#${i + 1}</span>
        <div class="card-title-wrap">
          <div class="trend-name">${name}</div>
          ${traffic ? `<div class="traffic">${traffic} searches</div>` : ''}
        </div>
        ${thumb}
      </div>
      ${newsBlock}
    `;

    const btn = document.createElement('button');
    btn.className   = 'explore-btn';
    btn.textContent = '✦ Explore';
    btn.addEventListener('click', () => openModal({ name, traffic, newsTitle, newsSource, newsUrl }));
    card.appendChild(btn);
    trendsGrid.appendChild(card);
  });
}

// --- Load ---

async function loadTrends() {
  const geo = countrySelect.value;
  localStorage.setItem(LS_COUNTRY, geo);
  clearError();
  trendsGrid.innerHTML = '';
  meta.hidden = true;
  showLoader(true);

  try {
    const items = await fetchTrends(geo);
    renderTrends(Array.from(items));
    updatedAt.textContent = new Date().toLocaleTimeString();
    meta.hidden = false;
  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
  } finally {
    showLoader(false);
  }
}

countrySelect.addEventListener('change', () => { detectedBadge.hidden = true; loadTrends(); });
refreshBtn.addEventListener('click', loadTrends);

handleIncomingKey();
updateAuthUI();
detectCountry().then(loadTrends);
