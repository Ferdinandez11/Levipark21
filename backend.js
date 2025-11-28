// backend.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { state, updateBudget } from './globals.js';
import { showToast, askUser, updateLoadingText } from './utils.js';
import { loadProjectData, resetScene } from './history.js';

let supabase = null;

export function initSupabase() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.warn("Supabase no configurado en config.js");
        return;
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Comprobar sesión existente al arrancar
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            handleUserLogin(session.user);
        } else {
            updateUIForGuest();
        }
    });

    // Escuchar cambios de sesión
    supabase.auth.onAuthStateChange((_event, session) => {
        if (session) handleUserLogin(session.user);
        else handleUserLogout();
    });
}

// --- AUTENTICACIÓN ---

export async function loginUser(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        showToast("Error: " + error.message, 'error');
        return false;
    }
    showToast("Sesión iniciada", 'success');
    return true;
}

export async function registerUser(email, password, companyName) {
    const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: { data: { company_name: companyName } } // Metadatos iniciales
    });
    
    if (error) {
        showToast("Error registro: " + error.message, 'error');
        return false;
    }
    
    showToast("Registro exitoso. ¡Revisa tu email!", 'info');
    return true;
}

export async function logoutUser() {
    const { error } = await supabase.auth.signOut();
    if (error) showToast("Error al salir", 'error');
    else showToast("Sesión cerrada", 'info');
}

// --- GESTIÓN DE ESTADO DE USUARIO ---

async function handleUserLogin(user) {
    state.currentUser = user;
    
    // Cargar perfil extendido (descuentos, empresa, etc.)
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
    
    if (profile) {
        state.userProfile = profile;
    } else {
        // Fallback si no existe perfil aún
        state.userProfile = { discount_rate: 0, company_name: "Cliente" };
    }

    updateUIForUser();
    updateBudget(); 
}

function handleUserLogout() {
    state.currentUser = null;
    state.userProfile = null;
    state.projectToLoad = null;
    
    resetScene();
    localStorage.removeItem('levipark_autosave');

    updateUIForGuest();
    updateBudget();
}

// --- INTERFAZ DE USUARIO (DOM) ---

function updateUIForUser() {
    const btnAuth = document.getElementById('btn-auth-trigger');
    const labelUser = document.getElementById('user-label');
    const panel = document.getElementById('auth-panel');
    
    // Actualización segura de texto del botón manteniendo la estructura HTML
    if(btnAuth) {
        const iconSpan = btnAuth.querySelector('.icon');
        const textSpan = btnAuth.querySelector('.text');
        
        if (iconSpan) iconSpan.innerText = "👤"; // Icono Usuario
        if (textSpan) textSpan.innerText = "Mi Cuenta";
    }

    if(labelUser) {
        const name = state.userProfile?.company_name || state.currentUser.email.split('@')[0];
        labelUser.innerText = `Hola, ${name}`;
        labelUser.style.display = 'block';
    }
    
    // Mostrar botones de nube
    document.getElementById('btn-save-cloud').style.display = 'flex';
    document.getElementById('btn-load-cloud').style.display = 'flex';
    
    // Ocultar panel de login si estaba abierto
    if(panel) panel.style.display = 'none';
}

function updateUIForGuest() {
    const btnAuth = document.getElementById('btn-auth-trigger');
    const labelUser = document.getElementById('user-label');
    
    if(btnAuth) {
        const iconSpan = btnAuth.querySelector('.icon');
        const textSpan = btnAuth.querySelector('.text');
        
        if (iconSpan) iconSpan.innerText = "🔑"; // Icono Llave
        if (textSpan) textSpan.innerText = "Iniciar Sesión";
    }

    if(labelUser) labelUser.style.display = 'none';

    document.getElementById('btn-save-cloud').style.display = 'none';
    document.getElementById('btn-load-cloud').style.display = 'none';
}

// --- BASE DE DATOS (PROYECTOS) ---

export async function saveProjectToCloud() {
    if (!state.currentUser) {
        showToast("Debes iniciar sesión", 'error');
        return;
    }

    let name = await askUser("Nombre del Proyecto:", "Nuevo Parque");
    if (!name) return;

    document.getElementById('loading').style.display = 'block';
    updateLoadingText("Guardando en la nube...");

    // Preparar JSON del proyecto
    const itemsSafe = state.objectsInScene.map(obj => {
        const data = JSON.parse(JSON.stringify(obj.userData));
        if(data.assetId && data.modelBase64) delete data.modelBase64; 
        return { 
            type: obj.userData.isFloor ? 'floor' : (obj.userData.isFence ? 'fence' : 'model'), 
            pos: obj.position, 
            rot: obj.rotation, 
            scale: obj.scale, 
            data: data 
        };
    });

    const projectData = {
        date: new Date().toISOString(),
        totalPrice: state.totalPrice,
        items: itemsSafe,
        assetCache: state.assetCache 
    };

    // Subir a Supabase
    const { data, error } = await supabase
        .from('projects')
        .insert([
            { 
                user_id: state.currentUser.id,
                name: name,
                data: projectData,
                total_price: state.totalPrice,
                status: 'draft'
            }
        ])
        .select();

    document.getElementById('loading').style.display = 'none';

    if (error) {
        showToast("Error al guardar: " + error.message, 'error');
    } else {
        showToast("¡Proyecto guardado en tu cuenta!", 'success');
    }
}

export async function loadUserProjects() {
    if (!state.currentUser) return;

    document.getElementById('loading').style.display = 'block';
    updateLoadingText("Cargando proyectos...");

    const { data: projects, error } = await supabase
        .from('projects')
        .select('id, name, created_at, total_price, status')
        .order('created_at', { ascending: false });

    document.getElementById('loading').style.display = 'none';

    if (error) {
        showToast("Error al cargar lista: " + error.message, 'error');
        return;
    }

    // Mostrar modal con lista
    const container = document.getElementById('cloud-list-content');
    container.innerHTML = "";
    
    if (projects.length === 0) {
        container.innerHTML = "<p style='text-align:center; color:#aaa'>No tienes proyectos guardados.</p>";
    } else {
        projects.forEach(p => {
            const row = document.createElement('div');
            row.className = 'list-item-row';
            
            const info = document.createElement('div');
            info.className = 'list-item-name';
            const date = new Date(p.created_at).toLocaleDateString();
            info.innerHTML = `<strong>${p.name}</strong> <br> <span style='font-size:10px; color:#aaa'>${date} - ${p.status}</span>`;
            
            const price = document.createElement('div');
            price.className = 'list-item-price';
            price.innerText = (p.total_price || 0).toLocaleString() + "€";

            const btnLoad = document.createElement('button');
            btnLoad.className = 'btn-mini';
            btnLoad.innerText = "📂 Abrir";
            btnLoad.style.background = "#27ae60";
            btnLoad.style.color = "white";
            btnLoad.onclick = () => loadFullProject(p.id);

            row.append(info, price, btnLoad);
            container.appendChild(row);
        });
    }
    
    document.getElementById('cloud-projects-modal').style.display = 'flex';
}

async function loadFullProject(projectId) {
    document.getElementById('cloud-projects-modal').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    updateLoadingText("Descargando proyecto...");

    const { data, error } = await supabase
        .from('projects')
        .select('data')
        .eq('id', projectId)
        .single();

    document.getElementById('loading').style.display = 'none';

    if (error) {
        showToast("Error cargando datos: " + error.message, 'error');
    } else if (data) {
        loadProjectData(data.data);
        showToast("Proyecto cargado correctamente", 'success');
    }
}