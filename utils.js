// --- START OF FILE utils.js ---

import * as THREE from 'three';
import { state } from './globals.js'; 

export function wait(ms) { return new Promise(r=>setTimeout(r,ms)); }

export function loadGLTFPromise(url) {
    return new Promise((resolve, reject) => {
        if (!state.loader) reject("Loader no inicializado");
        state.loader.load(
            url,
            (gltf) => resolve(gltf),
            undefined, 
            (error) => reject(error)
        );
    });
}

// Limpieza profunda de memoria
export function disposeHierarchy(node, removeFromScene = true) {
    if (!node) return;
    node.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            const cleanMat = (m) => {
                if (m.map) m.map.dispose();
                if (m.lightMap) m.lightMap.dispose();
                if (m.bumpMap) m.bumpMap.dispose();
                if (m.normalMap) m.normalMap.dispose();
                if (m.specularMap) m.specularMap.dispose();
                if (m.envMap) m.envMap.dispose();
                m.dispose();
            };
            if (Array.isArray(child.material)) child.material.forEach(cleanMat);
            else cleanMat(child.material);
        }
    });
    if (removeFromScene && node.parent) node.parent.remove(node);
}

export function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = type==='success'?'✅':(type==='error'?'❌':'ℹ️');
    toast.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

export function updateLoadingText(t) { 
    const el = document.getElementById('loading-text');
    if(el) el.innerText=t; 
}

export function askUser(title, defaultValue = "", isAlert = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const titleEl = document.getElementById('modal-title');
        const input = document.getElementById('modal-input');
        const btnOk = document.getElementById('modal-ok');
        const btnCancel = document.getElementById('modal-cancel');
        const desc = document.getElementById('modal-desc');

        titleEl.innerText = title;
        input.value = defaultValue;
        
        if(isAlert) {
            input.style.display = 'none';
            btnCancel.style.display = 'none';
            desc.style.display = 'block';
            desc.innerText = defaultValue;
        } else {
            input.style.display = 'block';
            btnCancel.style.display = 'block';
            desc.style.display = 'none';
            input.focus();
        }

        modal.style.display = 'flex';
        const newBtnOk = btnOk.cloneNode(true);
        const newBtnCancel = btnCancel.cloneNode(true);
        btnOk.parentNode.replaceChild(newBtnOk, btnOk);
        btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

        const close = (val) => { modal.style.display = 'none'; resolve(val); };
        newBtnOk.onclick = () => close(isAlert ? true : input.value);
        newBtnCancel.onclick = () => close(null);
        if(!isAlert) input.onkeydown = (e) => { if(e.key === 'Enter') close(input.value); };
    });
}

export function showMessage(title, text) { return askUser(title, text, true); }
export function toggleDisplay(id) { const e=document.getElementById(id); if(e) e.style.display=e.style.display==='none'?'block':'none'; }

export function preloadLogo(url, state) { 
    const i=new Image(); i.crossOrigin="Anonymous"; i.src=url;
    i.onload=()=>{
        const c=document.createElement('canvas');c.width=i.width;c.height=i.height;
        c.getContext('2d').drawImage(i,0,0);
        state.loadedLogoImg=i; state.loadedLogoBase64=c.toDataURL('image/png');
    };
    i.onerror=()=>{ state.loadedLogoBase64=createLogoUrl(); }; 
}

function createLogoUrl() { 
    const c=document.createElement('canvas');c.width=200;c.height=50;
    const x=c.getContext('2d');x.font="bold 40px Arial";x.fillStyle="#4a90e2";
    x.fillText("Levipark21",0,40);return c.toDataURL('image/png'); 
}

export function processSafetyZones(model) {
    model.traverse(node => {
        if (node.isMesh) {
            const meshName = node.name ? node.name.toLowerCase() : "";
            const matName = (node.material && node.material.name) ? node.material.name.toLowerCase() : "";
            const isSafety = meshName.includes('seguridad') || meshName.includes('zona') || matName.includes('seguridad') || matName.includes('zona');
            if (isSafety) {
                node.material = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
                node.visible = state.showSafetyZones;
                node.userData.isSafetyZone = true;
                state.safetyZonesList.push(node);
            }
        }
    });
}

// CÁLCULO DE POSICIÓN SOLAR APROXIMADA
export function calculateSunPosition(date, lat) {
    // Algoritmo simplificado para elevación y azimut
    const hour = date.getHours() + date.getMinutes()/60;
    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    
    // Declinación solar
    const declination = 23.45 * Math.sin(THREE.MathUtils.degToRad(360/365 * (dayOfYear - 81)));
    
    // Ángulo horario (asumiendo mediodía solar a las 13:00 en España aprox)
    const timeOffset = 13; 
    const HRA = 15 * (hour - timeOffset);
    
    const latRad = THREE.MathUtils.degToRad(lat);
    const decRad = THREE.MathUtils.degToRad(declination);
    const hraRad = THREE.MathUtils.degToRad(HRA);

    // Elevación
    let elevation = Math.asin(Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(hraRad));
    let elevationDeg = THREE.MathUtils.radToDeg(elevation);

    // Azimut
    let azimuth = Math.acos((Math.sin(decRad) * Math.cos(latRad) - Math.cos(decRad) * Math.sin(latRad) * Math.cos(hraRad)) / Math.cos(elevation));
    let azimuthDeg = THREE.MathUtils.radToDeg(azimuth);
    
    if (HRA > 0) azimuthDeg = 360 - azimuthDeg;

    return { elevation: Math.max(0, elevationDeg), azimuth: azimuthDeg };
}
// --- END OF FILE utils.js ---