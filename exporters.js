// exporters.js
import * as THREE from 'three';
import { state, updateBudget } from './globals.js';
import { askUser, showToast, updateLoadingText, wait, showMessage } from './utils.js';
import { selectObject } from './interaction.js';

// --- MOBILE AR ---
export async function exportToMobile() {
    if(state.objectsInScene.length === 0) { showMessage("Aviso", "El proyecto está vacío."); return; }
    
    document.getElementById('loading').style.display='block';
    updateLoadingText("Comprimiendo enlace...");
    await wait(100);

    const cleanItems = state.objectsInScene.map(obj => {
        const dataCopy = JSON.parse(JSON.stringify(obj.userData));
        if (dataCopy.img_2d && dataCopy.img_2d.startsWith('data:')) { delete dataCopy.img_2d; }
        if (dataCopy.modelBase64 && dataCopy.modelBase64.length > 1000) { delete dataCopy.modelBase64; }
        
        return {
            type: obj.userData.isFloor ? 'floor' : 'model',
            pos: { x: parseFloat(obj.position.x.toFixed(3)), y: parseFloat(obj.position.y.toFixed(3)), z: parseFloat(obj.position.z.toFixed(3)) },
            rot: { _x: parseFloat(obj.rotation.x.toFixed(3)), _y: parseFloat(obj.rotation.y.toFixed(3)), _z: parseFloat(obj.rotation.z.toFixed(3)) },
            scale: { x: parseFloat(obj.scale.x.toFixed(3)), y: parseFloat(obj.scale.y.toFixed(3)), z: parseFloat(obj.scale.z.toFixed(3)) },
            data: dataCopy
        };
    });

    const projectData = { totalPrice: state.totalPrice, items: cleanItems };
    
    try {
        const jsonString = JSON.stringify(projectData);
        const compressed = window.LZString.compressToEncodedURIComponent(jsonString);
        const currentUrl = window.location.href.split('?')[0];
        const bridgeUrl = `${currentUrl}?data=${compressed}`;
        
        if(bridgeUrl.length > 2500) {
            showMessage("Aviso", "El proyecto es demasiado complejo para un QR. Elimina algunos elementos.");
        } else {
            showQR(bridgeUrl);
        }
    } catch(e) {
        console.error(e);
        showMessage("Error", "Error al generar QR.");
    } finally {
        document.getElementById('loading').style.display='none';
    }
}

function showQR(url) {
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = "";
    new window.QRCode(qrContainer, {
        text: url, width: 200, height: 200, colorDark : "#000000", colorLight : "#ffffff", correctLevel : window.QRCode.CorrectLevel.L
    });
    document.getElementById('qr-modal').style.display = 'flex';
}

// --- PDF DOSSIER ---
export async function generateDossier() {
    const ref=await askUser("Nombre del Proyecto:", "Nuevo Parque"); 
    if(!ref)return;
    
    // --- LÓGICA DE DESCUENTO INTELIGENTE ---
    let disc = 0;
    
    // 1. Si hay un usuario logueado con descuento en su perfil, lo usamos.
    if (state.userProfile && state.userProfile.discount_rate > 0) {
        disc = parseFloat(state.userProfile.discount_rate);
        // NO PREGUNTAMOS AL USUARIO, SE APLICA AUTOMÁTICO
    } else {
        // 2. Si es invitado o no tiene descuento asignado, permitimos entrada manual
        const discStr = await askUser("Descuento manual (%):", "0");
        disc = parseFloat(discStr) || 0;
    }
    
    try {
        document.getElementById('loading').style.display='block';
        updateLoadingText("Generando PDF...");
        const doc=new window.jspdf.jsPDF(); 
        const w=doc.internal.pageSize.getWidth(), h=doc.internal.pageSize.getHeight(), m=10;

        const prevSky = state.sky.visible; 
        const prevBG = state.scene.background; 
        
        state.sky.visible = false; 
        state.scene.background = new THREE.Color(0xffffff); 
        state.outlinePass.selectedObjects = []; 
        state.transformControl.detach();
        
        state.dirLight.castShadow = true;
        
        updateLoadingText("Portada..."); await wait(200);
        const originalSize = new THREE.Vector2(); state.renderer.getSize(originalSize);
        state.renderer.setSize(2000, 1500); 
        state.activeCamera.aspect = 2000 / 1500; state.activeCamera.updateProjectionMatrix();
        state.renderer.render(state.scene, state.activeCamera); 
        const imgCov = state.renderer.domElement.toDataURL('image/jpeg', 0.9);
        
        state.renderer.setSize(originalSize.x, originalSize.y); 
        state.activeCamera.aspect = originalSize.x / originalSize.y; state.activeCamera.updateProjectionMatrix();

        state.dirLight.castShadow = false;

        updateLoadingText("Vistas Técnicas..."); state.controls.enabled=false;
        const oldCam = state.activeCamera; state.activeCamera = state.orthoCamera; const views={}; 
        
        const box=new THREE.Box3(); 
        if(state.objectsInScene.length>0) state.objectsInScene.forEach(o=>box.expandByObject(o)); 
        else box.setFromCenterAndSize(new THREE.Vector3(0,0,0), new THREE.Vector3(10,10,10));
        const ctr=box.getCenter(new THREE.Vector3()), sz=box.getSize(new THREE.Vector3());
        const maxDim=Math.max(sz.x,sz.y,sz.z)*0.6, dist=maxDim*4;
        
        state.orthoCamera.zoom=1; state.orthoCamera.left=-maxDim; state.orthoCamera.right=maxDim; state.orthoCamera.top=maxDim; state.orthoCamera.bottom=-maxDim; state.orthoCamera.updateProjectionMatrix();

        const camPos=[{n:'front',p:[0,0,dist],u:[0,1,0]}, {n:'side',p:[dist,0,0],u:[0,1,0]}, {n:'top',p:[0,dist,0],u:[0,0,-1]}, {n:'iso',p:[dist,dist,dist],u:[0,1,0]}];
        
        state.renderer.setSize(1000, 1000);
        for(let c of camPos) {
            state.orthoCamera.position.set(ctr.x+c.p[0], ctr.y+c.p[1], ctr.z+c.p[2]); 
            state.orthoCamera.up.set(c.u[0],c.u[1],c.u[2]); state.orthoCamera.lookAt(ctr);
            state.renderer.render(state.scene, state.orthoCamera); 
            views[c.n]=state.renderer.domElement.toDataURL('image/jpeg',0.9); 
            await wait(100); 
        }
        state.renderer.setSize(originalSize.x, originalSize.y);

        const items=[], seen=new Set(); 
        state.objectsInScene.forEach(o=>o.visible=false); 
        state.renderer.setSize(800, 600);
        
        for(let o of state.objectsInScene) {
            if(seen.has(o.userData.ref)) continue; seen.add(o.userData.ref);
            updateLoadingText("Item: "+o.userData.name); 
            o.visible=true; 
            
            const b=new THREE.Box3().setFromObject(o); const c=b.getCenter(new THREE.Vector3()); const s=b.getSize(new THREE.Vector3()); const d=Math.max(s.x,s.y,s.z)*0.6;
            state.orthoCamera.position.set(15,15,15); state.orthoCamera.up.set(0,1,0); state.orthoCamera.lookAt(c);
            state.orthoCamera.left=-d*1.33; state.orthoCamera.right=d*1.33; state.orthoCamera.top=d; state.orthoCamera.bottom=-d; state.orthoCamera.updateProjectionMatrix();
            
            state.renderer.render(state.scene, state.orthoCamera);
            
            let fImg=state.renderer.domElement.toDataURL('image/jpeg',0.9);
            if(o.userData.img_2d && !o.userData.img_2d.startsWith('data:')){ 
                try {
                    const i=new Image(); i.src=o.userData.img_2d; 
                    await new Promise((resolve) => {
                         i.onload = resolve; i.onerror = resolve; setTimeout(resolve, 500); 
                    });
                    if(i.width>0){
                        const ca=document.createElement('canvas');ca.width=i.width;ca.height=i.height;ca.getContext('2d').drawImage(i,0,0);
                        fImg=ca.toDataURL('image/jpeg',0.9);
                    }
                } catch(e){} 
            }
            items.push({d:o.userData, i:fImg}); 
            o.visible=false; 
            await wait(50);
        }
        state.renderer.setSize(originalSize.x, originalSize.y);

        state.dirLight.castShadow = true;
        state.objectsInScene.forEach(o=>o.visible=true); 
        state.sky.visible=prevSky; state.scene.background=prevBG; 
        if(state.selectedObject) selectObject(state.selectedObject);
        state.activeCamera=oldCam; state.controls.enabled=true;
        
        updateLoadingText("Generando PDF...");
        const lg = state.loadedLogoBase64 || createLogoUrl(); 
        const date = new Date().toLocaleDateString(); 
        const BLUE = [74, 144, 226];

        doc.setFont("helvetica", "bold"); doc.setFontSize(30); doc.setTextColor(40); doc.text("Levipark21", m, 25); 
        doc.setFontSize(14); doc.setTextColor(100); doc.text(ref, w-m, 25, {align:'right'});
        const coverProp = doc.getImageProperties(imgCov); 
        const maxCoverH = (h/2) + 20; const maxCoverW = w - (2*m); 
        const coverRatio = Math.min(maxCoverW / coverProp.width, maxCoverH / coverProp.height);
        doc.addImage(imgCov, 'JPEG', m + (maxCoverW - coverProp.width*coverRatio)/2, 40, coverProp.width*coverRatio, coverProp.height*coverRatio); 
        addFooter(doc, date, lg);

        doc.addPage(); doc.setFontSize(16); doc.setTextColor(0); doc.text("Vistas Técnicas", m, 20);
        const gw=(w-30)/2, gh=(h-60)/2; 
        const putView = (img, tit, x, y) => { doc.setFontSize(12); doc.setTextColor(100); doc.text(tit, x, y-2); const props = doc.getImageProperties(img); const r = Math.min(gw/props.width, gh/props.height); const fw = props.width * r; const fh = props.height * r; doc.addImage(img, 'JPEG', x+(gw-fw)/2, y+(gh-fh)/2, fw, fh); };
        putView(views.front, "Alzado", 10, 30); putView(views.side, "Perfil", 20+gw, 30); 
        putView(views.top, "Planta", 10, 40+gh); putView(views.iso, "Isométrica", 20+gw, 40+gh); 
        addFooter(doc, date, lg);

        doc.addPage(); doc.setFontSize(18); doc.text("Presupuesto", m, 20);
        const rows = state.objectsInScene.map(o => {
            let cantidad = "1";
            if (o.userData.dims && (o.userData.isFence || o.userData.isFloor)) {
                cantidad = o.userData.dims;
            }
            return [
                o.userData.name, 
                o.userData.ref, 
                cantidad, 
                (o.userData.price||0).toLocaleString()+" €"
            ];
        });

        const tot=state.totalPrice;
        const dAm=tot*(disc/100);
        const fin=tot-dAm; 
        const iva=fin*0.21;
        const final=fin+iva;
        
        rows.push(["","","",""]);
        
        // Solo mostramos la línea de descuento si existe
        if (disc > 0) {
            rows.push(["","","Dto "+disc+"%", "-"+dAm.toLocaleString()+" €"]);
        }
        
        rows.push(
            ["","","Base Imponible", fin.toLocaleString()+" €"], 
            ["","","IVA 21%", iva.toLocaleString()+" €"], 
            ["","","TOTAL", final.toLocaleString()+" €"]
        );
        
        doc.autoTable({head:[['Concepto','Ref','Ud','Precio']], body:rows, startY:30, theme:'grid', headStyles:{fillColor:BLUE}, columnStyles:{3:{halign:'right'}}}); 
        addFooter(doc, date, lg);

        if(items.length>0){
            doc.addPage(); doc.setFontSize(24); doc.text("Documentación", w/2, h/2, {align:'center'});
            items.forEach(i => {
                doc.addPage(); addHeader(doc, ref); 
                const iProp = doc.getImageProperties(i.i); const maxH = (h/2)-20; const maxW = w-2*m; const r = Math.min(maxW/iProp.width, maxH/iProp.height);
                doc.addImage(i.i, 'JPEG', m+(maxW-iProp.width*r)/2, 20, iProp.width*r, iProp.height*r);
                let y = maxH + 40; doc.setFontSize(18); doc.setTextColor(0); doc.text(i.d.name, m, y); y += 10;
                doc.setFontSize(12); doc.setTextColor(80); doc.text(`Ref: ${i.d.ref}`, m, y); y += 10; doc.text(`Dimensiones: ${i.d.dims || "-"}`, m, y); y += 15;
                doc.setFontSize(10); const ds = doc.splitTextToSize(i.d.desc || "", w-2*m); doc.text(ds, m, y); y += (ds.length*5) + 15;
                doc.setTextColor(0, 0, 255);
                if (i.d.url_tech && i.d.url_tech != "#") { doc.textWithLink(">> Ficha Técnica", m, y, {url:i.d.url_tech}); y+=8; }
                if (i.d.url_cert && i.d.url_cert != "#") { doc.textWithLink(">> Certificado", m, y, {url:i.d.url_cert}); y+=8; }
                doc.textWithLink(">> Ficha de Montaje", m, y, {url:i.d.url_inst||"#"}); 
                addFooter(doc, date, lg);
            });
        }
        
        doc.save("Dossier_"+ref+".pdf");
        showToast("PDF generado correctamente", 'success');

    } catch (err) {
        console.error(err);
        showMessage("Error", "Error al generar PDF: " + err.message);
    } finally {
        document.getElementById('loading').style.display='none';
        state.dirLight.castShadow = true;
        state.controls.enabled = true;
        state.activeCamera = state.perspectiveCamera;
        state.objectsInScene.forEach(o=>o.visible=true); 
        state.sky.visible = true;
        if(state.selectedObject) selectObject(state.selectedObject);
    }
}

function addHeader(d,r) { d.setFontSize(10);d.setTextColor(150);d.text(r,d.internal.pageSize.getWidth()-20,15,{align:'right'}); }
function addFooter(d,dt,lg) { const w=d.internal.pageSize.getWidth(),h=d.internal.pageSize.getHeight();d.setFontSize(10);d.setTextColor(150);d.text(dt,20,h-15);if(lg){const r=state.loadedLogoImg?state.loadedLogoImg.width/state.loadedLogoImg.height:4;let lw=40,lh=lw/r;if(lh>15){lh=15;lw=lh*r;}d.addImage(lg,'PNG',w-10-lw,h-25,lw,lh);} }

function createLogoUrl() { const c=document.createElement('canvas');c.width=200;c.height=50;const x=c.getContext('2d');x.font="bold 40px Arial";x.fillStyle="#4a90e2";x.fillText("Levipark21",0,40);return c.toDataURL('image/png'); }