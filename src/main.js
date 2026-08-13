import { FARM_STATS, runSimulation, compactAggregateHistory } from './logic.js';

// --- Background Canvas ---
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let width, height;
let leaves = [];
let mouseX = -1000;
let mouseY = -1000;

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

window.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});
window.addEventListener('touchmove', e => {
    if (e.touches.length > 0) {
        mouseX = e.touches[0].clientX;
        mouseY = e.touches[0].clientY;
    }
});

class Leaf {
    constructor() {
        this.reset();
        this.y = Math.random() * height; // initial random spread
    }
    reset() {
        this.x = Math.random() * width;
        this.y = -20;
        this.size = Math.random() * 8 + 4;
        this.speedY = Math.random() * 0.5 + 0.2;
        this.speedX = Math.random() * 0.4 - 0.2;
        this.angle = Math.random() * Math.PI * 2;
        this.spin = Math.random() * 0.02 - 0.01;
        this.opacity = Math.random() * 0.3 + 0.1;
    }
    update() {
        this.y += this.speedY;
        this.x += this.speedX + Math.sin(this.y * 0.01) * 0.5;
        this.angle += this.spin;

        // Interaction
        let dx = mouseX - this.x;
        let dy = mouseY - this.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 120) {
            let force = (120 - dist) / 120;
            // Smooth repulsion
            this.x -= (dx / dist) * force * 2;
            this.y -= (dy / dist) * force * 2;
            this.spin += (Math.random() - 0.5) * force * 0.1;
        }

        if (this.y > height + 20 || this.x < -20 || this.x > width + 20) {
            this.reset();
        }
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = `rgba(16, 185, 129, ${this.opacity})`;
        ctx.beginPath();
        // Realistic leaf shape
        ctx.beginPath();
        ctx.moveTo(this.size, 0);
        ctx.bezierCurveTo(this.size, this.size/2, this.size/2, this.size, 0, this.size);
        ctx.bezierCurveTo(-this.size/2, this.size, -this.size, this.size/2, -this.size, 0);
        ctx.bezierCurveTo(-this.size, -this.size/2, -this.size/2, -this.size, 0, -this.size);
        ctx.bezierCurveTo(this.size/2, -this.size, this.size, -this.size/2, this.size, 0);

        let grad = ctx.createLinearGradient(-this.size, -this.size, this.size, this.size);
        grad.addColorStop(0, `rgba(16, 185, 129, ${this.opacity})`);
        grad.addColorStop(1, `rgba(6, 95, 70, ${this.opacity})`);
        ctx.fillStyle = grad;
        ctx.fill();

        // Leaf vein
        ctx.beginPath();
        ctx.moveTo(-this.size*0.8, 0);
        ctx.lineTo(this.size*0.8, 0);
        ctx.strokeStyle = `rgba(255, 255, 255, ${this.opacity * 0.5})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }
}

for (let i = 0; i < 40; i++) leaves.push(new Leaf());

function animateCanvas() {
    ctx.clearRect(0, 0, width, height);
    leaves.forEach(l => {
        l.update();
        l.draw();
    });
    requestAnimationFrame(animateCanvas);
}
animateCanvas();

// --- Drawers Logic ---
const overlay = document.getElementById('drawerOverlay');
const settingsDrawer = document.getElementById('settingsDrawer');
const rewardsDrawer = document.getElementById('rewardsDrawer');
const libraryDrawer = document.getElementById('libraryDrawer');

function openDrawer(drawer) {
    overlay.classList.add('active');
    drawer.classList.add('active');
}

function closeAllDrawers() {
    overlay.classList.remove('active');
    settingsDrawer.classList.remove('active');
    rewardsDrawer.classList.remove('active');
    libraryDrawer.classList.remove('active');
}

document.getElementById('btnOpenSettingsDrawer').onclick = () => openDrawer(settingsDrawer);
document.getElementById('btnOpenRewardsDrawer').onclick = () => openDrawer(rewardsDrawer);
document.getElementById('btnOpenLibraryDrawer').onclick = () => openDrawer(libraryDrawer);

document.getElementById('btnCloseSettingsDrawer').onclick = closeAllDrawers;
document.getElementById('btnCloseRewardsDrawer').onclick = closeAllDrawers;
document.getElementById('btnCloseLibraryDrawer').onclick = closeAllDrawers;
overlay.onclick = closeAllDrawers;

// --- Custom Inputs ---
window.adjustVal = (id, delta) => {
    let el = document.getElementById(id);
    let v = parseInt(el.value) + delta;
    if (v < parseInt(el.min)) v = parseInt(el.min);
    if (el.max && v > parseInt(el.max)) v = parseInt(el.max);
    el.value = v;
    if (id === 'inpModeWaves') renderWaveGrid();
};

window.addVal = (id, amt) => {
    let el = document.getElementById(id);
    let v = parseInt(el.value) + amt;
    if (v < parseInt(el.min)) v = parseInt(el.min);
    el.value = v;
};

// Custom Dropdowns
function initCustomDropdown(dropdown) {
    const selected = dropdown.querySelector('.dropdown-selected');
    const text = selected.querySelector('.selected-text');
    const list = dropdown.querySelector('.dropdown-list');

    selected.onclick = (e) => {
        e.stopPropagation();
        // Close others
        document.querySelectorAll('.custom-dropdown').forEach(d => {
            if (d !== dropdown) d.classList.remove('open');
        });
        dropdown.classList.toggle('open');
    };

    list.querySelectorAll('li').forEach(item => {
        item.onclick = () => {
            text.textContent = item.textContent;
            dropdown.setAttribute('data-value', item.getAttribute('data-value'));
            dropdown.classList.remove('open');
            // Trigger change event logic if needed
            if (dropdown.id === 'dropdownCatalogFilter') fetchCommunityPresets();
        };
    });
}

document.querySelectorAll('.custom-dropdown').forEach(initCustomDropdown);
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('open'));
});

// Custom Toggles
document.querySelectorAll('.custom-toggle:not(.locked)').forEach(toggle => {
    toggle.onclick = () => {
        let isActive = toggle.getAttribute('data-active') === 'true';
        toggle.setAttribute('data-active', !isActive);
    };
});

// --- Wave Rewards Grid ---
const waveGridContainer = document.getElementById('waveGridContainer');
const inpModeWaves = document.getElementById('inpModeWaves');
let waveRewardsData = Array(100).fill(0);

function renderWaveGrid() {
    let count = parseInt(inpModeWaves.value);
    if (count < 1) count = 1;
    if (count > 100) count = 100;

    waveGridContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
        let cell = document.createElement('div');
        cell.className = 'wave-cell';
        cell.innerHTML = `
            <div class="wave-cell-num">W${i+1}</div>
            <input type="number" class="wave-cell-val" data-idx="${i}" value="${waveRewardsData[i] || 0}" min="0">
        `;
        waveGridContainer.appendChild(cell);
    }

    waveGridContainer.querySelectorAll('.wave-cell-val').forEach(inp => {
        inp.onchange = (e) => {
            let idx = parseInt(e.target.getAttribute('data-idx'));
            waveRewardsData[idx] = parseInt(e.target.value) || 0;
        };
    });
}
inpModeWaves.onchange = renderWaveGrid;
renderWaveGrid();

// --- Local Presets Logic ---
function loadLocalPresetsList() {
    const list = document.getElementById('listLocalPresets');
    list.innerHTML = '';

    let presets = {};
    try {
        presets = JSON.parse(localStorage.getItem('tdsLocalPresets')) || {};
    } catch(e) {}

    const keys = Object.keys(presets);
    if (keys.length === 0) {
        document.getElementById('dropdownLocalPresets').querySelector('.selected-text').textContent = "Нет сохраненных пресетов";
        document.getElementById('dropdownLocalPresets').setAttribute('data-value', '');
        return;
    }

    keys.forEach(k => {
        let li = document.createElement('li');
        li.setAttribute('data-value', k);
        li.textContent = k;
        list.appendChild(li);
    });

    // re-init dropdown logic for dynamic items
    initCustomDropdown(document.getElementById('dropdownLocalPresets'));
}

document.getElementById('btnSavePresetLocally').onclick = () => {
    const name = document.getElementById('inpPresetName').value.trim();
    if (!name) { showToast("Введите название пресета!"); return; }

    let presets = {};
    try { presets = JSON.parse(localStorage.getItem('tdsLocalPresets')) || {}; } catch(e) {}

    presets[name] = {
        mode: document.getElementById('dropdownMode').getAttribute('data-value'),
        players: document.getElementById('dropdownPlayers').getAttribute('data-value'),
        waves: parseInt(inpModeWaves.value),
        rewards: waveRewardsData.slice(0, parseInt(inpModeWaves.value))
    };

    localStorage.setItem('tdsLocalPresets', JSON.stringify(presets));
    showToast(`Пресет "${name}" сохранен локально`);
    document.getElementById('inpPresetName').value = '';
    loadLocalPresetsList();
};

document.getElementById('btnLoadLocalPreset').onclick = () => {
    const name = document.getElementById('dropdownLocalPresets').getAttribute('data-value');
    if (!name) { showToast("Выберите пресет для загрузки!"); return; }

    let presets = {};
    try { presets = JSON.parse(localStorage.getItem('tdsLocalPresets')) || {}; } catch(e) {}

    if (presets[name]) {
        applyPresetToUI(presets[name]);
        showToast(`Пресет "${name}" загружен`);
    } else {
        showToast("Ошибка загрузки пресета");
    }
};

document.getElementById('btnDeleteLocalPreset').onclick = () => {
    const name = document.getElementById('dropdownLocalPresets').getAttribute('data-value');
    if (!name) { showToast("Выберите пресет для удаления!"); return; }

    let presets = {};
    try { presets = JSON.parse(localStorage.getItem('tdsLocalPresets')) || {}; } catch(e) {}

    if (presets[name]) {
        delete presets[name];
        localStorage.setItem('tdsLocalPresets', JSON.stringify(presets));
        document.getElementById('dropdownLocalPresets').querySelector('.selected-text').textContent = "Выберите локальный пресет...";
        document.getElementById('dropdownLocalPresets').setAttribute('data-value', '');
        showToast(`Пресет "${name}" удален`);
        loadLocalPresetsList();
    }
};

loadLocalPresetsList();


// --- Farm Deck Logic ---
let activeFarms = [];

function renderFarms() {
    const list = document.getElementById('farmDeckList');
    list.innerHTML = '';

    activeFarms.sort((a,b) => b - a); // high level first for display

    activeFarms.forEach((lvl, idx) => {
        let el = document.createElement('div');
        el.className = 'farm-badge';
        el.innerHTML = `
            <button class="farm-remove" onclick="removeFarm(event, ${idx})">×</button>
            <div class="farm-lvl">L${lvl}</div>
            <div class="farm-inc">+$${FARM_STATS[lvl].inc}</div>
        `;
        el.onclick = () => openFarmActionModal(idx, lvl);
        list.appendChild(el);
    });

    document.getElementById('lblDeckCount').textContent = `${activeFarms.length}/10 Ферм`;

    let totalInc = activeFarms.reduce((sum, lvl) => sum + FARM_STATS[lvl].inc, 0);
    document.getElementById('lblDeckIncome').textContent = `+$${totalInc} / волна`;
}

window.removeFarm = (e, idx) => {
    e.stopPropagation();
    activeFarms.splice(idx, 1);
    renderFarms();
};

const farmModal = document.getElementById('farmActionModal');
let currentFarmActionIdx = -1;

function openFarmActionModal(idx, lvl) {
    currentFarmActionIdx = idx;

    document.getElementById('farmActionTitle').textContent = `Ферма Ур ${lvl}`;
    document.getElementById('farmActionIncome').textContent = `+$${FARM_STATS[lvl].inc} / волна`;

    const btnUp = document.getElementById('btnFarmUpgrade');
    const btnSell = document.getElementById('btnFarmSell');

    if (lvl < 5) {
        let nextLvl = lvl + 1;
        btnUp.style.display = 'block';
        btnUp.innerHTML = `⬆️ Прокачать до Ур ${nextLvl}<br><span style="font-size: 0.8rem; opacity: 0.8;">Стоимость: $${FARM_STATS[nextLvl].upg}</span>`;
        btnUp.onclick = () => {
            activeFarms[idx] = nextLvl;
            renderFarms();
            closeFarmActionModal();
        };
    } else {
        btnUp.style.display = 'none';
    }

    let sellVal = Math.floor(FARM_STATS[lvl].total / 2);
    btnSell.innerHTML = `💰 Продать<br><span style="font-size: 0.8rem; opacity: 0.8;">Получить: $${sellVal}</span>`;
    btnSell.onclick = () => {
        activeFarms.splice(idx, 1);
        renderFarms();
        closeFarmActionModal();
    };

    overlay.classList.add('active');
    farmModal.classList.add('active');
}

function closeFarmActionModal() {
    farmModal.classList.remove('active');
    if (!settingsDrawer.classList.contains('active') &&
        !rewardsDrawer.classList.contains('active') &&
        !libraryDrawer.classList.contains('active')) {
        overlay.classList.remove('active');
    }
    currentFarmActionIdx = -1;
}

document.getElementById('btnFarmCancel').onclick = closeFarmActionModal;

// Intercept overlay click to also close modal
const originalOverlayClick = overlay.onclick;
overlay.onclick = (e) => {
    if (farmModal.classList.contains('active')) {
        closeFarmActionModal();
    } else {
        originalOverlayClick(e);
    }
};

document.getElementById('btnAddFarm0').onclick = () => {
    if(activeFarms.length < 10) { activeFarms.push(0); renderFarms(); }
};
document.getElementById('btnPreset5x2').onclick = () => {
    activeFarms = [2,2,2,2,2]; renderFarms();
};
document.getElementById('btnPreset10x3').onclick = () => {
    activeFarms = [3,3,3,3,3,3,3,3,3,3]; renderFarms();
};
document.getElementById('btnClearDeck').onclick = () => {
    activeFarms = []; renderFarms();
};

// --- Simulation Logic ---
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

document.getElementById('btnRunSim').onclick = () => {
    const startWave = parseInt(document.getElementById('inpCurrentWave').value);
    const targetWave = parseInt(document.getElementById('inpTargetWave').value);
    const startCash = parseInt(document.getElementById('inpStartCash').value);
    const targetCash = parseInt(document.getElementById('inpTargetCash').value);

    const isRewardsActive = document.getElementById('toggleWaveRewards').getAttribute('data-active') === 'true';

    closeAllDrawers(); // close if open

    const result = runSimulation(
        startWave, targetWave, startCash, targetCash,
        [...activeFarms], isRewardsActive, waveRewardsData
    );

    animateValue(document.getElementById('valPureCash'), 0, result.pureCash, 1000);
    animateValue(document.getElementById('valTotalIncome'), 0, result.totalIncomeGenerated, 1000);

    // Update Details Button Logic
    const btnDetailed = document.getElementById('btnToggleDetailed');
    btnDetailed.onclick = () => {
        stratList.classList.toggle('hidden');
    };

    const banner = document.getElementById('verdictBanner');
    const title = document.getElementById('verdictTitle');
    const sub = document.getElementById('verdictSub');

    if (result.pureCash >= targetCash) {
        banner.className = 'verdict-banner realizable';
        title.textContent = 'ВЫПОЛНИМО';
        sub.textContent = 'Накоплено чистыми деньгами';
    } else if (result.cashWithSells >= targetCash) {
        banner.className = 'verdict-banner realizable';
        title.textContent = 'ВЫПОЛНИМО (С ПРОДАЖЕЙ)';
        sub.textContent = `Нужно продать ферм на $${result.accumulatedSell.toLocaleString()}`;
    } else {
        banner.className = 'verdict-banner unrealizable';
        title.textContent = 'НЕ ХВАТАЕТ ДЕНЕГ';
        sub.textContent = `Недостает $${(targetCash - result.maxWealth).toLocaleString()} (даже с продажей)`;
    }

    const stratList = document.getElementById('strategyList');
    const aggregated = compactAggregateHistory(result.history);
    stratList.innerHTML = '';

    if (aggregated.length === 0) {
        stratList.innerHTML = '<div class="strat-row">Действий не требуется.</div>';
        return;
    }

    aggregated.forEach(item => {
        let el = document.createElement('div');
        el.className = `strat-row ${item.isWait ? 'wait' : ''}`;
        el.innerHTML = `
            <div class="strat-wave">W ${item.waveText}</div>
            <div class="strat-action">${item.actionText}</div>
            <div class="strat-cash">$${item.endCash.toLocaleString()}</div>
        `;
        stratList.appendChild(el);
    });
};

// --- Library & API Logic ---
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
let currentUserId = null;

// Library Tabs
const libTabs = document.querySelectorAll('#libraryDrawer .tab-btn');
const libPanes = document.querySelectorAll('#libraryDrawer .tab-pane');

libTabs.forEach(btn => {
    btn.onclick = () => {
        libTabs.forEach(b => b.classList.remove('active'));
        libPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');

        if (targetId === 'lib-catalog') fetchCommunityPresets();
        if (targetId === 'lib-profile') fetchProfileData();
    };
});

function showToast(msg) {
    let toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

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

async function fetchCommunityPresets() {
    const container = document.getElementById('community-presets-list');
    const mode = document.getElementById('dropdownCatalogFilter').getAttribute('data-value');

    container.innerHTML = '<div class="preset-card skeleton" style="height: 80px;"></div>';

    try {
        const res = await fetch(`${API_URL}/api/presets?mode=${mode}`);
        if (!res.ok) throw new Error('API Error');
        const presets = await res.json();

        container.innerHTML = '';
        if (presets.length === 0) {
            container.innerHTML = '<p>Пресеты не найдены.</p>';
            return;
        }

        presets.forEach(p => renderPresetCard(p, container));
    } catch (e) {
        container.innerHTML = `
            <div class="error-widget">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 21H5a5.5 5.5 0 0 1-5.5-5.5C-.5 12.5 2 10 5 10c.8-4.5 4.5-8 9-8 4.2 0 7.7 3.2 8.4 7.2l-2 .5C19.8 6.5 16.8 4 14 4 10.5 4 7.5 6.8 6.8 10.5L6.5 12l-1.5.2C3 12.5 1.5 14 1.5 15.5S3 19 5 19h5l.3 2z"></path><line x1="22" y1="2" x2="2" y2="22"></line></svg>
                <h3>Нет подключения к серверу</h3>
                <p>Не удалось загрузить данные из библиотеки.</p>
                <button class="btn btn-primary liquid-btn" onclick="fetchCommunityPresets()">Повторить</button>
            </div>
        `;
    }
}

function renderPresetCard(p, container) {
    const iconUrl = MODE_ICONS[p.mode] || MODE_ICONS["Easy"];
    const card = document.createElement('div');
    card.className = 'preset-card liquid-btn';
    card.style.display = 'flex';
    card.style.cursor = 'default';
    card.innerHTML = `
        <img src="${iconUrl}" alt="${p.mode}" class="preset-icon" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\'/>'"/>
        <div class="preset-info">
            <h3 class="safe-title"></h3>
            <p>${p.mode} | ${p.players}P | Автор: ${p.author || 'Anonymous'}</p>
            <div class="social-actions">
                <button class="badge-btn liquid-btn" onclick="interactPreset(${p.id}, 'like', event)">👍 ${p.likes || 0}</button>
                <button class="badge-btn liquid-btn" onclick="interactPreset(${p.id}, 'favorite', event)">⭐</button>
                <button class="badge-btn liquid-btn danger-btn" onclick="reportPreset(${p.id}, event)">⚠️</button>
            </div>
        </div>
        <button class="btn btn-primary liquid-btn" onclick="loadPresetData(${p.id})" style="padding:8px;">Загрузить</button>
    `;
    card.querySelector('.safe-title').textContent = p.title;
    container.appendChild(card);
}

window.interactPreset = async (id, action, e) => {
    e.stopPropagation();
    try {
        const res = await fetch(`${API_URL}/api/interact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preset_id: id, action: action, user_id: currentUserId || 0 })
        });
        if (res.ok) {
            showToast(action === 'like' ? 'Лайк поставлен!' : 'Сохранено!');
            if (action === 'like') fetchCommunityPresets();
        }
    } catch(err) { console.error(err); }
};

window.reportPreset = async (id, e) => {
    e.stopPropagation();
    const reason = prompt("Причина жалобы:");
    if (!reason) return;
    try {
        const res = await fetch(`${API_URL}/api/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preset_id: id, reason })
        });
        if (res.ok) showToast('Жалоба отправлена');
    } catch(err) { console.error(err); }
};

// WebSocket & Auth logic ported over
let sessionId = sessionStorage.getItem('sessionId');
if (!sessionId) {
  sessionId = Math.floor(100000 + Math.random() * 900000).toString();
  sessionStorage.setItem('sessionId', sessionId);
}

let BOT_USERNAME = null;
fetch(`${API_URL}/api/bot_info`).then(r => r.json()).then(d => BOT_USERNAME = d.username).catch(console.error);

document.getElementById('btnFastLogin').onclick = () => {
    if (!BOT_USERNAME) { showToast("Бот загружается..."); return; }
    document.getElementById('loginStatusText').textContent = "Ожидание авторизации в боте...";
    window.open(`https://t.me/${BOT_USERNAME}?start=${sessionId}`, '_blank');
};

function connectWebSocket() {
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';
  const ws = new WebSocket(wsUrl);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'register', sessionId: sessionId }));
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'load_preset' && data.preset) {
        applyPresetToUI(data.preset);
        showToast("Пресет загружен!");
      } else if (data.type === 'auth_success') {
        currentUserId = data.user_id;
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('profileSection').style.display = 'block';
        fetchProfileData();
        showToast('Успешный вход!');
      }
    } catch (e) {}
  };
  ws.onclose = () => setTimeout(connectWebSocket, 3000);
}
connectWebSocket();

function renderProfileLocalPresets() {
    const list = document.getElementById('listProfileLocalPresets');
    if (!list) return;
    let presets = {};
    try { presets = JSON.parse(localStorage.getItem('tdsLocalPresets')) || {}; } catch(e) {}
    list.innerHTML = '';

    if (Object.keys(presets).length === 0) {
        list.innerHTML = '<li class="dropdown-item" style="justify-content:center; color: var(--text-muted); cursor:default;">Нет сохраненных пресетов</li>';
        return;
    }

    Object.keys(presets).forEach(name => {
        let li = document.createElement('li');
        li.className = 'dropdown-item';
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';

        let span = document.createElement('span');
        span.textContent = name;

        let actionDiv = document.createElement('div');

        let btnLoad = document.createElement('button');
        btnLoad.className = 'badge-btn liquid-btn';
        btnLoad.style.marginRight = '8px';
        btnLoad.textContent = 'Загрузить';
        btnLoad.onclick = (e) => {
            e.stopPropagation();
            applyPresetToUI(presets[name]);
            showToast(`Пресет "${name}" загружен`);
        };

        let btnDel = document.createElement('button');
        btnDel.className = 'badge-btn danger';
        btnDel.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>Удалить';
        btnDel.onclick = (e) => {
            e.stopPropagation();
            delete presets[name];
            localStorage.setItem('tdsLocalPresets', JSON.stringify(presets));
            renderProfileLocalPresets();
            loadLocalPresetsList();
            showToast(`Пресет "${name}" удален`);
        };

        actionDiv.appendChild(btnLoad);
        actionDiv.appendChild(btnDel);

        li.appendChild(span);
        li.appendChild(actionDiv);
        list.appendChild(li);
    });
}

async function fetchProfileData() {
    renderProfileLocalPresets();

    if(!currentUserId) return;
    try {
        const resProfile = await fetch(`${API_URL}/api/profile?user_id=${currentUserId}`);
        const data = await resProfile.json();

        document.getElementById('profileStatsContainer').innerHTML = `
            <div class="metric"><span class="lbl">Пресеты</span><span class="val">${data.created||0}</span></div>
            <div class="metric"><span class="lbl">Лайки</span><span class="val emerald">${data.total_likes||0}</span></div>
        `;

        const resFav = await fetch(`${API_URL}/api/favorites?user_id=${currentUserId}`);
        const favs = await resFav.json();
        const favList = document.getElementById('favorites-list');
        favList.innerHTML = '';
        if (favs.length === 0) {
            favList.innerHTML = '<p class="empty-text">Нет избранных пресетов</p>';
        } else {
            favs.forEach(p => renderPresetCard(p, favList));
        }

        const resMy = await fetch(`${API_URL}/api/my_presets?user_id=${currentUserId}`);
        const my = await resMy.json();
        const myList = document.getElementById('my-presets-list');
        myList.innerHTML = '';
        if (my.length === 0) {
            myList.innerHTML = '<p class="empty-text">Вы еще не публиковали пресеты</p>';
        } else {
            my.forEach(p => renderPresetCard(p, myList));
        }

    } catch(e) {
        document.getElementById('favorites-list').innerHTML = `
            <div class="error-widget">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 21H5a5.5 5.5 0 0 1-5.5-5.5C-.5 12.5 2 10 5 10c.8-4.5 4.5-8 9-8 4.2 0 7.7 3.2 8.4 7.2l-2 .5C19.8 6.5 16.8 4 14 4 10.5 4 7.5 6.8 6.8 10.5L6.5 12l-1.5.2C3 12.5 1.5 14 1.5 15.5S3 19 5 19h5l.3 2z"></path><line x1="22" y1="2" x2="2" y2="22"></line></svg>
                <h3>Ошибка сети</h3>
                <p>Не удалось загрузить данные профиля.</p>
                <button class="btn btn-primary liquid-btn" onclick="fetchProfileData()">Повторить</button>
            </div>
        `;
        document.getElementById('my-presets-list').innerHTML = `
            <div class="error-widget">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 21H5a5.5 5.5 0 0 1-5.5-5.5C-.5 12.5 2 10 5 10c.8-4.5 4.5-8 9-8 4.2 0 7.7 3.2 8.4 7.2l-2 .5C19.8 6.5 16.8 4 14 4 10.5 4 7.5 6.8 6.8 10.5L6.5 12l-1.5.2C3 12.5 1.5 14 1.5 15.5S3 19 5 19h5l.3 2z"></path><line x1="22" y1="2" x2="2" y2="22"></line></svg>
                <h3>Ошибка сети</h3>
                <p>Не удалось загрузить данные профиля.</p>
                <button class="btn btn-primary liquid-btn" onclick="fetchProfileData()">Повторить</button>
            </div>
        `;
    }
}

window.loadPresetData = async (id) => {
    showToast(`Для загрузки пресета ${id} перейдите в бота`);
};

document.getElementById('btnPublishPreset').onclick = async () => {
    const title = document.getElementById('inpPublishTitle').value.trim();
    if(!title) { showToast("Введите название!"); return; }

    document.getElementById('btnPublishPreset').disabled = true;

    const presetData = {
        mode: document.getElementById('dropdownMode').getAttribute('data-value'),
        players: document.getElementById('dropdownPlayers').getAttribute('data-value'),
        waves: parseInt(inpModeWaves.value),
        rewards: waveRewardsData.slice(0, parseInt(inpModeWaves.value))
    };

    try {
        const res = await fetch(`${API_URL}/api/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title,
                mode: presetData.mode,
                players: presetData.players,
                presetData: presetData,
                user_id: currentUserId || 0
            })
        });
        if (res.ok) {
            showToast("Пресет отправлен на модерацию!");
            document.getElementById('inpPublishTitle').value = '';
        }
    } catch (e) {
        showToast("Сохранено локально / Нет связи с сервером");
    } finally {
        document.getElementById('btnPublishPreset').disabled = false;
    }
};

function applyPresetToUI(preset) {
    if(preset.mode) document.getElementById('dropdownMode').setAttribute('data-value', preset.mode);
    if(preset.mode) document.getElementById('dropdownMode').querySelector('.selected-text').textContent = preset.mode;
    if(preset.players) document.getElementById('dropdownPlayers').setAttribute('data-value', preset.players);

    if(preset.waves) {
        inpModeWaves.value = preset.waves;
        renderWaveGrid();
    }
    if(preset.rewards) {
        for(let i=0; i<preset.rewards.length; i++) waveRewardsData[i] = preset.rewards[i];
        renderWaveGrid();
    }
}

document.getElementById('btnPublishFromRewards').onclick = () => {
    closeDrawer(document.getElementById('rewardsDrawer'));
    openDrawer(document.getElementById('libraryDrawer'));
    const pubTab = document.querySelector('[data-target="lib-publish"]');
    if (pubTab) pubTab.click();
};

// Initial renders
renderFarms();
fetchCommunityPresets();
renderProfileLocalPresets();
