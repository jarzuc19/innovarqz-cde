// ==============================================================================
// CONFIGURACIÓN CENTRALIZADA DE SERVICIOS - CDE INNOVARQZ S.A.S.
// ==============================================================================
const SUPABASE_URL = "https://bjlqtzrcrofpqlmyvoob.supabase.co";
const SUPABASE_KEY = "sb_publishable_htPtQvL-1wrLfu7ACHBg1w_epAZsu1E";
const WEBHOOK_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbyrLMTUnmYqkABhNTFQpQNGvmc0MpspzjvEv2EqUNklQ5a2jMxpRtytzuPwPwPwoyCWtQ/exec";

// Inicialización del cliente de Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables de Estado de la Aplicación
let currentUser = null;
let activeProjectId = null;
let activeProjectCode = null;
let activeTab = "01_WIP";

// ==============================================================================
// INICIALIZACIÓN Y EVENT LISTENERS
// ==============================================================================
document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    if (loginForm) loginForm.addEventListener("submit", handleLogin);

    const projectSelect = document.getElementById("projectSelect");
    if (projectSelect) projectSelect.addEventListener("change", handleProjectChange);

    const btnNewProject = document.getElementById("btnNewProject");
    if (btnNewProject) {
        btnNewProject.addEventListener("click", prepareAndOpenProjectModal);
    }

    const createProjectForm = document.getElementById("createProjectForm");
    if (createProjectForm) createProjectForm.addEventListener("submit", handleCreateProject);

    setupDropdownWithOther("ubicacionSelect", "ubicacionOtherInput");
    setupDropdownWithOther("tipoSelect", "tipoOtherInput");

    // Navegación por pestañas ISO 19650
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
// GESTIÓN DE PROYECTOS
// ==============================================================================
async function loadProjects() {
    const { data: proyectos } = await supabaseClient
        .from("proyectos")
        .select("*")
        .eq("activo", true);

    const select = document.getElementById("projectSelect");
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Seleccionar Proyecto --</option>';

    if (proyectos && proyectos.length > 0) {
        const proyectosUnicos = new Map();

        proyectos.forEach(p => {
            if (p.codigo_proyecto && !proyectosUnicos.has(p.codigo_proyecto)) {
                proyectosUnicos.set(p.codigo_proyecto, p);
            }
        });

        proyectosUnicos.forEach(p => {
            select.innerHTML += `<option value="${p.id}" data-code="${p.codigo_proyecto}">${p.nombre}</option>`;
        });
    }
}

function handleProjectChange(e) {
    const selectedOption = e.target.options[e.target.selectedIndex];
    activeProjectId = e.target.value;
    activeProjectCode = selectedOption ? selectedOption.getAttribute("data-code") : null;
    loadFiles();
}

// ==============================================================================
// MODAL DE CREACIÓN DE PROYECTOS
// ==============================================================================
async function prepareAndOpenProjectModal() {
    const yearCurrent = new Date().getFullYear();
    const prefix = `PRY${yearCurrent}`;

    const { data: proyectos } = await supabaseClient
        .from("proyectos")
        .select("codigo_proyecto");

    let maxNum = 0;
    if (proyectos && proyectos.length > 0) {
        proyectos.forEach(p => {
            if (p.codigo_proyecto && p.codigo_proyecto.startsWith(prefix)) {
                const parts = p.codigo_proyecto.split("-");
                if (parts.length > 1) {
                    const num = parseInt(parts[1], 10);
                    if (!isNaN(num) && num > maxNum) maxNum = num;
                }
            }
        });
    }

    const nextNum = String(maxNum + 1).padStart(3, '0');
    const autoCode = `${prefix}-${nextNum}`;

    const inputCodigo = document.getElementById("codigoProj");
    if (inputCodigo) {
        inputCodigo.value = autoCode;
        inputCodigo.readOnly = true;
    }

    const modal = document.getElementById("projectModal");
    if (modal) modal.className = "modal-overlay";
}

function setupDropdownWithOther(selectId, otherInputId) {
    const select = document.getElementById(selectId);
    const otherInput = document.getElementById(otherInputId);
    if (!select || !otherInput) return;

    select.addEventListener("change", (e) => {
        if (e.target.value === "OTRO") {
            otherInput.style.display = "block";
            otherInput.required = true;
        } else {
            otherInput.style.display = "none";
            otherInput.required = false;
            otherInput.value = "";
        }
    });
}

function obtenerValorCampo(selectId, otherInputId) {
    const select = document.getElementById(selectId);
    if (!select) return "";
    if (select.value === "OTRO") {
        const otherInput = document.getElementById(otherInputId);
        return otherInput ? otherInput.value.trim() : "";
    }
    return select.value;
}

function esValidoTextoCampo(val) {
    if (!val || val.length < 3) return false;
    if (/^\d+$/.test(val)) return false;
    return true;
}

async function handleCreateProject(e) {
    e.preventDefault();
    
    const codigo = document.getElementById("codigoProj").value.trim();
    const cliente = document.getElementById("clienteProj").value.trim();
    const ubicacion = obtenerValorCampo("ubicacionSelect", "ubicacionOtherInput");
    const tipoObra = obtenerValorCampo("tipoSelect", "tipoOtherInput");

    if (!esValidoTextoCampo(cliente)) {
        alert("⚠️ El cliente ingresado no es válido (mínimo 3 letras, no sólo números).");
        return;
    }
    if (!esValidoTextoCampo(ubicacion)) {
        alert("⚠️ La ubicación especificada no es válida.");
        return;
    }
    if (!esValidoTextoCampo(tipoObra)) {
        alert("⚠️ El tipo de obra especificado no es válido.");
        return;
    }

    const payload = {
        accion: "CREAR_PROYECTO",
        codigo_proyecto: codigo,
        cliente: cliente.replace(/\s+/g, ''),
        ubicacion: ubicacion.replace(/\s+/g, ''),
        tipo_obra: tipoObra.replace(/\s+/g, '')
    };

    alert("Enviando orden a Google Drive...");

    try {
        await fetch(WEBHOOK_APPS_SCRIPT, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        closeProjectModal();
        alert("¡Estructura generada exitosamente! Actualizando en 3 segundos...");
        setTimeout(() => loadProjects(), 3000);
    } catch (err) {
        alert("Error de envío: " + err.message);
    }
}

function closeProjectModal() {
    const modal = document.getElementById("projectModal");
    if (modal) modal.className = "modal-hidden";
}

// ==============================================================================
// CARGA Y RENDERIZADO DE ENTREGABLES ISO 19650
// ==============================================================================
async function loadFiles() {
    const tbody = document.getElementById("filesTableBody");
    if (!tbody) return;

    if (!activeProjectId) {
        tbody.innerHTML = '<tr><td colspan="5">Seleccione un proyecto para visualizar los entregables.</td></tr>';
        return;
    }

    // Consulta directa por el UUID del proyecto y la pestaña ISO seleccionada
    const { data: files, error } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("proyecto_id", activeProjectId)
        .eq("estado_destino", activeTab)
        .order("creado_en", { ascending: false });

    tbody.innerHTML = "";

    if (error || !files || files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No hay entregables en la pestaña <strong>${activeTab}</strong> para este proyecto.</td></tr>`;
        return;
    }

    const archivosUnicos = new Map();
    files.forEach(f => {
        if (!archivosUnicos.has(f.archivo_nombre)) {
            archivosUnicos.set(f.archivo_nombre, f);
        }
    });

    archivosUnicos.forEach(f => {
        const nombreCompleto = f.archivo_nombre || "";
        const parts = nombreCompleto.split("_");
        
        const esValidoISO = parts.length >= 6;
        const disciplina = esValidoISO ? parts[4] : "SIN_FORMATO";
        const estadoISO = esValidoISO ? parts[5].split(".")[0] : activeTab;

        if (esValidoISO) {
            tbody.innerHTML += `
                <tr>
                    <td>${nombreCompleto}</td>
                    <td><strong>${disciplina}</strong></td>
                    <td><span class="badge">${estadoISO}</span></td>
                    <td>${f.version || 'V1.0'}</td>
                    <td>
                        <button class="btn-secondary" onclick="openViewer('${f.drive_file_url}')">Ver</button>
                        <a href="${f.drive_file_url}" target="_blank" class="btn-primary" style="text-decoration:none; font-size: 0.8rem; padding: 0.4rem 0.8rem;">Descargar</a>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML += `
                <tr style="background-color: rgba(239, 68, 68, 0.05);">
                    <td style="color: #ef4444;">${nombreCompleto}</td>
                    <td><strong style="color: #ef4444;">${disciplina}</strong></td>
                    <td><span class="badge" style="background: #ef4444;">NO_CONFORME</span></td>
                    <td>${f.version || 'V1.0'}</td>
                    <td>
                        <small style="color: #ef4444; display: block; line-height: 1.2;">⚠️ Renombrar bajo ISO 19650 ([PROY]_[ORIG]_[ZONA]_[TIPO]_[DISC]_[EST])</small>
                    </td>
                </tr>
            `;
        }
    });
}
