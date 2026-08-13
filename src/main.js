import { FARM_STATS, runSimulation, compactAggregateHistory } from './logic.js';

let sessionId = sessionStorage.getItem('sessionId');
if (!sessionId) {
  sessionId = Math.floor(100000 + Math.random() * 900000).toString();
  sessionStorage.setItem('sessionId', sessionId);
}
document.getElementById('session-id').textContent = sessionId;

// State
let farms = []; // Array of levels (0-5)

// DOM Elements
const farmsContainer = document.getElementById('farms-container');
const farmCountSpan = document.getElementById('farm-count');
const addFarmBtn = document.getElementById('add-farm-btn');
const clearFarmsBtn = document.getElementById('clear-farms-btn');
const runBtn = document.getElementById('run-btn');

// Inputs
const modeSelect = document.getElementById('mode-select');
const playersSelect = document.getElementById('players-select');
const startWaveIn = document.getElementById('start-wave');
const targetWaveIn = document.getElementById('target-wave');
const startCashIn = document.getElementById('start-cash');
const targetCashIn = document.getElementById('target-cash');
const waveRewardsActive = document.getElementById('wave-rewards-active');

// Results
const resTotalIncome = document.getElementById('res-total-income');
const resPureCash = document.getElementById('res-pure-cash');
const resMaxWealth = document.getElementById('res-max-wealth');
const actionPlanContainer = document.getElementById('action-plan-container');

// Rolling Numbers Animation
function animateValue(obj, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = '$' + Math.floor(progress * (end - start) + start).toLocaleString();
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

function renderFarms() {
  farmsContainer.innerHTML = '';
  farmCountSpan.textContent = farms.length;

  if (farms.length >= 10) {
    addFarmBtn.disabled = true;
    addFarmBtn.style.opacity = '0.5';
  } else {
    addFarmBtn.disabled = false;
    addFarmBtn.style.opacity = '1';
  }

  farms.forEach((lvl, idx) => {
    const card = document.createElement('div');
    card.className = 'farm-card';
    card.innerHTML = `
      <button class="farm-remove" data-idx="${idx}">×</button>
      <div class="farm-lvl">Lvl ${lvl}</div>
      <div class="farm-inc">+$${FARM_STATS[lvl].inc}/wave</div>
    `;
    farmsContainer.appendChild(card);
  });

  // Attach remove listeners
  document.querySelectorAll('.farm-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      farms.splice(idx, 1);
      renderFarms();
    });
  });
}

addFarmBtn.addEventListener('click', () => {
  if (farms.length < 10) {
    farms.push(0);
    renderFarms();
  }
});

clearFarmsBtn.addEventListener('click', () => {
  farms = [];
  renderFarms();
});

runBtn.addEventListener('click', () => {
  const startWave = parseInt(startWaveIn.value);
  const targetWave = parseInt(targetWaveIn.value);
  const startCash = parseInt(startCashIn.value);
  const targetCash = parseInt(targetCashIn.value);
  const isRewards = waveRewardsActive.checked;
  // Stub for wave rewards data, could be expanded based on mode
  const dummyRewardsData = Array(100).fill(100);

  const result = runSimulation(
    startWave, targetWave, startCash, targetCash,
    farms, isRewards, dummyRewardsData
  );

  // Animate Results
  animateValue(resTotalIncome, 0, result.totalIncomeGenerated, 1000);
  animateValue(resPureCash, 0, result.pureCash, 1000);
  animateValue(resMaxWealth, 0, result.maxWealth, 1000);

  // Render Action Plan
  const aggregated = compactAggregateHistory(result.history);
  actionPlanContainer.innerHTML = '';

  if (aggregated.length === 0) {
    actionPlanContainer.innerHTML = '<div class="action-row">No actions needed.</div>';
    return;
  }

  aggregated.forEach(item => {
    const row = document.createElement('div');
    row.className = `action-row ${item.isWait ? 'wait' : ''}`;
    row.innerHTML = `
      <div class="wave-num">W ${item.waveText}</div>
      <div class="action-desc">${item.actionText}</div>
      <div class="action-cash">$${item.endCash.toLocaleString()}</div>
    `;
    actionPlanContainer.appendChild(row);
  });
});

// Load preset data into UI
export function loadPreset(preset) {
  if (preset.mode) modeSelect.value = preset.mode;
  if (preset.players) playersSelect.value = preset.players;
  if (preset.startWave !== undefined) startWaveIn.value = preset.startWave;
  if (preset.targetWave !== undefined) targetWaveIn.value = preset.targetWave;
  if (preset.startCash !== undefined) startCashIn.value = preset.startCash;
  if (preset.targetCash !== undefined) targetCashIn.value = preset.targetCash;
  if (preset.initialFarms) farms = [...preset.initialFarms];
  if (preset.isWaveRewardsActive !== undefined) waveRewardsActive.checked = preset.isWaveRewardsActive;
  // No skill tree is permanently locked, but we acknowledge it

  renderFarms();

  // Flash UI to indicate load
  document.body.style.transition = 'background-color 0.3s';
  document.body.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
  setTimeout(() => {
    document.body.style.backgroundColor = '';
  }, 300);
}

// --- Authentication ---
const loginBtn = document.getElementById('login-btn');
const loginModal = document.getElementById('login-modal');
const closeLoginBtn = document.querySelector('.close-login-btn');
const fastLoginBtn = document.getElementById('fast-login-btn');
const loginStatus = document.getElementById('login-status');
let BOT_USERNAME = null;
fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/bot_info`)
  .then(r => r.json())
  .then(data => BOT_USERNAME = data.username)
  .catch(console.error);

loginBtn.onclick = () => loginModal.style.display = 'block';
closeLoginBtn.onclick = () => loginModal.style.display = 'none';

fastLoginBtn.onclick = () => {
  if (!BOT_USERNAME) {
      showToast('Bot username not loaded yet');
      return;
  }
  loginStatus.style.display = 'block';
  // Opens Telegram deeplink
  window.open(`https://t.me/${BOT_USERNAME}?start=${sessionId}`, '_blank');
};

// --- Community Modal & API ---
const communityBtn = document.getElementById('community-btn');
const communityModal = document.getElementById('community-modal');
const closeBtn = document.querySelector('.close-btn');

const tabBrowse = document.getElementById('tab-browse');
const tabPublish = document.getElementById('tab-publish');
const browseSection = document.getElementById('browse-section');
const publishSection = document.getElementById('publish-section');

const tabFavorites = document.getElementById('tab-favorites');
const tabMyPresets = document.getElementById('tab-my-presets');
const tabProfile = document.getElementById('tab-profile');
const favoritesSection = document.getElementById('favorites-section');
const myPresetsSection = document.getElementById('my-presets-section');
const profileSection = document.getElementById('profile-section');
const favoritesList = document.getElementById('favorites-list');
const myPresetsList = document.getElementById('my-presets-list');
const profileStats = document.getElementById('profile-stats');

let currentUserId = null; // Will be set on auth_success

const filterMode = document.getElementById('filter-mode');
const presetsList = document.getElementById('presets-list');

const publishSubmitBtn = document.getElementById('publish-submit-btn');
const presetTitleIn = document.getElementById('preset-title');
const authorNameIn = document.getElementById('author-name');
const publishStatus = document.getElementById('publish-status');

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const MODE_ICONS = {
  "Easy": "https://static.wikia.nocookie.net/tower-defense-sim/images/8/87/EasyReworkIcon.png",
  "Casual": "https://static.wikia.nocookie.net/tower-defense-sim/images/0/02/GraveDiggerEasyIcon.png",
  "Intermediate": "https://static.wikia.nocookie.net/tower-defense-sim/images/9/96/PatientZeroIntermediateIcon.png",
  "Molten": "https://static.wikia.nocookie.net/tower-defense-sim/images/7/7f/MoltenBossMoltenIcon.png",
  "Fallen": "https://static.wikia.nocookie.net/tower-defense-sim/images/1/1c/FallenReworkIcon.png",
  "Frost": "https://static.wikia.nocookie.net/tower-defense-sim/images/e/ec/FrostModeIcon.png",
  "Hardcore": "https://static.wikia.nocookie.net/tower-defense-sim/images/d/dd/Hardcore2026Icon.png",
  "Voidcore": "https://static.wikia.nocookie.net/tower-defense-sim/images/9/94/VoidcoreIcon.png",
  "Pizza Party": "https://static.wikia.nocookie.net/tower-defense-sim/images/9/96/PizzaPartyIconNew.png",
  "Badlands II": "https://static.wikia.nocookie.net/tower-defense-sim/images/7/78/BadlandsIIIconNew.png",
  "Polluted Wasteland II": "https://static.wikia.nocookie.net/tower-defense-sim/images/b/bd/PollutedWastelandIIIconNew.png"
};

// Modal toggles
communityBtn.onclick = () => {
  communityModal.style.display = 'block';
  fetchPresets();
};
closeBtn.onclick = () => communityModal.style.display = 'none';
window.onclick = (event) => {
  if (event.target === communityModal) {
    communityModal.style.display = 'none';
  }
};


tabBrowse.onclick = () => switchTab('browse');
tabPublish.onclick = () => switchTab('publish');
tabFavorites.onclick = () => switchTab('favorites');
tabMyPresets.onclick = () => switchTab('my-presets');
tabProfile.onclick = () => switchTab('profile');

function switchTab(tab) {
  const tabs = {
    'browse': { btn: tabBrowse, sec: browseSection },
    'publish': { btn: tabPublish, sec: publishSection },
    'favorites': { btn: tabFavorites, sec: favoritesSection },
    'my-presets': { btn: tabMyPresets, sec: myPresetsSection },
    'profile': { btn: tabProfile, sec: profileSection }
  };

  for (let k in tabs) {
    tabs[k].btn.classList.remove('active');
    tabs[k].sec.classList.remove('active');
  }

  tabs[tab].btn.classList.add('active');
  tabs[tab].sec.classList.add('active');

  // A small delay to allow display:block to apply before changing opacity for transition
  setTimeout(() => {
    tabs[tab].sec.classList.add('active');
  }, 10);

  if (tab === 'publish') {
    publishStatus.textContent = '';
  } else if (tab === 'favorites') {
    fetchFavorites();
  } else if (tab === 'my-presets') {
    fetchMyPresets();
  } else if (tab === 'profile') {
    fetchProfile();
  }
}

filterMode.onchange = fetchPresets;

async function fetchPresets() {
  presetsList.innerHTML = `
    <div class="preset-card skeleton" style="height: 80px; margin-bottom: 1rem;"></div>
    <div class="preset-card skeleton" style="height: 80px; margin-bottom: 1rem;"></div>
    <div class="preset-card skeleton" style="height: 80px;"></div>
  `;
  try {
    // We update this fetch to just do mode for now, but in the bot we'll do search/players.
    // Wait, the API could support players/search if needed, but the web UI filter only has Mode.
    // Let's add basic players support to web UI just in case? Or leave web UI as Mode. The bot needs the rich filtering.
    const res = await fetch(`${API_URL}/api/presets?mode=${filterMode.value}`);
    if (!res.ok) throw new Error('Failed to fetch presets');
    const presets = await res.json();

    presetsList.innerHTML = '';
    if (presets.length === 0) {
      presetsList.innerHTML = '<p>No presets found.</p>';
      return;
    }

    presets.forEach(p => {
      const iconUrl = MODE_ICONS[p.mode] || MODE_ICONS["Easy"];
      const card = document.createElement('div');
      card.className = 'preset-card';
      card.innerHTML = `
        <div class="preset-info" style="flex-grow: 1;">
          <img src="${iconUrl}" alt="${p.mode}" class="preset-icon" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\'/>'"/>
          <div class="preset-details">
            <h3 class="safe-title"></h3>
            <p>${p.mode} | ${p.players}P</p>
            <div class="social-actions" style="display:flex; gap: 0.5rem; margin-top: 0.25rem;">
               <button class="secondary-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="interactPreset(${p.id}, 'like', event)">👍 ${p.likes || 0}</button>
               <button class="secondary-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="interactPreset(${p.id}, 'dislike', event)">👎</button>
               <button class="secondary-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="interactPreset(${p.id}, 'favorite', event)">⭐ Save</button>
               <button class="danger-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="reportPreset(${p.id}, event)">⚠️ Report</button>
            </div>
          </div>
        </div>
        <button class="primary-btn" style="width: auto; height: fit-content;" onclick="requestLoadPreset(${p.id})">Load</button>
      `;
      card.querySelector('.safe-title').textContent = p.title;
      presetsList.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    presetsList.innerHTML = '<p>Error loading presets.</p>';
  }
}

function renderPresetCard(p, container) {
  const iconUrl = MODE_ICONS[p.mode] || MODE_ICONS["Easy"];
  const card = document.createElement('div');
  card.className = 'preset-card';
  card.innerHTML = `
    <div class="preset-info" style="flex-grow: 1;">
      <img src="${iconUrl}" alt="${p.mode}" class="preset-icon" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\'/>'"/>
      <div class="preset-details">
        <h3 class="safe-title"></h3>
        <p>${p.mode} | ${p.players}P | Автор: ${p.author || 'Anonymous'}</p>
        <div class="social-actions" style="display:flex; gap: 0.5rem; margin-top: 0.25rem;">
           <button class="secondary-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="interactPreset(${p.id}, 'like', event)">👍 ${p.likes || 0}</button>
           <button class="secondary-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="interactPreset(${p.id}, 'dislike', event)">👎</button>
           <button class="secondary-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="interactPreset(${p.id}, 'favorite', event)">⭐ Save</button>
           <button class="danger-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="reportPreset(${p.id}, event)">⚠️ Report</button>
        </div>
      </div>
    </div>
    <button class="primary-btn" style="width: auto; height: fit-content;" onclick="requestLoadPreset(${p.id})">Load</button>
  `;
  card.querySelector('.safe-title').textContent = p.title;
  container.appendChild(card);
}

async function fetchFavorites() {
  if (!currentUserId) {
    favoritesList.innerHTML = '<p>Пожалуйста, войдите в систему (Sign In), чтобы увидеть избранное.</p>';
    return;
  }
  favoritesList.innerHTML = '<div class="preset-card skeleton" style="height: 80px;"></div>';
  try {
    const res = await fetch(`${API_URL}/api/favorites?user_id=${currentUserId}`);
    if (!res.ok) throw new Error('Failed to fetch favorites');
    const presets = await res.json();
    favoritesList.innerHTML = '';
    if (presets.length === 0) {
      favoritesList.innerHTML = '<p>У вас пока нет избранных пресетов.</p>';
      return;
    }
    presets.forEach(p => renderPresetCard(p, favoritesList));
  } catch (err) {
    console.error(err);
    favoritesList.innerHTML = '<p>Ошибка загрузки избранного.</p>';
  }
}

async function fetchMyPresets() {
  if (!currentUserId) {
    myPresetsList.innerHTML = '<p>Пожалуйста, войдите в систему (Sign In), чтобы увидеть свои пресеты.</p>';
    return;
  }
  myPresetsList.innerHTML = '<div class="preset-card skeleton" style="height: 80px;"></div>';
  try {
    const res = await fetch(`${API_URL}/api/my_presets?user_id=${currentUserId}`);
    if (!res.ok) throw new Error('Failed to fetch my presets');
    const presets = await res.json();
    myPresetsList.innerHTML = '';
    if (presets.length === 0) {
      myPresetsList.innerHTML = '<p>Вы еще не опубликовали ни одного пресета.</p>';
      return;
    }
    presets.forEach(p => renderPresetCard(p, myPresetsList));
  } catch (err) {
    console.error(err);
    myPresetsList.innerHTML = '<p>Ошибка загрузки ваших пресетов.</p>';
  }
}

async function fetchProfile() {
  if (!currentUserId) {
    profileStats.innerHTML = '<p>Пожалуйста, войдите в систему (Sign In), чтобы увидеть свой профиль.</p>';
    return;
  }
  profileStats.innerHTML = '<p>Загрузка...</p>';
  try {
    const res = await fetch(`${API_URL}/api/profile?user_id=${currentUserId}`);
    if (!res.ok) throw new Error('Failed to fetch profile');
    const data = await res.json();
    profileStats.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Имя пользователя</div>
        <div class="stat-value accent-text">@${data.username || 'Unknown'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Опубликовано пресетов</div>
        <div class="stat-value accent-text">${data.created || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Одобрено модерацией</div>
        <div class="stat-value accent-text">${data.approved || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Всего лайков</div>
        <div class="stat-value accent-text">${data.total_likes || 0}</div>
      </div>
    `;
  } catch (err) {
    console.error(err);
    profileStats.innerHTML = '<p>Ошибка загрузки профиля.</p>';
  }
}

window.interactPreset = async (presetId, action, event) => {
  event.stopPropagation();
  try {
    const res = await fetch(`${API_URL}/api/interact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset_id: presetId, action: action, user_id: currentUserId || 0 })
    });
    if (res.ok) {
      // Show toast
      showToast(action === 'like' ? 'Лайк поставлен!' : 'Пресет сохранен!');
      if (action === 'like') fetchPresets(); // refresh likes
    }
  } catch(e) {
    console.error(e);
  }
};

window.reportPreset = async (presetId, event) => {
  event.stopPropagation();
  const reason = prompt("Причина жалобы (например, Нереализуемый билд, Спам):");
  if (!reason) return;

  try {
    const res = await fetch(`${API_URL}/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset_id: presetId, reason })
    });
    if (res.ok) {
      showToast('Жалоба отправлена модераторам');
    }
  } catch(e) {
    console.error(e);
  }
};

// Toast Notification
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed; bottom:20px; right:20px; background:rgba(0,0,0,0.8); color:#fff; padding:10px 20px; border-radius:8px; z-index:9999; border:1px solid var(--border-color); backdrop-filter: blur(10px); transition: opacity 0.3s; opacity:0;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

// In a real app we'd load by ID from backend, but since the bot handles it or we can just fetch it here.
// Let's pretend the bot does the push when we tell the backend to load it to our session.
window.requestLoadPreset = async (presetId) => {
  alert(`To load this preset, go to the Telegram bot and click Load or type the session ID ${sessionId}`);
  // If we wanted to load it directly, we'd add an endpoint for it.
};

publishSubmitBtn.onclick = async () => {
  const title = presetTitleIn.value.trim();
  if (!title) {
    publishStatus.textContent = 'Title is required!';
    publishStatus.style.color = 'var(--danger-color)';
    return;
  }

  publishSubmitBtn.disabled = true;
  publishStatus.textContent = 'Submitting...';
  publishStatus.style.color = 'var(--text-primary)';

  const presetData = {
    mode: modeSelect.value,
    players: playersSelect.value,
    startWave: parseInt(startWaveIn.value),
    targetWave: parseInt(targetWaveIn.value),
    startCash: parseInt(startCashIn.value),
    targetCash: parseInt(targetCashIn.value),
    initialFarms: [...farms],
    isWaveRewardsActive: waveRewardsActive.checked,
    noSkillTree: true
  };

  try {
    const res = await fetch(`${API_URL}/api/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        mode: modeSelect.value,
        players: playersSelect.value,
        username: authorNameIn.value.trim() || 'Anonymous',
        presetData,
        user_id: currentUserId
      })
    });

    if (!res.ok) throw new Error('Submission failed');

    publishStatus.textContent = 'Success! Preset submitted for moderation.';
    publishStatus.style.color = 'var(--accent-color)';
    presetTitleIn.value = '';
  } catch (err) {
    console.error(err);
    publishStatus.textContent = 'Error submitting preset.';
    publishStatus.style.color = 'var(--danger-color)';
  } finally {
    publishSubmitBtn.disabled = false;
  }
};


// Initial render
renderFarms();

// --- WebSocket Connection ---
function connectWebSocket() {
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Connected to WS');
    // Register session
    ws.send(JSON.stringify({ type: 'register', sessionId: sessionId }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'load_preset' && data.preset) {
        loadPreset(data.preset);
      } else if (data.type === 'auth_success') {
        loginModal.style.display = 'none';
        loginBtn.textContent = 'Profile';
        showToast('Успешный вход!');
        currentUserId = data.user_id;
        // Fetch new lists if tabs are open
        if (favoritesSection.classList.contains('active')) fetchFavorites();
        if (myPresetsSection.classList.contains('active')) fetchMyPresets();
        if (profileSection.classList.contains('active')) fetchProfile();
      }
    } catch (e) {
      console.error('Error parsing WS message', e);
    }
  };

  ws.onclose = () => {
    console.log('WS disconnected. Reconnecting in 3s...');
    setTimeout(connectWebSocket, 3000);
  };
}

connectWebSocket();