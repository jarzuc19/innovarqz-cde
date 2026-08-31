// ==============================================================================
// CONFIGURACIÓN CENTRALIZADA DE SERVICIOS - CDE INNOVARQZ S.A.S.
// ==============================================================================
const SUPABASE_URL = "https://bjlqtzrcrofpqlmyvoob.supabase.co";
const SUPABASE_KEY = "sb_publishable_htPtQvL-1wrLfu7ACHBg1w_epAZsu1E";
const WEBHOOK_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbyrLMTUnmYqkABhNTFQpQNGvmc0MpspzjvEv2EqUNklQ5a2jMxpRtytzuPwPwPwoyCWtQ/exec";

// Inicialización corregida del cliente de Supabase (Evita colisión de identificadores)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables de Estado de la Aplicación
let currentUser = null;
let activeProject = null;
let activeTab = "01_WIP";

// ==============================================================================
// INICIALIZACIÓN Y EVENT LISTENERS
// ==============================================================================
document.addEventListener("DOMContentLoaded", () => {
    // Formulario de Inicio de Sesión
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
    }

    // Selector de Proyecto Activo
    const projectSelect = document.getElementById("projectSelect");
    if (projectSelect) {
        projectSelect.addEventListener("change", handleProjectChange);
    }

    // Botón para Abrir Modal de Nuevo Proyecto
    const btnNewProject = document.getElementById("btnNewProject");
    if (btnNewProject) {
        btnNewProject.addEventListener("click", () => {
            document.getElementById("projectModal").className = "modal-overlay";
        });
    }

    // Formulario para Crear Nuevo Proyecto
    const createProjectForm = document.getElementById("createProjectForm");
    if (createProjectForm) {
        createProjectForm.addEventListener("submit", handleCreateProject);
    }

    // Navegación por Pestañas de Estados ISO 19650
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
// AUTENTICACIÓN Y CONTROL DE ACCESO
// ==============================================================================
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("emailInput").value.trim();

    if (!email) {
        alert("Por favor ingrese su correo electrónico.");
        return;
    }

    // Consulta directa a la tabla usuarios en Supabase usando supabaseClient
    const { data: user, error } = await supabaseClient
        .from("usuarios")
        .select("*")
        .eq("email", email)
        .single();

    if (error || !user) {
        alert("Usuario no registrado en la base de datos del CDE.");
        return;
    }

    // Asignación de Usuario Actual
    currentUser = user;

    // Actualizar Interfaz del Usuario
    const userInfo = document.getElementById("userInfo");
    if (userInfo) {
        userInfo.innerHTML = `
            <strong>${user.nombre_completo}</strong><br>
            <small style="color: var(--accent-copper);">${user.cargo || 'SuperAdmin'}</small>
        `;
    }

    // Transición de Pantallas (Login -> Dashboard)
    document.getElementById("loginView").style.display = "none";
    document.getElementById("dashboardView").style.display = "block";

    // Habilitar Botón de Creación para el SuperAdmin / BIM Manager
    const btnNewProject = document.getElementById("btnNewProject");
    if (btnNewProject && user.cargo && (user.cargo.includes("BIM Manager") || user.cargo.includes("Director General"))) {
        btnNewProject.style.display = "block";
    }

    // Cargar Proyectos Autorizados
    loadProjects();
}

// ==============================================================================
// GESTIÓN DE PROYECTOS
// ==============================================================================
async function loadProjects() {
    const { data: proyectos, error } = await supabaseClient.from("proyectos").select("*");
    const select = document.getElementById("projectSelect");
    
    if (!select) return;
    select.innerHTML = '<option value="">-- Seleccionar Proyecto --</option>';

    if (proyectos && proyectos.length > 0) {
        proyectos.forEach(p => {
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
// GESTIÓN Y RENDERIZADO DE ENTREGABLES ISO 19650
// ==============================================================================
async function loadFiles() {
    const tbody = document.getElementById("filesTableBody");
    if (!tbody) return;

    if (!activeProject) {
        tbody.innerHTML = '<tr><td colspan="5">Seleccione un proyecto para visualizar los entregables.</td></tr>';
        return;
    }

    // Consulta a la tabla audit_logs por estado activo (01_WIP, 02_SHARED, 03_PUBLISHED, 04_ARCHIVED)
    const { data: files, error } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("estado_destino", activeTab);

    tbody.innerHTML = "";

    if (!files || files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No hay entregables registrados en la pestaña <strong>${activeTab}</strong>.</td></tr>`;
        return;
    }

    files.forEach(f => {
        // Desglose sintáctico de la nomenclatura ISO 19650
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
