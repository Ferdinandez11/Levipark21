// --- START OF FILE ui_manager.js ---

import { state } from './globals.js';
import { toggleDisplay, showToast } from './utils.js';
import { toggleMeasureMode, toggleFloorMode, clearMeasurements, addPointFromInput, finishFloor, updateFloorFromInput, setFloorColor, updateTextureMapping, updateFloorInfoLabel, undoLastFloorPoint } from './floor.js';
import { deleteSelected, cloneSelected, snapToFloor, toggleLock, toggleObjectCollision, setGizmoMode } from './interaction.js';
import { undo, redo, resetScene, saveProject, loadProjectData } from './history.js';
import { filterCatalog } from './catalog.js';
import { toggleFenceMode, finishFence } from './fence.js';
import { generateDossier, exportToMobile } from './exporters.js';
import { exportDXF } from './dxf_exporter.js';
import { loginUser, registerUser, logoutUser, saveProjectToCloud, loadUserProjects } from './backend.js';
import { FLOOR_COLORS } from './config.js';
import { toggleProjection, setView, takeScreenshot, updateAndShowList, exportGLB, handleFileUpload, toggleWalkMode } from './app_actions.js';
import { record360Video } from './video_recorder.js';

function triggerSunUpdate() { window.dispatchEvent(new Event('env-changed')); }

// HELPER: Añade evento click y quita el foco inmediatamente (Soluciona el bug del Espacio)
function bindClick(id, action) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('click', (e) => {
            action(e);
            el.blur(); // IMPORTANTE: Quita el foco del botón
            document.body.focus(); // Devuelve el foco al cuerpo de la página
        });
    }
}

function injectExtraUI() {
    // 1. Botón Modo Paseo
    const topBar = document.getElementById('top-bar-controls');
    if(topBar && !document.getElementById('btn-walk-mode')) {
        const btn = document.createElement('button');
        btn.id = 'btn-walk-mode'; btn.className = 'top-icon-btn'; btn.title = "Modo Paseo (1ra Persona)";
        btn.innerHTML = '🏃';
        topBar.appendChild(btn);
        bindClick('btn-walk-mode', toggleWalkMode);
    }

    // 2. Panel Solar
    const envPanel = document.getElementById('env-panel');
    if(envPanel && !document.getElementById('real-time-controls')) {
        const container = document.createElement('div');
        container.id = 'real-time-controls';
        container.style.marginTop = "10px"; container.style.borderTop = "1px solid #555"; container.style.paddingTop = "10px";
        container.innerHTML = `
            <p class="panel-subtitle">Estudio Solar Real</p>
            <div style="margin-bottom:5px;">
                <span class="input-label">Fecha</span>
                <input type="date" id="sun-date" class="input-box" style="padding:4px;">
            </div>
            <div style="margin-bottom:5px;">
                <span class="input-label">Hora: <span id="time-display">12:00</span></span>
                <input type="range" id="sun-time" min="0" max="23.9" step="0.1" value="12">
            </div>
            <div style="font-size:10px; color:#aaa; margin-top:5px;">
                <label><input type="checkbox" id="manual-sun-toggle"> Control Manual (Sliders)</label>
            </div>
        `;
        envPanel.appendChild(container);
        const now = new Date();
        document.getElementById('sun-date').valueAsDate = now;
        document.getElementById('sun-time').value = now.getHours() + now.getMinutes()/60;
    }

    // 3. Botón Deshacer Punto
    const polyInputs = document.getElementById('poly-inputs');
    if(polyInputs && !document.getElementById('btn-undo-point')) {
        const btn = document.createElement('button');
        btn.id = 'btn-undo-point'; btn.innerText = "↩ Deshacer Punto";
        btn.className = "btn-mini"; btn.style.width = "100%"; btn.style.marginTop = "5px"; btn.style.background = "#d35400"; btn.style.color = "white";
        polyInputs.appendChild(btn);
        bindClick('btn-undo-point', undoLastFloorPoint);
    }
}

export function initDOMEvents() {
    injectExtraUI();

    bindClick('btn-toggle-menu', () => toggleDisplay('ui-panel'));
    bindClick('btn-close-menu', () => document.getElementById('ui-panel').style.display = 'none');
    bindClick('btn-toggle-env', () => toggleDisplay('env-panel'));
    bindClick('btn-min-edit', () => toggleDisplay('edit-content'));

    bindClick('btn-snap', () => { 
        state.isSnapping = !state.isSnapping; const btn = document.getElementById('btn-snap');
        if(state.isSnapping) { btn.classList.add('active-snap'); showToast('Snapping Activado', 'info'); } else { btn.classList.remove('active-snap'); showToast('Snapping Desactivado', 'info'); }
        window.dispatchEvent(new Event('snap-changed')); 
    });
    
    bindClick('btn-toggle-safety', () => {
        state.showSafetyZones = !state.showSafetyZones; const btn = document.getElementById('btn-toggle-safety');
        if(state.showSafetyZones) { btn.classList.remove('active-safety'); showToast('Zonas de seguridad visibles', 'info'); } else { btn.classList.add('active-safety'); showToast('Zonas de seguridad ocultas', 'info'); }
        state.safetyZonesList.forEach(obj => { obj.visible = state.showSafetyZones; });
    });

    bindClick('btn-toggle-grid', () => {
        if(!state.gridHelper) return; state.gridHelper.visible = !state.gridHelper.visible; const btn = document.getElementById('btn-toggle-grid');
        if(state.gridHelper.visible) { btn.classList.add('active-grid'); showToast('Cuadrícula visible (1x1m)', 'info'); } else { btn.classList.remove('active-grid'); }
    });

    if (!document.getElementById('mode-curve')) {
        const container = document.querySelector('#floor-input-panel div');
        if (container) {
            const btnCurve = document.createElement('button'); btnCurve.id = 'mode-curve'; btnCurve.className = 'btn-mini'; btnCurve.innerText = 'Curva';
            container.appendChild(btnCurve); 
            bindClick('mode-curve', () => import('./floor.js').then(m => m.setFloorMode('curve')));
        }
    }

    bindClick('mode-poly', () => import('./floor.js').then(m => m.setFloorMode('poly')));
    bindClick('mode-rect', () => import('./floor.js').then(m => m.setFloorMode('rect')));
    bindClick('btn-floor', toggleFloorMode);
    bindClick('btn-add-point', addPointFromInput); 
    bindClick('btn-close-floor', () => { if (state.isDrawingFence) finishFence(); else import('./floor.js').then(m => { m.finishFloor(); m.toggleFloorMode(); }); });
    document.querySelectorAll('.input-box').forEach(i => { i.addEventListener('focus', ()=>state.isInputFocused=true); i.addEventListener('blur', ()=>state.isInputFocused=false); i.addEventListener('input', updateFloorFromInput); });

    bindClick('env-white', () => { state.sky.visible=false; triggerSunUpdate(); });
    bindClick('env-morning', () => { state.sky.visible=true; state.sunConfig.manualMode=true; state.sunConfig.elevation=15; state.sunConfig.azimuth=90; triggerSunUpdate(); });
    bindClick('env-noon', () => { state.sky.visible=true; state.sunConfig.manualMode=true; state.sunConfig.elevation=80; state.sunConfig.azimuth=180; triggerSunUpdate(); });
    bindClick('env-evening', () => { state.sky.visible=true; state.sunConfig.manualMode=true; state.sunConfig.elevation=5; state.sunConfig.azimuth=270; triggerSunUpdate(); });
    
    document.getElementById('sun-azimuth').addEventListener('input', (e) => { state.sunConfig.manualMode=true; state.sunConfig.azimuth=parseFloat(e.target.value); triggerSunUpdate(); });
    document.getElementById('sun-elevation').addEventListener('input', (e) => { state.sunConfig.manualMode=true; state.sunConfig.elevation=parseFloat(e.target.value); triggerSunUpdate(); });
    document.getElementById('light-intensity').addEventListener('input', (e) => { state.dirLight.intensity=e.target.value; });

    document.getElementById('sun-date').addEventListener('change', (e) => {
        state.sunConfig.date = new Date(e.target.valueAsDate);
        state.sunConfig.date.setHours(parseFloat(document.getElementById('sun-time').value));
        state.sunConfig.manualMode = false;
        document.getElementById('manual-sun-toggle').checked = false;
        triggerSunUpdate();
    });
    document.getElementById('sun-time').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const h = Math.floor(val); const m = Math.floor((val - h)*60);
        document.getElementById('time-display').innerText = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
        state.sunConfig.date.setHours(h); state.sunConfig.date.setMinutes(m);
        state.sunConfig.manualMode = false;
        document.getElementById('manual-sun-toggle').checked = false;
        triggerSunUpdate();
    });
    document.getElementById('manual-sun-toggle').addEventListener('change', (e) => { state.sunConfig.manualMode = e.target.checked; triggerSunUpdate(); });

    document.getElementById('tex-scale').addEventListener('input', updateTextureMapping);
    document.getElementById('tex-rotate').addEventListener('input', updateTextureMapping);
    document.getElementById('tex-off-x').addEventListener('input', updateTextureMapping);
    document.getElementById('tex-off-y').addEventListener('input', updateTextureMapping);
    bindClick('btn-floor-upload-tex', () => { document.getElementById('file-upload').click(); });

    bindClick('fc-garnet', () => setFloorColor(FLOOR_COLORS.garnet));
    bindClick('fc-blue', () => setFloorColor(FLOOR_COLORS.blue));
    bindClick('fc-green', () => setFloorColor(FLOOR_COLORS.green));
    bindClick('fc-black', () => setFloorColor(FLOOR_COLORS.black));

    bindClick('btn-screenshot', takeScreenshot);
    const btnVideo = document.getElementById('btn-record-video'); if (btnVideo) bindClick('btn-record-video', record360Video);
    bindClick('btn-export-pdf', generateDossier);
    bindClick('btn-export-dxf', exportDXF);
    bindClick('btn-export-glb', exportGLB); 
    bindClick('btn-projection', toggleProjection);
    bindClick('btn-save-project', saveProject);
    bindClick('btn-load-project', () => document.getElementById('project-upload').click());
    document.getElementById('project-upload').addEventListener('change', (e) => { 
        const f=e.target.files[0]; if(!f)return; const r=new FileReader(); 
        r.onload=(ev)=>{ try{ loadProjectData(JSON.parse(ev.target.result)); showToast("Proyecto cargado.", 'success'); }catch(x){ showToast("Error al leer archivo.", 'error'); } }; 
        r.readAsText(f); e.target.value=''; 
    });
    bindClick('btn-mobile-ar', exportToMobile);

    bindClick('view-iso', ()=>setView('iso')); 
    bindClick('view-top', ()=>setView('top'));
    bindClick('view-front', ()=>setView('front'));
    bindClick('view-side', ()=>setView('side'));

    bindClick('btn-measure', toggleMeasureMode);
    bindClick('clear-measures', clearMeasurements);
    bindClick('btn-reset', resetScene); 
    bindClick('btn-lock', toggleLock);
    bindClick('btn-collision', toggleObjectCollision); 
    bindClick('btn-delete', deleteSelected);
    bindClick('btn-clone', cloneSelected);
    bindClick('btn-undo', undo); 
    bindClick('btn-redo', redo);

    bindClick('mode-translate', ()=>setGizmoMode('translate')); 
    bindClick('mode-rotate', ()=>setGizmoMode('rotate'));
    bindClick('mode-scale', ()=>setGizmoMode('scale'));

    document.getElementById('catalog-search').addEventListener('input', (e) => filterCatalog(e.target.value));
    bindClick('btn-show-list', updateAndShowList);

    bindClick('btn-fence', toggleFenceMode);
    const fenceSelect = document.getElementById('fence-model-select'); if(fenceSelect) { fenceSelect.addEventListener('change', (e) => { import('./fence.js').then(m => { m.setFenceConfig(e.target.value); }); }); }
    ['fence-col-post', 'fence-col-a', 'fence-col-b', 'fence-col-c'].forEach(id => {
        const el = document.getElementById(id);
        if(el) { el.addEventListener('input', (e) => { const key = id.replace('fence-col-', '').replace('post', 'post').replace('a', 'slatA').replace('b', 'slatB').replace('c', 'slatC'); import('./fence.js').then(m => m.setFenceConfig(null, key, e.target.value)); }); }
    });

    bindClick('btn-upload-trigger', () => document.getElementById('file-upload').click());
    document.getElementById('file-upload').addEventListener('change', handleFileUpload);

    bindClick('btn-auth-trigger', () => { if(state.currentUser) { if(confirm("¿Cerrar sesión?")) logoutUser(); } else { document.getElementById('auth-panel').style.display = 'flex'; } });
    bindClick('toggle-auth-mode', () => {
        const regBtn = document.getElementById('btn-register-submit'); const logBtn = document.getElementById('btn-login-submit'); const fields = document.getElementById('register-fields'); const toggle = document.getElementById('toggle-auth-mode');
        if (regBtn.style.display === 'none') { regBtn.style.display = 'block'; logBtn.style.display = 'none'; fields.style.display = 'block'; toggle.innerHTML = '¿Ya tienes cuenta? <span style="color:#4a90e2; text-decoration:underline;">Inicia sesión</span>'; } 
        else { regBtn.style.display = 'none'; logBtn.style.display = 'block'; fields.style.display = 'none'; toggle.innerHTML = '¿No tienes cuenta? <span style="color:#4a90e2; text-decoration:underline;">Regístrate aquí</span>'; }
    });
    bindClick('btn-login-submit', async () => { const e = document.getElementById('auth-email').value; const p = document.getElementById('auth-pass').value; if(e && p) await loginUser(e, p); });
    bindClick('btn-register-submit', async () => { const e = document.getElementById('auth-email').value; const p = document.getElementById('auth-pass').value; const c = document.getElementById('auth-company').value; if(e && p) await registerUser(e, p, c); });
    bindClick('btn-save-cloud', saveProjectToCloud);
    bindClick('btn-load-cloud', loadUserProjects);
}
// --- END OF FILE ui_manager.js ---