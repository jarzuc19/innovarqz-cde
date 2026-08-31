// ==============================================================================
// CONFIGURACIÓN CENTRALIZADA DE SERVICIOS - CDE INNOVARQZ S.A.S.
// ==============================================================================
const SUPABASE_URL = "https://bjlqtzrcrofpqlmyvoob.supabase.co";
const SUPABASE_KEY = "sb_publishable_htPtQvL-1wrLfu7ACHBg1w_epAZsu1E";
const WEBHOOK_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbyrLMTUnmYqkABhNTFQpQNGvmc0MpspzjvEv2EqUNklQ5a2jMxpRtytzuPwPwPwoyCWtQ/exec";

// Inicialización del cliente de Supabase (Evita colisión de identificadores)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables de Estado
let currentUser = null;
let activeProject = null;
let activeTab = "01_WIP";

// ==============================================================================
// INICIALIZACIÓN Y EVENT LISTENERS
// ==============================================================================
document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
    }

    const projectSelect = document.getElementById("projectSelect");
    if (projectSelect) {
        projectSelect.addEventListener("change", handleProjectChange);
    }

    const btnNewProject = document.getElementById("btnNewProject");
    if (btnNewProject) {
        btnNewProject.addEventListener("click", () => {
            document.getElementById("projectModal").className = "modal-overlay";
        });
    }

    const createProjectForm = document.getElementById("createProjectForm");
    if (createProjectForm) {
        createProjectForm.addEventListener("submit", handleCreateProject);
    }

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            activeTab = e.target.dataset.tab;
            loadFiles();
        });
    });
});

// ==============================================================================
// AUTENTICACIÓN
// ==============================================================================
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("emailInput").value.trim();

    if (!email) {
        alert("Por favor ingrese su correo electrónico.");
        return;
    }

    const { data: user, error } = await supabaseClient
        .from("usuarios")
        .select("*")
        .eq("email", email)
        .single();

    if (error || !user) {
        alert("Usuario no registrado en la base de datos del CDE.");
        return;
    }

    currentUser = user;

    const userInfo = document.getElementById("userInfo");
    if (userInfo) {
        userInfo.innerHTML = `
            <strong>${user.nombre_completo}</strong><br>
            <small style="color: var(--accent-copper);">${user.cargo || 'SuperAdmin'}</small>
        `;
    }

    document.getElementById("loginView").style.display = "none";
    document.getElementById("dashboardView").style.display = "block";

    const btnNewProject = document.getElementById("btnNewProject");
    if (btnNewProject && user.cargo && (user.cargo.includes("BIM Manager") || user.cargo.includes("Director General"))) {
        btnNewProject.style.display = "block";
    }

    loadProjects();
}

// ==============================================================================
// GESTIÓN DE PROYECTOS (CON FILTRO DE DUPLICADOS)
// ==============================================================================
async function loadProjects() {
    const { data: proyectos, error } = await supabaseClient.from("proyectos").select("*");
    const select = document.getElementById("projectSelect");
    
    if (!select) return;
    select.innerHTML = '<option value="">-- Seleccionar Proyecto --</option>';

    if (proyectos && proyectos.length > 0) {
        // MAPA PARA EVITAR NOMBRES/CÓDIGOS DUPLICADOS EN EL DESPLEGABLE
        const proyectosUnicos = new Map();

        proyectos.forEach(p => {
            if (!proyectosUnicos.has(p.nombre)) {
                proyectosUnicos.set(p.nombre, p);
            }
        });

        proyectosUnicos.forEach(p => {
            select.innerHTML += `<option value="${p.id}" data-code="${p.codigo_proyecto}">${p.nombre}</option>`;
        });
    }
}

function handleProjectChange(e) {
    activeProject = e.target.value;
    loadFiles();
}

async function handleCreateProject(e) {
    e.preventDefault();
    
    const payload = {
        accion: "CREAR_PROYECTO",
        codigo_proyecto: document.getElementById("codigoProj").value.trim(),
        cliente: document.getElementById("clienteProj").value.trim(),
        ubicacion: document.getElementById("ubicacionProj").value.trim(),
        tipo_obra: document.getElementById("tipoProj").value.trim()
    };

    alert("Creando estructura normativa ISO 19650 en Google Drive...");

    try {
        await fetch(WEBHOOK_APPS_SCRIPT, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        closeProjectModal();
        alert("Solicitud enviada exitosamente. Actualizando lista de proyectos...");
        setTimeout(() => loadProjects(), 3000);
    } catch (err) {
        alert("Error al enviar la orden al servidor: " + err.message);
    }
}

function closeProjectModal() {
    const modal = document.getElementById("projectModal");
    if (modal) {
        modal.className = "modal-hidden";
    }
}

// ==============================================================================
// GESTIÓN Y RENDERIZADO DE ENTREGABLES (FILTRADO POR PROYECTO ACTIVO Y PESTAÑA)
// ==============================================================================
async function loadFiles() {
    const tbody = document.getElementById("filesTableBody");
    if (!tbody) return;

    if (!activeProject) {
        tbody.innerHTML = '<tr><td colspan="5">Seleccione un proyecto para visualizar los entregables.</td></tr>';
        return;
    }

    // Consulta filtrando obligatoriamente por PROYECTO ACTIVO y PESTAÑA
    const { data: files, error } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("proyecto_id", activeProject)
        .eq("estado_destino", activeTab)
        .order("creado_en", { ascending: false });

    tbody.innerHTML = "";

    if (!files || files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No hay entregables registrados en la pestaña <strong>${activeTab}</strong> para este proyecto.</td></tr>`;
        return;
    }

    // Mapa para mostrar únicamente la última versión de cada archivo
    const archivosUnicos = new Map();

    files.forEach(f => {
        if (!archivosUnicos.has(f.archivo_nombre)) {
            archivosUnicos.set(f.archivo_nombre, f);
        }
    });

    archivosUnicos.forEach(f => {
        const parts = f.archivo_nombre ? f.archivo_nombre.split("-") : [];
        const disciplina = parts[4] || "GENERAL";
        const estadoISO = parts[5] ? parts[5].split(".")[0] : activeTab;

        tbody.innerHTML += `
            <tr>
                <td>${f.archivo_nombre}</td>
                <td><strong>${disciplina}</strong></td>
                <td><span class="badge">${estadoISO}</span></td>
                <td>${f.version || 'V1.0'}</td>
                <td>
                    <button class="btn-secondary" onclick="openViewer('${f.drive_file_url}')">Ver</button>
                    <a href="${f.drive_file_url}" target="_blank" class="btn-primary" style="text-decoration:none; font-size: 0.8rem; padding: 0.4rem 0.8rem;">Descargar</a>
                </td>
            </tr>
        `;
    });
}
