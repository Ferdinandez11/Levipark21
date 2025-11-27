// fence.js
import * as THREE from 'three';
import { state, updateBudget } from './globals.js';
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

// --- LÓGICA DE CONSTRUCCIÓN ---

export function finishFence() {
    if (fencePoints.length < 2) return;
    
    const preset = FENCE_PRESETS[currentFenceConfig.type];
    const colors = currentFenceConfig.colors;
    const fenceGroup = new THREE.Group();
    let totalLength = 0;

    const postMat = new THREE.MeshStandardMaterial({ color: colors.post, roughness: 0.5, metalness: 0.1 });
    const slatMats = [
        new THREE.MeshStandardMaterial({ color: colors.slatA, roughness: 0.6 }),
        new THREE.MeshStandardMaterial({ color: colors.slatB || colors.slatA, roughness: 0.6 }),
        new THREE.MeshStandardMaterial({ color: colors.slatC || colors.slatA, roughness: 0.6 })
    ];

    // ALTURAS DE LARGUEROS
    const topRailY = preset.postHeight - 0.15; 
    const botRailY = 0.15; 
    const slatHeight = topRailY - botRailY - (preset.railShape === 'square' ? preset.railThickness : preset.railRadius*2);
    const slatCenterY = (topRailY + botRailY) / 2;

    for (let i = 0; i < fencePoints.length - 1; i++) {
        const start = fencePoints[i];
        const end = fencePoints[i+1];
        const dist = start.distanceTo(end);
        totalLength += dist;
        
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const angle = Math.atan2(dir.x, dir.z);
        
        // Módulos de 2m
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
            createPost(modStart, preset, postMat, fenceGroup);

            // 2. LARGUEROS
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
                topRail.position.copy(modCenter);
                topRail.position.y = topRailY;
                topRail.rotation.y = angle;
                fenceGroup.add(topRail);

                const botRail = new THREE.Mesh(railGeo, postMat);
                botRail.position.copy(modCenter);
                botRail.position.y = botRailY;
                botRail.rotation.y = angle;
                fenceGroup.add(botRail);
            }

            // 3. RELLENO (Lamas o Panel)
            if (preset.isSolidPanel) {
                // PANEL SÓLIDO
                const pWidth = railLen - 0.02;
                const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, slatHeight, pWidth), slatMats[0]);
                panel.position.copy(modCenter);
                panel.position.y = slatCenterY; 
                panel.rotation.y = angle; 
                fenceGroup.add(panel);

            } else {
                // LAMAS CON DISTRIBUCIÓN INTELIGENTE
                let slatCount, unitWidth, startOffset;

                if (preset.fixedCount) {
                    // LÓGICA DE REPARTO EQUIDISTANTE EXACTO
                    slatCount = preset.fixedCount;
                    // Espacio disponible total para lamas y huecos
                    // Calculamos el hueco necesario para que entren X lamas centradas
                    // railLen es el espacio hueco.
                    // gap = (EspacioTotal - (NumLamas * AnchoLama)) / (NumLamas + 1)
                    // Así tenemos hueco al principio, entre medias y al final.
                    const totalSlatWidth = slatCount * preset.slatWidth;
                    const availableGapSpace = railLen - totalSlatWidth;
                    const dynamicGap = availableGapSpace / (slatCount + 1);
                    
                    unitWidth = preset.slatWidth + dynamicGap;
                    // El offset de inicio es el primer hueco + la mitad de la primera lama
                    // Pero nuestra lógica de bucle usa startOffset para centrar el bloque entero.
                    // Si unitWidth incluye 1 gap + 1 lama...
                    
                    // Simplificación: Calculamos el ancho total del bloque "virtual" (lamas + gaps internos)
                    // y lo centramos.
                    // Pero queremos gaps en los extremos también.
                    // Usemos la lógica de gaps dinámicos directamente en el bucle.
                    
                    // Recalculamos startOffset para que el primer centro de lama caiga en:
                    // -railLen/2 + gap + width/2
                    
                    // Vamos a usar la lógica existente pero "trucando" el unitWidth y startOffset
                    startOffset = dynamicGap; 
                    // No, el startOffset en el código de abajo es para centrar respecto al módulo.
                    
                    // Reiniciemos la lógica de posición para fixedCount:
                    const totalSpan = railLen;
                    // Posición local del inicio del rail: -totalSpan/2
                    // Posición primer lama (centro): -totalSpan/2 + dynamicGap + width/2
                    
                    for (let k = 0; k < slatCount; k++) {
                        // Posición relativa desde el inicio del rail (0 a railLen)
                        const positionFromStart = dynamicGap + (preset.slatWidth / 2) + (k * unitWidth);
                        const relativeT = positionFromStart / actualModuleLen; // Aproximado
                        
                        // Mejor: calcular posición absoluta vector 3D
                        // Vector director del modulo
                        const vecMod = new THREE.Vector3().subVectors(modEnd, modStart);
                        // El rail empieza desplazado por el poste?
                        // modStart es el centro del poste.
                        // El rail empieza en modStart + (postThickness/2) * dir
                        
                        // Simplificación robusta: Usar lerp sobre el rail efectivo
                        // Inicio efectivo del hueco
                        const gapStartT = (postThickness / 2) / actualModuleLen;
                        const gapEndT = 1 - ((postThickness / 2) / actualModuleLen);
                        
                        // Interpolamos dentro del hueco
                        // T local (0 a 1 dentro del hueco) para el centro de la lama k
                        // centro = dynamicGap + width/2 + k*(width+gap)
                        const centerInGap = dynamicGap + (preset.slatWidth / 2) + (k * (preset.slatWidth + dynamicGap));
                        const tInGap = centerInGap / railLen;
                        
                        // T global
                        const tGlobal = gapStartT + (tInGap * (gapEndT - gapStartT));
                        
                        const slatPos = new THREE.Vector3().lerpVectors(modStart, modEnd, tGlobal);
                        
                        const slat = new THREE.Mesh(
                            new THREE.BoxGeometry(preset.slatThickness, slatHeight, preset.slatWidth),
                            slatMats[k % 3]
                        );
                        slatPos.y = slatCenterY;
                        slat.position.copy(slatPos);
                        slat.rotation.y = angle;
                        slat.castShadow = true;
                        slat.receiveShadow = true;
                        fenceGroup.add(slat);
                    }

                } else {
                    // LÓGICA ANTIGUA (Relleno por densidad, para madera)
                    unitWidth = preset.slatWidth + preset.slatGap;
                    slatCount = Math.floor(railLen / unitWidth);
                    const totalSlatSpan = slatCount * unitWidth;
                    startOffset = (actualModuleLen - totalSlatSpan) / 2;

                    for (let k = 0; k < slatCount; k++) {
                        const relativeT = (startOffset + (k * unitWidth) + (preset.slatWidth/2)) / actualModuleLen;
                        const slatPos = new THREE.Vector3().lerpVectors(modStart, modEnd, relativeT);
                        const slat = new THREE.Mesh(
                            new THREE.BoxGeometry(preset.slatThickness, slatHeight, preset.slatWidth), 
                            slatMats[k % 3] 
                        );
                        slatPos.y = slatCenterY;
                        if(preset.railType === 'none') slatPos.y = preset.slatHeight / 2 + 0.05;
                        slat.position.copy(slatPos);
                        slat.rotation.y = angle;
                        slat.castShadow = true;
                        slat.receiveShadow = true;
                        fenceGroup.add(slat);
                    }
                }
            }
        }
    }
    
    // 3. POSTE FINAL
    createPost(fencePoints[fencePoints.length-1], preset, postMat, fenceGroup);

    // CALCULO PRECIO
    const price = Math.round(totalLength * (preset.price || 30));
    
    fenceGroup.userData = {
        name: preset.name,
        ref: preset.ref, 
        price: price,
        isFence: true,
        points: fencePoints.map(p => ({x:p.x, y:p.y, z:p.z})),
        fenceType: currentFenceConfig.type, 
        fenceColors: colors,               
        dims: `${totalLength.toFixed(2)}m`,
        locked: false, collides: true
    };
    
    state.scene.add(fenceGroup);
    state.objectsInScene.push(fenceGroup);
    state.totalPrice += price;
    updateBudget();
    
    showToast(`${preset.name} creada: ${totalLength.toFixed(2)}m`, "success");
    toggleFenceMode();
    saveHistory();
}

function createPost(pos, preset, mat, group) {
    let geo;
    if (preset.postType === "round") {
        geo = new THREE.CylinderGeometry(preset.postRadius, preset.postRadius, preset.postHeight);
    } else {
        geo = new THREE.BoxGeometry(preset.postWidth, preset.postHeight, preset.postWidth);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.position.y = preset.postHeight / 2;
    mesh.castShadow = true;
    group.add(mesh);
}

export function setFenceConfig(type, colorKey, colorHex) {
    if (type) currentFenceConfig.type = type;
    if (colorKey && colorHex) currentFenceConfig.colors[colorKey] = parseInt(colorHex.replace('#', '0x'));
}