// --- START OF FILE app_actions.js ---

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'; 
import { state, updateBudget } from './globals.js';
import { askUser, showToast, updateLoadingText } from './utils.js';
import { selectObject, deleteSelected, deselectObject } from './interaction.js';
import { toggleMeasureMode, toggleFloorMode, applyTextureToSelectedFloor, prepareCustomFloor } from './floor.js';

// --- LOGICA DE VISTAS Y CÁMARA ---

export function toggleProjection() { 
    const p=state.activeCamera.position.clone(), t=state.controls.target.clone(); 
    state.activeCamera = (state.activeCamera===state.perspectiveCamera)?state.orthoCamera:state.perspectiveCamera; 
    state.activeCamera.position.copy(p); state.activeCamera.lookAt(t); 
    state.controls.object=state.activeCamera; state.transformControl.camera=state.activeCamera; 
    if (state.activeCamera === state.orthoCamera) { const aspect = window.innerWidth / window.innerHeight; state.orthoCamera.left = -20 * aspect; state.orthoCamera.right = 20 * aspect; state.orthoCamera.top = 20; state.orthoCamera.bottom = -20; state.orthoCamera.updateProjectionMatrix(); } 
    state.composer.passes.forEach(pass => { if(pass.camera) pass.camera = state.activeCamera; }); 
    document.getElementById('btn-projection').innerText = (state.activeCamera===state.perspectiveCamera)?"👁️ Perspectiva":"📐 Ortográfica"; 
}

export function setView(v) { 
    state.controls.target.set(0,0,0); const d=20; 
    if(v==='iso') state.activeCamera.position.set(d,d,d); 
    if(v==='top') state.activeCamera.position.set(0,d,0); 
    if(v==='front') state.activeCamera.position.set(0,0,d); 
    if(v==='side') state.activeCamera.position.set(d,0,0); 
    state.activeCamera.lookAt(0,0,0); state.controls.update(); 
}

// --- LOGICA DE EXPORTACIÓN GLB ---

export async function exportGLB() {
    if (state.objectsInScene.length === 0) {
        showToast("Escena vacía", "error");
        return;
    }

    const name = await askUser("Nombre del archivo .glb:", "diseño_3d");
    if(!name) return;

    document.getElementById('loading').style.display = 'block';
    updateLoadingText("Generando GLB 3D...");

    const prevVisibleGrid = state.gridHelper.visible;
    state.gridHelper.visible = false;
    state.transformControl.detach();
    if(state.measureLine) state.measureLine.visible = false;
    state.measureMarkers.forEach(m => m.visible = false);
    state.shadowPlane.visible = false;

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
        { binary: true } 
    );
}

// --- LOGICA DE CAPTURA ---

export function takeScreenshot() { 
    state.transformControl.detach(); state.outlinePass.selectedObjects=[]; state.composer.render(); 
    const d=state.renderer.domElement.toDataURL('image/jpeg',0.9); 
    const a=document.createElement('a'); a.download='diseño.jpg'; a.href=d; a.click(); 
    if(state.selectedObject) selectObject(state.selectedObject); 
    showToast("Captura guardada", 'success'); 
}

// --- LOGICA DE LISTADO ---

export function updateAndShowList() {
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

// --- LOGICA DE IMPORTACIÓN ---

export async function prepareImportedModel(url, filename, base64Data) {
    if (state.isMeasuring) toggleMeasureMode(); if (state.isDrawingFloor) toggleFloorMode(); deselectObject();
    
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

export function handleFileUpload(e) {
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
}