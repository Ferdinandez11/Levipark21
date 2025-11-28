// --- START OF FILE history.js ---

import * as THREE from 'three';
import { state } from './globals.js';
import { FLOOR_COLORS } from './config.js';
import { showToast, askUser, processSafetyZones, loadGLTFPromise, disposeHierarchy } from './utils.js';
import { deselectObject } from './interaction.js';
import { createFenceObject } from './fence.js'; // Importamos el constructor unificado

let localStorageWarningShown = false; 

export function saveHistory() { 
    if (state.historyStep < state.historyStack.length - 1) {
        state.historyStack = state.historyStack.slice(0, state.historyStep + 1); 
    }

    // Snapshot optimizado
    const snapshot = state.objectsInScene.map(obj => {
        const data = JSON.parse(JSON.stringify(obj.userData));
        if (data.assetId && data.modelBase64) {
            delete data.modelBase64;
        }

        return { 
            type: getObjectType(obj), 
            pos: obj.position.clone(), 
            rot: obj.rotation.clone(), 
            scale: obj.scale.clone(), 
            data: data 
        };
    });

    state.historyStack.push(JSON.stringify(snapshot)); 
    state.historyStep++; 
    
    if (state.historyStack.length > 50) { 
        state.historyStack.shift(); 
        state.historyStep--; 
    } 
}

function getObjectType(obj) {
    if (obj.userData.isFloor) return 'floor';
    if (obj.userData.isFence) return 'fence';
    return 'model';
}

export function undo() { 
    if (state.historyStep > 0) { 
        state.historyStep--; 
        restoreState(state.historyStack[state.historyStep]); 
        showToast("Deshacer", 'info');
    } 
}

export function redo() { 
    if (state.historyStep < state.historyStack.length - 1) { 
        state.historyStep++; 
        restoreState(state.historyStack[state.historyStep]); 
        showToast("Rehacer", 'info');
    } 
}

export function restoreState(json) {
    // Limpieza profunda de memoria antes de restaurar
    state.objectsInScene.forEach(o => disposeHierarchy(o, true));
    state.objectsInScene.length = 0; 
    state.totalPrice = 0; 
    deselectObject();

    const items = JSON.parse(json);
    items.forEach(i => {
        if (i.data && i.data.isFence) reconstructFence(i);
        else if (i.type === 'floor' || i.data.isFloor) reconstructFloor(i);
        else reconstructModel(i);
    });
}

function reconstructFloor(i) {
    const sc = i.scale || {x:1, y:1, z:1};
    if(i.data.dims && i.data.dims.includes("x")) { 
        const dims = i.data.dims.split("x"); const w = parseFloat(dims[0]); const h = parseFloat(dims[1]);
        let mat;
        if(i.data.img_2d && i.data.img_2d.startsWith("data:")) {
            const tex = state.textureLoader.load(i.data.img_2d);
            tex.colorSpace = THREE.SRGBColorSpace; tex.center.set(0.5, 0.5);
            if(i.data.texSettings) { tex.repeat.set(i.data.texSettings.repeat, i.data.texSettings.repeat); tex.rotation = i.data.texSettings.rotation; tex.offset.set(i.data.texSettings.offsetX, i.data.texSettings.offsetY); }
            mat = new THREE.MeshStandardMaterial({ map: tex, roughness:0.6, metalness:0.1, transparent: true, color: 0xffffff }); 
        } else { mat = new THREE.MeshStandardMaterial({ color: FLOOR_COLORS.garnet, roughness:0.5 }); }
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        m.rotation.set(i.rot._x, i.rot._y, i.rot._z); m.position.set(i.pos.x, i.pos.y, i.pos.z); m.scale.set(sc.x, sc.y, sc.z);
        m.userData = i.data; m.receiveShadow=true;
        state.scene.add(m); state.objectsInScene.push(m); state.totalPrice += (m.userData.price||0); 
    } else if(i.data.points) { 
        const s = new THREE.Shape(); i.data.points.forEach((p,k) => k===0?s.moveTo(p.x,p.z):s.lineTo(p.x,p.z)); s.lineTo(i.data.points[0].x, i.data.points[0].z);
        let mat;
        if(i.data.img_2d) {
            const tex = state.textureLoader.load(i.data.img_2d);
            tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.center.set(0.5,0.5);
            if(i.data.texSettings) { tex.repeat.set(i.data.texSettings.repeat, i.data.texSettings.repeat); tex.rotation = i.data.texSettings.rotation; tex.offset.set(i.data.texSettings.offsetX, i.data.texSettings.offsetY); }
            mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, color: 0xffffff });
        } else { mat = new THREE.MeshStandardMaterial({ color: FLOOR_COLORS.garnet }); }
        const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s,{depth:0.05, bevelEnabled:false}), mat);
        m.rotation.set(i.rot._x, i.rot._y, i.rot._z); m.position.set(i.pos.x, i.pos.y, i.pos.z); m.scale.set(sc.x, sc.y, sc.z);
        m.userData = i.data; m.receiveShadow=true;
        state.scene.add(m); state.objectsInScene.push(m); state.totalPrice += (m.userData.price||0); 
    }
}

// NUEVA VERSIÓN SIMPLIFICADA (usa createFenceObject)
function reconstructFence(i) {
    if (!i.data.points || i.data.points.length < 2) return;

    const points = i.data.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const config = {
        type: i.data.fenceType || "wood",
        colors: i.data.fenceColors || null
    };

    // Usamos el constructor unificado
    const fenceGroup = createFenceObject(points, config);

    if (fenceGroup) {
        fenceGroup.position.set(i.pos.x, i.pos.y, i.pos.z);
        fenceGroup.rotation.set(i.rot._x, i.rot._y, i.rot._z);
        fenceGroup.scale.set(i.scale.x, i.scale.y, i.scale.z);
        
        // Restaurar data completa por si hay metadatos extra
        fenceGroup.userData = { ...fenceGroup.userData, ...i.data };

        state.scene.add(fenceGroup);
        state.objectsInScene.push(fenceGroup);
        state.totalPrice += (i.data.price || 0);
    }
}

async function reconstructModel(i) {
    let u;
    if (i.data.assetId && state.assetCache[i.data.assetId]) {
        u = state.assetCache[i.data.assetId]; // Base64 desde caché
    } else {
        u = i.data.modelBase64 || i.data.modelFile; 
    }
    
    if(!u || u.startsWith('blob:')) return; 

    try {
        const gltf = await loadGLTFPromise(u);
        const m = gltf.scene; 
        m.traverse(n=>{ if(n.isMesh){ n.castShadow=true; n.receiveShadow=true; } });
        processSafetyZones(m); 
        m.position.set(i.pos.x, i.pos.y, i.pos.z); 
        m.rotation.set(i.rot._x, i.rot._y, i.rot._z); 
        m.scale.set(i.scale.x || 1, i.scale.y || 1, i.scale.z || 1);
        m.userData = i.data;
        if(m.userData.modelBase64) delete m.userData.modelBase64; 
        
        state.scene.add(m); 
        state.objectsInScene.push(m); 
        state.totalPrice += (i.data.price||0); 
    } catch(e) {
        console.error("Error reconstruyendo modelo historial:", e);
    }
}

export function saveToLocalStorage() {
    const itemsSafe = state.objectsInScene.map(obj => {
        const d = JSON.parse(JSON.stringify(obj.userData));
        if(d.modelBase64) delete d.modelBase64; 
        return { type: getObjectType(obj), pos: obj.position, rot: obj.rotation, scale: obj.scale, data: d }; 
    });

    const d = { date: new Date().toISOString(), totalPrice: state.totalPrice, items: itemsSafe };
    try {
        localStorage.setItem('levipark_autosave', JSON.stringify(d));
    } catch(e) {
        if (!localStorageWarningShown) {
            console.warn("Autosave falló (límite de espacio):", e);
            showToast("⚠️ Autoguardado pausado: Navegador lleno", "error");
            localStorageWarningShown = true;
        }
    }
}

export function resetScene() { 
    // Limpieza profunda de memoria
    state.objectsInScene.forEach(o => disposeHierarchy(o, true));
    state.objectsInScene.length = 0; 
    state.totalPrice = 0; 
    state.assetCache = {}; 
    
    deselectObject(); 
    
    import('./floor.js').then(m => m.clearMeasurements());
    if(state.floorLine) state.scene.remove(state.floorLine);
    state.floorPoints = [];
    document.getElementById('btn-close-floor').style.display='none';
    
    localStorage.removeItem('levipark_autosave'); // Limpiar autosave también
    saveHistory(); 
    
    showToast("Escena reiniciada", 'info'); 
}

export function loadProjectData(j) { 
    // Limpieza profunda
    state.objectsInScene.forEach(o => disposeHierarchy(o, true));
    state.objectsInScene.length = 0;
    state.totalPrice = 0;
    
    if (j.assetCache) {
        state.assetCache = { ...state.assetCache, ...j.assetCache };
    }

    j.items.forEach(i => {
        if (i.data && i.data.isFence) reconstructFence(i);
        else if (i.type === 'floor' || i.data.isFloor) reconstructFloor(i);
        else reconstructModel(i);
    });
    // UpdateBudget auto
    setTimeout(() => saveHistory(), 1000); 
}

export async function saveProject() { 
    let name = await askUser("Nombre del archivo:", "proyecto");
    if (!name) return;
    if (name.trim() === "") name = "proyecto"; 
    if (!name.toLowerCase().endsWith(".json")) { name += ".json"; }
    
    const saveData = { 
        date: new Date().toISOString(), 
        totalPrice: state.totalPrice, 
        items: [],
        assetCache: state.assetCache 
    };

    state.objectsInScene.forEach(obj => {
         const data = JSON.parse(JSON.stringify(obj.userData));
         if (data.assetId && data.modelBase64) delete data.modelBase64;
         saveData.items.push({ type: getObjectType(obj), pos: obj.position, rot: obj.rotation, scale: obj.scale, data: data });
    });

    const jsonContent = JSON.stringify(saveData);
    const a = document.createElement('a'); 
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(jsonContent); 
    a.download = name; a.click(); 
    showToast("Proyecto descargado.", 'success');
}