const STORAGE_KEYS = {
  backendUrl: 'backendUrl',
  tiktokSession: 'tiktokSession',
  systemSessionId: 'systemSessionId',
  selectedVideos: 'selectedVideos',
  searchHistory: 'searchHistory',
  filters: 'filters',
  agent3BatchId: 'agent3BatchId'
};

const DEFAULT_TOPICS = ['Science', 'Facts', 'Amazing', 'Tech', 'AI', 'Motivation'];

const state = {
  backendUrl: '',
  tiktokSession: '',
  systemSessionId: '',
  selectedVideoUrls: new Set(),
  selectedVideoMap: new Map(),
  currentVideos: [],
  topics: [...DEFAULT_TOPICS],
  activeTopics: new Set(['Science', 'Facts', 'Amazing']),
  searchHistory: [],
  lastPayload: null,
  lastCount: 12,
  lastBatchId: '',
  chart: null,
  connected: false,
  currentDataSource: 'mock'
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  loadStateFromStorage();
  bindEvents();
  renderTopics();
  renderHistory();
  renderSelectedCount();
  renderEmptyState('Connect your backend and run a search.');
  restoreFilters();
  applySavedInputs();
  autoConnectIfPossible();
});

function cacheElements() {
  els.backendUrlInput = document.getElementById('backendUrlInput');
  els.connectBtn = document.getElementById('connectBtn');
  els.statusDot = document.getElementById('statusDot');
  els.statusText = document.getElementById('statusText');
  els.systemSessionInput = document.getElementById('systemSessionInput');
  els.topicsList = document.getElementById('topicsList');
  els.customTopicInput = document.getElementById('customTopicInput');
  els.addTopicBtn = document.getElementById('addTopicBtn');
  els.searchBtn = document.getElementById('searchBtn');
  els.clearBtn = document.getElementById('clearBtn');
  els.min50kCheckbox = document.getElementById('min50kCheckbox');
  els.hindiOnlyCheckbox = document.getElementById('hindiOnlyCheckbox');
  els.under60Checkbox = document.getElementById('under60Checkbox');
  els.tiktokSessionInput = document.getElementById('tiktokSessionInput');
  els.historyList = document.getElementById('historyList');
  els.clearHistoryBtn = document.getElementById('clearHistoryBtn');
  els.resultsTitle = document.getElementById('resultsTitle');
  els.resultsMeta = document.getElementById('resultsMeta');
  els.resultsGrid = document.getElementById('resultsGrid');
  els.mockBanner = document.getElementById('mockBanner');
  els.loadMoreBtn = document.getElementById('loadMoreBtn');
  els.hashtagsWrap = document.getElementById('hashtagsWrap');
  els.selectedCount = document.getElementById('selectedCount');
  els.batchInfo = document.getElementById('batchInfo');
  els.sendToAgent3Btn = document.getElementById('sendToAgent3Btn');
  els.clearSelectionBtn = document.getElementById('clearSelectionBtn');
  els.selectAllBtn = document.getElementById('selectAllBtn');
  els.deselectAllBtn = document.getElementById('deselectAllBtn');
  els.previewModal = document.getElementById('previewModal');
  els.previewContent = document.getElementById('previewContent');
  els.closeModalBtn = document.getElementById('closeModalBtn');
  els.toastContainer = document.getElementById('toastContainer');
  els.viewsChart = document.getElementById('viewsChart');
}

function bindEvents() {
  els.connectBtn.addEventListener('click', connectBackend);
  els.addTopicBtn.addEventListener('click', addCustomTopic);
  els.customTopicInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addCustomTopic();
  });
  els.searchBtn.addEventListener('click', () => searchTikTok(true));
  els.clearBtn.addEventListener('click', clearSearchState);
  els.clearHistoryBtn.addEventListener('click', clearHistory);
  els.loadMoreBtn.addEventListener('click', loadMoreResults);
  els.sendToAgent3Btn.addEventListener('click', sendToAgent3);
  els.clearSelectionBtn.addEventListener('click', clearSelection);
  els.selectAllBtn.addEventListener('click', selectAllVisible);
  els.deselectAllBtn.addEventListener('click', clearSelection);
  els.closeModalBtn.addEventListener('click', closePreviewModal);
  els.previewModal.addEventListener('click', (event) => {
    if (event.target.dataset.closeModal === 'true') closePreviewModal();
  });

  els.backendUrlInput.addEventListener('change', saveCurrentInputs);
  els.systemSessionInput.addEventListener('change', saveCurrentInputs);
  els.tiktokSessionInput.addEventListener('change', saveCurrentInputs);
  els.min50kCheckbox.addEventListener('change', saveFilters);
  els.hindiOnlyCheckbox.addEventListener('change', saveFilters);
  els.under60Checkbox.addEventListener('change', saveFilters);
  document.querySelectorAll('input[name="timeFilter"]').forEach((input) => input.addEventListener('change', saveFilters));
  document.querySelectorAll('input[name="sortBy"]').forEach((input) => input.addEventListener('change', saveFilters));
}

function loadStateFromStorage() {
  state.backendUrl = localStorage.getItem(STORAGE_KEYS.backendUrl) || '';
  state.tiktokSession = localStorage.getItem(STORAGE_KEYS.tiktokSession) || '';
  state.systemSessionId = localStorage.getItem(STORAGE_KEYS.systemSessionId) || '';
  state.searchHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.searchHistory) || '[]');
  state.lastBatchId = localStorage.getItem(STORAGE_KEYS.agent3BatchId) || '';

  const selected = JSON.parse(localStorage.getItem(STORAGE_KEYS.selectedVideos) || '[]');
  state.selectedVideoUrls = new Set(selected);
}

function applySavedInputs() {
  els.backendUrlInput.value = state.backendUrl;
  els.tiktokSessionInput.value = state.tiktokSession;
  els.systemSessionInput.value = state.systemSessionId;
  if (state.lastBatchId) {
    els.batchInfo.textContent = `Last batch ready: ${state.lastBatchId}`;
  }
}

function restoreFilters() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.filters) || '{}');
  if (typeof saved.min50k === 'boolean') els.min50kCheckbox.checked = saved.min50k;
  if (typeof saved.hindiOnly === 'boolean') els.hindiOnlyCheckbox.checked = saved.hindiOnly;
  if (typeof saved.under60 === 'boolean') els.under60Checkbox.checked = saved.under60;

  if (saved.timeFilter) {
    const timeNode = document.querySelector(`input[name="timeFilter"][value="${saved.timeFilter}"]`);
    if (timeNode) timeNode.checked = true;
  }

  if (saved.sortBy) {
    const sortNode = document.querySelector(`input[name="sortBy"][value="${saved.sortBy}"]`);
    if (sortNode) sortNode.checked = true;
  }
}

function saveCurrentInputs() {
  state.backendUrl = els.backendUrlInput.value.trim();
  state.tiktokSession = els.tiktokSessionInput.value.trim();
  state.systemSessionId = els.systemSessionInput.value.trim();

  localStorage.setItem(STORAGE_KEYS.backendUrl, state.backendUrl);
  localStorage.setItem(STORAGE_KEYS.tiktokSession, state.tiktokSession);
  localStorage.setItem(STORAGE_KEYS.systemSessionId, state.systemSessionId);
}

function saveFilters() {
  const filters = {
    min50k: els.min50kCheckbox.checked,
    hindiOnly: els.hindiOnlyCheckbox.checked,
    under60: els.under60Checkbox.checked,
    timeFilter: getCheckedValue('timeFilter'),
    sortBy: getCheckedValue('sortBy')
  };
  localStorage.setItem(STORAGE_KEYS.filters, JSON.stringify(filters));
}

function autoConnectIfPossible() {
  if (!state.backendUrl) return;
  connectBackend(true);
}

async function connectBackend(isAuto = false) {
  saveCurrentInputs();
  const normalizedUrl = normalizeBackendUrl(state.backendUrl);
  if (!normalizedUrl) {
    setConnectionStatus(false);
    if (!isAuto) showToast('Invalid backend URL format', 'error');
    return;
  }

  state.backendUrl = normalizedUrl;
  els.backendUrlInput.value = normalizedUrl;
  localStorage.setItem(STORAGE_KEYS.backendUrl, normalizedUrl);

  els.connectBtn.disabled = true;
  els.connectBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Connecting';

  try {
    const response = await fetch(`${normalizedUrl}/api/health`);
    if (!response.ok) throw new Error('Health check failed');
    const data = await response.json();
    state.connected = true;
    state.currentDataSource = data.data_source || 'mock';
    setConnectionStatus(true, data.data_source);
    showToast(`Backend connected (${data.data_source} mode)`, 'success');
  } catch (error) {
    state.connected = false;
    setConnectionStatus(false);
    if (!isAuto) showToast('Cannot connect to backend. Check URL and try again.', 'error');
  } finally {
    els.connectBtn.disabled = false;
    els.connectBtn.innerHTML = '<i class="fa-solid fa-link mr-2"></i>Connect';
  }
}

function setConnectionStatus(online, dataSource = 'mock') {
  els.statusDot.classList.toggle('online', online);
  els.statusDot.classList.toggle('offline', !online);
  if (online) {
    els.statusText.textContent = dataSource === 'live' ? 'Online • Live' : 'Online • Mock';
  } else {
    els.statusText.textContent = 'Offline';
  }
}

function normalizeBackendUrl(value) {
  if (!value) return '';
  let url = value.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

function renderTopics() {
  els.topicsList.innerHTML = '';
  state.topics.forEach((topic) => {
    const button = document.createElement('button');
    button.className = `topic-chip ${state.activeTopics.has(topic) ? 'active' : ''}`;
    button.textContent = topic;
    button.addEventListener('click', () => toggleTopic(topic));
    els.topicsList.appendChild(button);
  });
}

function toggleTopic(topic) {
  if (state.activeTopics.has(topic)) {
    state.activeTopics.delete(topic);
  } else {
    state.activeTopics.add(topic);
  }
  renderTopics();
}

function addCustomTopic() {
  const topic = els.customTopicInput.value.trim();
  if (!topic) return;

  if (!state.topics.includes(topic)) {
    state.topics.unshift(topic);
  }
  state.activeTopics.add(topic);
  els.customTopicInput.value = '';
  renderTopics();
}

function renderHistory() {
  els.historyList.innerHTML = '';
  if (!state.searchHistory.length) {
    els.historyList.innerHTML = '<p class="text-slate-500 text-sm">No searches yet.</p>';
    return;
  }

  state.searchHistory.forEach((item) => {
    const button = document.createElement('button');
    button.className = 'history-chip w-full text-left';
    button.textContent = `• ${item}`;
    button.addEventListener('click', () => applyHistorySearch(item));
    els.historyList.appendChild(button);
  });
}

function applyHistorySearch(keywordString) {
  const terms = keywordString.split(',').map((item) => item.trim()).filter(Boolean);
  terms.forEach((term) => {
    if (!state.topics.includes(term)) state.topics.unshift(term);
    state.activeTopics.add(term);
  });
  renderTopics();
  searchTikTok(true);
}

function addToHistory(keywordString) {
  state.searchHistory = [keywordString, ...state.searchHistory.filter((item) => item !== keywordString)].slice(0, 10);
  localStorage.setItem(STORAGE_KEYS.searchHistory, JSON.stringify(state.searchHistory));
  renderHistory();
}

function clearHistory() {
  state.searchHistory = [];
  localStorage.removeItem(STORAGE_KEYS.searchHistory);
  renderHistory();
  showToast('Search history cleared', 'success');
}

function getCheckedValue(name) {
  const node = document.querySelector(`input[name="${name}"]:checked`);
  return node ? node.value : '';
}

function buildSearchPayload(countOverride = null) {
  const selectedTopics = Array.from(state.activeTopics);
  const fallback = selectedTopics.length ? selectedTopics : ['viral content'];
  const payload = {
    keywords: fallback.join(', '),
    time_filter: getCheckedValue('timeFilter') || '7d',
    sort_by: getCheckedValue('sortBy') || 'most_viral',
    min_views: els.min50kCheckbox.checked ? 50000 : 0,
    count: countOverride || state.lastCount || 12,
    language: els.hindiOnlyCheckbox.checked ? 'hi' : 'any',
    under_60s: els.under60Checkbox.checked
  };
  return payload;
}

async function searchTikTok(resetCount = true) {
  if (!state.connected) {
    showToast('Cannot connect to backend. Check URL and try again.', 'error');
    return;
  }

  saveCurrentInputs();
  saveFilters();

  if (resetCount) state.lastCount = 12;
  const payload = buildSearchPayload(state.lastCount);
  state.lastPayload = payload;

  renderLoadingSkeletons(6);
  els.resultsTitle.textContent = 'Searching TikTok...';
  els.resultsMeta.textContent = 'Fetching viral content for your selected topics.';

  try {
    const result = await fetchWithRetry(`${state.backendUrl}/api/search-tiktok`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await result.json();
    state.currentVideos = Array.isArray(data.videos) ? data.videos : [];
    state.currentDataSource = data.data_source || 'mock';
    addToHistory(payload.keywords);
    renderResults(data);
    await loadTrendingHashtags(payload.keywords);
  } catch (error) {
    renderEmptyState('Search failed. Try again.');
    if (String(error.message || '').includes('429')) {
      showToast('Too many requests. Please wait...', 'warning');
    } else {
      showToast('Search failed. Retrying did not succeed.', 'error');
    }
  }
}

async function fetchWithRetry(url, options, retryCount = 1) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${text}`);
    }
    return response;
  } catch (error) {
    if (retryCount > 0) {
      showToast('Search failed. Retrying...', 'warning');
      await wait(1000);
      return fetchWithRetry(url, options, retryCount - 1);
    }
    throw error;
  }
}

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (state.tiktokSession) {
    headers['x-tiktok-session-id'] = state.tiktokSession;
  }
  return headers;
}

function renderLoadingSkeletons(count) {
  els.resultsGrid.innerHTML = '';
  els.loadMoreBtn.classList.add('hidden');
  for (let i = 0; i < count; i += 1) {
    const wrapper = document.createElement('div');
    wrapper.className = 'video-card skeleton';
    wrapper.innerHTML = `
      <div class="skeleton-box" style="aspect-ratio: 9 / 14;"></div>
      <div class="p-4 space-y-3">
        <div class="skeleton-box h-5 w-3/4"></div>
        <div class="skeleton-box h-4 w-1/2"></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="skeleton-box h-14"></div>
          <div class="skeleton-box h-14"></div>
          <div class="skeleton-box h-14"></div>
          <div class="skeleton-box h-14"></div>
        </div>
      </div>
    `;
    els.resultsGrid.appendChild(wrapper);
  }
}

function renderResults(data) {
  const videos = data.videos || [];
  
  // FIXED: Proper keyword display
  const keywordText = typeof data.keywords === 'string' ? data.keywords : 'viral content';
  
  els.resultsTitle.textContent = `Found ${videos.length} videos`;
  els.resultsMeta.textContent = `${keywordText} • ${data.data_source === 'live' ? 'Live TikTok data' : 'Mock fallback data'}${data.cached ? ' • Cached' : ''}`;
  els.mockBanner.classList.toggle('hidden', data.data_source !== 'mock');

  if (!videos.length) {
    renderEmptyState('No videos found. Try different keywords.');
    destroyChart();
    return;
  }

  els.resultsGrid.innerHTML = '';
  videos.forEach((video) => {
    syncSelectionWithIncomingVideo(video);
    els.resultsGrid.appendChild(createVideoCard(video));
  });

  els.loadMoreBtn.classList.remove('hidden');
  updateResultsChart(videos);
  renderSelectedCount();
}

function syncSelectionWithIncomingVideo(video) {
  if (state.selectedVideoUrls.has(video.url)) {
    state.selectedVideoMap.set(video.url, video);
  }
}

function createVideoCard(video) {
  const isSelected = state.selectedVideoUrls.has(video.url);
  const card = document.createElement('article');
  card.className = `video-card ${isSelected ? 'selected' : ''}`;

  const hashtags = Array.isArray(video.hashtags) ? video.hashtags : [];
  const visibleTags = hashtags.slice(0, 3).join(' ');
  const extraCount = hashtags.length > 3 ? ` +${hashtags.length - 3} more` : '';

  card.innerHTML = `
    <div class="relative">
      <img class="video-thumb" src="${escapeHtml(video.thumbnail || '')}" alt="${escapeHtml(video.title || 'TikTok thumbnail')}" loading="lazy" onerror="this.src='https://picsum.photos/400/700'" />
      <div class="video-overlay"></div>

      <div class="badge-row">
        ${video.is_viral ? '<span class="badge viral"><i class="fa-solid fa-fire mr-1"></i>VIRAL</span>' : ''}
        ${video.is_trending ? '<span class="badge trending"><i class="fa-solid fa-chart-line mr-1"></i>TRENDING</span>' : ''}
      </div>

      <button class="select-toggle" type="button" title="Toggle selection">
        <i class="${isSelected ? 'fa-solid fa-check-square text-sky-300' : 'fa-regular fa-square'}"></i>
      </button>
    </div>

    <div class="video-content">
      <h3 class="font-bold text-lg leading-snug pr-12">${escapeHtml(truncate(video.title || 'Untitled', 95))}</h3>
      <div class="mt-2 text-sm text-slate-300 flex flex-wrap gap-x-3 gap-y-2">
        <span><i class="fa-regular fa-user mr-1 text-sky-300"></i>${escapeHtml(video.creator_username || '@creator')}</span>
        <span><i class="fa-regular fa-clock mr-1 text-cyan-300"></i>${escapeHtml(video.duration_label || '0:00')}</span>
        <span><i class="fa-regular fa-calendar mr-1 text-violet-300"></i>${escapeHtml(video.posted_label || 'recently')}</span>
      </div>

      <div class="meta-grid">
        <div class="meta-pill"><div class="text-xs text-slate-400">Views</div><div class="font-bold text-lg">${escapeHtml(video.views_label || formatCompactNumber(video.views || 0))}</div></div>
        <div class="meta-pill"><div class="text-xs text-slate-400">Engagement</div><div class="font-bold text-lg">${Number(video.engagement_rate || 0).toFixed(2)}%</div></div>
        <div class="meta-pill"><div class="text-xs text-slate-400">Likes</div><div class="font-bold text-lg">${escapeHtml(video.likes_label || formatCompactNumber(video.likes || 0))}</div></div>
        <div class="meta-pill"><div class="text-xs text-slate-400">Comments/Shares</div><div class="font-bold text-lg">${escapeHtml(video.comments_label || formatCompactNumber(video.comments || 0))} / ${escapeHtml(video.shares_label || formatCompactNumber(video.shares || 0))}</div></div>
      </div>

      <div class="mt-4 text-sm text-slate-300 space-y-2">
        <div><span class="text-slate-500">Tags:</span> ${escapeHtml(visibleTags || '#viral #content #finder')}${escapeHtml(extraCount)}</div>
        <div><span class="text-slate-500">Sound:</span> ${escapeHtml(truncate(video.music_name || 'Original Sound', 42))}</div>
      </div>

      <button class="preview-btn" type="button"><i class="fa-regular fa-eye mr-2"></i>Preview</button>
    </div>
  `;

  card.querySelector('.select-toggle').addEventListener('click', () => toggleVideoSelection(video, card));
  card.querySelector('.preview-btn').addEventListener('click', () => openPreviewModal(video));

  return card;
}

function toggleVideoSelection(video, card = null) {
  if (state.selectedVideoUrls.has(video.url)) {
    state.selectedVideoUrls.delete(video.url);
    state.selectedVideoMap.delete(video.url);
  } else {
    state.selectedVideoUrls.add(video.url);
    state.selectedVideoMap.set(video.url, video);
  }

  persistSelection();
  renderSelectedCount();

  if (card) {
    card.replaceWith(createVideoCard(video));
  } else {
    rerenderCurrentGrid();
  }
}

function persistSelection() {
  localStorage.setItem(STORAGE_KEYS.selectedVideos, JSON.stringify(Array.from(state.selectedVideoUrls)));
}

function renderSelectedCount() {
  const count = state.selectedVideoUrls.size;
  els.selectedCount.textContent = String(count);
}

function rerenderCurrentGrid() {
  const videos = [...state.currentVideos];
  els.resultsGrid.innerHTML = '';
  videos.forEach((video) => els.resultsGrid.appendChild(createVideoCard(video)));
}

function selectAllVisible() {
  state.currentVideos.forEach((video) => {
    state.selectedVideoUrls.add(video.url);
    state.selectedVideoMap.set(video.url, video);
  });
  persistSelection();
  renderSelectedCount();
  rerenderCurrentGrid();
  showToast(`${state.currentVideos.length} videos selected`, 'success');
}

function clearSelection() {
  state.selectedVideoUrls.clear();
  state.selectedVideoMap.clear();
  persistSelection();
  renderSelectedCount();
  rerenderCurrentGrid();
  showToast('Selection cleared', 'success');
}

async function loadTrendingHashtags(keywordString) {
  if (!state.connected) return;
  try {
    const response = await fetch(`${state.backendUrl}/api/get-trending-hashtags`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        niche: keywordString,
        language: els.hindiOnlyCheckbox.checked ? 'hi' : 'any'
      })
    });
    if (!response.ok) throw new Error('Failed hashtags');
    const data = await response.json();
    renderHashtags(data.hashtags || []);
  } catch {
    renderHashtags([]);
  }
}

function renderHashtags(hashtags) {
  els.hashtagsWrap.innerHTML = '';
  if (!hashtags.length) {
    els.hashtagsWrap.innerHTML = '<p class="text-slate-500 text-sm">No hashtags available yet.</p>';
    return;
  }

  hashtags.forEach((tag) => {
    const span = document.createElement('button');
    span.className = 'hash-chip';
    span.textContent = tag;
    span.addEventListener('click', () => {
      const clean = tag.replace('#', '');
      if (!state.topics.includes(clean)) state.topics.unshift(clean);
      state.activeTopics.add(clean);
      renderTopics();
    });
    els.hashtagsWrap.appendChild(span);
  });
}

async function sendToAgent3() {
  if (!state.selectedVideoUrls.size) {
    showToast('Select at least 1 video before sending to Agent 3.', 'warning');
    return;
  }

  if (!state.connected) {
    showToast('Backend offline. Reconnect and try again.', 'error');
    return;
  }

  const videos = Array.from(state.selectedVideoUrls)
    .map((url) => state.selectedVideoMap.get(url))
    .filter(Boolean);

  if (!videos.length) {
    showToast('Refresh search results so selected video details can be sent.', 'warning');
    return;
  }

  els.sendToAgent3Btn.disabled = true;
  els.sendToAgent3Btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Sending';

  try {
    const response = await fetch(`${state.backendUrl}/api/prepare-for-agent3`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        session_id: els.systemSessionInput.value.trim() || null,
        videos
      })
    });

    if (!response.ok) throw new Error('Prepare failed');
    const data = await response.json();
    state.lastBatchId = data.batch_id;
    localStorage.setItem(STORAGE_KEYS.agent3BatchId, data.batch_id);
    els.batchInfo.textContent = `Batch ready for Agent 3: ${data.batch_id}`;
    showToast(`${data.video_count} videos ready for Agent 3!`, 'success');
  } catch {
    showToast('Could not prepare selected videos for Agent 3.', 'error');
  } finally {
    els.sendToAgent3Btn.disabled = false;
    els.sendToAgent3Btn.innerHTML = '<i class="fa-solid fa-arrow-right mr-2"></i>Send to Agent 3';
  }
}

function updateResultsChart(videos) {
  const topVideos = videos.slice(0, 6);
  const labels = topVideos.map((_, index) => `${index + 1}`);
  const views = topVideos.map((video) => Number(video.views || 0));
  const engagement = topVideos.map((video) => Number(video.engagement_rate || 0));

  destroyChart();
  
  // FIXED: Check if canvas exists and Chart is available
  if (!els.viewsChart || typeof Chart === 'undefined') return;
  
  state.chart = new Chart(els.viewsChart, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Views',
          data: views,
          borderRadius: 12,
          backgroundColor: 'rgba(56, 189, 248, 0.72)'
        },
        {
          label: 'Engagement %',
          data: engagement,
          type: 'line',
          borderColor: 'rgba(244, 114, 182, 1)',
          backgroundColor: 'rgba(244, 114, 182, 0.2)',
          tension: 0.35,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#cbd5e1' }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: {
            color: '#94a3b8',
            // FIXED: Safe formatCompact call
            callback: (value) => formatCompactNumber(value)
          }
        },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            color: '#f9a8d4',
            callback: (value) => `${value}%`
          }
        }
      }
    }
  });
}

function destroyChart() {
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }
}

function renderEmptyState(message) {
  els.resultsGrid.innerHTML = `
    <div class="empty-state md:col-span-2 2xl:col-span-3">
      <div class="text-3xl mb-3">🎯</div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  els.loadMoreBtn.classList.add('hidden');
}

function clearSearchState() {
  state.currentVideos = [];
  state.lastPayload = null;
  state.lastCount = 12;
  els.mockBanner.classList.add('hidden');
  els.resultsTitle.textContent = 'Found 0 videos';
  els.resultsMeta.textContent = 'Filters reset. Ready for a new search.';
  renderEmptyState('Search cleared. Choose topics and click search.');
  renderHashtags([]);
  destroyChart();
}

function loadMoreResults() {
  if (!state.lastPayload) {
    showToast('Run a search first before loading more results.', 'warning');
    return;
  }
  state.lastCount += 12;
  searchTikTok(false);
}

function openPreviewModal(video) {
  const isMock = String(video.id || '').startsWith('mock_');
  const embedHtml = isMock
    ? `
      <div class="grid md:grid-cols-[260px_minmax(0,1fr)] gap-6 items-start">
        <img src="${escapeHtml(video.thumbnail || '')}" alt="${escapeHtml(video.title || 'Video')}" class="rounded-2xl w-full max-w-[260px] aspect-[9/14] object-cover border border-slate-700" onerror="this.src='https://picsum.photos/260/400'" />
        <div>
          <p class="text-xs uppercase tracking-[0.25em] text-slate-400">Preview</p>
          <h3 class="text-2xl font-bold mt-2">${escapeHtml(video.title || 'Untitled')}</h3>
          <div class="mt-4 space-y-2 text-slate-300">
            <p><strong>Creator:</strong> ${escapeHtml(video.creator_username || 'N/A')}</p>
            <p><strong>Views:</strong> ${escapeHtml(video.views_label || formatCompactNumber(video.views || 0))}</p>
            <p><strong>Likes:</strong> ${escapeHtml(video.likes_label || formatCompactNumber(video.likes || 0))}</p>
            <p><strong>Sound:</strong> ${escapeHtml(video.music_name || 'Original Sound')}</p>
            <p><strong>Posted:</strong> ${escapeHtml(video.posted_label || 'recently')}</p>
          </div>
          <a href="${escapeHtml(video.url || '#')}" target="_blank" rel="noopener noreferrer" class="primary-btn inline-block mt-6">Open TikTok Link</a>
        </div>
      </div>
    `
    : `
      <iframe class="preview-frame" src="https://www.tiktok.com/embed/v2/${encodeURIComponent(video.id)}" allowfullscreen></iframe>
      <div class="mt-4 flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h3 class="text-xl font-bold">${escapeHtml(video.title || 'Untitled')}</h3>
          <p class="text-slate-400 mt-1">${escapeHtml(video.creator_username || '')} • ${escapeHtml(video.posted_label || '')}</p>
        </div>
        <a href="${escapeHtml(video.url || '#')}" target="_blank" rel="noopener noreferrer" class="secondary-btn">Open in TikTok</a>
      </div>
    `;

  els.previewContent.innerHTML = embedHtml;
  els.previewModal.classList.remove('hidden');
}

function closePreviewModal() {
  els.previewModal.classList.add('hidden');
  els.previewContent.innerHTML = '';
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<div class="font-semibold text-slate-100">${escapeHtml(message)}</div>`;
  els.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// FIXED: Renamed to avoid conflict
function formatCompactNumber(value) {
  const number = Number(value || 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return `${number}`;
}

function truncate(text, max) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
