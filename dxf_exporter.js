// dxf_exporter.js
import * as THREE from 'three';
import { state } from './globals.js';
import { askUser, showToast, updateLoadingText, wait } from './utils.js';

// --- GENERADOR DE CÓDIGO DXF ---

// Función para formatear pares código/valor
function p(code, value) {
    return `${code}\r\n${value}\r\n`;
}

// Cabecera Minimalista R12 (AC1009) - SOLO ENTIDADES LINE y TEXT
function getHeader() {
    let s = "";
    s += p(0, "SECTION");
    s += p(2, "HEADER");
    s += p(9, "$ACADVER");
    s += p(1, "AC1009"); // R12 (Máxima compatibilidad)
    s += p(9, "$INSUNITS");
    s += p(70, 6); // Metros
    s += p(0, "ENDSEC");

    s += p(0, "SECTION");
    s += p(2, "TABLES");
    s += p(0, "TABLE");
    s += p(2, "LAYER");
    s += p(70, 1);
    s += p(0, "LAYER");
    s += p(2, "0");
    s += p(70, 0);
    s += p(62, 7);
    s += p(6, "CONTINUOUS");
    s += p(0, "ENDTAB");
    s += p(0, "ENDSEC");

    s += p(0, "SECTION");
    s += p(2, "ENTITIES");
    return s;
}

const FOOTER = p(0, "ENDSEC") + p(0, "EOF");

// --- ENTIDADES BÁSICAS (SOLO LINE Y TEXT) ---

function drawLine(x1, y1, x2, y2, layer) {
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return "";
    return p(0, "LINE") +
           p(8, layer) +
           p(10, x1.toFixed(4)) + p(20, y1.toFixed(4)) + p(30, 0.0) + 
           p(11, x2.toFixed(4)) + p(21, y2.toFixed(4)) + p(31, 0.0);  
}

function drawPolyAsLines(points, layer, closed = true) {
    if (!points || points.length < 2) return "";
    let s = "";
    for (let i = 0; i < points.length - 1; i++) {
        s += drawLine(points[i].x, -points[i].z, points[i+1].x, -points[i+1].z, layer);
    }
    if (closed && points.length > 2) {
        const last = points[points.length - 1];
        const first = points[0];
        s += drawLine(last.x, -last.z, first.x, -first.z, layer);
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

// --- PROCESAMIENTO GEOMETRÍA 3D ---

function processModelGeometry(group) {
    let lines = "";
    const thresholdAngle = 20; 
    
    group.traverse((child) => {
        if (child.isMesh && child.geometry) {
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

// --- FUNCIÓN EXPORTAR ---

export async function exportDXF() {
    if(state.objectsInScene.length === 0) {
        showToast("Escena vacía", "error");
        return;
    }

    const filename = await askUser("Nombre archivo DXF:", "plano_levipark");
    if(!filename) return;

    document.getElementById('loading').style.display = 'block';
    updateLoadingText("Generando DXF (Modo Seguro)...");
    await wait(100);

    const chunks = [];
    chunks.push(getHeader());

    try {
        let counter = 0;
        for (const obj of state.objectsInScene) {
            
            // OPTIMIZACIÓN UI: Ceder control al navegador cada 3 objetos
            counter++;
            if (counter % 3 === 0) {
                updateLoadingText(`Procesando objeto ${counter}/${state.objectsInScene.length}...`);
                await wait(20); 
            }

            const d = obj.userData;
            
            // --- SUELOS ---
            if (d.isFloor) {
                if (d.points && d.points.length > 0) {
                    chunks.push(drawPolyAsLines(d.points, "SUELOS", true));
                } else if (d.dims && d.dims.includes('x')) {
                    const parts = d.dims.split('x');
                    const w = parseFloat(parts[0]) * obj.scale.x;
                    const h = parseFloat(parts[1]) * obj.scale.y;
                    const hw = w/2; const hh = h/2;
                    const pts = [
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
                    chunks.push(drawPolyAsLines(pts, "SUELOS", true));
                }
            } 
            // --- MODELOS 3D ---
            else {
                const geomLines = processModelGeometry(obj);
                if (geomLines.length > 0) {
                    chunks.push(geomLines);
                } else {
                    const s = 1;
                    const pts = [
                        new THREE.Vector3(obj.position.x-s, 0, obj.position.z-s),
                        new THREE.Vector3(obj.position.x+s, 0, obj.position.z-s),
                        new THREE.Vector3(obj.position.x+s, 0, obj.position.z+s),
                        new THREE.Vector3(obj.position.x-s, 0, obj.position.z+s)
                    ];
                    chunks.push(drawPolyAsLines(pts, "EQUIPAMIENTO", true));
                }
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