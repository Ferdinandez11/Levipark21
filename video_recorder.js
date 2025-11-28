// --- START OF FILE video_recorder.js ---

import * as THREE from 'three';
import { state } from './globals.js';
import { showToast, updateLoadingText } from './utils.js';
import { deselectObject } from './interaction.js';

let mediaRecorder = null;
let recordedChunks = [];
let originalPixelRatio = 1;

// --- GRABACIÓN MANUAL (Modo Paseo) ---
export function startManualRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') return;

    // 1. OPTIMIZACIÓN: Bajar resolución interna para ganar FPS
    originalPixelRatio = state.renderer.getPixelRatio();
    state.renderer.setPixelRatio(1); 
    state.composer.setPixelRatio(1);

    const canvas = state.renderer.domElement;
    
    // 2. FLUIDEZ: Capturar a 60 FPS (antes 30)
    const stream = canvas.captureStream(60); 
    
    // Configuración de códec preferente
    const mimeTypes = [
        'video/webm; codecs=vp9', 
        'video/webm; codecs=vp8', 
        'video/webm'
    ];
    const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

    recordedChunks = [];
    
    // 3. BITRATE: Ajustado a 5Mbps para equilibrar calidad/rendimiento
    mediaRecorder = new MediaRecorder(stream, { 
        mimeType: selectedMime,
        videoBitsPerSecond: 5000000 
    });

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    
    mediaRecorder.onstop = () => {
        // Restaurar calidad original al terminar
        state.renderer.setPixelRatio(originalPixelRatio);
        state.composer.setPixelRatio(originalPixelRatio);

        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Paseo_${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.webm`;
        a.click();
        showToast("Video guardado", "success");
    };

    mediaRecorder.start();
    showToast("🔴 Grabando a 60FPS... (Pulsa R para parar)", "error");
}

export function stopManualRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        mediaRecorder = null;
        showToast("Procesando video...", "info");
    }
}

export function isRecording() {
    return mediaRecorder && mediaRecorder.state === 'recording';
}

// --- GRABACIÓN AUTOMÁTICA 360 ---
export async function record360Video() {
    if (state.objectsInScene.length === 0) { showToast("La escena está vacía.", "error"); return; }

    deselectObject(); 
    const prevGridVis = state.gridHelper.visible;
    
    state.gridHelper.visible = false; 
    state.transformControl.detach();
    if (state.measureLine) state.measureLine.visible = false;
    state.measureMarkers.forEach(m => m.visible = false);
    if (state.floorLabel) state.floorLabel.visible = false;
    
    const box = new THREE.Box3();
    state.objectsInScene.forEach(obj => box.expandByObject(obj));
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z, size.y);
    const distance = maxDim * 1.5 + 5; 
    const height = maxDim * 0.8 + 2;   

    const originalPos = state.activeCamera.position.clone();
    const originalTarget = state.controls.target.clone();
    const wasAutoRotate = state.controls.autoRotate;

    state.controls.enabled = false; 
    
    // Optimización temporal
    const oldPixel = state.renderer.getPixelRatio();
    state.renderer.setPixelRatio(1);
    state.composer.setPixelRatio(1);

    const canvas = state.renderer.domElement;
    const stream = canvas.captureStream(60); // 60 FPS
    
    const mimeTypes = ['video/webm; codecs=vp9', 'video/webm'];
    const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType: selectedMime, videoBitsPerSecond: 5000000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    
    recorder.onstop = () => {
        state.renderer.setPixelRatio(oldPixel);
        state.composer.setPixelRatio(oldPixel);

        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `Video_360_${new Date().toISOString().slice(0,10)}.webm`; a.click();
        
        state.gridHelper.visible = prevGridVis;
        if (state.measureLine) state.measureLine.visible = true;
        state.measureMarkers.forEach(m => m.visible = true);
        if (state.floorLabel) state.floorLabel.visible = true;

        state.activeCamera.position.copy(originalPos);
        state.controls.target.copy(originalTarget);
        state.controls.enabled = true;
        state.controls.autoRotate = wasAutoRotate;
        
        document.getElementById('loading').style.display = 'none';
        showToast("Video generado correctamente", "success");
    };

    document.getElementById('loading').style.display = 'block';
    updateLoadingText("Grabando video 360º suave...");

    recorder.start();
    
    const DURATION = 10000; 
    const startTime = performance.now();

    function animateCamera() {
        const now = performance.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / DURATION, 1);
        const angle = - (progress * Math.PI * 2) + (Math.PI / 2); 
        
        state.activeCamera.position.x = center.x + Math.cos(angle) * distance;
        state.activeCamera.position.z = center.z + Math.sin(angle) * distance;
        state.activeCamera.position.y = height;
        state.activeCamera.lookAt(center);
        
        // Render explícito
        if (state.renderer.xr.isPresenting) state.renderer.render(state.scene, state.activeCamera); 
        else state.composer.render();

        if (progress < 1) { requestAnimationFrame(animateCamera); } else { recorder.stop(); }
    }
    animateCamera();
}
// --- END OF FILE video_recorder.js ---