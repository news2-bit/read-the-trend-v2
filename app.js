const PROXY = 'https://api.allorigins.win/raw?url=';
const TRENDS_RSS = geo => `https://trends.google.com/trending/rss?geo=${geo}`;
const GEO_API = 'https://ipapi.co/json/';
const LS_COUNTRY = 'trending_country';

const countrySelect = document.getElementById('countrySelect');
const refreshBtn    = document.getElementById('refreshBtn');
const loader        = document.getElementById('loader');
const errorDiv      = document.getElementById('error');
const trendsGrid    = document.getElementById('trendsGrid');
const meta          = document.getElementById('meta');
const updatedAt     = document.getElementById('updatedAt');
const detectedBadge = document.getElementById('detectedBadge');

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
  if (saved) {
    setCountry(saved, false);
    return;
  }
  try {
    const res = await fetch(GEO_API);
    const data = await res.json();
    const code = data.country_code || 'US';
    setCountry(code, true);
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
  const url = encodeURIComponent(TRENDS_RSS(geo));
  const res = await fetch(`${PROXY}${url}`);
  if (!res.ok) throw new Error(`Failed to fetch trends (HTTP ${res.status})`);
  const text = await res.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'application/xml');
  const parseErr = xml.querySelector('parsererror');
  if (parseErr) throw new Error('Could not parse trends data.');
  return xml.querySelectorAll('item');
}

function getText(el, tag, ns) {
  const node = ns ? el.getElementsByTagNameNS(ns, tag)[0] : el.querySelector(tag);
  return node ? node.textContent.trim() : '';
}

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

    trendsGrid.appendChild(card);
  });
}

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

countrySelect.addEventListener('change', () => {
  detectedBadge.hidden = true;
  loadTrends();
});
refreshBtn.addEventListener('click', loadTrends);

detectCountry().then(loadTrends);
