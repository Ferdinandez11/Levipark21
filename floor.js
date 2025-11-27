// floor.js
import * as THREE from 'three';
import { state, updateBudget } from './globals.js';
import { PRICE_PER_M2, FLOOR_COLORS } from './config.js';
import { showToast, askUser } from './utils.js'; // <--- AÑADIDO askUser
import { saveHistory } from './history.js';
import { selectObject, deselectObject } from './interaction.js';

// --- MEDIDAS ---
export function toggleMeasureMode() { 
    if(state.isDrawingFloor) toggleFloorMode(); 
    state.isMeasuring = !state.isMeasuring; 
    const b = document.getElementById('btn-measure'); 
    
    if(state.isMeasuring){
        b.classList.add('active-tool');
        b.innerText="📏 Click A";
        deselectObject();
    } else {
        b.classList.remove('active-tool');
        b.innerText="📏 Medir";
        clearMeasurements();
    } 
}

export function clearMeasurements() { 
    state.measurePoints=[]; 
    state.measureMarkers.forEach(m=>state.scene.remove(m)); 
    state.measureMarkers=[]; 
    if(state.measureLine) state.scene.remove(state.measureLine); 
    if(state.measureLabel) state.scene.remove(state.measureLabel); 
    document.getElementById('clear-measures').style.display='none'; 
}

export function createMeasureMarker(p) { 
    const m=new THREE.Mesh(new THREE.SphereGeometry(0.15),new THREE.MeshBasicMaterial({color:0xe67e22,depthTest:false})); 
    m.position.copy(p); m.renderOrder=999; 
    state.scene.add(m); 
    state.measureMarkers.push(m); 
}

export function updateMeasureLine(e) { 
    if(state.measurePoints.length<1) return; 
    const s=state.measurePoints[0]; 
    if(state.measureLine) state.scene.remove(state.measureLine); 
    const g=new THREE.BufferGeometry().setFromPoints([s,e]); 
    state.measureLine=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xe67e22,linewidth:3,depthTest:false})); 
    state.measureLine.renderOrder=998; 
    state.scene.add(state.measureLine); 
    const d=s.distanceTo(e).toFixed(2); 
    const b=document.getElementById('btn-measure'); 
    if(state.isMeasuring && state.measurePoints.length===1) b.innerText=`📏 ${d}m`; 
    if(state.measurePoints.length===2){
        createMeasureLabel(d+" m", s.clone().lerp(e,0.5).add(new THREE.Vector3(0,0.3,0))); 
        document.getElementById('clear-measures').style.display='block'; 
        b.innerText="📏 Terminar";
    } 
}

export function createMeasureLabel(t,p) { 
    if(state.measureLabel) state.scene.remove(state.measureLabel); 
    const c=document.createElement('canvas');c.width=256;c.height=128;const x=c.getContext('2d');
    x.fillStyle="rgba(0,0,0,0.7)";x.roundRect(10,10,236,108,20);x.fill();
    x.font="bold 60px Arial";x.fillStyle="white";x.textAlign="center";x.textBaseline="middle";x.fillText(t,128,64);
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));
    s.position.copy(p);s.scale.set(2,1,1);s.renderOrder=999;
    state.scene.add(s); state.measureLabel=s; 
}

// --- SUELOS ---
export function setFloorMode(m) {
    state.floorMode = m;
    document.getElementById('mode-poly').style.background = m==='poly' ? '#4a90e2' : '#444';
    document.getElementById('mode-rect').style.background = m==='rect' ? '#4a90e2' : '#444';
    document.getElementById('poly-inputs').style.display = m==='poly' ? 'block' : 'none';
    document.getElementById('rect-inputs').style.display = m==='rect' ? 'block' : 'none';
    clearFloorDraft();
}

export function toggleFloorMode() { 
    if(state.isMeasuring) toggleMeasureMode(); 
    state.isDrawingFloor = !state.isDrawingFloor; 
    const b=document.getElementById('btn-floor'),p=document.getElementById('floor-input-panel'); 
    if(state.isDrawingFloor){ 
        b.classList.add('active-tool');b.innerText="✏️ Cancel";p.style.display='block';
        deselectObject(); 
        setFloorMode('poly'); 
    } else { 
        b.classList.remove('active-tool');b.innerText="✏️ Suelo";p.style.display='none';
        clearFloorDraft(); 
    } 
}

export function clearFloorDraft() { 
    state.floorPoints=[]; 
    state.floorMarkers.forEach(m=>state.scene.remove(m)); 
    state.floorMarkers=[]; 
    if(state.floorLine) state.scene.remove(state.floorLine); 
    if(state.floorLabel) state.scene.remove(state.floorLabel); 
    document.getElementById('btn-close-floor').style.display='none'; 
    document.getElementById('inp-dist').value=""; 
    document.getElementById('inp-ang').value=""; 
}

export function addFloorPoint(p) { 
    state.floorPoints.push(p); 
    const m=new THREE.Mesh(new THREE.SphereGeometry(0.1,16,16),new THREE.MeshBasicMaterial({color:0x8e44ad}));
    m.position.copy(p); state.scene.add(m); state.floorMarkers.push(m); 
}

export function updateFloorDraft(c, input=false) { 
    if(state.floorPoints.length===0) return; 
    if(state.floorLine) state.scene.remove(state.floorLine); 
    const pts=[...state.floorPoints,c]; 
    state.floorLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x9b59b6,linewidth:2})); 
    state.scene.add(state.floorLine); 
    const l=state.floorPoints[state.floorPoints.length-1], d=l.distanceTo(c).toFixed(2); 
    let a=0; 
    if(state.floorPoints.length>=2){
        const p=state.floorPoints[state.floorPoints.length-2];
        a=Math.round(new THREE.Vector3().subVectors(l,p).normalize().angleTo(new THREE.Vector3().subVectors(c,l).normalize())*(180/Math.PI));
    } 
    if(!input && !state.isInputFocused){
        document.getElementById('inp-dist').value=d;
        document.getElementById('inp-ang').value=a;
    } 
    updateFloorInfoLabel(`${d}m`,c); 
    if(state.floorPoints.length>=3) document.getElementById('btn-close-floor').style.display='block'; 
}

export function updateFloorInfoLabel(t,p) { 
    if(state.floorLabel) state.scene.remove(state.floorLabel); 
    const c=document.createElement('canvas');c.width=300;c.height=100;const x=c.getContext('2d');
    x.fillStyle="rgba(0,0,0,0.6)";x.roundRect(10,10,280,80,15);x.fill();
    x.font="bold 40px Arial";x.fillStyle="#fff";x.textAlign="center";x.textBaseline="middle";x.fillText(t,150,50);
    const m=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false});
    state.floorLabel=new THREE.Sprite(m);
    state.floorLabel.position.copy(p).add(new THREE.Vector3(0,0.5,0));
    state.floorLabel.scale.set(3,1,1);
    state.floorLabel.renderOrder=999;
    state.scene.add(state.floorLabel); 
}

export function addPointFromInput() { 
    if(state.isDrawingFloor){
        const d=parseFloat(document.getElementById('inp-dist').value);
        const a=parseFloat(document.getElementById('inp-ang').value);
        if(!isNaN(d)&&d>0){
            const l=state.floorPoints.length>0?state.floorPoints[state.floorPoints.length-1]:new THREE.Vector3(0,0,0);
            let v=new THREE.Vector3(1,0,0);
            if(state.floorPoints.length>=2){
                const p=state.floorPoints[state.floorPoints.length-2];
                v.subVectors(l,p).normalize();
                if(!isNaN(a)) v.applyAxisAngle(new THREE.Vector3(0,1,0),a*(Math.PI/180));
            }
            addFloorPoint(l.clone().add(v.multiplyScalar(d)));
            document.getElementById('inp-dist').value="";
            document.getElementById('inp-dist').focus();
        } else if(state.floorPoints.length===0) addFloorPoint(new THREE.Vector3(0,0,0));
    } 
}

export function updateFloorFromInput() { 
    if (!state.isDrawingFloor || state.floorPoints.length === 0) return; 
    const d = parseFloat(document.getElementById('inp-dist').value); 
    const a = parseFloat(document.getElementById('inp-ang').value); 
    if (!isNaN(d) && d > 0) { 
        const last = state.floorPoints[state.floorPoints.length - 1]; 
        let dir = new THREE.Vector3(1, 0, 0); 
        if (state.floorPoints.length >= 2) { 
            const prev = state.floorPoints[state.floorPoints.length - 2]; 
            dir.subVectors(last, prev).normalize(); 
            if (!isNaN(a)) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), a * (Math.PI / 180)); 
        } 
        updateFloorDraft(last.clone().add(dir.multiplyScalar(d)), true); 
    } 
}

export function finishFloor() { 
    if(state.floorPoints.length<3) return; 
    let a=0; const n=state.floorPoints.length;
    for(let i=0;i<n;i++){ const j=(i+1)%n; a+=state.floorPoints[i].x*state.floorPoints[j].z; a-=state.floorPoints[j].x*state.floorPoints[i].z; }
    a=Math.abs(a/2);
    const pr=Math.round(a*PRICE_PER_M2); 
    
    const s=new THREE.Shape();
    s.moveTo(state.floorPoints[0].x,state.floorPoints[0].z);
    for(let i=1;i<state.floorPoints.length;i++) s.lineTo(state.floorPoints[i].x,state.floorPoints[i].z);
    s.lineTo(state.floorPoints[0].x,state.floorPoints[0].z); 
    
    const m=new THREE.Mesh(new THREE.ExtrudeGeometry(s,{depth:0.05,bevelEnabled:false}),new THREE.MeshStandardMaterial({color:FLOOR_COLORS.garnet,roughness:0.5}));
    m.rotation.x=Math.PI/2; m.position.y=0.01; m.receiveShadow=true; m.castShadow=true; 
    m.userData={price:pr,locked:false,collides:true,isFloor:true,area:a.toFixed(2),name:"Suelo Caucho",ref:"S-001",dims:`${a.toFixed(2)} m2`,points:state.floorPoints.map(p=>({x:p.x,y:p.y,z:p.z}))}; 
    
    state.scene.add(m);
    state.objectsInScene.push(m);
    state.totalPrice+=pr;
    updateBudget();
    
    updateFloorInfoLabel(`Area: ${a.toFixed(2)}m²`,state.floorPoints[n-1]);
    setTimeout(()=>state.scene.remove(state.floorLabel),3000);
    
    clearFloorDraft(); 
    saveHistory(); 
    showToast('Suelo creado correctamente', 'success'); 
}

export function setFloorColor(h) { 
    if(state.selectedObject && state.selectedObject.userData.isFloor) {
        state.selectedObject.material.color.setHex(h); 
        saveHistory(); 
    }
}

export function applyTextureToSelectedFloor(url, filename) {
    const floor = state.selectedObject; 
    state.textureLoader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace; 
        t.wrapS = t.wrapT = THREE.RepeatWrapping; 
        t.center.set(0.5, 0.5); t.rotation = 0; t.repeat.set(1, 1); t.offset.set(0, 0);
        
        floor.material.map = t; 
        floor.material.color.setHex(0xffffff); 
        floor.material.transparent = true;
        floor.material.needsUpdate = true;
        
        floor.userData.img_2d = url; floor.userData.name = "Suelo: " + filename;
        // updateUI() se llamará desde main o interaction, aquí solo lógica
        saveHistory();
        showToast("Textura aplicada al suelo.", 'success');
    });
}

export function updateTextureMapping() {
    if (!state.selectedObject || !state.selectedObject.userData.isFloor || !state.selectedObject.material.map) return;
    const scale = parseFloat(document.getElementById('tex-scale').value);
    const rot = parseFloat(document.getElementById('tex-rotate').value);
    const offX = parseFloat(document.getElementById('tex-off-x').value);
    const offY = parseFloat(document.getElementById('tex-off-y').value);
    const tex = state.selectedObject.material.map;
    tex.repeat.set(scale, scale); tex.rotation = rot; tex.offset.set(offX, offY);
    state.selectedObject.userData.texSettings = { repeat: scale, rotation: rot, offsetX: offX, offsetY: offY };
}

// --- NUEVA FUNCIÓN AÑADIDA ---
export async function prepareCustomFloor(url, filename) {
    const widthStr = await askUser("Ancho real de la imagen (m):", "10");
    const width = parseFloat(widthStr);
    if(isNaN(width)) return;

    state.textureLoader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace; const asp = t.image.height / t.image.width; const height = width * asp; const area = width * height; 
        t.center.set(0.5, 0.5);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), 
            new THREE.MeshStandardMaterial({ map: t, roughness:0.6, metalness:0.1, transparent: true, color: 0xffffff })); 
        m.rotation.x = -Math.PI/2; m.position.y = 0.05; m.receiveShadow = true;
        m.userData = { price: 0, locked:false, collides:true, isFloor:true, name: "Suelo: "+filename, ref:"IMG", dims:`${width}x${height.toFixed(2)}`, area:area.toFixed(2), img_2d:url };
        state.scene.add(m); state.objectsInScene.push(m); updateBudget(); selectObject(m); saveHistory();
        showToast("Suelo personalizado creado.", 'success');
    });
}