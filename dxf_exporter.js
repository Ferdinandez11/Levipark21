// --- START OF FILE dxf_exporter.js ---

import * as THREE from 'three';
import { state } from './globals.js';
import { askUser, showToast, updateLoadingText, wait } from './utils.js';

function p(code, value) {
    return `${code}\r\n${value}\r\n`;
}

// Header R12 compatible (AC1009)
function getHeader() {
    let s = "";
    s += p(0, "SECTION");
    s += p(2, "HEADER");
    s += p(9, "$ACADVER");
    s += p(1, "AC1009"); 
    s += p(9, "$INSUNITS");
    s += p(70, 6); // Metros
    s += p(0, "ENDSEC");

    s += p(0, "SECTION");
    s += p(2, "TABLES");
    s += p(0, "TABLE");
    s += p(2, "LAYER");
    s += p(70, 1);
    s += p(0, "LAYER");
    s += p(2, "SUELOS");
    s += p(70, 0);
    s += p(62, 3); // Verde
    s += p(6, "CONTINUOUS");
    s += p(0, "ENDTAB");
    s += p(0, "ENDSEC");

    s += p(0, "SECTION");
    s += p(2, "ENTITIES");
    return s;
}

const FOOTER = p(0, "ENDSEC") + p(0, "EOF");

function drawLine(x1, y1, x2, y2, layer) {
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return "";
    return p(0, "LINE") +
           p(8, layer) +
           p(10, x1.toFixed(4)) + p(20, y1.toFixed(4)) + p(30, 0.0) + 
           p(11, x2.toFixed(4)) + p(21, y2.toFixed(4)) + p(31, 0.0);  
}

function drawLWPolyline(points, layer) {
    if (!points || points.length < 2) return "";
    
    let s = "";
    s += p(0, "LWPOLYLINE");
    s += p(8, layer);
    s += p(100, "AcDbEntity");
    s += p(100, "AcDbPolyline");
    s += p(90, points.length); // Número de vértices
    s += p(70, 1); // 1 = Closed

    for (let pt of points) {
        s += p(10, pt.x.toFixed(4));
        s += p(20, (-pt.z).toFixed(4)); // Y en DXF es -Z en Three
    }
    return s;
}

function drawText(x, y, text, height, layer) {
    const safeText = text.replace(/[^\w\s\-\.]/gi, '');
    return p(0, "TEXT") +
           p(8, layer) +
           p(10, x.toFixed(4)) + p(20, y.toFixed(4)) + p(30, 0.0) +
           p(40, height) +
           p(1, safeText);
}

function processModelGeometry(group) {
    let lines = "";
    const thresholdAngle = 20; 
    
    const instanceMatrix = new THREE.Matrix4();
    const finalMatrix = new THREE.Matrix4();

    group.traverse((child) => {
        if (child.isInstancedMesh && child.geometry) {
            const edges = new THREE.EdgesGeometry(child.geometry, thresholdAngle);
            const pos = edges.attributes.position;
            
            if (pos) {
                child.updateMatrixWorld(true);
                for (let k = 0; k < child.count; k++) {
                    child.getMatrixAt(k, instanceMatrix);
                    finalMatrix.multiplyMatrices(child.matrixWorld, instanceMatrix);

                    for (let i = 0; i < pos.count; i += 2) {
                        const v1 = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
                        const v2 = new THREE.Vector3(pos.getX(i+1), pos.getY(i+1), pos.getZ(i+1));
                        v1.applyMatrix4(finalMatrix);
                        v2.applyMatrix4(finalMatrix);
                        const dist = Math.hypot(v1.x - v2.x, v1.z - v2.z);
                        if (dist > 0.01) lines += drawLine(v1.x, -v1.z, v2.x, -v2.z, "EQUIPAMIENTO");
                    }
                }
            }
            edges.dispose();
        }
        else if (child.isMesh && child.geometry && !child.isInstancedMesh) {
            const edges = new THREE.EdgesGeometry(child.geometry, thresholdAngle);
            const pos = edges.attributes.position;

            if (pos) {
                child.updateMatrixWorld(true);
                const matrix = child.matrixWorld;

                for (let i = 0; i < pos.count; i += 2) {
                    const v1 = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
                    const v2 = new THREE.Vector3(pos.getX(i+1), pos.getY(i+1), pos.getZ(i+1));

                    v1.applyMatrix4(matrix);
                    v2.applyMatrix4(matrix);

                    const dist = Math.hypot(v1.x - v2.x, v1.z - v2.z);
                    if (dist > 0.02) {
                        lines += drawLine(v1.x, -v1.z, v2.x, -v2.z, "EQUIPAMIENTO");
                    }
                }
            }
            edges.dispose();
        }
    });
    return lines;
}

export async function exportDXF() {
    if(state.objectsInScene.length === 0) {
        showToast("Escena vacía", "error");
        return;
    }

    const filename = await askUser("Nombre archivo DXF:", "plano_levipark");
    if(!filename) return;

    document.getElementById('loading').style.display = 'block';
    updateLoadingText("Generando DXF...");
    await wait(100);

    const chunks = [];
    chunks.push(getHeader());

    try {
        let counter = 0;
        for (const obj of state.objectsInScene) {
            counter++;
            if (counter % 3 === 0) {
                updateLoadingText(`Procesando objeto ${counter}/${state.objectsInScene.length}...`);
                await wait(20); 
            }

            const d = obj.userData;
            
            // SUELOS
            if (d.isFloor) {
                let pts = [];
                
                // PRIORIDAD 1: Contorno final calculado (Mezcla Curva/Recta)
                if (d.finalPoints && d.finalPoints.length > 0) {
                    // Los finalPoints están en coordenadas locales pre-calculadas pero "flat"
                    // Necesitamos aplicar la transformación del objeto actual (posición, rotación)
                    pts = d.finalPoints.map(p => {
                         const v = new THREE.Vector3(p.x, p.y, p.z);
                         v.applyEuler(obj.rotation);
                         v.multiply(obj.scale);
                         v.add(obj.position);
                         return v;
                    });
                }
                // PRIORIDAD 2: Puntos de control originales (Legacy)
                else if (d.points && d.points.length > 0) {
                    pts = d.points.map(p => {
                        const v = new THREE.Vector3(p.x, p.y, p.z);
                        v.applyEuler(obj.rotation);
                        v.multiply(obj.scale);
                        v.add(obj.position);
                        return v;
                    });
                } 
                // PRIORIDAD 3: Rectángulos simples
                else if (d.dims && d.dims.includes('x')) {
                    const parts = d.dims.split('x');
                    const w = parseFloat(parts[0]) * obj.scale.x;
                    const h = parseFloat(parts[1]) * obj.scale.y;
                    const hw = w/2; const hh = h/2;
                    pts = [
                        new THREE.Vector3(-hw, 0, -hh),
                        new THREE.Vector3(hw, 0, -hh),
                        new THREE.Vector3(hw, 0, hh),
                        new THREE.Vector3(-hw, 0, hh)
                    ];
                    const center = obj.position.clone();
                    const rot = obj.rotation.y;
                    pts.forEach(p => {
                        p.applyAxisAngle(new THREE.Vector3(0,1,0), rot);
                        p.add(center);
                    });
                }
                
                if (pts.length > 0) {
                    chunks.push(drawLWPolyline(pts, "SUELOS"));
                }
            } 
            // VALLAS Y MODELOS
            else {
                const geomLines = processModelGeometry(obj);
                if (geomLines.length > 0) chunks.push(geomLines);
                chunks.push(drawText(obj.position.x, -obj.position.z, d.ref || "Juego", 0.4, "TEXTOS"));
            }
        }

        chunks.push(FOOTER);

        const blob = new Blob(chunks, { type: 'application/dxf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.dxf') ? filename : filename + '.dxf';
        a.click();
        
        showToast("DXF Generado correctamente", "success");

    } catch (e) {
        console.error(e);
        showToast("Error inesperado exportando", "error");
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}
// --- END OF FILE dxf_exporter.js ---