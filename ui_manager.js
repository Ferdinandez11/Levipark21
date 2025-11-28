// --- START OF FILE ui_manager.js ---

import { state } from './globals.js';
import { toggleDisplay, showToast } from './utils.js';
import { 
    toggleMeasureMode, toggleFloorMode, clearMeasurements, 
    addPointFromInput, finishFloor, updateFloorFromInput, 
    setFloorColor, updateTextureMapping, updateFloorInfoLabel
} from './floor.js';
import { 
    deleteSelected, cloneSelected, snapToFloor, toggleLock, 
    toggleObjectCollision, setGizmoMode 
} from './interaction.js';
import { undo, redo, resetScene, saveProject, loadProjectData } from './history.js';
import { filterCatalog } from './catalog.js';
import { toggleFenceMode, finishFence } from './fence.js';
import { generateDossier, exportToMobile } from './exporters.js';
import { exportDXF } from './dxf_exporter.js';
import { loginUser, registerUser, logoutUser, saveProjectToCloud, loadUserProjects } from './backend.js';
import { FLOOR_COLORS } from './config.js';

// Importamos las acciones lógicas que movimos a app_actions.js
import { 
    toggleProjection, setView, takeScreenshot, 
    updateAndShowList, exportGLB, handleFileUpload 
} from './app_actions.js';

// --- NUEVO IMPORT ---
import { record360Video } from './video_recorder.js';

function updateSunPosition() {
    window.dispatchEvent(new Event('env-changed'));
}

export function initDOMEvents() {
    // --- PANELES FLOTANTES ---
    document.getElementById('btn-toggle-menu').addEventListener('click', () => toggleDisplay('ui-panel'));
    document.getElementById('btn-close-menu').addEventListener('click', () => document.getElementById('ui-panel').style.display = 'none');
    document.getElementById('btn-toggle-env').addEventListener('click', () => toggleDisplay('env-panel'));
    document.getElementById('btn-min-edit').addEventListener('click', () => toggleDisplay('edit-content'));

    // --- BARRA SUPERIOR (TOOLS) ---
    document.getElementById('btn-snap').addEventListener('click', () => { 
        state.isSnapping = !state.isSnapping; 
        const btn = document.getElementById('btn-snap');
        if(state.isSnapping) { btn.classList.add('active-snap'); showToast('Snapping Activado', 'info'); } 
        else { btn.classList.remove('active-snap'); showToast('Snapping Desactivado', 'info'); }
        window.dispatchEvent(new Event('snap-changed')); 
    });
    
    document.getElementById('btn-toggle-safety').addEventListener('click', () => {
        state.showSafetyZones = !state.showSafetyZones;
        const btn = document.getElementById('btn-toggle-safety');
        if(state.showSafetyZones) { btn.classList.remove('active-safety'); showToast('Zonas de seguridad visibles', 'info'); }
        else { btn.classList.add('active-safety'); showToast('Zonas de seguridad ocultas', 'info'); }
        state.safetyZonesList.forEach(obj => { obj.visible = state.showSafetyZones; });
    });

    document.getElementById('btn-toggle-grid').addEventListener('click', () => {
        if(!state.gridHelper) return;
        state.gridHelper.visible = !state.gridHelper.visible;
        const btn = document.getElementById('btn-toggle-grid');
        if(state.gridHelper.visible) { btn.classList.add('active-grid'); showToast('Cuadrícula visible (1x1m)', 'info'); } 
        else { btn.classList.remove('active-grid'); }
    });

    // --- HERRAMIENTAS SUELO ---
    if (!document.getElementById('mode-curve')) {
        const container = document.querySelector('#floor-input-panel div');
        if (container) {
            const btnCurve = document.createElement('button');
            btnCurve.id = 'mode-curve';
            btnCurve.className = 'btn-mini';
            btnCurve.innerText = 'Curva';
            container.appendChild(btnCurve);
            btnCurve.addEventListener('click', () => import('./floor.js').then(m => m.setFloorMode('curve')));
        }
    }

    document.getElementById('mode-poly').addEventListener('click', () => import('./floor.js').then(m => m.setFloorMode('poly')));
    document.getElementById('mode-rect').addEventListener('click', () => import('./floor.js').then(m => m.setFloorMode('rect')));
    document.getElementById('btn-floor').addEventListener('click', toggleFloorMode);
    document.getElementById('btn-add-point').addEventListener('click', addPointFromInput); 
    document.getElementById('btn-close-floor').addEventListener('click', () => {
        if (state.isDrawingFence) {
            finishFence();
        } else {
            import('./floor.js').then(m => { m.finishFloor(); m.toggleFloorMode(); });
        }
    });
    
    document.querySelectorAll('.input-box').forEach(i => { 
        i.addEventListener('focus', ()=>state.isInputFocused=true); 
        i.addEventListener('blur', ()=>state.isInputFocused=false); 
        i.addEventListener('input', updateFloorFromInput); 
    });

    // --- AMBIENTE ---
    document.getElementById('env-white').addEventListener('click', () => { 
        state.sky.visible=false; 
        updateSunPosition(); 
    });
    document.getElementById('env-morning').addEventListener('click', () => { 
        state.sky.visible=true; state.sunElevation=15; state.sunAzimuth=90; 
        document.getElementById('sun-azimuth').value=90; document.getElementById('sun-elevation').value=15;
        updateSunPosition(); 
    });
    document.getElementById('env-noon').addEventListener('click', () => { 
        state.sky.visible=true; state.sunElevation=80; state.sunAzimuth=180; 
        document.getElementById('sun-azimuth').value=180; document.getElementById('sun-elevation').value=80;
        updateSunPosition(); 
    });
    document.getElementById('env-evening').addEventListener('click', () => { 
        state.sky.visible=true; state.sunElevation=5; state.sunAzimuth=270; 
        document.getElementById('sun-azimuth').value=270; document.getElementById('sun-elevation').value=5;
        updateSunPosition(); 
    });
    
    document.getElementById('sun-azimuth').addEventListener('input', (e) => { state.sunAzimuth=e.target.value; updateSunPosition(); });
    document.getElementById('sun-elevation').addEventListener('input', (e) => { state.sunElevation=e.target.value; updateSunPosition(); });
    document.getElementById('light-intensity').addEventListener('input', (e) => { state.dirLight.intensity=e.target.value; });

    // --- TEXTURAS SUELO ---
    document.getElementById('tex-scale').addEventListener('input', updateTextureMapping);
    document.getElementById('tex-rotate').addEventListener('input', updateTextureMapping);
    document.getElementById('tex-off-x').addEventListener('input', updateTextureMapping);
    document.getElementById('tex-off-y').addEventListener('input', updateTextureMapping);
    document.getElementById('btn-floor-upload-tex').addEventListener('click', () => { document.getElementById('file-upload').click(); });

    document.getElementById('fc-garnet').addEventListener('click', () => setFloorColor(FLOOR_COLORS.garnet));
    document.getElementById('fc-blue').addEventListener('click', () => setFloorColor(FLOOR_COLORS.blue));
    document.getElementById('fc-green').addEventListener('click', () => setFloorColor(FLOOR_COLORS.green));
    document.getElementById('fc-black').addEventListener('click', () => setFloorColor(FLOOR_COLORS.black));

    // --- ACCIONES GENERALES ---
    document.getElementById('btn-screenshot').addEventListener('click', takeScreenshot);
    
    // --- NUEVO: LISTENER DE VIDEO 360 ---
    const btnVideo = document.getElementById('btn-record-video');
    if (btnVideo) btnVideo.addEventListener('click', record360Video);

    document.getElementById('btn-export-pdf').addEventListener('click', generateDossier);
    document.getElementById('btn-export-dxf').addEventListener('click', exportDXF);
    document.getElementById('btn-export-glb').addEventListener('click', exportGLB); 
    document.getElementById('btn-projection').addEventListener('click', toggleProjection);
    document.getElementById('btn-save-project').addEventListener('click', saveProject);
    
    document.getElementById('btn-load-project').addEventListener('click', () => document.getElementById('project-upload').click());
    document.getElementById('project-upload').addEventListener('change', (e) => { 
        const f=e.target.files[0]; if(!f)return; 
        const r=new FileReader(); 
        r.onload=(ev)=>{
            try{
                loadProjectData(JSON.parse(ev.target.result)); 
                showToast("Proyecto cargado.", 'success');
            }catch(x){ showToast("Error al leer archivo.", 'error'); }
        }; 
        r.readAsText(f); 
        e.target.value=''; 
    });
    
    document.getElementById('btn-mobile-ar').addEventListener('click', exportToMobile);

    // --- VISTAS ---
    document.getElementById('view-iso').addEventListener('click', ()=>setView('iso')); 
    document.getElementById('view-top').addEventListener('click', ()=>setView('top'));
    document.getElementById('view-front').addEventListener('click', ()=>setView('front'));
    document.getElementById('view-side').addEventListener('click', ()=>setView('side'));

    // --- EDICIÓN ---
    document.getElementById('btn-measure').addEventListener('click', toggleMeasureMode);
    document.getElementById('clear-measures').addEventListener('click', clearMeasurements);
    document.getElementById('btn-reset').addEventListener('click', resetScene); 
    document.getElementById('btn-lock').addEventListener('click', toggleLock);
    document.getElementById('btn-collision').addEventListener('click', toggleObjectCollision); 
    document.getElementById('btn-delete').addEventListener('click', deleteSelected);
    document.getElementById('btn-clone').addEventListener('click', cloneSelected);
    
    // --- HISTORIAL ---
    document.getElementById('btn-undo').addEventListener('click', undo); 
    document.getElementById('btn-redo').addEventListener('click', redo);

    // --- GIZMO MODES ---
    document.getElementById('mode-translate').addEventListener('click', ()=>setGizmoMode('translate')); 
    document.getElementById('mode-rotate').addEventListener('click', ()=>setGizmoMode('rotate'));
    document.getElementById('mode-scale').addEventListener('click', ()=>setGizmoMode('scale'));

    // --- CATÁLOGO ---
    document.getElementById('catalog-search').addEventListener('input', (e) => filterCatalog(e.target.value));
    document.getElementById('btn-show-list').addEventListener('click', updateAndShowList);

    // --- VALLAS ---
    document.getElementById('btn-fence').addEventListener('click', toggleFenceMode);

    const fenceSelect = document.getElementById('fence-model-select');
    if(fenceSelect) {
        fenceSelect.addEventListener('change', (e) => {
            import('./fence.js').then(m => {
                m.setFenceConfig(e.target.value);
            });
        });
    }
    
    ['fence-col-post', 'fence-col-a', 'fence-col-b', 'fence-col-c'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('input', (e) => {
                const key = id.replace('fence-col-', '').replace('post', 'post').replace('a', 'slatA').replace('b', 'slatB').replace('c', 'slatC');
                import('./fence.js').then(m => m.setFenceConfig(null, key, e.target.value));
            });
        }
    });

    document.getElementById('btn-upload-trigger').addEventListener('click', () => document.getElementById('file-upload').click());
    document.getElementById('file-upload').addEventListener('change', handleFileUpload);

    document.getElementById('btn-auth-trigger').addEventListener('click', () => {
        if(state.currentUser) {
            if(confirm("¿Cerrar sesión?")) logoutUser();
        } else {
            document.getElementById('auth-panel').style.display = 'flex';
        }
    });

    document.getElementById('toggle-auth-mode').addEventListener('click', () => {
        const regBtn = document.getElementById('btn-register-submit');
        const logBtn = document.getElementById('btn-login-submit');
        const fields = document.getElementById('register-fields');
        const toggle = document.getElementById('toggle-auth-mode');
        
        if (regBtn.style.display === 'none') {
            regBtn.style.display = 'block';
            logBtn.style.display = 'none';
            fields.style.display = 'block';
            toggle.innerHTML = '¿Ya tienes cuenta? <span style="color:#4a90e2; text-decoration:underline;">Inicia sesión</span>';
        } else {
            regBtn.style.display = 'none';
            logBtn.style.display = 'block';
            fields.style.display = 'none';
            toggle.innerHTML = '¿No tienes cuenta? <span style="color:#4a90e2; text-decoration:underline;">Regístrate aquí</span>';
        }
    });

    document.getElementById('btn-login-submit').addEventListener('click', async () => {
        const e = document.getElementById('auth-email').value;
        const p = document.getElementById('auth-pass').value;
        if(e && p) await loginUser(e, p);
    });

    document.getElementById('btn-register-submit').addEventListener('click', async () => {
        const e = document.getElementById('auth-email').value;
        const p = document.getElementById('auth-pass').value;
        const c = document.getElementById('auth-company').value;
        if(e && p) await registerUser(e, p, c);
    });

    document.getElementById('btn-save-cloud').addEventListener('click', saveProjectToCloud);
    document.getElementById('btn-load-cloud').addEventListener('click', loadUserProjects);
}