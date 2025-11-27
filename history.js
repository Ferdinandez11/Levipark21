// history.js
import * as THREE from 'three';
import { state, updateBudget } from './globals.js';
import { FLOOR_COLORS } from './config.js';
import { showToast, askUser, processSafetyZones } from './utils.js'; // <--- Importado processSafetyZones
import { deselectObject } from './interaction.js';
import { FENCE_PRESETS } from './fence_presets.js';

export function saveHistory() { 
    if (state.historyStep < state.historyStack.length - 1) state.historyStack = state.historyStack.slice(0, state.historyStep + 1); 
    const snapshot = state.objectsInScene.map(obj => ({ 
        type: getObjectType(obj), 
        pos: obj.position.clone(), 
        rot: obj.rotation.clone(), 
        scale: obj.scale.clone(), 
        data: JSON.parse(JSON.stringify(obj.userData)) 
    }));
    state.historyStack.push(JSON.stringify(snapshot)); 
    state.historyStep++; 
    if (state.historyStack.length > 50) { state.historyStack.shift(); state.historyStep--; } 
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
    state.objectsInScene.forEach(o => state.scene.remove(o)); 
    state.objectsInScene.length = 0; 
    state.totalPrice = 0; 
    deselectObject();
    const items = JSON.parse(json);
    items.forEach(i => {
        if (i.data && i.data.isFence) reconstructFence(i);
        else if (i.type === 'floor' || i.data.isFloor) reconstructFloor(i);
        else reconstructModel(i);
    });
    updateBudget();
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

function reconstructFence(i) {
    if (!i.data.points || i.data.points.length < 2) return;

    const type = i.data.fenceType || "wood"; 
    const preset = FENCE_PRESETS[type] || FENCE_PRESETS["wood"];
    const colors = i.data.fenceColors || preset.defaultColors;

    const points = i.data.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const fenceGroup = new THREE.Group();

    const postMat = new THREE.MeshStandardMaterial({ color: colors.post, roughness: 0.5 });
    const slatMats = [
        new THREE.MeshStandardMaterial({ color: colors.slatA, roughness: 0.6 }),
        new THREE.MeshStandardMaterial({ color: colors.slatB || colors.slatA, roughness: 0.6 }),
        new THREE.MeshStandardMaterial({ color: colors.slatC || colors.slatA, roughness: 0.6 })
    ];

    // ALTURAS
    const topRailY = preset.postHeight - 0.15; 
    const botRailY = 0.15; 
    const slatHeight = topRailY - botRailY - (preset.railShape === 'square' ? preset.railThickness : preset.railRadius*2);
    const slatCenterY = (topRailY + botRailY) / 2;

    for (let k = 0; k < points.length - 1; k++) {
        const start = points[k];
        const end = points[k+1];
        const dist = start.distanceTo(end);
        
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const angle = Math.atan2(dir.x, dir.z);

        const moduleLength = 2.0; 
        const modulesCount = Math.ceil(dist / moduleLength); 
        const actualModuleLen = dist / modulesCount;

        for (let m = 0; m < modulesCount; m++) {
            const tStart = m / modulesCount;
            const tEnd = (m + 1) / modulesCount;
            const modStart = new THREE.Vector3().lerpVectors(start, end, tStart);
            const modEnd = new THREE.Vector3().lerpVectors(start, end, tEnd);
            const modCenter = new THREE.Vector3().lerpVectors(modStart, modEnd, 0.5);

            createPostHistory(modStart, preset, postMat, fenceGroup);

            const postThickness = (preset.postType==='round' ? preset.postRadius*2 : preset.postWidth);
            const railLen = actualModuleLen - postThickness + 0.02;

            if (preset.railType === "frame") {
                let railGeo;
                if (preset.railShape === 'square') {
                    railGeo = new THREE.BoxGeometry(preset.railThickness, preset.railThickness, railLen);
                } else {
                    railGeo = new THREE.CylinderGeometry(preset.railRadius, preset.railRadius, railLen);
                    railGeo.rotateX(Math.PI / 2);
                }
                const topRail = new THREE.Mesh(railGeo, postMat);
                topRail.position.copy(modCenter); topRail.position.y = topRailY; topRail.rotation.y = angle;
                fenceGroup.add(topRail);
                const botRail = new THREE.Mesh(railGeo, postMat);
                botRail.position.copy(modCenter); botRail.position.y = botRailY; botRail.rotation.y = angle;
                fenceGroup.add(botRail);
            }

            if (preset.isSolidPanel) {
                const pWidth = railLen - 0.02;
                const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, slatHeight, pWidth), slatMats[0]);
                panel.position.copy(modCenter); panel.position.y = slatCenterY; panel.rotation.y = angle;
                fenceGroup.add(panel);
            } else {
                let slatCount;
                if (preset.fixedCount) {
                    slatCount = preset.fixedCount;
                    const totalSlatWidth = slatCount * preset.slatWidth;
                    const availableGapSpace = railLen - totalSlatWidth;
                    const dynamicGap = availableGapSpace / (slatCount + 1);
                    
                    const gapStartT = (postThickness / 2) / actualModuleLen;
                    const gapEndT = 1 - ((postThickness / 2) / actualModuleLen);

                    for (let j = 0; j < slatCount; j++) {
                        const centerInGap = dynamicGap + (preset.slatWidth / 2) + (j * (preset.slatWidth + dynamicGap));
                        const tInGap = centerInGap / railLen;
                        const tGlobal = gapStartT + (tInGap * (gapEndT - gapStartT));
                        
                        const slatPos = new THREE.Vector3().lerpVectors(modStart, modEnd, tGlobal);
                        
                        const slat = new THREE.Mesh(
                            new THREE.BoxGeometry(preset.slatThickness, slatHeight, preset.slatWidth), 
                            slatMats[j % 3]
                        );
                        slatPos.y = slatCenterY;
                        slat.position.copy(slatPos); slat.rotation.y = angle;
                        slat.castShadow = true;
                        fenceGroup.add(slat);
                    }
                } else {
                    const unitWidth = preset.slatWidth + preset.slatGap;
                    slatCount = Math.floor(railLen / unitWidth);
                    const totalSlatSpan = slatCount * unitWidth;
                    const startOffset = (actualModuleLen - totalSlatSpan) / 2;

                    for (let j = 0; j < slatCount; j++) {
                        const relativeT = (startOffset + (j * unitWidth) + (preset.slatWidth/2)) / actualModuleLen;
                        const slatPos = new THREE.Vector3().lerpVectors(modStart, modEnd, relativeT);
                        const slat = new THREE.Mesh(
                            new THREE.BoxGeometry(preset.slatThickness, slatHeight, preset.slatWidth), 
                            slatMats[j % 3]
                        );
                        slatPos.y = slatCenterY;
                        if(preset.railType === 'none') slatPos.y = preset.slatHeight / 2 + 0.05;
                        slat.position.copy(slatPos); slat.rotation.y = angle;
                        slat.castShadow = true;
                        fenceGroup.add(slat);
                    }
                }
            }
        }
    }
    createPostHistory(points[points.length-1], preset, postMat, fenceGroup);

    fenceGroup.position.set(i.pos.x, i.pos.y, i.pos.z);
    fenceGroup.rotation.set(i.rot._x, i.rot._y, i.rot._z);
    fenceGroup.scale.set(i.scale.x, i.scale.y, i.scale.z);
    fenceGroup.userData = i.data;

    state.scene.add(fenceGroup);
    state.objectsInScene.push(fenceGroup);
    state.totalPrice += (i.data.price || 0);
}

function createPostHistory(pos, preset, mat, group) {
    let geo;
    if (preset.postType === "round") geo = new THREE.CylinderGeometry(preset.postRadius, preset.postRadius, preset.postHeight);
    else geo = new THREE.BoxGeometry(preset.postWidth, preset.postHeight, preset.postWidth);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos); mesh.position.y = preset.postHeight / 2; mesh.castShadow=true;
    group.add(mesh);
}

function reconstructModel(i) {
    // 1. Intentar cargar desde assetId (CACHÉ)
    if (i.data.assetId && state.assetCache[i.data.assetId]) {
        loadModelFromUrl(state.assetCache[i.data.assetId], i);
        return;
    }
    
    // 2. Fallback: Intentar cargar base64 legado o URL externa
    let u = i.data.modelBase64 || i.data.modelFile; 
    if(!u || u.startsWith('blob:')) return; // Blobs caducan, no sirven en historial
    
    loadModelFromUrl(u, i);
}

function loadModelFromUrl(url, i) {
    const sc = i.scale || {x:1, y:1, z:1};
    state.loader.load(url, (g)=>{
        const m=g.scene; 
        m.traverse(n=>{ if(n.isMesh){ n.castShadow=true; n.receiveShadow=true; } });
        processSafetyZones(m); // Usando función importada de utils
        m.position.set(i.pos.x, i.pos.y, i.pos.z); 
        m.rotation.set(i.rot._x, i.rot._y, i.rot._z); 
        m.scale.set(sc.x, sc.y, sc.z);
        m.userData = i.data;
        // Limpiamos base64 pesado del objeto en escena para liberar RAM inmediata, ya está en cache si corresponde
        if(m.userData.modelBase64) delete m.userData.modelBase64; 
        
        state.scene.add(m); 
        state.objectsInScene.push(m); 
        state.totalPrice += (i.data.price||0); 
        updateBudget();
    });
}

export function saveToLocalStorage() {
    // Nota: LocalStorage tiene límite de ~5MB. No guardamos la assetCache completa aquí.
    // Solo guardamos referencias simples y el estado actual.
    // Si hay muchos modelos custom, esto fallará en localStorage.
    // Para proyectos complejos, usar saveProject (JSON).
    
    // Simplificamos objetos para autosave
    const itemsSafe = state.objectsInScene.map(obj => {
        const d = JSON.parse(JSON.stringify(obj.userData));
        if(d.modelBase64) delete d.modelBase64; // No guardar base64 en localstorage
        return { type: getObjectType(obj), pos: obj.position, rot: obj.rotation, scale: obj.scale, data: d }; 
    });

    const d = { date: new Date().toISOString(), totalPrice: state.totalPrice, items: itemsSafe };
    try {
        localStorage.setItem('levipark_autosave', JSON.stringify(d));
    } catch(e) {
        console.warn("Autosave falló (probablemente límite de espacio):", e);
    }
}

export function resetScene() { 
    // 1. Limpiar escena
    state.objectsInScene.forEach(o=>state.scene.remove(o)); 
    state.objectsInScene.length=0; 
    state.totalPrice=0; 
    
    // 2. Limpiar cachés y herramientas
    state.assetCache = {}; 
    updateBudget(); 
    deselectObject(); 
    clearMeasurements(); 
    if(state.floorLine) state.scene.remove(state.floorLine);
    state.floorPoints = [];
    document.getElementById('btn-close-floor').style.display='none';
    
    // 3. IMPORTANTÍSIMO: Guardar el estado VACÍO inmediatamente en localStorage
    // Así si das F5, cargará una lista vacía.
    saveToLocalStorage(); 
    
    // 4. Guardar hito en el historial (Undo/Redo)
    saveHistory(); 
    
    showToast("Escena reiniciada", 'info'); 
}

export function loadProjectData(j) { 
    state.objectsInScene.forEach(o => state.scene.remove(o));
    state.objectsInScene.length = 0;
    state.totalPrice = 0;
    
    // Si el proyecto trae una caché de assets (exportación futura), cargarla
    if (j.assetCache) {
        state.assetCache = { ...state.assetCache, ...j.assetCache };
    }

    j.items.forEach(i => {
        if (i.data && i.data.isFence) reconstructFence(i);
        else if (i.type === 'floor' || i.data.isFloor) reconstructFloor(i);
        else reconstructModel(i);
    });
    updateBudget();
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
        assetCache: state.assetCache // GUARDAMOS LA CACHÉ EN EL JSON
    };

    state.objectsInScene.forEach(obj => {
         const data = JSON.parse(JSON.stringify(obj.userData));
         // Limpiamos base64 redundante del item si ya tiene ID
         if (data.assetId && data.modelBase64) delete data.modelBase64;
         saveData.items.push({ type: getObjectType(obj), pos: obj.position, rot: obj.rotation, scale: obj.scale, data: data });
    });

    const jsonContent = JSON.stringify(saveData);
    const a = document.createElement('a'); 
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(jsonContent); 
    a.download = name; a.click(); 
    showToast("Proyecto descargado.", 'success');
}