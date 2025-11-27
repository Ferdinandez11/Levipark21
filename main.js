// main.js
// ... (imports anteriores se mantienen igual, solo añadimos initSupabase) ...
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'; 

import { toggleFenceMode, addFencePoint, updateFencePreview, finishFence } from './fence.js';

// NUEVO: Importamos funciones del backend
import { initSupabase, loginUser, registerUser, logoutUser, saveProjectToCloud, loadUserProjects } from './backend.js';

// Módulos
import { state, updateBudget } from './globals.js';
import { LOGO_URL, FLOOR_COLORS } from './config.js';
import { showToast, askUser, toggleDisplay, preloadLogo, updateLoadingText, processSafetyZones } from './utils.js';
import { loadSheetData, filterCatalog, prepareToPlace, initCatalogUI } from './catalog.js';
import { 
    toggleMeasureMode, toggleFloorMode, updateMeasureLine, clearMeasurements, updateFloorDraft, 
    addPointFromInput, finishFloor, updateFloorFromInput, applyTextureToSelectedFloor,
    prepareCustomFloor, setFloorColor, updateTextureMapping, addFloorPoint, updateFloorInfoLabel, createMeasureMarker
} from './floor.js';
import { 
    selectObject, deselectObject, deleteSelected, cloneSelected, checkCollisions, 
    snapToFloor, toggleLock, toggleObjectCollision, setGizmoMode 
} from './interaction.js';
import { 
    undo, redo, saveHistory, saveToLocalStorage, loadProjectData, saveProject, resetScene 
} from './history.js';
import { generateDossier, exportToMobile } from './exporters.js';
import { exportDXF } from './dxf_exporter.js';

let dragStartData = { pos: new THREE.Vector3(), rot: new THREE.Euler(), scale: new THREE.Vector3() };
let reticle;

// --- INICIO ---
init();

async function init() {
    // 1. INICIALIZAR BACKEND (SUPABASE)
    initSupabase();

    state.loadingManager = new THREE.LoadingManager();
    state.loadingManager.onStart = (url) => { document.getElementById('loading').style.display='block'; document.getElementById('loading-text').innerText='Iniciando carga...'; };
    state.loadingManager.onProgress = (url, loaded, total) => { document.getElementById('loading-text').innerText=`Cargando... ${Math.round((loaded/total)*100)}%`; };
    state.loadingManager.onLoad = () => { document.getElementById('loading').style.display='none'; };
    
    state.loader = new GLTFLoader(state.loadingManager);
    state.textureLoader = new THREE.TextureLoader(state.loadingManager);

    state.scene = new THREE.Scene();

    state.perspectiveCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    state.perspectiveCamera.position.set(10, 10, 10);
    
    const aspect = window.innerWidth / window.innerHeight;
    const d = 20;
    state.orthoCamera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
    state.orthoCamera.position.set(20, 20, 20);
    state.activeCamera = state.perspectiveCamera;

    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping; 
    state.renderer.toneMappingExposure = 0.8;
    state.renderer.xr.enabled = true;
    document.body.appendChild(state.renderer.domElement);
    
    setupPostProcessing();

    const arBtn = ARButton.createButton(state.renderer, { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: document.body } });
    document.body.appendChild(arBtn);

    state.renderer.xr.addEventListener('sessionstart', () => { document.body.style.background = 'transparent'; if(state.sky) state.sky.visible=false; state.scene.background=null; if(reticle) reticle.visible=true; });
    state.renderer.xr.addEventListener('sessionend', () => { document.body.style.background = '#222'; if(state.sky) { state.sky.visible=true; updateSunPosition(); } if(reticle) reticle.visible=false; });

    reticle = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    reticle.matrixAutoUpdate = false; reticle.visible = false; state.scene.add(reticle);

    state.hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6); state.scene.add(state.hemiLight);
    state.dirLight = new THREE.DirectionalLight(0xffffff, 3); state.dirLight.castShadow = true;
    state.dirLight.shadow.camera.left = -100; state.dirLight.shadow.camera.right = 100; state.dirLight.shadow.camera.top = 100; state.dirLight.shadow.camera.bottom = -100;
    state.dirLight.shadow.mapSize.set(2048, 2048); state.dirLight.shadow.bias = -0.0001;
    state.scene.add(state.dirLight);

    const shadowGeo = new THREE.PlaneGeometry(500, 500);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.3, color: 0x000000 });
    state.shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    state.shadowPlane.rotation.x = -Math.PI / 2; state.shadowPlane.position.y = 0.001; state.shadowPlane.receiveShadow = true;
    state.scene.add(state.shadowPlane);

    state.gridHelper = new THREE.GridHelper(100, 100, 0x888888, 0x444444);
    state.gridHelper.visible = false; 
    state.gridHelper.position.y = 0.002; 
    state.scene.add(state.gridHelper);

    state.controls = new OrbitControls(state.activeCamera, state.renderer.domElement); state.controls.enableDamping = true; 

    state.transformControl = new TransformControls(state.activeCamera, state.renderer.domElement);
    state.transformControl.addEventListener('dragging-changed', function (event) { 
        state.controls.enabled = !event.value; 
        if (event.value) { 
            if (state.selectedObject) { 
                dragStartData.pos.copy(state.selectedObject.position); 
                dragStartData.rot.copy(state.selectedObject.rotation);
                dragStartData.scale.copy(state.selectedObject.scale);
            } 
        } else { 
            if (state.selectedObject) { 
                if (state.isColliding) { 
                    state.selectedObject.position.copy(dragStartData.pos); 
                    state.selectedObject.rotation.copy(dragStartData.rot);
                    state.selectedObject.scale.copy(dragStartData.scale);
                    checkCollisions(); 
                    showToast('¡Colisión detectada! Revertido.', 'error');
                } else { 
                    snapToFloor(state.selectedObject); 
                } 
                saveHistory(); 
            } 
        }
    });
    state.transformControl.addEventListener('change', function () { if (state.selectedObject) checkCollisions(); });
    state.scene.add(state.transformControl);
    
    updateSnapSettings();
    initSky();
    window.addEventListener('resize', onWindowResize);

    const urlParams = new URLSearchParams(window.location.search);
    const compressedData = urlParams.get('data');
    if (compressedData) {
        document.getElementById('loading').style.display = 'block';
        try {
            const jsonString = window.LZString.decompressFromEncodedURIComponent(compressedData);
            if(jsonString) { loadProjectData(JSON.parse(jsonString)); window.history.replaceState({}, document.title, window.location.pathname); showToast('Proyecto móvil cargado', 'success'); }
        } catch (err) { console.error(err); showToast('Error al cargar proyecto móvil', 'error'); }
        document.getElementById('loading').style.display = 'none';
    } else {
        await loadSheetData();
        const s = localStorage.getItem('levipark_autosave'); if(s) { try { loadProjectData(JSON.parse(s)); } catch(e){} }
    }

    setupEventListeners();
    setupAuthListeners(); // <--- NUEVOS LISTENERS DE LOGIN

    document.getElementById('btn-fence').addEventListener('click', toggleFenceMode);    
    setupUploadSystem();
    preloadLogo(LOGO_URL, state);
    
    setInterval(saveToLocalStorage, 30000);
    state.renderer.setAnimationLoop(render);
}

// ... (RESTO DE FUNCIONES DE SETUP IGUAL QUE ANTES) ...
function setupPostProcessing() {
    state.composer = new EffectComposer(state.renderer);
    state.composer.addPass(new RenderPass(state.scene, state.activeCamera));
    state.outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), state.scene, state.activeCamera);
    state.outlinePass.edgeStrength = 3.0; state.outlinePass.visibleEdgeColor.setHex(0xffff00); state.outlinePass.hiddenEdgeColor.setHex(0xffaa00);
    state.composer.addPass(state.outlinePass);
    state.composer.addPass(new OutputPass());
}

function initSky() {
    state.sky = new Sky(); state.sky.scale.setScalar(450000); state.scene.add(state.sky); state.sun = new THREE.Vector3();
    const uniforms = state.sky.material.uniforms; uniforms['turbidity'].value = 10; uniforms['rayleigh'].value = 2; uniforms['mieCoefficient'].value = 0.005; uniforms['mieDirectionalG'].value = 0.8;
    updateSunPosition();
}
function updateSunPosition() {
    const phi = THREE.MathUtils.degToRad(90 - state.sunElevation); const theta = THREE.MathUtils.degToRad(state.sunAzimuth);
    state.sun.setFromSphericalCoords(1, phi, theta); state.sky.material.uniforms['sunPosition'].value.copy(state.sun);
    state.dirLight.position.setFromSphericalCoords(100, phi, theta);
    if (state.renderer && state.sky.visible) { 
        const pmremGenerator = new THREE.PMREMGenerator(state.renderer); 
        state.scene.environment = pmremGenerator.fromScene(state.sky).texture; 
        state.scene.background = null; 
    } else {
        state.scene.environment = null;
        state.scene.background = new THREE.Color(0xffffff);
    }
}

function updateSnapSettings() {
    if(state.isSnapping) {
        state.transformControl.setTranslationSnap(0.5); state.transformControl.setRotationSnap(THREE.MathUtils.degToRad(45));
    } else {
        state.transformControl.setTranslationSnap(null); state.transformControl.setRotationSnap(THREE.MathUtils.degToRad(15));
    }
}

function setupUploadSystem() {
    document.getElementById('btn-upload-trigger').addEventListener('click', () => document.getElementById('file-upload').click());
    document.getElementById('file-upload').addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const name = file.name.toLowerCase();
        if (name.endsWith('.glb') || name.endsWith('.gltf')) {
            const reader = new FileReader(); reader.readAsDataURL(file);
            reader.onload = function(evt) { 
                prepareImportedModel(URL.createObjectURL(file), file.name, evt.target.result); 
            };
        } else if (name.endsWith('.jpg') || name.endsWith('.png') || name.endsWith('.jpeg')) {
            const url = URL.createObjectURL(file);
            if (state.selectedObject && state.selectedObject.userData.isFloor) applyTextureToSelectedFloor(url, file.name);
            else prepareCustomFloor(url, file.name);
        }
        e.target.value = "";
    });
}

async function prepareImportedModel(url, filename, base64Data) {
    if (state.isMeasuring) toggleMeasureMode(); if (state.isDrawingFloor) toggleFloorMode(); deselectObject();
    
    // Generar ID único para este asset
    const assetId = "import_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    state.assetCache[assetId] = base64Data;
    
    const userRef = await askUser("Referencia del modelo:", "CUSTOM") || "CUSTOM";
    const priceStr = await askUser("Precio unitario (€):", "0");
    const userPrice = parseFloat(priceStr) || 0;

    window.currentProductData = { 
        name: filename, 
        price: userPrice, 
        ref: userRef, 
        desc: "Importado", 
        dims: "Custom",
        assetId: assetId 
    };
    
    state.productToPlace = url; 
    state.productPrice = userPrice; 
    state.pendingModelBase64 = base64Data; 
    state.pendingAssetId = assetId;

    showToast("Haz click en el suelo para colocar.", 'success');
}

function placeObject(p) { 
    document.getElementById('loading').style.display='block'; 
    const u=state.productToPlace; 
    const b64=state.pendingModelBase64; 
    const assetId = state.pendingAssetId; 

    state.loader.load(u, (g)=>{ 
        const m=g.scene; m.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); 
        processSafetyZones(m); 
        m.position.set(p.x,0,p.z); 
        m.userData=JSON.parse(JSON.stringify(window.currentProductData)); 
        m.userData.modelFile=u; 
        if(assetId) {
            m.userData.assetId = assetId;
            m.userData.modelBase64 = null; 
        } else {
            m.userData.modelBase64 = b64; 
        }

        m.userData.locked=false; m.userData.collides=true; 
        state.scene.add(m); state.objectsInScene.push(m); state.totalPrice+=m.userData.price; updateBudget(); 
        selectObject(m); snapToFloor(m); saveHistory(); 
        document.getElementById('loading').style.display='none'; 
        
        state.productToPlace=null; 
        state.pendingModelBase64=null; 
        state.pendingAssetId=null;
        
        document.querySelectorAll('.btn-product').forEach(btn=>btn.classList.remove('active')); 
        showToast("Objeto colocado", 'success'); 
    }); 
}

// --- NUEVA FUNCIÓN: Exportar GLB ---
async function exportGLB() {
    if (state.objectsInScene.length === 0) {
        showToast("Escena vacía", "error");
        return;
    }

    const name = await askUser("Nombre del archivo .glb:", "diseño_3d");
    if(!name) return;

    document.getElementById('loading').style.display = 'block';
    updateLoadingText("Generando GLB 3D...");

    // Limpiamos la escena de helpers antes de exportar
    const prevVisibleGrid = state.gridHelper.visible;
    state.gridHelper.visible = false;
    state.transformControl.detach();
    if(state.measureLine) state.measureLine.visible = false;
    state.measureMarkers.forEach(m => m.visible = false);
    state.shadowPlane.visible = false;

    // Crear un grupo temporal con los objetos a exportar
    const exportGroup = new THREE.Group();
    state.objectsInScene.forEach(obj => {
        const clone = obj.clone();
        exportGroup.add(clone);
    });

    const exporter = new GLTFExporter();
    exporter.parse(
        exportGroup,
        function (gltf) {
            const blob = new Blob([gltf], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name.endsWith('.glb') ? name : name + '.glb';
            a.click();
            
            // Restaurar estado
            state.gridHelper.visible = prevVisibleGrid;
            state.shadowPlane.visible = true;
            if(state.measureLine) state.measureLine.visible = true;
            state.measureMarkers.forEach(m => m.visible = true);
            if(state.selectedObject) state.transformControl.attach(state.selectedObject);
            
            document.getElementById('loading').style.display = 'none';
            showToast("Exportación GLB completa", "success");
        },
        function (error) {
            console.error(error);
            showToast("Error al exportar GLB", "error");
            document.getElementById('loading').style.display = 'none';
        },
        { binary: true } // Exportar como .glb binario
    );
}

// --- LISTENERS UI (Eventos) ---

function setupAuthListeners() {
    // Botón abrir modal login
    document.getElementById('btn-auth-trigger').addEventListener('click', () => {
        if(state.currentUser) {
            // Si ya está logueado, al hacer click cierra sesión (o abre perfil, aquí simplificado a cerrar)
            if(confirm("¿Cerrar sesión?")) logoutUser();
        } else {
            document.getElementById('auth-panel').style.display = 'flex';
        }
    });

    // Toggle Registro/Login
    document.getElementById('toggle-auth-mode').addEventListener('click', () => {
        const regBtn = document.getElementById('btn-register-submit');
        const logBtn = document.getElementById('btn-login-submit');
        const fields = document.getElementById('register-fields');
        const toggle = document.getElementById('toggle-auth-mode');
        
        if (regBtn.style.display === 'none') {
            // Cambiar a Modo Registro
            regBtn.style.display = 'block';
            logBtn.style.display = 'none';
            fields.style.display = 'block';
            toggle.innerHTML = '¿Ya tienes cuenta? <span style="color:#4a90e2; text-decoration:underline;">Inicia sesión</span>';
        } else {
            // Cambiar a Modo Login
            regBtn.style.display = 'none';
            logBtn.style.display = 'block';
            fields.style.display = 'none';
            toggle.innerHTML = '¿No tienes cuenta? <span style="color:#4a90e2; text-decoration:underline;">Regístrate aquí</span>';
        }
    });

    // Submit Login
    document.getElementById('btn-login-submit').addEventListener('click', async () => {
        const e = document.getElementById('auth-email').value;
        const p = document.getElementById('auth-pass').value;
        if(e && p) await loginUser(e, p);
    });

    // Submit Registro
    document.getElementById('btn-register-submit').addEventListener('click', async () => {
        const e = document.getElementById('auth-email').value;
        const p = document.getElementById('auth-pass').value;
        const c = document.getElementById('auth-company').value;
        if(e && p) await registerUser(e, p, c);
    });

    // Botones Nube
    document.getElementById('btn-save-cloud').addEventListener('click', saveProjectToCloud);
    document.getElementById('btn-load-cloud').addEventListener('click', loadUserProjects);
}


function setupEventListeners() {
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);

    // UI Toggles
    document.getElementById('btn-toggle-menu').addEventListener('click', () => toggleDisplay('ui-panel'));
    document.getElementById('btn-close-menu').addEventListener('click', () => document.getElementById('ui-panel').style.display = 'none');
    document.getElementById('btn-toggle-env').addEventListener('click', () => toggleDisplay('env-panel'));
    document.getElementById('btn-min-edit').addEventListener('click', () => toggleDisplay('edit-content'));

    // Herramientas
    document.getElementById('btn-snap').addEventListener('click', () => { 
        state.isSnapping = !state.isSnapping; 
        const btn = document.getElementById('btn-snap');
        if(state.isSnapping) { btn.classList.add('active-snap'); showToast('Snapping Activado', 'info'); } 
        else { btn.classList.remove('active-snap'); showToast('Snapping Desactivado', 'info'); }
        updateSnapSettings();
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

    // Floor
    document.getElementById('mode-poly').addEventListener('click', () => setFloorMode('poly'));
    document.getElementById('mode-rect').addEventListener('click', () => setFloorMode('rect'));
    document.getElementById('btn-floor').addEventListener('click', toggleFloorMode);
    document.getElementById('btn-add-point').addEventListener('click', addPointFromInput); 
    document.getElementById('btn-close-floor').addEventListener('click', () => {
    if (state.isDrawingFence) {
        finishFence();
        } else {
        import('./floor.js').then(m => { m.finishFloor(); m.toggleFloorMode(); });
        }
    });
    
    // Inputs Focus
    document.querySelectorAll('.input-box').forEach(i => { i.addEventListener('focus', ()=>state.isInputFocused=true); i.addEventListener('blur', ()=>state.isInputFocused=false); i.addEventListener('input', updateFloorFromInput); });

    // Environment
    document.getElementById('env-white').addEventListener('click', () => { state.sky.visible=false; updateSunPosition(); });
    document.getElementById('env-morning').addEventListener('click', () => { state.sky.visible=true; state.sunElevation=15; state.sunAzimuth=90; updateSunPosition(); document.getElementById('sun-azimuth').value=90; document.getElementById('sun-elevation').value=15; });
    document.getElementById('env-noon').addEventListener('click', () => { state.sky.visible=true; state.sunElevation=80; state.sunAzimuth=180; updateSunPosition(); document.getElementById('sun-azimuth').value=180; document.getElementById('sun-elevation').value=80; });
    document.getElementById('env-evening').addEventListener('click', () => { state.sky.visible=true; state.sunElevation=5; state.sunAzimuth=270; updateSunPosition(); document.getElementById('sun-azimuth').value=270; document.getElementById('sun-elevation').value=5; });
    
    document.getElementById('sun-azimuth').addEventListener('input', (e) => { state.sunAzimuth=e.target.value; updateSunPosition(); });
    document.getElementById('sun-elevation').addEventListener('input', (e) => { state.sunElevation=e.target.value; updateSunPosition(); });
    document.getElementById('light-intensity').addEventListener('input', (e) => { state.dirLight.intensity=e.target.value; });

    // Texture
    document.getElementById('tex-scale').addEventListener('input', updateTextureMapping);
    document.getElementById('tex-rotate').addEventListener('input', updateTextureMapping);
    document.getElementById('tex-off-x').addEventListener('input', updateTextureMapping);
    document.getElementById('tex-off-y').addEventListener('input', updateTextureMapping);
    document.getElementById('btn-floor-upload-tex').addEventListener('click', () => { document.getElementById('file-upload').click(); });

    // Colors
    document.getElementById('fc-garnet').addEventListener('click', () => setFloorColor(FLOOR_COLORS.garnet));
    document.getElementById('fc-blue').addEventListener('click', () => setFloorColor(FLOOR_COLORS.blue));
    document.getElementById('fc-green').addEventListener('click', () => setFloorColor(FLOOR_COLORS.green));
    document.getElementById('fc-black').addEventListener('click', () => setFloorColor(FLOOR_COLORS.black));

    // Actions
    document.getElementById('btn-screenshot').addEventListener('click', takeScreenshot);
    document.getElementById('btn-export-pdf').addEventListener('click', generateDossier);
    document.getElementById('btn-export-dxf').addEventListener('click', exportDXF);
    document.getElementById('btn-export-glb').addEventListener('click', exportGLB); 
    document.getElementById('btn-projection').addEventListener('click', toggleProjection);
    document.getElementById('btn-save-project').addEventListener('click', saveProject);
    document.getElementById('btn-load-project').addEventListener('click', () => document.getElementById('project-upload').click());
    document.getElementById('project-upload').addEventListener('change', (e) => { const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=(ev)=>{try{loadProjectData(JSON.parse(ev.target.result)); showToast("Proyecto cargado.", 'success');}catch(x){ showToast("Error al leer archivo.", 'error'); }}; r.readAsText(f); e.target.value=''; });
    document.getElementById('btn-mobile-ar').addEventListener('click', exportToMobile);

    // Vistas
    document.getElementById('view-iso').addEventListener('click', ()=>setView('iso')); 
    document.getElementById('view-top').addEventListener('click', ()=>setView('top'));
    document.getElementById('view-front').addEventListener('click', ()=>setView('front'));
    document.getElementById('view-side').addEventListener('click', ()=>setView('side'));

    // Edit
    document.getElementById('btn-measure').addEventListener('click', toggleMeasureMode);
    document.getElementById('clear-measures').addEventListener('click', clearMeasurements);
    document.getElementById('btn-reset').addEventListener('click', resetScene); 
    document.getElementById('btn-lock').addEventListener('click', toggleLock);
    document.getElementById('btn-collision').addEventListener('click', toggleObjectCollision); 
    document.getElementById('btn-delete').addEventListener('click', deleteSelected);
    document.getElementById('btn-clone').addEventListener('click', cloneSelected);
    document.getElementById('btn-undo').addEventListener('click', undo); 
    document.getElementById('btn-redo').addEventListener('click', redo);

    document.getElementById('mode-translate').addEventListener('click', ()=>setGizmoMode('translate')); 
    document.getElementById('mode-rotate').addEventListener('click', ()=>setGizmoMode('rotate'));
    document.getElementById('mode-scale').addEventListener('click', ()=>setGizmoMode('scale'));

    document.getElementById('catalog-search').addEventListener('input', (e) => filterCatalog(e.target.value));
    document.getElementById('btn-show-list').addEventListener('click', updateAndShowList);

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
}


function onPointerDown(event) {
    if (event.target.closest('.modal-overlay')) return;
    if (event.target.closest('#ui-panel') || event.target.closest('#edit-panel') || event.target.closest('#env-panel') || event.target.closest('#floor-input-panel') || event.target.closest('#action-panel') || event.target.closest('#history-controls') || event.target.closest('#top-bar-controls') || event.target.closest('#qr-modal')) return;
    if (state.transformControl.axis) return;
    
    state.pointer.x = (event.clientX / window.innerWidth) * 2 - 1; state.pointer.y = - (event.clientY / window.innerHeight) * 2 + 1; state.raycaster.setFromCamera(state.pointer, state.activeCamera); 

    if (state.renderer.xr.isPresenting && state.productToPlace && reticle.visible) { placeObject(reticle.position); return; }
    
    if (state.isDrawingFloor) { 
        const i = state.raycaster.intersectObject(state.shadowPlane); 
        if (i.length>0) {
            if (state.floorMode === 'poly') {
                addFloorPoint(i[0].point); 
            } else if (state.floorMode === 'rect') {
                state.rectStartPoint = i[0].point; 
                const g = new THREE.PlaneGeometry(0.1, 0.1); g.rotateX(-Math.PI/2);
                state.rectPreviewMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x9b59b6, transparent: true, opacity: 0.5 }));
                state.rectPreviewMesh.position.copy(state.rectStartPoint); state.rectPreviewMesh.position.y += 0.02;
                state.scene.add(state.rectPreviewMesh);
            }
        }
        return; 
    }

    if (state.isDrawingFence) {
    const i = state.raycaster.intersectObject(state.shadowPlane);
    if (i.length > 0) {
        addFencePoint(i[0].point);
    }
    return;
}
    if (state.isMeasuring) { 
        const i = state.raycaster.intersectObjects([...state.objectsInScene, state.shadowPlane], true); 
        if(i.length>0) { 
            if(state.measurePoints.length===2) clearMeasurements(); 
            state.measurePoints.push(i[0].point); 
            createMeasureMarker(i[0].point); 
            if(state.measurePoints.length===2) updateMeasureLine(i[0].point); 
        } 
        return; 
    }
    if (state.productToPlace) { const i = state.raycaster.intersectObject(state.shadowPlane); if (i.length>0) placeObject(i[0].point); return; }

    const i = state.raycaster.intersectObjects(state.objectsInScene, true);
    if (i.length > 0) { let s = i[0].object; while (s.parent && !state.objectsInScene.includes(s)) s = s.parent; if(state.objectsInScene.includes(s)) selectObject(s); }
    else deselectObject();
}

function onPointerMove(event) {
    if (state.isInputFocused) return;
    state.pointer.x = (event.clientX / window.innerWidth) * 2 - 1; state.pointer.y = - (event.clientY / window.innerHeight) * 2 + 1; state.raycaster.setFromCamera(state.pointer, state.activeCamera);
    
    if (state.isDrawingFloor && state.floorMode === 'poly' && state.floorPoints.length>0) { 
        const i = state.raycaster.intersectObject(state.shadowPlane); 
        if(i.length>0) updateFloorDraft(i[0].point); 
    }
    if (state.isDrawingFloor && state.floorMode === 'rect' && state.rectStartPoint && state.rectPreviewMesh) {
        const i = state.raycaster.intersectObject(state.shadowPlane);
        if (i.length > 0) {
            const end = i[0].point;
            const width = Math.abs(end.x - state.rectStartPoint.x);
            const depth = Math.abs(end.z - state.rectStartPoint.z);
            const centerX = (state.rectStartPoint.x + end.x) / 2;
            const centerZ = (state.rectStartPoint.z + end.z) / 2;
            state.rectPreviewMesh.scale.set(Math.max(0.1, width), Math.max(0.1, depth), 1); 
            state.rectPreviewMesh.position.set(centerX, 0.02, centerZ);
            updateFloorInfoLabel(`${width.toFixed(2)}m x ${depth.toFixed(2)}m`, new THREE.Vector3(centerX, 0, centerZ));
        }
    }
    if (state.isMeasuring && state.measurePoints.length===1) { const i = state.raycaster.intersectObjects([...state.objectsInScene, state.shadowPlane], true); if(i.length>0) updateMeasureLine(i[0].point); }
    if (state.isDrawingFence) {
    const i = state.raycaster.intersectObject(state.shadowPlane);
    if(i.length > 0) updateFencePreview();
    }
}

function onPointerUp(event) {
    if (state.isDrawingFloor && state.floorMode === 'rect' && state.rectStartPoint && state.rectPreviewMesh) {
        const width = state.rectPreviewMesh.scale.x; const depth = state.rectPreviewMesh.scale.y; const pos = state.rectPreviewMesh.position.clone();
        state.scene.remove(state.rectPreviewMesh); state.scene.remove(state.floorLabel); state.rectStartPoint = null; state.rectPreviewMesh = null;
        if (width < 0.2 || depth < 0.2) return; 
        const area = width * depth; const pr = Math.round(area * 40); // 40 hardcoded or imported from config
        const mat = new THREE.MeshStandardMaterial({ color: FLOOR_COLORS.garnet, roughness:0.5 });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
        m.rotation.x = -Math.PI/2; m.position.set(pos.x, 0.01, pos.z); m.receiveShadow = true; m.castShadow = true;
        m.userData = { price: pr, locked:false, collides:true, isFloor:true, area: area.toFixed(2), name: "Suelo Rectangular", ref: "S-Rect", dims: `${width.toFixed(2)}x${depth.toFixed(2)}` };
        state.scene.add(m); state.objectsInScene.push(m); state.totalPrice += pr; updateBudget(); selectObject(m); saveHistory(); toggleFloorMode();
    }
}

function onKeyDown(e) { 
    if(state.isInputFocused) return;
    if(e.key==='Delete') deleteSelected(); 
    if(e.key==='t') setGizmoMode('translate'); 
    if(e.key==='r') setGizmoMode('rotate');
    if(e.key==='e') setGizmoMode('scale');
    if(e.key==='c' || e.key==='C') cloneSelected();
    if(e.key==='s' || e.key==='S') document.getElementById('btn-snap').click();
    if(e.ctrlKey && e.key==='z') undo(); 
    if(e.ctrlKey && e.key==='y') redo();
}

function toggleProjection() { 
    const p=state.activeCamera.position.clone(), t=state.controls.target.clone(); 
    state.activeCamera = (state.activeCamera===state.perspectiveCamera)?state.orthoCamera:state.perspectiveCamera; 
    state.activeCamera.position.copy(p); state.activeCamera.lookAt(t); 
    state.controls.object=state.activeCamera; state.transformControl.camera=state.activeCamera; 
    if (state.activeCamera === state.orthoCamera) { const aspect = window.innerWidth / window.innerHeight; state.orthoCamera.left = -20 * aspect; state.orthoCamera.right = 20 * aspect; state.orthoCamera.top = 20; state.orthoCamera.bottom = -20; state.orthoCamera.updateProjectionMatrix(); } 
    state.composer.passes.forEach(pass => { if(pass.camera) pass.camera = state.activeCamera; }); 
    document.getElementById('btn-projection').innerText = (state.activeCamera===state.perspectiveCamera)?"👁️ Perspectiva":"📐 Ortográfica"; 
}

function setView(v) { 
    state.controls.target.set(0,0,0); const d=20; 
    if(v==='iso') state.activeCamera.position.set(d,d,d); 
    if(v==='top') state.activeCamera.position.set(0,d,0); 
    if(v==='front') state.activeCamera.position.set(0,0,d); 
    if(v==='side') state.activeCamera.position.set(d,0,0); 
    state.activeCamera.lookAt(0,0,0); state.controls.update(); 
}

function takeScreenshot() { 
    state.transformControl.detach(); state.outlinePass.selectedObjects=[]; state.composer.render(); 
    const d=state.renderer.domElement.toDataURL('image/jpeg',0.9); 
    const a=document.createElement('a'); a.download='diseño.jpg'; a.href=d; a.click(); 
    if(state.selectedObject) selectObject(state.selectedObject); 
    showToast("Captura guardada", 'success'); 
}

function updateAndShowList() {
    const container = document.getElementById('list-content'); container.innerHTML = "";
    if (state.objectsInScene.length === 0) {
        container.innerHTML = "<p style='color:#aaa; text-align:center;'>El proyecto está vacío.</p>";
    } else {
        state.objectsInScene.forEach((obj, index) => {
            const row = document.createElement('div'); row.className = 'list-item-row';
            const nameDiv = document.createElement('div'); nameDiv.className = 'list-item-name';
            const icon = obj.userData.isFloor ? '⬛' : '🌳';
            nameDiv.innerText = `${icon} ${obj.userData.name} (${obj.userData.ref})`;
            const priceDiv = document.createElement('div'); priceDiv.className = 'list-item-price';
            priceDiv.innerText = (obj.userData.price || 0) + "€";
            const delBtn = document.createElement('button'); delBtn.className = 'btn-delete-item'; delBtn.innerText = '🗑️';
            delBtn.onclick = () => { if(!obj.userData.locked) { selectObject(obj); deleteSelected(); updateAndShowList(); } else { showToast("Elemento bloqueado.", 'error'); } };
            row.appendChild(nameDiv); row.appendChild(priceDiv); row.appendChild(delBtn); container.appendChild(row);
        });
    }
    document.getElementById('list-total-price').innerText = state.totalPrice.toLocaleString('es-ES') + " €";
    document.getElementById('list-modal').style.display = 'flex';
}

function onWindowResize() { 
    const w=window.innerWidth, h=window.innerHeight; 
    state.perspectiveCamera.aspect=w/h; state.perspectiveCamera.updateProjectionMatrix(); 
    state.renderer.setSize(w,h); state.composer.setSize(w,h); 
}

function render(timestamp, frame) { 
    state.controls.update(); 
    if (state.renderer.xr.isPresenting) state.renderer.render(state.scene, state.activeCamera); 
    else state.composer.render(); 
}