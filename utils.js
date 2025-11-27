import * as THREE from 'three';
import { state } from './globals.js'; // Necesario para acceder a state.safetyZonesList y state.showSafetyZones

export function wait(ms) { return new Promise(r=>setTimeout(r,ms)); }

export function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if(type==='success') icon='✅';
    if(type==='error') icon='❌';

    toast.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;
    container.appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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

        const close = (val) => {
            modal.style.display = 'none';
            resolve(val);
        };

        newBtnOk.onclick = () => close(isAlert ? true : input.value);
        newBtnCancel.onclick = () => close(null);
        
        if(!isAlert) {
            input.onkeydown = (e) => { if(e.key === 'Enter') close(input.value); };
        }
    });
}

export function showMessage(title, text) {
    return askUser(title, text, true);
}

export function toggleDisplay(id) { 
    const e=document.getElementById(id);
    if(e) e.style.display=e.style.display==='none'?'block':'none'; 
}

// Logo Helpers
export function preloadLogo(url, state) { 
    const i=new Image();
    i.crossOrigin="Anonymous";
    i.src=url;
    i.onload=()=>{
        const c=document.createElement('canvas');c.width=i.width;c.height=i.height;
        c.getContext('2d').drawImage(i,0,0);
        state.loadedLogoImg=i;
        state.loadedLogoBase64=c.toDataURL('image/png');
    };
    i.onerror=()=>{ state.loadedLogoBase64=createLogoUrl(); }; 
}

function createLogoUrl() { 
    const c=document.createElement('canvas');c.width=200;c.height=50;
    const x=c.getContext('2d');x.font="bold 40px Arial";x.fillStyle="#4a90e2";
    x.fillText("Levipark21",0,40);return c.toDataURL('image/png'); 
}

// --- LOGICA DE ZONAS DE SEGURIDAD (MOVIDA DESDE MAIN.JS) ---
export function processSafetyZones(model) {
    model.traverse(node => {
        if (node.isMesh) {
            const meshName = node.name ? node.name.toLowerCase() : "";
            const matName = (node.material && node.material.name) ? node.material.name.toLowerCase() : "";
            const isSafetyName = meshName.includes('seguridad') || meshName.includes('zona') || meshName.includes('safety');
            const isSafetyMat = matName.includes('seguridad') || matName.includes('zona') || matName.includes('safety');
            if (isSafetyName || isSafetyMat) {
                node.material = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
                node.visible = state.showSafetyZones;
                node.userData.isSafetyZone = true;
                state.safetyZonesList.push(node);
            }
        }
    });
}