// globals.js
import * as THREE from 'three';

export const state = {
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
    currentUser: null,       // Objeto Auth de Supabase
    userProfile: null,       // Datos de perfil (empresa, descuento...)
    projectToLoad: null,     // ID del proyecto cargado actualmente (si existe)

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

// Función auxiliar para actualizar presupuesto UI desde cualquier módulo
export function updateBudget() {
    const el = document.getElementById('budget-box');
    const discountEl = document.getElementById('discount-display');
    
    if(el) {
        let finalPrice = state.totalPrice;
        let discountText = "";

        // Aplicar descuento si el usuario tiene uno asignado en su perfil
        if (state.userProfile && state.userProfile.discount_rate > 0) {
            const disc = state.userProfile.discount_rate;
            const savings = finalPrice * (disc / 100);
            finalPrice = finalPrice - savings;
            discountText = ` (Dto. ${disc}% aplicado)`;
            
            // Si hay un elemento visual para el descuento, mostrarlo
            if(discountEl) {
                discountEl.style.display = 'block';
                discountEl.innerText = `Ahorro: -${savings.toLocaleString('es-ES')} €`;
            }
        } else {
            if(discountEl) discountEl.style.display = 'none';
        }

        el.innerText = finalPrice.toLocaleString('es-ES') + " €";
        // Añadimos indicador visual si hay descuento
        if(discountText) {
             el.innerHTML += `<span style="font-size:12px; display:block; color:#f1c40f;">${discountText}</span>`;
        }
    }
}