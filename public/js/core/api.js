const API_BASE = '/v1/config';

async function updateStatus() {
    try {
        const response = await fetch(`${API_BASE}/status?t=${new Date().getTime()}`, {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        const data = await response.json();

        // Update Backend Status
        const backendStatus = document.getElementById('status-backend');
        if (backendStatus) {
            backendStatus.className = 'status-pill online';
            backendStatus.innerHTML = '● Backend';
        }

        // Update Google Status
        const googleStatus = document.getElementById('status-google');
        if (googleStatus) {
            if (data.googleAuthorized) {
                googleStatus.className = 'status-pill online';
                googleStatus.innerHTML = '● Google';
            } else {
                googleStatus.className = 'status-pill offline';
                googleStatus.innerHTML = '● Google (Off)';
            }
        }

        // Update WhatsApp Status
        const waStatus = document.getElementById('status-whatsapp');
        const waPageStatus = document.getElementById('wa-status-text');
        const qrContainer = document.getElementById('qr-container');
        const waProfile = document.getElementById('wa-profile');

        if (waStatus) {
            if (data.whatsapp.status === 'open' || data.whatsapp.status === 'connected') {
                waStatus.className = 'status-pill online';
                waStatus.innerHTML = '● WhatsApp';
                if (waPageStatus) waPageStatus.innerHTML = 'CONECTADO COM SUCESSO!';

                // Show profile info if available
                if (data.whatsapp.user) {
                    if (waProfile) waProfile.style.display = 'flex';
                    if (qrContainer) qrContainer.style.display = 'none';
                    const photo = data.whatsapp.user.photo || 'https://via.placeholder.com/120?text=WA';
                    const name = data.whatsapp.user.name;
                    const idShort = data.whatsapp.user.id.split('@')[0];

                    if (document.getElementById('wa-user-photo')) document.getElementById('wa-user-photo').src = photo;
                    if (document.getElementById('wa-user-name')) document.getElementById('wa-user-name').innerText = name;
                    if (document.getElementById('wa-user-id')) document.getElementById('wa-user-id').innerText = idShort;

                    // Header Sync
                    const headerWaUser = document.getElementById('header-wa-user');
                    if (headerWaUser) {
                        headerWaUser.style.display = 'flex';
                        if (document.getElementById('header-wa-photo')) document.getElementById('header-wa-photo').src = photo;
                        if (document.getElementById('header-wa-name')) document.getElementById('header-wa-name').innerText = name;
                    }
                } else {
                    if (waProfile) waProfile.style.display = 'none';
                    if (document.getElementById('header-wa-user')) document.getElementById('header-wa-user').style.display = 'none';
                    if (qrContainer) {
                        qrContainer.style.display = 'flex';
                        qrContainer.innerHTML = '<h3>WhatsApp Conectado!</h3>';
                    }
                }

                if (document.getElementById('btn-disconnect-wa')) document.getElementById('btn-disconnect-wa').style.display = 'block';

                const manualCallSection = document.getElementById('manual-call-section');
                if (manualCallSection) manualCallSection.style.display = 'block';

                if (window.allContacts.length === 0 && !window.loadingContacts && (data.whatsapp.status === 'connected' || data.whatsapp.status === 'open')) {
                    loadContacts(false);
                }
            } else if (data.whatsapp.status === 'waiting_qr' || data.whatsapp.qr) {
                waStatus.className = 'status-pill warning';
                waStatus.innerHTML = '● Aguardando QR';
                if (waPageStatus) waPageStatus.innerHTML = 'Aguardando Escaneamento...';
                if (document.getElementById('btn-disconnect-wa')) document.getElementById('btn-disconnect-wa').style.display = 'none';
                if (waProfile) waProfile.style.display = 'none';
                if (qrContainer) {
                    qrContainer.style.display = 'flex';
                    if (data.whatsapp.qr) {
                        qrContainer.innerHTML = `<img src="${data.whatsapp.qr}" style="width: 250px; height: 250px;" />`;
                    }
                }
            } else {
                waStatus.className = 'status-pill offline';
                waStatus.innerHTML = '● WhatsApp (Off)';
                if (waProfile) waProfile.style.display = 'none';
                if (qrContainer) qrContainer.style.display = 'flex';
                const manualCallSection = document.getElementById('manual-call-section');
                if (manualCallSection) manualCallSection.style.display = 'none';
            }
        }

    } catch (e) {
        console.error('Error fetching status', e);
    }
}

async function loadCalendars() {
    console.log('[AgendaBot] Loading calendars...');
    try {
        const response = await fetch('/v1/events/calendars');
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();
        window.availableCalendars = Array.isArray(data) ? data : (data.items || []);
        console.log(`[AgendaBot] Found ${window.availableCalendars.length} calendars.`);

        const disabledCalendars = (typeof window.getDisabledCalendars === 'function') ? window.getDisabledCalendars() : new Set();
        console.log('[AgendaBot] Disabled calendars:', Array.from(disabledCalendars));

        // Calendários ativos = todos EXCETO os explicitamente desativados
        window.activeCalendars = new Set(
            window.availableCalendars.filter(c => !disabledCalendars.has(c.id)).map(c => c.id)
        );

        const filterContainer = document.getElementById('calendar-filters-container');
        console.log('[AgendaBot] filterContainer exists:', !!filterContainer);
        if (filterContainer) filterContainer.innerHTML = '';

        const selectContainer = document.getElementById('event-calendar');
        if (selectContainer) selectContainer.innerHTML = '';

        window.availableCalendars.forEach(cal => {
            const isActive = !disabledCalendars.has(cal.id);
            const calColor = cal.backgroundColor || '#3788d8';

            // ----- Item row -----
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 2px;border-radius:6px;transition:background 0.15s;';
            row.onmouseover = () => row.style.background = 'rgba(255,255,255,0.05)';
            row.onmouseout  = () => row.style.background = 'transparent';

            // Bolinha de cor da agenda
            const dot = document.createElement('span');
            dot.style.cssText = `width:9px;height:9px;border-radius:50%;background:${calColor};flex-shrink:0;`;
            row.appendChild(dot);

            // Label (nome da agenda)
            const label = document.createElement('span');
            label.innerText = cal.summary;
            label.title = cal.id;
            label.style.cssText = `flex:1;font-size:0.82rem;color:${isActive ? 'white' : 'var(--text-muted)'};cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color 0.2s;`;
            row.appendChild(label);

            // Toggle switch
            const toggleLabel = document.createElement('label');
            toggleLabel.style.cssText = 'position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0;cursor:pointer;';

            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = isActive;
            toggleInput.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';

            const slider = document.createElement('span');
            slider.style.cssText = `
                position:absolute;top:0;left:0;right:0;bottom:0;
                background:${isActive ? calColor : 'rgba(255,255,255,0.15)'};
                border-radius:18px;transition:background 0.25s;
            `;

            const knob = document.createElement('span');
            knob.style.cssText = `
                position:absolute;width:13px;height:13px;border-radius:50%;background:white;
                top:2.5px;left:${isActive ? '16px' : '2.5px'};transition:left 0.25s;
                box-shadow:0 1px 3px rgba(0,0,0,0.4);
            `;
            slider.appendChild(knob);
            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(slider);

            const applyState = (active) => {
                slider.style.background = active ? calColor : 'rgba(255,255,255,0.15)';
                knob.style.left = active ? '16px' : '2.5px';
                label.style.color = active ? 'white' : 'var(--text-muted)';
                dot.style.opacity = active ? '1' : '0.35';
            };

            toggleInput.onchange = () => {
                const active = toggleInput.checked;
                applyState(active);
                if (window.setCalendarDisabled) window.setCalendarDisabled(cal.id, !active);
                if (active) window.activeCalendars.add(cal.id);
                else window.activeCalendars.delete(cal.id);
                if (window.filterAndRenderEvents) window.filterAndRenderEvents();
            };

            // Click na label/dot também activa o toggle
            label.onclick = () => { toggleInput.checked = !toggleInput.checked; toggleInput.dispatchEvent(new Event('change')); };

            row.appendChild(toggleLabel);
            if (filterContainer) filterContainer.appendChild(row);

            // Dropdown option (só aparece se a agenda está ativa)
            const opt = document.createElement('option');
            opt.value = cal.id;
            opt.innerText = cal.summary;
            opt.style.background = calColor;
            opt.style.color = 'white';
            if (selectContainer) selectContainer.appendChild(opt);
        });

    } catch (e) {
        console.error("Error loading calendars", e);
        const filterContainer = document.getElementById('calendar-filters-container');
        if (filterContainer) filterContainer.innerHTML = '<p style="color:red">Erro ao carregar agendas</p>';
    }
}

function getDisabledCalendars() {
    const data = localStorage.getItem('disabled_calendars');
    return data ? new Set(JSON.parse(data)) : new Set();
}

let savedAgendas = [];

async function listAgendas() {
    try {
        const response = await fetch(`${API_BASE}/calendar-id`);
        if (response.ok) {
            savedAgendas = await response.json();
            window.savedAgendas = savedAgendas;
            renderAgendaList();
        }
    } catch (error) {
        console.error('Failed to load agendas:', error);
    }
}

function renderAgendaList() {
    const list = document.getElementById('agenda-list');
    if (!list) return;
    list.innerHTML = '';

    if (savedAgendas.length === 0) {
        list.innerHTML = '<li style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem; padding: 10px;">Nenhuma agenda cadastrada.</li>';
        return;
    }

    savedAgendas.forEach((agenda, index) => {
        const li = document.createElement('li');
        li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 0.5rem;';

        const textSpan = document.createElement('span');
        textSpan.textContent = agenda;
        textSpan.style.color = 'white';
        textSpan.style.wordBreak = 'break-all';

        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '🗑️';
        removeBtn.style.cssText = 'background: rgba(255, 68, 68, 0.2); color: #ff4444; border: 1px solid rgba(255, 68, 68, 0.4); padding: 5px 10px; cursor: pointer; border-radius: 4px; font-size: 1.2rem; margin-left: 10px; transition: background 0.2s;';
        removeBtn.onmouseenter = () => removeBtn.style.background = 'rgba(255, 68, 68, 0.4)';
        removeBtn.onmouseleave = () => removeBtn.style.background = 'rgba(255, 68, 68, 0.2)';
        removeBtn.onclick = function() { removeAgenda(index, this); };

        li.appendChild(textSpan);
        li.appendChild(removeBtn);
        list.appendChild(li);
    });
}

async function removeAgenda(index, btn) {
    if (btn && !btn.dataset.confirm) {
        btn.dataset.confirm = "true";
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '⚠️';
        btn.style.background = 'rgba(255, 160, 0, 0.3)';
        setTimeout(() => {
            btn.dataset.confirm = "";
            btn.innerHTML = oldHtml;
            btn.style.background = 'rgba(255, 68, 68, 0.2)';
        }, 3000);
        return;
    }
    
    if (btn) btn.innerHTML = '⏳';

    const oldAgendas = [...savedAgendas];
    savedAgendas.splice(index, 1);
    const success = await saveAgendasArray();
    if (success) {
        renderAgendaList();
        loadCalendars().then(() => fetchEvents());
    } else {
        savedAgendas = oldAgendas; // revert
        if (btn) {
            btn.dataset.confirm = "";
            btn.innerHTML = '🗑️';
            btn.style.background = 'rgba(255, 68, 68, 0.2)';
        }
    }
}

async function addAgenda() {
    const input = document.getElementById('new-agenda-input');
    const newAgenda = input.value.trim();

    if (!newAgenda) {
        showStatus('calendar-id-status', 'Por favor, insira o E-mail ou ID.', false);
        return;
    }

    if (savedAgendas.includes(newAgenda)) {
        showStatus('calendar-id-status', 'Esta agenda já foi adicionada.', false);
        return;
    }

    const btn = event.target;
    const oldText = btn.innerHTML;
    btn.innerHTML = 'Adicionando...';
    btn.disabled = true;

    savedAgendas.push(newAgenda);
    const success = await saveAgendasArray();

    if (success) {
        input.value = '';
        renderAgendaList();
        loadCalendars().then(() => fetchEvents());
    } else {
        savedAgendas.pop(); // revert
    }

    btn.innerHTML = oldText;
    btn.disabled = false;
}

async function saveAgendasArray() {
    try {
        const response = await fetch(`${API_BASE}/calendar-id`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ emails: savedAgendas })
        });
        const data = await response.json();

        if (response.ok) {
            showStatus('calendar-id-status', data.message, true);
            return true;
        } else {
            showStatus('calendar-id-status', 'Erro: ' + data.message, false);
            return false;
        }
    } catch (error) {
        showStatus('calendar-id-status', 'Erro de conexão: ' + error.message, false);
        return false;
    }
}

function showStatus(id, message, isSuccess) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<p style="color: ${isSuccess ? 'var(--success)' : 'var(--error)'}">${isSuccess ? '✓' : '✗'} ${message}</p>`;
    setTimeout(() => { if (el.innerHTML.includes(message)) el.innerHTML = ''; }, 5000);
}


async function fetchEvents() {
    try {
        const response = await fetch('/v1/events');
        if (!response.ok) return;

        window.cachedEvents = await response.json();

        // Exibe a hora da última atualização do cache
        const cacheHeader = response.headers.get('X-Cache-Updated');
        if (cacheHeader && cacheHeader !== 'never') {
            const updated = new Date(cacheHeader);
            const timeStr = updated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const el = document.getElementById('cache-last-updated');
            if (el) el.textContent = `Atualizado às ${timeStr}`;
        }

        filterAndRenderEvents();
    } catch (e) {
        console.error('Error fetching events', e);
    }
}

async function refreshEvents() {
    const btn = document.getElementById('btn-refresh-events');
    const el = document.getElementById('cache-last-updated');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Atualizando...'; }
    if (el) el.textContent = 'Atualizando...';
    try {
        const res = await fetch('/v1/events/refresh', { method: 'POST' });
        if (res.ok) {
            await fetchEvents();
        } else {
            console.error('Refresh falhou');
            if (el) el.textContent = 'Erro ao atualizar';
        }
    } catch (e) {
        console.error('Refresh error', e);
        if (el) el.textContent = 'Erro ao atualizar';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Atualizar'; }
    }
}

async function listAgendas() {
    console.log('[AgendaBot] Listing agendas (IDs)...');
    try {
        const response = await fetch(`${API_BASE}/calendar-id`);
        if (response.ok) {
            window.savedAgendas = await response.json();
            console.log(`[AgendaBot] Loaded ${window.savedAgendas.length} agenda IDs.`);
            if (window.renderAgendaList) renderAgendaList();
            else console.warn('[AgendaBot] renderAgendaList not available on window.');
        } else {
            console.error(`[AgendaBot] Failed to load agenda IDs: ${response.status}`);
        }
    } catch (error) {
        console.error('[AgendaBot] Failed to load agendas:', error);
    }
}

async function removeAgenda(index) {
    if (!window.savedAgendas) return;
    window.savedAgendas.splice(index, 1);
    const success = await saveAgendasArray();
    if (success && window.renderAgendaList) {
        renderAgendaList();
        loadCalendars().then(() => fetchEvents());
    }
}

async function saveAgendasArray() {
    try {
        const response = await fetch(`${API_BASE}/calendar-id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: window.savedAgendas })
        });
        const data = await response.json();

        if (response.ok) {
            showStatus('calendar-id-status', data.message, true);
            return true;
        } else {
            showStatus('calendar-id-status', 'Erro: ' + data.message, false);
            return false;
        }
    } catch (error) {
        showStatus('calendar-id-status', 'Erro de conexão: ' + error.message, false);
        return false;
    }
}

async function uploadOAuthJson() {
    const fileInput = document.getElementById('oauth-file-input');
    const file = fileInput.files[0];
    const statusText = document.getElementById('oauth-status-text');
    
    if (!file) {
        alert('Selecione um arquivo JSON primeiro.');
        return;
    }

    statusText.innerText = "⏳ Enviando e processando...";
    statusText.style.color = "var(--warning)";

    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/oauth/upload', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (response.ok) {
            statusText.innerText = '✅ JSON configurado! Requer Login.';
            statusText.style.color = 'var(--success)';
            document.getElementById('btn-oauth-login').style.display = 'flex';
            document.getElementById('btn-oauth-logout').style.display = 'none';
        } else {
            statusText.innerText = '❌ Erro: ' + result.message;
            statusText.style.color = '#ff4444';
        }
    } catch (e) {
        statusText.innerText = '❌ Erro de conexão.';
        statusText.style.color = '#ff4444';
    }
}

async function checkOAuthStatus() {
    const statusText = document.getElementById('oauth-status-text');
    const btnLogin = document.getElementById('btn-oauth-login');
    const btnLogout = document.getElementById('btn-oauth-logout');

    if (!statusText || !btnLogin) return;

    try {
        const response = await fetch('/api/oauth/status');
        const data = await response.json();
        
        if (data.configured) {
            if (data.authorized) {
                statusText.innerText = '✅ Autenticado e Pronto!';
                statusText.style.color = 'var(--success)';
                btnLogin.style.display = 'none';
                if (btnLogout) btnLogout.style.display = 'flex';
            } else {
                statusText.innerText = '⚠ Requer Login';
                statusText.style.color = 'var(--warning)';
                btnLogin.style.display = 'flex';
                if (btnLogout) btnLogout.style.display = 'none';
            }
        } else {
            statusText.innerText = '❌ Não configurado (Faça upload do JSON) ';
            statusText.style.color = '#ff4444';
            btnLogin.style.display = 'none';
            if (btnLogout) btnLogout.style.display = 'none';
        }
    } catch (e) {
        console.error('Failed to check OAuth status', e);
    }
}

async function disconnectWhatsApp() {
    if (!confirm('Tem certeza que deseja desconectar o WhatsApp? Você precisará escanear o QR Code novamente.')) {
        return;
    }

    const btn = document.getElementById('btn-disconnect-wa');
    if (btn) {
        btn.innerText = "Desconectando...";
        btn.disabled = true;
    }

    try {
        const response = await fetch(`${API_BASE}/whatsapp/disconnect`, { method: 'POST' });
        const data = await response.json();

        if (data.status === 'success') {
            log('Sessão do WhatsApp encerrada.');
            setTimeout(() => {
                if (btn) {
                    btn.innerText = "Desconectar WhatsApp";
                    btn.disabled = false;
                }
                updateStatus();
            }, 3000);
        } else {
            alert('Erro ao desconectar: ' + data.message);
            if (btn) {
                btn.innerText = "Desconectar WhatsApp";
                btn.disabled = false;
            }
        }
    } catch (e) {
        alert('Erro de conexão ao tentar desconectar.');
        if (btn) {
            btn.innerText = "Desconectar WhatsApp";
            btn.disabled = false;
        }
    }
}

async function loadWhatsAppGroups() {
    const select = document.getElementById('event-group-id') || document.getElementById('event-group-jid');
    if (!select) return;

    try {
        console.log('[Frontend] Chamando API de grupos...');
        select.innerHTML = '<option value="">Carregando grupos...</option>';
        const apiPath = API_BASE.includes('config') ? API_BASE.replace('/config', '') : '/v1';

        const response = await fetch(`${apiPath}/whatsapp/groups`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ${response.status}: ${errorText || response.statusText}`);
        }

        window.cachedGroups = await response.json();
        console.log(`[Frontend] ${window.cachedGroups.length} grupos carregados.`);
        renderGroupOptions(window.cachedGroups);
    } catch (error) {
        select.innerHTML = `<option value="">⚠️ Erro: ${error.message}</option>`;
        console.error('[Frontend] Falha ao carregar grupos:', error);
    }
}

async function loadContacts(isManual = true, retryCount = 0) {
    if (window.loadingContacts) return;
    window.loadingContacts = true;

    const btn = document.getElementById('btn-sync-contacts');
    const badge = document.getElementById('contact-count-badge');
    const oldBtnContent = btn ? btn.innerHTML : '';

    if (btn) {
        btn.innerHTML = '⏳ Buscando contatos...';
        btn.disabled = true;
    }

    try {
        console.log('[Frontend] Carregando contatos...');
        const response = await fetch('/v1/whatsapp/contacts');
        if (!response.ok) throw new Error("Servidor Offline ou Erro no WhatsApp");

        const protectedNumbers = new Set();
        document.querySelectorAll('.p-wa').forEach(inp => {
            const v = inp.value.trim();
            if (v) protectedNumbers.add(v);
        });

        window.allContacts = await response.json();

        const datalist = document.getElementById('contacts-list');
        if (datalist) {
            datalist.innerHTML = "";
            window.allContacts.forEach(c => {
                const name = c.name || c.notify || "Sem Nome";
                const number = c.id.split('@')[0];
                const option = document.createElement('option');
                option.value = `${name} (${number})`;
                datalist.appendChild(option);
            });
        }

        if (window.allContacts.length === 0 && retryCount < 4) {
            const waitSec = 5;
            window.loadingContacts = false;
            if (btn) {
                let countdown = waitSec;
                btn.innerHTML = `⌛ Aguardando sincronização... (${countdown}s)`;
                const timer = setInterval(() => {
                    countdown--;
                    if (btn) btn.innerHTML = `⌛ Aguardando sincronização... (${countdown}s)`;
                }, 1000);
                setTimeout(() => {
                    clearInterval(timer);
                    btn.disabled = false;
                    loadContacts(isManual, retryCount + 1);
                }, waitSec * 1000);
            }
            return;
        }

        if (isManual) showToast(`✅ ${window.allContacts.length} contatos sincronizados!`, 'success');
        if (badge) {
            badge.textContent = window.allContacts.length + ' contatos';
            badge.style.display = 'inline';
        }
    } catch (e) {
        console.error('Erro ao carregar contatos:', e);
        if (isManual) showToast("Falha ao sincronizar: " + e.message, 'error');
    } finally {
        window.loadingContacts = false;
        if (btn) {
            btn.innerHTML = oldBtnContent || `🔄 Atualizar Contatos <span id="contact-count-badge"></span>`;
            btn.disabled = false;
        }
    }
}

async function rebootSystem() {
    if (!confirm('Deseja realmente REINICIAR o sistema inteiro? Ele ficará indisponível por alguns segundos.')) return;
    try {
        await fetch(`${API_BASE}/reboot`, { method: 'POST' });
        alert('Comando de reinicialização enviado. Recarregue a página em alguns segundos.');
    } catch (e) {
        alert('Erro ao enviar comando de reboot.');
    }
}

async function fetchLogs() {
    const container = document.getElementById('system-logs-container');
    try {
        const res = await fetch('/v1/system/logs');
        const data = await res.json();
        if (data.logs) {
            container.textContent = data.logs;
            container.scrollTop = container.scrollHeight;
        } else {
            container.textContent = "Nenhum log disponível.";
        }
    } catch (e) {
        container.textContent = "Erro ao carregar logs.";
    }
}

async function saveCalendar() {
    const summary = document.getElementById('calendar-summary').value;
    const description = document.getElementById('calendar-description').value;

    if (!summary.trim()) {
        alert('Por favor, informe um nome para a agenda.');
        return;
    }

    try {
        const res = await fetch('/v1/events/calendars', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summary, description })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        alert('Agenda criada com sucesso!');
        closeCreateCalendarModal();
        await loadCalendars();
        listAgendas();
    } catch (e) {
        alert('Erro ao criar agenda: ' + e.message);
    }
}

// Global Exports
window.updateStatus = updateStatus;
window.loadCalendars = loadCalendars;
window.fetchEvents = fetchEvents;
window.refreshEvents = refreshEvents;
window.listAgendas = listAgendas;
window.saveAgendasArray = saveAgendasArray;
window.uploadOAuthJson = uploadOAuthJson;
window.checkOAuthStatus = checkOAuthStatus;
window.disconnectWhatsApp = disconnectWhatsApp;
window.loadWhatsAppGroups = loadWhatsAppGroups;
window.loadContacts = loadContacts;
window.rebootSystem = rebootSystem;
window.fetchLogs = fetchLogs;
window.saveCalendar = saveCalendar;
window.removeAgenda = removeAgenda;
window.listAgendas = listAgendas;
window.addAgenda = addAgenda;
window.renderAgendaList = renderAgendaList;
window.getDisabledCalendars = getDisabledCalendars;
window.setCalendarDisabled = setCalendarDisabled;
