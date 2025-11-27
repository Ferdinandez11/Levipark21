// interaction.js
import * as THREE from 'three';
import { OBB } from 'three/addons/math/OBB.js';
import { state, updateBudget } from './globals.js';
import { showToast } from './utils.js';
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
    state.selectedObject = null; 
    state.outlinePass.selectedObjects = []; 
    state.transformControl.detach(); 
    document.getElementById('edit-panel').style.display='none'; 
}

export function deleteSelected() { 
    if(state.selectedObject && !state.selectedObject.userData.locked){
        // LIMPIEZA DE MEMORIA (IMPORTANTE)
        if(state.selectedObject.geometry) state.selectedObject.geometry.dispose();
        if(state.selectedObject.material) {
            if(Array.isArray(state.selectedObject.material)) {
                state.selectedObject.material.forEach(m => m.dispose());
            } else {
                state.selectedObject.material.dispose();
                if(state.selectedObject.material.map) state.selectedObject.material.map.dispose();
            }
        }

        state.scene.remove(state.selectedObject);
        state.objectsInScene.splice(state.objectsInScene.indexOf(state.selectedObject),1);
        state.totalPrice -= state.selectedObject.userData.price||0;
        
        updateBudget();
        deselectObject(); 
        saveHistory(); 
        showToast("Objeto eliminado y memoria liberada", 'info'); 
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
        updateUI(); 
        saveHistory();
    } 
}

export function toggleObjectCollision() { 
    if(state.selectedObject){
        state.selectedObject.userData.collides = !state.selectedObject.userData.collides;
        updateUI(); 
        checkCollisions(); 
        saveHistory();
    } 
}

export function checkCollisions() { 
    if(!state.selectedObject || !state.selectedObject.userData.collides){
        state.isColliding = false; 
        state.outlinePass.visibleEdgeColor.setHex(0xffff00); 
        return;
    } 
    const myOBB = getOBBFromObject(state.selectedObject); 
    let h = false; 
    for(let o of state.objectsInScene){ 
        if(o !== state.selectedObject && o.userData.collides && !o.userData.isFloor){ 
            if(o.position.distanceTo(state.selectedObject.position) > 10) continue; 
            if (myOBB.intersectsOBB(getOBBFromObject(o))) { h=true; break; } 
        } 
    } 
    state.isColliding = h; 
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
    updateBudget(); 
    selectObject(clone); 
    snapToFloor(clone); 
    checkCollisions(); 
    saveHistory(); 
    showToast("Objeto clonado", 'success'); 
}

export function snapToFloor(obj) { 
    if (!obj || obj.userData.isFloor) return; 
    const box = new THREE.Box3().setFromObject(obj); 
    if (Math.abs(box.min.y) > 0.01) { 
        obj.position.y -= box.min.y; 
        obj.updateMatrixWorld(); 
    } 
}

export function setGizmoMode(m) { 
    state.transformControl.setMode(m); 
    const t=document.getElementById('mode-translate');
    const r=document.getElementById('mode-rotate');
    const s=document.getElementById('mode-scale');
    
    [t,r,s].forEach(b => {
        b.classList.remove('active-mode');
        b.style.background='#444';
        b.style.color='#ccc';
    });

    let active;
    if(m==='translate') active = t;
    else if(m==='rotate') active = r;
    else if(m==='scale') active = s;
    
    if(active){
        active.classList.add('active-mode');
        active.style.background='#4a90e2';
        active.style.color='white';
    }
}