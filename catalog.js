// --- START OF FILE catalog.js ---

import { state } from './globals.js';
import { SHEET_URL } from './config.js';
import { showToast } from './utils.js';
import { deselectObject } from './interaction.js';
import { toggleMeasureMode, toggleFloorMode } from './floor.js';

// Variables de estado para la navegación
let currentView = 'lines'; // 'lines' | 'categories' | 'products'
let currentLine = null;
let currentCategory = null;

// URL por defecto
const NO_IMAGE_URL = "https://placehold.co/400x300/333/999?text=Sin+Imagen";

export async function loadSheetData() { 
    if(SHEET_URL) { 
        try { 
            const r = await fetch(SHEET_URL); 
            state.productsDB = parseCSVtoTree(await r.text()); 
        } catch(e) { 
            console.error("Error cargando CSV:", e);
            showToast("Error cargando catálogo", "error");
        } 
    } 
}

function parseCSVtoTree(csv) {
    const rows = csv.split('\n').map(row => row.trim()).filter(row => row.length > 0);
    const separator = rows[0].includes(';') ? ';' : ',';
    const splitCSV = (str) => str.split(new RegExp(`${separator}(?=(?:(?:[^"]*"){2})*[^"]*$)`));

    const headers = splitCSV(rows[0]).map(h => h.trim().replace(/^"|"$/g, '').toUpperCase());
    
    const db = {};
    for (let i = 1; i < rows.length; i++) {
        const values = splitCSV(rows[i]);
        const item = {};
        
        headers.forEach((header, index) => { 
            let val = values[index] ? values[index].trim() : ""; 
            val = val.replace(/^"|"$/g, '').replace(/""/g, '"'); 
            item[header] = val; 
        });

        const linea = item['LINEA'] || "Varios"; 
        const cat = item['CATEGORIA'] || "General";

        const productObj = { 
            name: item['NOMBRE'], 
            file: item['ARCHIVO_GLB'], 
            price: parseFloat(item['PRECIO'].replace(',','.')) || 0, 
            ref: item['REF'] || "", 
            desc: item['DESC'] || "", 
            dims: item['DIMS'] || "", 
            url_tech: item['URL_TECH'] || "#", 
            img_2d: item['IMG_2D'] || ""
        };

        if (!db[linea]) db[linea] = {}; 
        if (!db[linea][cat]) db[linea][cat] = []; 
        db[linea][cat].push(productObj);
    }
    return db;
}

// --- LÓGICA VISUAL ---

export function openCatalogModal() {
    const modal = document.getElementById('catalog-modal');
    if(!modal) return;
    
    modal.style.display = 'flex';
    document.getElementById('catalog-search-visual').value = "";
    document.getElementById('catalog-search-visual').focus();
    
    renderLines();
}

// NIVEL 1: Renderizar LÍNEAS
export function renderLines() {
    currentView = 'lines';
    currentLine = null;
    currentCategory = null;

    // --- CONFIGURACIÓN DE PORTADAS ---
    // Aquí defines manualmente las fotos para tus líneas.
    // El nombre (izquierda) debe ser EXACTO al de la columna LINEA del CSV.
    const LINE_COVERS = {
        "Línea Clásica": "https://levipark21.es/wp-content/uploads/2025/10/LOGO-LINEA-QUBIQ.png",
        "Línea Futura": "https://levipark21.es/wp-content/uploads/2024/03/Logo-Espacial-02-300x300.png",
        "Mobiliario": "https://levipark21.es/wp-content/uploads/2022/03/LOGO-LEBIURBAN-300x175.png",
        // Si añades más líneas en el futuro, ponlas aquí
    };
    // ----------------------------------


    const container = document.getElementById('catalog-grid');
    const title = document.getElementById('catalog-title');
    const btnBack = document.getElementById('btn-catalog-back');
    
    container.innerHTML = "";
    title.innerText = "Líneas de Juego";
    btnBack.style.display = 'none'; // Estamos en la raíz, no hay botón volver

    const lines = Object.keys(state.productsDB);

    if (lines.length === 0) {
        container.innerHTML = "<p style='color:#ccc; padding:20px;'>Cargando datos...</p>";
        return;
    }

    lines.forEach(lineName => {
        // 1. Buscar portada manual
        let imgUrl = LINE_COVERS[lineName];

        // 2. Si no hay, buscar la primera imagen disponible dentro de esa línea
        if (!imgUrl) {
            imgUrl = NO_IMAGE_URL;
            const cats = Object.keys(state.productsDB[lineName]);
            // Buscamos en la primera categoría, el primer producto
            if(cats.length > 0 && state.productsDB[lineName][cats[0]].length > 0) {
                const firstProd = state.productsDB[lineName][cats[0]][0];
                if(firstProd.img_2d && firstProd.img_2d.length > 4) imgUrl = firstProd.img_2d;
            }
        }

        const card = document.createElement('div');
        card.className = 'catalog-card';
        card.innerHTML = `
            <img src="${imgUrl}" class="card-img" onerror="this.src='${NO_IMAGE_URL}'" loading="lazy">
            <div class="card-body">
                <div class="card-title" style="font-size:16px;">${lineName}</div>
                <div class="card-subtitle">Ver Categorías &rarr;</div>
            </div>
        `;
        card.onclick = () => renderCategories(lineName);
        container.appendChild(card);
    });
}

// NIVEL 2: Renderizar CATEGORÍAS (Dentro de una Línea)
export function renderCategories(lineName) {
    currentView = 'categories';
    currentLine = lineName;
    currentCategory = null;

    const container = document.getElementById('catalog-grid');
    const title = document.getElementById('catalog-title');
    const btnBack = document.getElementById('btn-catalog-back');

    container.innerHTML = "";
    title.innerText = `${lineName} / Categorías`;
    btnBack.style.display = 'block';
    btnBack.onclick = renderLines; // Volver a Líneas

    const categories = Object.keys(state.productsDB[lineName]);

    categories.forEach(catName => {
        // Imagen de portada para la categoría: Usamos la del primer producto de esa categoría
        const productsInCat = state.productsDB[lineName][catName];
        let imgUrl = NO_IMAGE_URL;
        
        if (productsInCat.length > 0) {
            const firstProd = productsInCat[0];
            if(firstProd.img_2d && firstProd.img_2d.length > 4) imgUrl = firstProd.img_2d;
        }

        const card = document.createElement('div');
        card.className = 'catalog-card';
        card.innerHTML = `
            <img src="${imgUrl}" class="card-img" onerror="this.src='${NO_IMAGE_URL}'" loading="lazy">
            <div class="card-body">
                <div class="card-title" style="font-size:15px;">${catName}</div>
                <div class="card-subtitle">${productsInCat.length} productos &rarr;</div>
            </div>
        `;
        // Al hacer click, vamos a los productos de ESTA categoría y ESTA línea
        card.onclick = () => renderProducts(lineName, catName);
        container.appendChild(card);
    });
}

// NIVEL 3: Renderizar PRODUCTOS (Dentro de una Categoría)
export function renderProducts(lineName, catName) {
    currentView = 'products';
    currentLine = lineName;
    currentCategory = catName;

    const container = document.getElementById('catalog-grid');
    const title = document.getElementById('catalog-title');
    const btnBack = document.getElementById('btn-catalog-back');

    container.innerHTML = "";
    title.innerText = `${lineName} / ${catName}`;
    btnBack.style.display = 'block';
    // Volver a: Listado de Categorías de la línea actual
    btnBack.onclick = () => renderCategories(lineName); 

    const products = state.productsDB[lineName][catName];
    
    products.forEach(prod => {
        createProductCard(prod, container, catName);
    });
}

// Helper para crear tarjeta de producto final
function createProductCard(prod, container, badgeText) {
    const card = document.createElement('div');
    card.className = 'catalog-card';
    
    const imgSafe = (prod.img_2d && prod.img_2d.length > 4) ? prod.img_2d : NO_IMAGE_URL;

    card.innerHTML = `
        <div class="card-badge">${badgeText}</div>
        <img src="${imgSafe}" class="card-img" onerror="this.src='${NO_IMAGE_URL}'" loading="lazy">
        <div class="card-body">
            <div class="card-title">${prod.name}</div>
            <div class="card-subtitle">Ref: ${prod.ref}</div>
            <div class="card-price">${prod.price.toLocaleString()} €</div>
        </div>
    `;

    card.onclick = () => {
        placeProductFromCatalog(prod);
    };
    container.appendChild(card);
}

// Acción final: Colocar producto
function placeProductFromCatalog(prod) {
    document.getElementById('catalog-modal').style.display = 'none';
    
    if(state.isMeasuring) toggleMeasureMode(); 
    if(state.isDrawingFloor) toggleFloorMode(); 
    deselectObject(); 
    
    state.productToPlace = prod.file; 
    state.productPrice = prod.price; 
    window.currentProductData = prod; 
    state.pendingModelBase64 = null; 
    
    showToast(`Seleccionado: ${prod.name}. Haz click en el suelo.`, 'info');
    
    if(window.innerWidth < 600) {
        document.getElementById('ui-panel').style.display = 'none';
    }
}

// Buscador Visual Global (Salto transversal)
export function filterCatalogVisual(text) {
    text = text.toLowerCase();
    const container = document.getElementById('catalog-grid');
    const title = document.getElementById('catalog-title');
    const btnBack = document.getElementById('btn-catalog-back');

    if (text.trim() === "") {
        // Restaurar vista según historial simple
        if (currentView === 'lines') renderLines();
        else if (currentView === 'categories') renderCategories(currentLine);
        else if (currentView === 'products') renderProducts(currentLine, currentCategory);
        else renderLines(); // Fallback
        return;
    }

    container.innerHTML = "";
    title.innerText = `Buscando: "${text}"`;
    btnBack.style.display = 'block';
    
    // Al salir de la búsqueda, volvemos siempre al inicio para evitar confusión
    btnBack.onclick = () => {
        document.getElementById('catalog-search-visual').value = "";
        renderLines();
    };

    let foundCount = 0;

    // Buscar en todas las líneas y categorías
    for (const [lineName, categories] of Object.entries(state.productsDB)) {
        for (const [catName, products] of Object.entries(categories)) {
            const matches = products.filter(p => 
                p.name.toLowerCase().includes(text) || 
                p.ref.toLowerCase().includes(text)
            );
            
            matches.forEach(prod => {
                createProductCard(prod, container, catName); // Badge muestra la categoría
                foundCount++;
            });
        }
    }

    if (foundCount === 0) {
        container.innerHTML = `<div style="color:#aaa; text-align:center; padding:20px; width:100%;">No se encontraron productos.</div>`;
    }
}