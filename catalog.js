// catalog.js
import { state } from './globals.js';
import { SHEET_URL } from './config.js';
import { showToast, askUser } from './utils.js';
import { deselectObject } from './interaction.js';
import { toggleMeasureMode, toggleFloorMode } from './floor.js';

export async function loadSheetData() { 
    if(SHEET_URL) { 
        try { 
            const r=await fetch(SHEET_URL); 
            state.productsDB=parseCSVtoTree(await r.text()); 
            initCatalogUI(); 
        } catch(e){} 
    } 
}

function parseCSVtoTree(csv) {
    const rows = csv.split('\n').map(row => row.trim()).filter(row => row.length > 0);
    const headers = rows[0].split(',').map(h => h.trim().toUpperCase());
    const db = {};
    for (let i = 1; i < rows.length; i++) {
        const values = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); const item = {};
        headers.forEach((header, index) => { let val = values[index]?values[index].trim():""; val = val.replace(/^"|"$/g, ''); item[header] = val; });
        const linea = item['LINEA'] || "Sin Línea"; const cat = item['CATEGORIA'] || "Varios";
        const productObj = { name: item['NOMBRE'], file: item['ARCHIVO_GLB'], price: parseFloat(item['PRECIO']) || 0, ref: item['REF'] || "", desc: item['DESC'] || "", dims: item['DIMS'] || "", url_tech: item['URL_TECH']||"#", url_cert: item['URL_CERT']||"#", url_inst: item['URL_INST']||"#", img_2d: item['IMG_2D']||"" };
        if (!db[linea]) db[linea] = {}; if (!db[linea][cat]) db[linea][cat] = []; db[linea][cat].push(productObj);
    }
    return db;
}

export function initCatalogUI() {
    const select = document.getElementById('line-select'); if(!select) return; select.innerHTML = "";
    const lines = Object.keys(state.productsDB); 
    if(lines.length>0) { 
        lines.forEach(l => { const o = document.createElement('option'); o.value = l; o.innerText = l; select.appendChild(o); }); 
        select.addEventListener('change', (e) => renderCategories(e.target.value)); 
        renderCategories(lines[0]); 
    }
}

export function renderCategories(l) { 
    const c = document.getElementById('dynamic-catalog'); c.innerHTML=""; if(!state.productsDB[l]) return;
    for(const [cat, prods] of Object.entries(state.productsDB[l])) {
        const b=document.createElement('button'); b.className="accordion-btn"; b.innerText=cat;
        const p=document.createElement('div'); p.className="panel-products";
        prods.forEach(prod => { 
            const bb=document.createElement('button'); bb.className="btn-product"; bb.innerHTML=`${prod.name} <span style="float:right;opacity:0.7">${prod.price}€</span>`; 
            bb.onclick=()=>{
                prepareToPlace(prod,bb);
                if(window.innerWidth<600) document.getElementById('ui-panel').style.display='none';
            }; 
            p.appendChild(bb); 
        });
        b.onclick=()=>{b.classList.toggle("active-acc"); p.style.maxHeight=p.style.maxHeight?null:p.scrollHeight+"px"}; c.append(b,p);
    }
}

export function prepareToPlace(d, b) { 
    if(state.isMeasuring) toggleMeasureMode(); 
    if(state.isDrawingFloor) toggleFloorMode(); 
    deselectObject(); 
    
    state.productToPlace = d.file; 
    state.productPrice = d.price; 
    window.currentProductData = d; 
    state.pendingModelBase64 = null; 
    
    document.querySelectorAll('.btn-product').forEach(btn=>btn.classList.remove('active')); b.classList.add('active'); 
    showToast(`Seleccionado: ${d.name}. Haz click en el suelo.`, 'info');
}

export function filterCatalog(text) {
    text = text.toLowerCase();
    const container = document.getElementById('dynamic-catalog');
    const select = document.getElementById('line-select');
    
    if (text.trim() === "") {
        renderCategories(select.value);
        return;
    }
    container.innerHTML = "";
    let found = false;
    for (const [lineName, categories] of Object.entries(state.productsDB)) {
        for (const [catName, products] of Object.entries(categories)) {
            const matches = products.filter(p => p.name.toLowerCase().includes(text) || p.ref.toLowerCase().includes(text));
            if (matches.length > 0) {
                found = true;
                const header = document.createElement('div');
                header.className = "accordion-btn active-acc"; 
                header.innerText = `${lineName} - ${catName}`; header.style.cursor = "default";
                const pPanel = document.createElement('div');
                pPanel.className = "panel-products"; pPanel.style.maxHeight = "1000px"; 
                matches.forEach(prod => {
                    const bb = document.createElement('button');
                    bb.className = "btn-product";
                    bb.innerHTML = `${prod.name} <span style="float:right;opacity:0.7">${prod.price}€</span>`;
                    bb.onclick = () => {
                        prepareToPlace(prod, bb);
                        if(window.innerWidth < 600) document.getElementById('ui-panel').style.display='none';
                    };
                    pPanel.appendChild(bb);
                });
                container.appendChild(header); container.appendChild(pPanel);
            }
        }
    }
    if (!found) container.innerHTML = "<div style='color:#aaa; text-align:center; padding:10px;'>No se encontraron productos.</div>";
}