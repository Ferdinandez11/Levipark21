// --- START OF FILE video_recorder.js ---

import * as THREE from 'three';
import { state } from './globals.js';
import { showToast, updateLoadingText, wait } from './utils.js';
import { deselectObject } from './interaction.js';

export async function record360Video() {
    if (state.objectsInScene.length === 0) {
        showToast("La escena está vacía.", "error");
        return;
    }

    // 1. PREPARACIÓN DE LA ESCENA (MODO CINE)
    deselectObject(); // Quitar selecciones
    const prevGridVis = state.gridHelper.visible;
    const prevShadowVis = state.shadowPlane.visible;
    
    state.gridHelper.visible = false; // Ocultar rejilla
    // state.shadowPlane.visible = false; // Opcional: ocultar plano de sombras si se ve feo los bordes
    state.transformControl.detach();
    
    // Ocultar marcadores de medidas y UI 3D temporalmente
    if (state.measureLine) state.measureLine.visible = false;
    state.measureMarkers.forEach(m => m.visible = false);
    if (state.floorLabel) state.floorLabel.visible = false;
    
    // 2. CÁLCULO DE ENCUADRE AUTOMÁTICO
    const box = new THREE.Box3();
    state.objectsInScene.forEach(obj => box.expandByObject(obj));
    
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // Calculamos el radio necesario para que todo quepa
    const maxDim = Math.max(size.x, size.z, size.y);
    const distance = maxDim * 1.5 + 5; // Margen de seguridad + 5 metros base
    const height = maxDim * 0.8 + 2;   // Altura proporcional

    // Guardar estado original de cámara y controles
    const originalPos = state.activeCamera.position.clone();
    const originalTarget = state.controls.target.clone();
    const wasAutoRotate = state.controls.autoRotate;

    // Configurar cámara para inicio
    state.controls.enabled = false; // Bloquear usuario
    
    // 3. CONFIGURAR GRABADORA
    const canvas = state.renderer.domElement;
    const stream = canvas.captureStream(30); // 30 FPS
    const mimeTypes = ['video/webm; codecs=vp9', 'video/webm; codecs=vp8', 'video/webm'];
    let selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

    const recorder = new MediaRecorder(stream, { 
        mimeType: selectedMime,
        videoBitsPerSecond: 5000000 // 5 Mbps (Alta calidad)
    });

    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    
    recorder.onstop = () => {
        // 5. FINALIZAR Y DESCARGAR
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Video_360_${new Date().toISOString().slice(0,10)}.webm`;
        a.click();
        
        // Restaurar estado
        state.gridHelper.visible = prevGridVis;
        // state.shadowPlane.visible = prevShadowVis;
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

    // 4. ANIMACIÓN Y GRABACIÓN
    document.getElementById('loading').style.display = 'block';
    updateLoadingText("Grabando video 360º... Por favor espera.");

    recorder.start();
    
    const DURATION = 10000; // 10 segundos exactos
    const startTime = performance.now();

    function animateCamera() {
        const now = performance.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / DURATION, 1);

        // Matemática circular: X = CenterX + Cos(angle) * R, Z = CenterZ + Sin(angle) * R
        // Angulo va de 0 a 2PI (360 grados)
        const angle = - (progress * Math.PI * 2) + (Math.PI / 2); // Empezar desde frente
        
        state.activeCamera.position.x = center.x + Math.cos(angle) * distance;
        state.activeCamera.position.z = center.z + Math.sin(angle) * distance;
        state.activeCamera.position.y = height;
        state.activeCamera.lookAt(center);
        
        // Renderizar frame forzado
        state.renderer.render(state.scene, state.activeCamera);

        if (progress < 1) {
            requestAnimationFrame(animateCamera);
        } else {
            recorder.stop();
        }
    }

    // Iniciar loop de animación personalizado (desacoplado del main loop por un momento)
    animateCamera();
}