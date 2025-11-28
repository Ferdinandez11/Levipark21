// --- START OF FILE main.js ---

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

import { initSupabase } from './backend.js';
import { state } from './globals.js'; 
import { LOGO_URL } from './config.js';
import { showToast, preloadLogo, processSafetyZones, loadGLTFPromise } from './utils.js';
import { loadSheetData } from './catalog.js';
import { 
    updateMeasureLine, clearMeasurements, updateFloorDraft, 
    addFloorPoint, updateFloorInfoLabel, createMeasureMarker, toggleFloorMode
} from './floor.js';
import { 
    selectObject, deselectObject, checkCollisions, 
    snapToFloor, setGizmoMode 
} from './interaction.js';
import { 
    saveHistory, saveToLocalStorage, loadProjectData 
} from './history.js';
import { addFencePoint, updateFencePreview, toggleFenceMode } from './fence.js';

// NUEVO: Importamos el gestor de UI
import { initDOMEvents } from './ui_manager.js';

let dragStartData = { pos: new THREE.Vector3(), rot: new THREE.Euler(), scale: new THREE.Vector3() };
let reticle;

init();

async function init() {
    initSupabase();

    state.loadingManager = new THREE.LoadingManager();
    state.loadingManager.onStart = () => { document.getElementById('loading').style.display='block'; document.getElementById('loading-text').innerText='Iniciando carga...'; };
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

    // Escuchar eventos personalizados de UI Manager
    window.addEventListener('env-changed', updateSunPosition);
    window.addEventListener('snap-changed', updateSnapSettings);

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

    // --- INICIALIZACIÓN DE EVENTOS DEL DOM SEPARADA ---
    initDOMEvents();

    setupEventListeners(); // Mantiene listeners de pointer/keyboard (lógica de escena)
    
    preloadLogo(LOGO_URL, state);
    
    setInterval(saveToLocalStorage, 30000);
    state.renderer.setAnimationLoop(render);
}

// placeObject se mantiene aquí porque es lógica de escena pura invocada por raycaster
async function placeObject(p) { 
    document.getElementById('loading').style.display='block'; 
    const u=state.productToPlace; 
    const b64=state.pendingModelBase64; 
    const assetId = state.pendingAssetId; 

    try {
        const gltf = await loadGLTFPromise(u);
        const m = gltf.scene; 
        m.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}}); 
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
        state.scene.add(m); state.objectsInScene.push(m); 
        state.totalPrice += m.userData.price; 
        
        selectObject(m); snapToFloor(m); saveHistory(); 
        
        state.productToPlace=null; 
        state.pendingModelBase64=null; 
        state.pendingAssetId=null;
        
        document.querySelectorAll('.btn-product').forEach(btn=>btn.classList.remove('active')); 
        showToast("Objeto colocado", 'success'); 
    } catch(err) {
        console.error(err);
        showToast("Error al colocar objeto", 'error');
    } finally {
        document.getElementById('loading').style.display='none'; 
    }
}

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

// Listener de input y eventos de ventana (Lógica Core)
function setupEventListeners() {
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
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
            // Aceptamos Poly o Curve como puntos
            if (state.floorMode === 'poly' || state.floorMode === 'curve') {
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
    
    if (state.isDrawingFloor && (state.floorMode === 'poly' || state.floorMode === 'curve') && state.floorPoints.length>0) { 
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
        
        // Importación dinámica de tema para no romper encapsulamiento, aunque es un color suelto.
        import('./config.js').then(config => {
             const area = width * depth; const pr = Math.round(area * 40); 
             const mat = new THREE.MeshStandardMaterial({ color: config.FLOOR_COLORS.garnet, roughness:0.5 });
             const m = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
             m.rotation.x = -Math.PI/2; m.position.set(pos.x, 0.01, pos.z); m.receiveShadow = true; m.castShadow = true;
             m.userData = { price: pr, locked:false, collides:true, isFloor:true, area: area.toFixed(2), name: "Suelo Rectangular", ref: "S-Rect", dims: `${width.toFixed(2)}x${depth.toFixed(2)}` };
             state.scene.add(m); state.objectsInScene.push(m); 
             state.totalPrice += pr; 
             selectObject(m); saveHistory(); toggleFloorMode();
        });
    }
}

function onKeyDown(e) { 
    if(state.isInputFocused) return;
    // Utilizamos imports dinámicos o funciones exportadas para acciones que no están en main
    if(e.key==='Delete') import('./interaction.js').then(m=>m.deleteSelected()); 
    if(e.key==='t') setGizmoMode('translate'); 
    if(e.key==='r') setGizmoMode('rotate');
    if(e.key==='e') setGizmoMode('scale');
    if(e.key==='c' || e.key==='C') import('./interaction.js').then(m=>m.cloneSelected());
    if(e.key==='s' || e.key==='S') document.getElementById('btn-snap').click();
    if(e.ctrlKey && e.key==='z') import('./history.js').then(m=>m.undo()); 
    if(e.ctrlKey && e.key==='y') import('./history.js').then(m=>m.redo());
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