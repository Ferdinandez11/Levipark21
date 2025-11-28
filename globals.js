// --- START OF FILE globals.js ---

import * as THREE from 'three';

// Estado interno (no exportado directamente para protegerlo con el Proxy)
const internalState = {
    // Escena y Render
    scene: null,
    renderer: null,
    activeCamera: null,
    perspectiveCamera: null,
    orthoCamera: null,
    controls: null,
    transformControl: null,
    composer: null,
    outlinePass: null,
    
    // Luces y Ambiente
    dirLight: null,
    hemiLight: null,
    sky: null,
    sun: null,
    sunAzimuth: 180,
    sunElevation: 30,
    gridHelper: null,
    shadowPlane: null,

    // Herramientas y Raycaster
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    loadingManager: null,
    loader: null,
    textureLoader: null,

    // Lógica de Negocio
    productsDB: {},
    objectsInScene: [],
    productToPlace: null,
    productPrice: 0,
    currentProductData: null, 
    selectedObject: null,
    totalPrice: 0,
    
    // --- USUARIO Y NUBE ---
    currentUser: null,
    userProfile: null,
    projectToLoad: null,

    // --- GESTIÓN DE MEMORIA Y ASSETS ---
    pendingModelBase64: null, 
    pendingAssetId: null,     
    assetCache: {},           

    isColliding: false,

    // Estado de Herramientas
    isMeasuring: false,
    measurePoints: [],
    measureMarkers: [],
    measureLine: null,
    measureLabel: null,

    isDrawingFloor: false,
    isDrawingFence: false,
    floorPoints: [],
    floorMarkers: [],
    floorLine: null,
    floorLabel: null,
    floorMode: 'poly', 
    rectStartPoint: null,
    rectPreviewMesh: null,
    isInputFocused: false,

    // Snapping & Safety
    isSnapping: false,
    showSafetyZones: true,
    safetyZonesList: [],

    // Historial
    historyStack: [],
    historyStep: -1,

    // Assets
    loadedLogoBase64: null,
    loadedLogoImg: null
};

// Función de actualización de UI
export function updateBudget() {
    const el = document.getElementById('budget-box');
    const discountEl = document.getElementById('discount-display');
    
    // Accedemos directamente a internalState para evitar bucles infinitos con el Proxy
    let finalPrice = internalState.totalPrice;
    
    if(el) {
        let discountText = "";

        if (internalState.userProfile && internalState.userProfile.discount_rate > 0) {
            const disc = internalState.userProfile.discount_rate;
            const savings = finalPrice * (disc / 100);
            finalPrice = finalPrice - savings;
            discountText = ` (Dto. ${disc}% aplicado)`;
            
            if(discountEl) {
                discountEl.style.display = 'block';
                discountEl.innerText = `Ahorro: -${savings.toLocaleString('es-ES')} €`;
            }
        } else {
            if(discountEl) discountEl.style.display = 'none';
        }

        el.innerText = finalPrice.toLocaleString('es-ES') + " €";
        if(discountText) {
             el.innerHTML += `<span style="font-size:12px; display:block; color:#f1c40f;">${discountText}</span>`;
        }
    }
}

// --- PATRÓN PROXY PARA REACTIVIDAD ---
export const state = new Proxy(internalState, {
    set(target, property, value) {
        target[property] = value;
        
        // Si cambia el precio total, actualizamos la UI automáticamente
        if (property === 'totalPrice' || property === 'userProfile') {
            updateBudget();
        }
        return true;
    }
});