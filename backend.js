// backend.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { state, updateBudget } from './globals.js';
import { showToast, askUser, updateLoadingText } from './utils.js';
import { loadProjectData, resetScene } from './history.js';

let supabase = null;

export function initSupabase() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.warn("Supabase no configurado");
        return;
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) handleUserLogin(session.user);
        else updateUIForGuest();
    });

    supabase.auth.onAuthStateChange((_event, session) => {
        if (session) handleUserLogin(session.user);
        else handleUserLogout();
    });
}

// --- AUTENTICACIÓN ---

export async function loginUser(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { showToast("Error: " + error.message, 'error'); return false; }
    showToast("Sesión iniciada", 'success'); return true;
}

export async function registerUser(email, password, companyName) {
    const { data, error } = await supabase.auth.signUp({ 
        email, password, options: { data: { company_name: companyName } } 
    });
    if (error) { showToast("Error registro: " + error.message, 'error'); return false; }
    showToast("Registro exitoso. ¡Revisa tu email!", 'info'); return true;
}

export async function logoutUser() {
    const { error } = await supabase.auth.signOut();
    if (error) showToast("Error al salir", 'error');
    else showToast("Sesión cerrada", 'info');
}

// --- GESTIÓN DE ESTADO ---

async function handleUserLogin(user) {
    state.currentUser = user;
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (profile) state.userProfile = profile;
    else state.userProfile = { discount_rate: 0, company_name: "Cliente" };
    updateUIForUser(); updateBudget(); 
}

function handleUserLogout() {
    state.currentUser = null; state.userProfile = null; state.projectToLoad = null; state.currentProjectId = null;
    resetScene(); localStorage.removeItem('levipark_autosave');
    updateUIForGuest(); updateBudget();
}

function updateUIForUser() {
    const btnAuth = document.getElementById('btn-auth-trigger');
    const labelUser = document.getElementById('user-label');
    const panel = document.getElementById('auth-panel');
    
    if(btnAuth) {
        const iconSpan = btnAuth.querySelector('.icon'); const textSpan = btnAuth.querySelector('.text');
        if (iconSpan) iconSpan.innerText = "👤";
        if (textSpan) textSpan.innerText = "Mi Cuenta";
    }
    if(labelUser) {
        const name = state.userProfile?.company_name || state.currentUser.email.split('@')[0];
        labelUser.innerText = `Hola, ${name}`;
        labelUser.style.display = 'block';
    }
    document.getElementById('btn-save-cloud').style.display = 'flex';
    document.getElementById('btn-load-cloud').style.display = 'flex';
    if(panel) panel.style.display = 'none';
}

function updateUIForGuest() {
    const btnAuth = document.getElementById('btn-auth-trigger');
    const labelUser = document.getElementById('user-label');
    if(btnAuth) {
        const iconSpan = btnAuth.querySelector('.icon'); const textSpan = btnAuth.querySelector('.text');
        if (iconSpan) iconSpan.innerText = "🔑";
        if (textSpan) textSpan.innerText = "Iniciar Sesión";
    }
    if(labelUser) labelUser.style.display = 'none';
    document.getElementById('btn-save-cloud').style.display = 'none';
    document.getElementById('btn-load-cloud').style.display = 'none';
}

// --- CLOUD PROJECTS ---

// 1. CARGAR POR ID (Desde Dashboard)
export async function loadProjectById(id) {
    if (!id) return;
    document.getElementById('loading').style.display = 'block';
    updateLoadingText("Cargando proyecto...");

    const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();

    if (error) {
        showToast("Error: " + error.message, 'error');
        document.getElementById('loading').style.display = 'none';
        return;
    }

    if (data) {
        state.currentProjectId = data.id;
        loadProjectData(data.data);
        showToast(`Editando: ${data.name}`, 'success');
        
        // Botón para volver al dashboard
        const headerBtn = document.getElementById('user-label');
        if(headerBtn) {
            headerBtn.innerHTML = `Editando: <strong>${data.name}</strong> <a href="dashboard.html" style="color:#4a90e2; margin-left:10px; text-decoration:none;">⬅ Volver</a>`;
        }
    }
    document.getElementById('loading').style.display = 'none';
}

// 2. GUARDAR / ACTUALIZAR
export async function saveProjectToCloud() {
    if (!state.currentUser) { showToast("Debes iniciar sesión", 'error'); return; }

    // Nombre por defecto
    let defaultName = "Nuevo Parque";
    let name = await askUser("Nombre del Proyecto:", defaultName);
    if (!name) return;

    document.getElementById('loading').style.display = 'block';
    updateLoadingText("Guardando...");

    const itemsSafe = state.objectsInScene.map(obj => {
        const data = JSON.parse(JSON.stringify(obj.userData));
        if(data.assetId && data.modelBase64) delete data.modelBase64; 
        return { type: obj.userData.isFloor ? 'floor' : (obj.userData.isFence ? 'fence' : 'model'), pos: obj.position, rot: obj.rotation, scale: obj.scale, data: data };
    });

    const projectData = { date: new Date().toISOString(), totalPrice: state.totalPrice, items: itemsSafe, assetCache: state.assetCache };
    let error = null;

    // UPDATE si ya existe ID, INSERT si es nuevo
    if (state.currentProjectId) {
        const res = await supabase.from('projects').update({ 
            name: name, data: projectData, total_price: state.totalPrice, updated_at: new Date() 
        }).eq('id', state.currentProjectId);
        error = res.error;
    } else {
        const res = await supabase.from('projects').insert([{ 
            user_id: state.currentUser.id, name: name, data: projectData, total_price: state.totalPrice, status: 'draft' 
        }]).select().single();
        if (res.data) state.currentProjectId = res.data.id;
        error = res.error;
    }

    document.getElementById('loading').style.display = 'none';
    if (error) showToast("Error: " + error.message, 'error');
    else showToast("¡Guardado correctamente!", 'success');
}

// 3. LISTAR (Para el modal antiguo dentro del editor, opcional)
export async function loadUserProjects() {
    if (!state.currentUser) return;
    // ... (Tu lógica antigua de modal, si quieres mantenerla, o redirigir al dashboard)
    window.location.href = 'dashboard.html';
}