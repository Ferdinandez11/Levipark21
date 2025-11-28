// --- START OF FILE interaction.js ---

import * as THREE from 'three';
import { OBB } from 'three/addons/math/OBB.js';
import { state, updateBudget } from './globals.js';
import { showToast, disposeHierarchy } from './utils.js';
import { saveHistory } from './history.js';

export function selectObject(o) { 
    state.selectedObject = o; 
    state.outlinePass.selectedObjects = [o];
    if(!o.userData.locked) state.transformControl.attach(o); 
    else state.transformControl.detach(); 
    document.getElementById('edit-panel').style.display='block'; 
    document.getElementById('edit-floor-specific').style.display = o.userData.isFloor?'block':'none'; 
    const texControls = document.getElementById('texture-mapping-controls');
    if (o.userData.isFloor && o.material.map) {
        texControls.style.display = 'block';
        const s = o.userData.texSettings || { repeat: 1, rotation: 0, offsetX: 0, offsetY: 0 };
        document.getElementById('tex-scale').value = s.repeat; document.getElementById('tex-rotate').value = s.rotation;
        document.getElementById('tex-off-x').value = s.offsetX; document.getElementById('tex-off-y').value = s.offsetY;
    } else { texControls.style.display = 'none'; }
    if(o.userData.isFloor) document.getElementById('floor-price-display').innerText=o.userData.price||0; 
    updateUI(); 
}

export function deselectObject() { 
    state.selectedObject = null; state.outlinePass.selectedObjects = []; 
    state.transformControl.detach(); document.getElementById('edit-panel').style.display='none'; 
}

export function deleteSelected() { 
    if(state.selectedObject && !state.selectedObject.userData.locked){
        const obj = state.selectedObject;
        disposeHierarchy(obj, true);
        state.objectsInScene.splice(state.objectsInScene.indexOf(obj), 1);
        state.totalPrice -= obj.userData.price || 0;
        updateBudget(); deselectObject(); saveHistory(); showToast("Objeto eliminado", 'info'); 
    } 
}

export function updateUI() { 
    if(!state.selectedObject) return; 
    const l=document.getElementById('btn-lock'), c=document.getElementById('btn-collision'); 
    if(state.selectedObject.userData.locked){
        l.innerText="🔒";l.classList.add('is-locked');state.transformControl.detach();
    } else {
        l.innerText="🔓";l.classList.remove('is-locked');
        if(state.transformControl.object!==state.selectedObject) state.transformControl.attach(state.selectedObject);
    } 
    if(state.selectedObject.userData.collides){
        c.innerText="💥 ON";c.classList.remove('is-inactive');
    } else {
        c.innerText="👻 OFF";c.classList.add('is-inactive');
    } 
}

export function toggleLock() { 
    if(state.selectedObject){
        state.selectedObject.userData.locked = !state.selectedObject.userData.locked;
        updateUI(); saveHistory();
    } 
}

export function toggleObjectCollision() { 
    if(state.selectedObject){
        state.selectedObject.userData.collides = !state.selectedObject.userData.collides;
        updateUI(); checkCollisions(); saveHistory();
    } 
}

// SISTEMA DE COLISIÓN MEJORADO (Vallas transparentes)
export function checkCollisions() { 
    if(!state.selectedObject || !state.selectedObject.userData.collides){
        state.isColliding = false; 
        state.outlinePass.visibleEdgeColor.setHex(0xffff00); 
        return;
    } 
    
    // Obtenemos el OBB del objeto seleccionado (asumimos que lo que movemos no es una valla compleja)
    const myOBB = getOBBFromObject(state.selectedObject); 
    const myCenter = new THREE.Vector3();
    state.selectedObject.getWorldPosition(myCenter);
    const radius = 1.0; // Radio aproximado para pre-check

    let hit = false; 

    for(let o of state.objectsInScene){ 
        if(o === state.selectedObject) continue;
        if(!o.userData.collides || o.userData.isFloor) continue; 
        
        // Optimización por distancia
        if(o.position.distanceTo(state.selectedObject.position) > 20) continue; 

        // LÓGICA ESPECIAL PARA VALLAS (Segmentos de línea en lugar de cajas)
        if (o.userData.isFence && o.userData.points) {
            // Comprobar distancia a los segmentos de la valla
            const points = o.userData.points;
            // Necesitamos transformar los puntos locales de la valla a coordenadas mundiales actuales
            // Pero fence.js guarda puntos en userData que suelen ser mundiales al crearse.
            // Si la valla se movió, hay que aplicar matriz. Asumiremos puntos relativos al origen de la valla si se movió.
            
            // Para simplificar: comprobamos contra los segmentos definidos en userData.points aplicando la transformación del objeto
            const mat = o.matrixWorld;
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = new THREE.Vector3(points[i].x, points[i].y, points[i].z).applyMatrix4(mat);
                const p2 = new THREE.Vector3(points[i+1].x, points[i+1].y, points[i+1].z).applyMatrix4(mat);
                
                // Distancia punto a segmento
                const closest = new THREE.Vector3();
                const line = new THREE.Line3(p1, p2);
                line.closestPointToPoint(myCenter, true, closest);
                
                // Si la distancia al segmento es menor que X (grosor valla + radio objeto)
                if (myCenter.distanceTo(closest) < 0.8) { 
                    hit = true; break; 
                }
            }
        } 
        // LÓGICA NORMAL (OBB vs OBB) PARA MODELOS
        else {
            if (myOBB.intersectsOBB(getOBBFromObject(o))) { hit=true; } 
        }

        if(hit) break;
    } 
    
    state.isColliding = hit; 
    state.outlinePass.visibleEdgeColor.setHex(state.isColliding ? 0xff0000 : 0xffff00); 
    if(!state.isColliding) updateUI(); 
}

function getOBBFromObject(obj) { 
    const prevRot = obj.rotation.clone(); obj.rotation.set(0,0,0); obj.updateMatrixWorld(); 
    const localBox = new THREE.Box3().setFromObject(obj); 
    const localSize = new THREE.Vector3(); localBox.getSize(localSize); localSize.multiplyScalar(0.95); 
    const localCenter = new THREE.Vector3(); localBox.getCenter(localCenter); 
    obj.rotation.copy(prevRot); obj.updateMatrixWorld(); 
    const finalOBB = new OBB(); 
    finalOBB.halfSize.copy(localSize).multiplyScalar(0.5); 
    const offset = localCenter.clone().sub(obj.position); offset.applyEuler(obj.rotation); 
    finalOBB.center.copy(obj.position).add(offset); 
    finalOBB.rotation.setFromMatrix4(obj.matrixWorld); 
    return finalOBB; 
}

export function cloneSelected() { 
    if (!state.selectedObject || state.selectedObject.userData.isFloor) return; 
    const original = state.selectedObject; 
    const clone = original.clone(); 
    clone.position.add(new THREE.Vector3(1, 0, 1)); 
    clone.userData = JSON.parse(JSON.stringify(original.userData)); 
    state.scene.add(clone); 
    state.objectsInScene.push(clone); 
    state.totalPrice += clone.userData.price || 0; 
    updateBudget(); selectObject(clone); snapToFloor(clone); checkCollisions(); saveHistory(); showToast("Objeto clonado", 'success'); 
}

export function snapToFloor(obj) { 
    if (!obj || obj.userData.isFloor) return; 
    const box = new THREE.Box3().setFromObject(obj); 
    if (Math.abs(box.min.y) > 0.01) { 
        obj.position.y -= box.min.y; obj.updateMatrixWorld(); 
    } 
}

export function setGizmoMode(m) { 
    state.transformControl.setMode(m); 
    const t=document.getElementById('mode-translate'); const r=document.getElementById('mode-rotate'); const s=document.getElementById('mode-scale');
    [t,r,s].forEach(b => { b.classList.remove('active-mode'); b.style.background='#444'; b.style.color='#ccc'; });
    let active = (m==='translate')?t:(m==='rotate'?r:s);
    if(active){ active.classList.add('active-mode'); active.style.background='#4a90e2'; active.style.color='white'; }
}
// --- END OF FILE interaction.js ---