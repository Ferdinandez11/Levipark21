// --- START OF FILE fence.js ---

import * as THREE from 'three';
import { state } from './globals.js'; 
import { showToast } from './utils.js';
import { deselectObject } from './interaction.js';
import { toggleMeasureMode, toggleFloorMode } from './floor.js';
import { saveHistory } from './history.js';
import { FENCE_PRESETS } from './fence_presets.js';

let fencePoints = [];
let fenceMarkers = [];
let fencePreviewLine = null;

export let currentFenceConfig = {
    type: "wood",
    colors: { ...FENCE_PRESETS["wood"].defaultColors }
};

export function toggleFenceMode() {
    if (state.isMeasuring) toggleMeasureMode();
    if (state.isDrawingFloor) toggleFloorMode();
    
    state.isDrawingFence = !state.isDrawingFence;
    
    const btn = document.getElementById('btn-fence');
    const panel = document.getElementById('floor-input-panel');
    const fenceOptions = document.getElementById('fence-options-panel');
    
    if (state.isDrawingFence) {
        btn.classList.add('active-tool');
        btn.innerText = "🚧 Cancelar";
        panel.style.display = 'block';
        document.getElementById('mode-poly').style.display = 'none';
        document.getElementById('mode-rect').style.display = 'none';
        document.querySelector('#floor-input-panel h1').innerText = "🚧 Trazar Valla";
        document.getElementById('poly-inputs').style.display = 'block';
        if(fenceOptions) fenceOptions.style.display = 'block';
        deselectObject();
        clearFenceDraft();
        showToast("Haz clic para trazar el recorrido", "info");
    } else {
        btn.classList.remove('active-tool');
        btn.innerText = "🚧 Valla";
        panel.style.display = 'none';
        if(fenceOptions) fenceOptions.style.display = 'none';
        clearFenceDraft();
    }
}

export function addFencePoint(p) {
    fencePoints.push(p);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial({color: 0xe67e22}));
    m.position.copy(p); state.scene.add(m); fenceMarkers.push(m);
    updateFencePreview();
}

export function updateFencePreview() {
    if (state.fencePreviewLine) state.scene.remove(state.fencePreviewLine);
    if (fencePoints.length > 1) {
        const geo = new THREE.BufferGeometry().setFromPoints(fencePoints);
        state.fencePreviewLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xe67e22, linewidth: 2 }));
        state.scene.add(state.fencePreviewLine);
        
        let totalLen = 0;
        for(let i=0; i<fencePoints.length-1; i++) totalLen += fencePoints[i].distanceTo(fencePoints[i+1]);
        
        document.getElementById('btn-close-floor').style.display = 'block';
        document.getElementById('btn-close-floor').innerText = "✅ Crear Valla";
        
        import('./floor.js').then(m => m.updateFloorInfoLabel(`L: ${totalLen.toFixed(2)}m`, fencePoints[fencePoints.length-1]));
    }
}

export function clearFenceDraft() {
    fencePoints = [];
    fenceMarkers.forEach(m => state.scene.remove(m));
    fenceMarkers = [];
    if (state.fencePreviewLine) state.scene.remove(state.fencePreviewLine);
    state.fencePreviewLine = null;
    if (state.floorLabel) state.scene.remove(state.floorLabel);
    document.getElementById('btn-close-floor').style.display = 'none';
}

// --- FUNCIÓN PURA: Genera el Grupo de Valla (Compartida con Historial) ---
export function createFenceObject(points, configOverride = null) {
    if (!points || points.length < 2) return null;

    const configToUse = configOverride || currentFenceConfig;
    const preset = FENCE_PRESETS[configToUse.type] || FENCE_PRESETS["wood"];
    const colors = configToUse.colors || preset.defaultColors;
    
    // Arrays temporales para guardar matrices y colores
    const partsData = {};
    const helperObj = new THREE.Object3D();

    const registerPart = (key, geometry, material, position, rotation, scale, colorHex) => {
        if (!partsData[key]) {
            partsData[key] = { geometry, material, matrices: [], colors: [] };
        }
        helperObj.position.copy(position);
        helperObj.rotation.set(rotation.x, rotation.y, rotation.z);
        helperObj.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
        helperObj.updateMatrix();
        
        partsData[key].matrices.push(helperObj.matrix.clone());
        const col = new THREE.Color(colorHex);
        partsData[key].colors.push(col.r, col.g, col.b);
    };

    let totalLength = 0;

    // DEFINICIÓN DE GEOMETRÍAS
    let postGeo, railGeo, slatGeo;

    if (preset.postType === "round") postGeo = new THREE.CylinderGeometry(preset.postRadius, preset.postRadius, preset.postHeight, 12);
    else postGeo = new THREE.BoxGeometry(preset.postWidth, preset.postHeight, preset.postWidth);
    postGeo.translate(0, preset.postHeight/2, 0); 

    if (preset.railType === "frame") {
        if (preset.railShape === 'square') railGeo = new THREE.BoxGeometry(preset.railThickness, preset.railThickness, 1);
        else { railGeo = new THREE.CylinderGeometry(preset.railRadius, preset.railRadius, 1, 8); railGeo.rotateX(Math.PI / 2); }
    }
    slatGeo = new THREE.BoxGeometry(preset.slatThickness, 1, preset.slatWidth);

    const topRailY = preset.postHeight - 0.15; 
    const botRailY = 0.15; 
    const slatHeight = topRailY - botRailY - (preset.railShape === 'square' ? preset.railThickness : preset.railRadius*2);
    const slatCenterY = (topRailY + botRailY) / 2;
    const slatColors = [colors.slatA, colors.slatB || colors.slatA, colors.slatC || colors.slatA];

    // --- CÁLCULO DE POSICIONES ---
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i+1];
        const dist = start.distanceTo(end);
        totalLength += dist;
        
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

            // 1. POSTE
            registerPart('post', postGeo, null, modStart, new THREE.Euler(0,0,0), {}, colors.post);

            // 2. LARGUEROS
            const postThickness = (preset.postType==='round' ? preset.postRadius*2 : preset.postWidth);
            const railLen = actualModuleLen - postThickness + 0.02;

            if (preset.railType === "frame") {
                registerPart('rail', railGeo, null, new THREE.Vector3(modCenter.x, topRailY, modCenter.z), new THREE.Euler(0, angle, 0), {x:1, y:1, z: railLen}, colors.post);
                registerPart('rail', railGeo, null, new THREE.Vector3(modCenter.x, botRailY, modCenter.z), new THREE.Euler(0, angle, 0), {x:1, y:1, z: railLen}, colors.post);
            }

            // 3. RELLENO
            if (preset.isSolidPanel) {
                const pWidth = railLen - 0.02;
                registerPart('slat', slatGeo, null, new THREE.Vector3(modCenter.x, slatCenterY, modCenter.z), new THREE.Euler(0, angle, 0), {x:1, y:slatHeight, z: pWidth/preset.slatWidth}, slatColors[0]);
            } else {
                let slatCount;
                if (preset.fixedCount) {
                    slatCount = preset.fixedCount;
                    const totalSlatWidth = slatCount * preset.slatWidth;
                    const dynamicGap = (railLen - totalSlatWidth) / (slatCount + 1);
                    const gapStartT = (postThickness / 2) / actualModuleLen;
                    const gapEndT = 1 - ((postThickness / 2) / actualModuleLen);

                    for (let k = 0; k < slatCount; k++) {
                        const tGlobal = gapStartT + ((dynamicGap + (preset.slatWidth/2) + (k*(preset.slatWidth+dynamicGap))) / railLen * (gapEndT - gapStartT));
                        const slatPos = new THREE.Vector3().lerpVectors(modStart, modEnd, tGlobal);
                        slatPos.y = slatCenterY;
                        registerPart('slat', slatGeo, null, slatPos, new THREE.Euler(0, angle, 0), {x:1, y:slatHeight, z:1}, slatColors[k % 3]);
                    }
                } else {
                    const unitWidth = preset.slatWidth + preset.slatGap;
                    slatCount = Math.floor(railLen / unitWidth);
                    const startOffset = (actualModuleLen - (slatCount * unitWidth)) / 2;
                    for (let k = 0; k < slatCount; k++) {
                        const relativeT = (startOffset + (k * unitWidth) + (preset.slatWidth/2)) / actualModuleLen;
                        const slatPos = new THREE.Vector3().lerpVectors(modStart, modEnd, relativeT);
                        slatPos.y = slatCenterY;
                        if(preset.railType === 'none') slatPos.y = preset.slatHeight / 2 + 0.05;
                        registerPart('slat', slatGeo, null, slatPos, new THREE.Euler(0, angle, 0), {x:1, y:slatHeight, z:1}, slatColors[k % 3]);
                    }
                }
            }
        }
    }
    // Poste Final
    registerPart('post', postGeo, null, points[points.length-1], new THREE.Euler(0,0,0), {}, colors.post);

    // --- CONSTRUCCIÓN DEL GRUPO FINAL ---
    const fenceGroup = new THREE.Group();
    const commonMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1, vertexColors: false }); 
    commonMat.color.setHex(0xffffff);

    for (const [key, data] of Object.entries(partsData)) {
        const count = data.matrices.length;
        const instancedMesh = new THREE.InstancedMesh(data.geometry, commonMat, count);
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;

        for (let i = 0; i < count; i++) {
            instancedMesh.setMatrixAt(i, data.matrices[i]);
            instancedMesh.setColorAt(i, new THREE.Color(data.colors[i*3], data.colors[i*3+1], data.colors[i*3+2]));
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.instanceColor.needsUpdate = true;
        fenceGroup.add(instancedMesh);
    }

    const price = Math.round(totalLength * (preset.price || 30));
    
    // Metadata completa para el historial
    fenceGroup.userData = {
        name: preset.name,
        ref: preset.ref, 
        price: price,
        isFence: true,
        points: points.map(p => ({x:p.x, y:p.y, z:p.z})),
        fenceType: configToUse.type, 
        fenceColors: JSON.parse(JSON.stringify(colors)), // Guardar copia               
        dims: `${totalLength.toFixed(2)}m`,
        locked: false, collides: true
    };

    return fenceGroup;
}


export function finishFence() {
    if (fencePoints.length < 2) return;
    
    // Usamos la función compartida para crear el objeto
    const fenceGroup = createFenceObject(fencePoints, currentFenceConfig);
    
    if (fenceGroup) {
        state.scene.add(fenceGroup);
        state.objectsInScene.push(fenceGroup);
        state.totalPrice += fenceGroup.userData.price;
        
        showToast(`${fenceGroup.userData.name} creada`, "success");
        toggleFenceMode();
        saveHistory();
    }
}

export function setFenceConfig(type, colorKey, colorHex) {
    if (type) currentFenceConfig.type = type;
    if (colorKey && colorHex) currentFenceConfig.colors[colorKey] = parseInt(colorHex.replace('#', '0x'));
}