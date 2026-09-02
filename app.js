// ==============================================================================
// CONFIGURACIÓN CENTRALIZADA DE SERVICIOS - CDE INNOVARQZ S.A.S.
// ==============================================================================
const SUPABASE_URL = "https://bjlqtzrcrofpqlmyvoob.supabase.co";
const SUPABASE_KEY = "sb_publishable_htPtQvL-1wrLfu7ACHBg1w_epAZsu1E";
const WEBHOOK_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbyZROxo0lJW9ImGGlRfS-Ila6H5pMAgN4RupXKV4_WwKcBewLku3kgyvh_Tr359Oij01w/exec";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let userPermissions = null;
let activeProjectId = null;
let activeProjectCode = null;
let activeTab = "01_WIP";
let activeSubfolder = "TODAS";

// MAPA DE SUBCARPETAS ISO 19650 POR ESTADO
const SUBCARPETAS_MAP = {
    "01_WIP": ["TODAS", "ARQ_Arquitectura", "EST_Estructura", "MEP_Instalaciones"],
    "02_SHARED": ["TODAS", "01_Modelos_3D", "02_Planos_Coordinados", "03_Informes_Interferencias"],
    "03_PUBLISHED": ["TODAS", "01_Modelos_Aprobados", "02_Planos_Contractuales", "03_Actas_y_Memorias"],
    "04_ARCHIVED": []
};

// ==============================================================================
// INICIALIZACIÓN Y NAVEGACIÓN
// ==============================================================================
document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    if (loginForm) loginForm.addEventListener("submit", handleLogin);

    const projectSelect = document.getElementById("projectSelect");
    if (projectSelect) projectSelect.addEventListener("change", handleProjectChange);

    const btnNewProject = document.getElementById("btnNewProject");
    if (btnNewProject) btnNewProject.addEventListener("click", prepareAndOpenProjectModal);

    const createProjectForm = document.getElementById("createProjectForm");
    if (createProjectForm) createProjectForm.addEventListener("submit", handleCreateProject);

    const uploadForm = document.getElementById("uploadForm");
    if (uploadForm) uploadForm.addEventListener("submit", handleFileUpload);

    const revisorForm = document.getElementById("revisorInstructionForm");
    if (revisorForm) revisorForm.addEventListener("submit", handleRevisorInstructionSubmit);

    const isoNameInput = document.getElementById("isoNameInput");
    if (isoNameInput) isoNameInput.addEventListener("input", actualizarPistaSubcarpetaModal);

    const uploadTargetTab = document.getElementById("uploadTargetTab");
    if (uploadTargetTab) uploadTargetTab.addEventListener("change", actualizarPistaSubcarpetaModal);

    setupDropdownWithOther("ubicacionSelect", "ubicacionOtherInput");
    setupDropdownWithOther("tipoSelect", "tipoOtherInput");

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const requestedTab = e.target.dataset.tab;

            if (!validarAccesoPestana(requestedTab)) {
                alert(`⛔ Acceso denegado: Su rol (${currentUser ? currentUser.cargo : 'Sin Rol'}) no tiene permisos para acceder a la carpeta ${requestedTab}.`);
                return;
            }

            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            activeTab = requestedTab;
            activeSubfolder = "TODAS";
            
            const clientCard = document.getElementById("clientApprovalCard");
            if (clientCard && currentUser) {
                clientCard.style.display = (currentUser.cargo === "CLIENTE" && activeTab === "03_PUBLISHED") ? "block" : "none";
            }

            renderizarBarraSubcarpetas();
            loadFiles();
        });
    });
});

function validarAccesoPestana(tabName) {
    if (!userPermissions) return false;
    if (tabName === "01_WIP") return !!userPermissions.permiso_wip;
    if (tabName === "02_SHARED") return !!userPermissions.permiso_shared;
    if (tabName === "03_PUBLISHED") return !!userPermissions.permiso_published;
    if (tabName === "04_ARCHIVED") return !!userPermissions.permiso_wip;
    return false;
}

function renderizarBarraSubcarpetas() {
    const container = document.getElementById("subcarpetas-bar");
    if (!container) return;

    const subcarpetas = SUBCARPETAS_MAP[activeTab] || [];

    if (subcarpetas.length === 0) {
        container.style.display = "none";
        return;
    }

    container.style.display = "flex";
    container.innerHTML = `<span style="font-size:0.75rem; color:#94a3b8; font-weight:bold; margin-right:4px;">📂 Subcarpeta:</span>`;

    subcarpetas.forEach(sub => {
        const esActiva = activeSubfolder === sub;
        const nombreLimpio = sub === "TODAS" ? "Ver Todas" : sub.replace(/_/g, " ");
        
        container.innerHTML += `
            <button 
                type="button"
                onclick="filtrarPorSubcarpeta('${sub}')" 
                style="font-size: 0.72rem; padding: 4px 10px; border-radius: 6px; border: 1px solid #475569; transition: all 0.2s; cursor: pointer; ${esActiva ? 'background: var(--accent-copper, #d97706); color: #fff; font-weight: bold; border-color: #d97706;' : 'background: #0f172a; color: #cbd5e1;'}"
            >
                ${nombreLimpio}
            </button>
        `;
    });
}

function filtrarPorSubcarpeta(sub) {
    activeSubfolder = sub;
    renderizarBarraSubcarpetas();
    loadFiles();
}

function actualizarPistaSubcarpetaModal() {
    const isoName = document.getElementById("isoNameInput").value.trim().toUpperCase();
    const targetTab = document.getElementById("uploadTargetTab").value;
    const hintSpan = document.getElementById("hintFolderName");

    if (!hintSpan) return;

    if (!isoName) {
        hintSpan.innerText = "Ingrese el nombre para detectar...";
        hintSpan.style.color = "#94a3b8";
        return;
    }

    let subDetectada = "Principal";

    if (targetTab === "01_WIP") {
        if (isoName.includes("_ARQ_")) subDetectada = "01_WIP / ARQ_Arquitectura";
        else if (isoName.includes("_EST_")) subDetectada = "01_WIP / EST_Estructura";
        else if (isoName.includes("_MEP_")) subDetectada = "01_WIP / MEP_Instalaciones";
        else subDetectada = "01_WIP / ARQ_Arquitectura (Default)";
    } else if (targetTab === "02_SHARED") {
        if (isoName.includes("_M3_") || isoName.endsWith(".IFC") || isoName.endsWith(".RVT")) subDetectada = "02_SHARED / 01_Modelos_3D";
        else if (isoName.includes("_PL_") || isoName.includes("_DR_") || isoName.endsWith(".DWG")) subDetectada = "02_SHARED / 02_Planos_Coordinados";
        else subDetectada = "02_SHARED / 03_Informes_Interferencias";
    }

    hintSpan.innerText = subDetectada;
    hintSpan.style.color = "#10b981";
}

// ==============================================================================
// AUTENTICACIÓN
// ==============================================================================
async function handleLogin(e) {
    e.preventDefault();
    const emailInput = document.getElementById("emailInput");
    if (!emailInput) return;

    const email = emailInput.value.trim();

    if (!email) {
        alert("Por favor ingrese su correo electrónico.");
        return;
    }

    try {
        const { data: user, error } = await supabaseClient
            .from("usuarios")
            .select("*")
            .eq("email", email)
            .single();

        if (error || !user) {
            alert("Usuario no registrado en la base de datos del CDE o error de conexión.");
            console.error("Error Login Supabase:", error);
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
        if (btnNewProject && user.cargo && (user.cargo.includes("BIM Manager") || user.cargo.includes("Director General") || user.cargo.includes("SUPER_ADMIN"))) {
            btnNewProject.style.display = "block";
        }

        const btnUpload = document.getElementById("btnUploadFile");
        if (btnUpload && currentUser.cargo !== "CLIENTE") {
            btnUpload.style.display = "block";
        }

        loadProjects();
    } catch (err) {
        alert("Excepción al intentar conectar con Supabase: " + err.message);
    }
}

// ==============================================================================
// PROYECTOS Y CONFIGURACIÓN DE VISTA POR ROL
// ==============================================================================
async function loadProjects() {
    let proyectosVisibles = [];

    if (currentUser.cargo === "SUPER_ADMIN" || currentUser.cargo?.includes("Director General") || currentUser.cargo?.includes("BIM Manager")) {
        const { data: todosProyectos } = await supabaseClient.from("proyectos").select("*").eq("activo", true);
        proyectosVisibles = todosProyectos || [];
    } else {
        const { data: permisos } = await supabaseClient
            .from("permisos_proyecto")
            .select("proyecto_id, proyectos(*)")
            .eq("usuario_id", currentUser.id);

        if (permisos && permisos.length > 0) {
            proyectosVisibles = permisos.map(p => p.proyectos).filter(p => p && p.activo);
        }
    }

    const select = document.getElementById("projectSelect");
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Seleccionar Proyecto --</option>';

    if (proyectosVisibles.length > 0) {
        const proyectosUnicos = new Map();

        proyectosVisibles.forEach(p => {
            if (p.codigo_proyecto && !proyectosUnicos.has(p.codigo_proyecto)) {
                proyectosUnicos.set(p.codigo_proyecto, p);
            }
        });

        proyectosUnicos.forEach(p => {
            select.innerHTML += `<option value="${p.id}" data-code="${p.codigo_proyecto}">${p.nombre}</option>`;
        });
    }
}

async function handleProjectChange(e) {
    const selectedOption = e.target.options[e.target.selectedIndex];
    activeProjectId = e.target.value;
    activeProjectCode = selectedOption ? selectedOption.getAttribute("data-code") : null;

    if (!activeProjectId) return;

    if (currentUser.cargo === "SUPER_ADMIN" || currentUser.cargo?.includes("Director General") || currentUser.cargo?.includes("BIM Manager")) {
        userPermissions = { permiso_wip: true, permiso_shared: true, permiso_published: true, permiso_archived: true };
    } else {
        const { data: permiso } = await supabaseClient
            .from("permisos_proyecto")
            .select("*")
            .eq("usuario_id", currentUser.id)
            .eq("proyecto_id", activeProjectId)
            .single();

        userPermissions = permiso || { permiso_wip: false, permiso_shared: false, permiso_published: true, permiso_archived: false };
    }

    if (currentUser.cargo === "CLIENTE") {
        activeTab = "03_PUBLISHED";
    } else if (currentUser.cargo.includes("REVISOR")) {
        activeTab = "02_SHARED";
    } else {
        activeTab = "01_WIP";
    }

    activeSubfolder = "TODAS";
    aplicarRestriccionPestanasVisuales();
    renderizarBarraSubcarpetas();
    evaluarNotasTecnicasActivas();
    cargarTimelineActividad();
    loadFiles();
}

function aplicarRestriccionPestanasVisuales() {
    const tabWip = document.querySelector('.tab-btn[data-tab="01_WIP"]');
    const tabShared = document.querySelector('.tab-btn[data-tab="02_SHARED"]');
    const tabPublished = document.querySelector('.tab-btn[data-tab="03_PUBLISHED"]');
    const tabArchived = document.querySelector('.tab-btn[data-tab="04_ARCHIVED"]');

    if (tabWip) tabWip.style.display = userPermissions.permiso_wip ? "inline-block" : "none";
    if (tabShared) tabShared.style.display = userPermissions.permiso_shared ? "inline-block" : "none";
    if (tabPublished) tabPublished.style.display = userPermissions.permiso_published ? "inline-block" : "none";
    if (tabArchived) tabArchived.style.display = userPermissions.permiso_wip ? "inline-block" : "none";

    document.querySelectorAll(".tab-btn").forEach(b => {
        if (b.dataset.tab === activeTab) {
            b.classList.add("active");
        } else {
            b.classList.remove("active");
        }
    });

    const clientCard = document.getElementById("clientApprovalCard");
    if (clientCard) {
        clientCard.style.display = (currentUser.cargo === "CLIENTE" && activeTab === "03_PUBLISHED") ? "block" : "none";
    }

    const techNoteCard = document.getElementById("technicalNoteCard");
    const auditLogCard = document.getElementById("auditLogCard");
    if (currentUser.cargo === "CLIENTE") {
        if (techNoteCard) techNoteCard.style.display = "none";
        if (auditLogCard) auditLogCard.style.height = "100%";
    } else {
        if (techNoteCard) techNoteCard.style.display = "flex";
        if (auditLogCard) auditLogCard.style.height = "50%";
    }
}

// ==============================================================================
// HILO DE NOTAS TÉCNICAS
// ==============================================================================
async function evaluarNotasTecnicasActivas() {
    const threadContainer = document.getElementById("interactionThreadContainer");
    const actionsContainer = document.getElementById("threadActionsContainer");
    const card = document.getElementById("technicalNoteCard");

    if (!threadContainer || !activeProjectId) return;

    if (currentUser.cargo === "CLIENTE") {
        card.style.display = "none";
        return;
    }

    const { data: notas, error } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("proyecto_id", activeProjectId)
        .ilike("archivo_nombre", "NOTA_TECNICA_%")
        .order("id", { ascending: false })
        .limit(20);

    const interaccionesHumanas = (notas || []).filter(n => 
        n.archivo_nombre.includes("AJUSTES_SOLICITADOS") || 
        n.archivo_nombre.includes("CONFIRMADO_RECIBIDO") || 
        n.archivo_nombre.includes("SOLICITUD_REUNION") ||
        n.archivo_nombre.includes("CORRECCION_MODELADOR")
    );

    if (error || interaccionesHumanas.length === 0) {
        card.style.display = "flex";
        threadContainer.innerHTML = "<small style='color: var(--text-muted);'>No hay interacciones recientes en este proyecto.</small>";
        if (actionsContainer) actionsContainer.style.display = "none";
        return;
    }

    card.style.display = "flex";
    let html = "";

    interaccionesHumanas.sort((a, b) => {
        let timeA = new Date(a.version).getTime() || a.id;
        let timeB = new Date(b.version).getTime() || b.id;
        return timeB - timeA;
    });

    interaccionesHumanas.forEach(n => {
        let tipo = n.archivo_nombre.replace("NOTA_TECNICA_", "");
        let colorTexto = "#f8fafc";
        let icono = "💬";

        if (tipo === "AJUSTES_SOLICITADOS") { colorTexto = "#ef4444"; icono = "🚨 Cliente:"; }
        else if (tipo === "CONFIRMADO_RECIBIDO") { colorTexto = "#10b981"; icono = "✅ Modelador:"; }
        else if (tipo === "SOLICITUD_REUNION") { colorTexto = "#d97706"; icono = "📅 Modelador:"; }
        else if (tipo === "CORRECCION_MODELADOR") { colorTexto = "#f59e0b"; icono = "⚠️ Revisor a Modelador:"; }

        let mensajeCompleto = n.drive_file_url || "";
        let partesMensaje = mensajeCompleto.split(" | Detalle: ");
        let asunto = partesMensaje[0] || mensajeCompleto;
        let detalle = partesMensaje[1] || "";

        html += `
            <div style="background: rgba(15, 23, 42, 0.6); padding: 8px 10px; border-radius: 6px; margin-bottom: 6px; border-left: 3px solid ${colorTexto};">
                <strong style="color: ${colorTexto}; font-size: 0.82rem;">${icono}</strong> 
                <span style="font-size: 0.85rem; color: #fff; font-weight: bold;">${asunto}</span>
                ${detalle ? `<div style="font-size: 0.78rem; color: #cbd5e1; margin-top: 2px;">${detalle}</div>` : ''}
                <div style="text-align: right;"><small style="color: var(--text-muted); font-size: 0.7rem;">${n.version}</small></div>
            </div>
        `;
    });

    threadContainer.innerHTML = html;

    const esModelador = currentUser.cargo.includes("MODELADOR") || currentUser.cargo.includes("SUPER_ADMIN");
    const esRevisor = currentUser.cargo.includes("REVISOR") || currentUser.cargo.includes("SUPER_ADMIN");

    if (actionsContainer) actionsContainer.style.display = "flex";

    const btnConfirmar = document.getElementById("btnConfirmarLectura");
    if (btnConfirmar) {
        btnConfirmar.style.display = esModelador ? "inline-block" : "none";
        btnConfirmar.onclick = function() {
            responderNotaTecnica('CONFIRMADO_RECIBIDO', 'Entendido. Se inician ajustes en modelos nativos en WIP.');
        };
    }

    const btnComite = document.getElementById("btnSolicitarComite");
    if (btnComite) {
        btnComite.style.display = esModelador ? "inline-block" : "none";
        btnComite.onclick = function() {
            responderNotaTecnica('SOLICITUD_REUNION', 'Solicitud de mesa de trabajo técnica para aclarar observaciones.');
        };
    }

    const btnCorregirModelador = document.getElementById("btnSolicitarCorreccionModelador");
    if (btnCorregirModelador) {
        btnCorregirModelador.style.display = esRevisor ? "inline-block" : "none";
        btnCorregirModelador.onclick = openRevisorInstructionModal;
    }
}

function openRevisorInstructionModal() {
    const modal = document.getElementById("revisorInstructionModal");
    if (modal) modal.className = "modal-overlay";
}

function closeRevisorInstructionModal() {
    const modal = document.getElementById("revisorInstructionModal");
    if (modal) modal.className = "modal-hidden";
}

async function handleRevisorInstructionSubmit(e) {
    e.preventDefault();
    const asunto = document.getElementById("revisorSubjectInput").value.trim();
    const detalle = document.getElementById("revisorDetailInput").value.trim();

    if (!asunto || !detalle) return;

    let comentarioEstructurado = `${asunto} | Detalle: ${detalle}`;
    await responderNotaTecnica('CORRECCION_MODELADOR', comentarioEstructurado);
    
    document.getElementById("revisorSubjectInput").value = "";
    document.getElementById("revisorDetailInput").value = "";
    closeRevisorInstructionModal();
}

async function responderNotaTecnica(tipoRespuesta, comentario) {
    if (!confirm("¿Confirma registrar esta respuesta en el hilo técnico del proyecto?")) return;

    const payload = {
        accion: "RESPUESTA_NOTA_TECNICA",
        proyecto_id: activeProjectId,
        tipo_respuesta: tipoRespuesta,
        usuario_nombre: currentUser.nombre_completo,
        comentario: comentario
    };

    try {
        const res = await fetch(WEBHOOK_APPS_SCRIPT, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === "success") {
            alert("✅ Respuesta registrada correctamente.");
            evaluarNotasTecnicasActivas();
            cargarTimelineActividad();
        }
    } catch (err) {
        alert("Error al registrar respuesta: " + err.message);
    }
}

// ==============================================================================
// BITÁCORA REAL
// ==============================================================================
async function cargarTimelineActividad() {
    let timelineDiv = document.getElementById("activityTimeline");
    if (!timelineDiv || !activeProjectId) return;

    const { data: logs, error } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("proyecto_id", activeProjectId)
        .order("id", { ascending: false })
        .limit(30);

    if (error || !logs || logs.length === 0) {
        timelineDiv.innerHTML = "<small style='color: var(--text-muted);'>Sin actividad registrada.</small>";
        return;
    }

    logs.sort((a, b) => {
        let timeA = new Date(a.version).getTime() || a.id;
        let timeB = new Date(b.version).getTime() || b.id;
        return timeB - timeA;
    });

    let html = "<ul style='margin-left: 15px; margin-top: 2px; padding: 0; list-style-type: square; font-size: 0.8rem;'>";
    
    logs.forEach(l => {
        const fecha = l.version || "Sin fecha";
        let eventoNombre = l.archivo_nombre.replace("NOTA_TECNICA_", "");
        
        let icono = "📄";
        let estiloTexto = "color: #38bdf8;";

        if (eventoNombre.includes("PROMOCIÓN")) { icono = "🚀"; estiloTexto = "color: #34d399;"; }
        else if (eventoNombre.includes("AJUSTES")) { icono = "🚨"; estiloTexto = "color: #f87171;"; }
        else if (eventoNombre.includes("CONFIRMADO")) { icono = "✅"; estiloTexto = "color: #10b981;"; }
        else if (eventoNombre.includes("REEMPLAZO")) { icono = "📦"; estiloTexto = "color: #fbbf24;"; }
        else if (eventoNombre.includes("CORRECCION")) { icono = "⚠️"; estiloTexto = "color: #f59e0b;"; }

        let mensajeOriginal = l.drive_file_url || "";
        let asuntoCorto = mensajeOriginal.split(" | Detalle: ")[0];

        html += `<li style='${estiloTexto}; margin-bottom: 4px;'><strong>${fecha}</strong> — ${icono} <strong>[${eventoNombre}]</strong>: <em>${asuntoCorto}</em></li>`;
    });
    
    html += "</ul>";
    timelineDiv.innerHTML = html;
}

// ==============================================================================
// GESTIÓN DE SUBIDAS Y VALIDACIÓN ESTRICTA $1:1$ DE ESTADO ISO 19650
// ==============================================================================
function openUploadModal() {
    const optWip = document.getElementById("optUploadWip");
    const optShared = document.getElementById("optUploadShared");

    if (currentUser && currentUser.cargo.includes("REVISOR")) {
        if (optWip) optWip.style.display = "none";
        if (optShared) optShared.selected = true;
    } else {
        if (optWip) optWip.style.display = "block";
    }

    actualizarPistaSubcarpetaModal();
    const modal = document.getElementById("uploadModal");
    if (modal) modal.className = "modal-overlay";
}

function closeUploadModal() {
    const modal = document.getElementById("uploadModal");
    if (modal) modal.className = "modal-hidden";
}

function toggleUploadMethod() {
    const method = document.getElementById("uploadMethodSelect").value;
    const linkGroup = document.getElementById("linkMethodGroup");
    const directGroup = document.getElementById("directMethodGroup");

    if (method === "LINK") {
        linkGroup.style.display = "block";
        directGroup.style.display = "none";
    } else {
        linkGroup.style.display = "none";
        directGroup.style.display = "block";
    }
}

function validarNomenclaturaISO19650(nombreArchivo) {
    const nombreSinExt = nombreArchivo.split('.').slice(0, -1).join('.');
    const partes = nombreSinExt.split('_');
    return partes.length >= 6;
}

function extraerEstadoDeNombre(nombreArchivo) {
    const nombreSinExt = nombreArchivo.split('.').slice(0, -1).join('.');
    const partes = nombreSinExt.split('_');
    if (partes.length >= 6) {
        return partes[5].toUpperCase();
    }
    return "";
}

function recalcularEstadoEnNombre(nombreOriginal, nuevoEstadoISO) {
    const partesExt = nombreOriginal.split('.');
    const ext = partesExt.pop();
    const nombreSinExt = partesExt.join('.');
    
    const comp = nombreSinExt.split('_');
    if (comp.length >= 6) {
        comp[5] = nuevoEstadoISO;
        return comp.join('_') + '.' + ext;
    }
    return nombreOriginal;
}

async function handleFileUpload(e) {
    e.preventDefault();
    
    const method = document.getElementById("uploadMethodSelect").value;
    const isoNameInput = document.getElementById("isoNameInput").value.trim();
    const targetTab = document.getElementById("uploadTargetTab").value;
    const btnSubmit = document.getElementById("btnSubmitUpload");

    if (!isoNameInput) {
        alert("⚠️ Debe ingresar el nombre normado ISO 19650 con su extensión.");
        return;
    }

    if (!validarNomenclaturaISO19650(isoNameInput) && !isoNameInput.endsWith(".html")) {
        alert(`❌ REGLA ISO 19650 INCUMPLIDA:\n\nEl nombre "${isoNameInput}" no cumple la estructura de 6 campos:\n[PROYECTO]_[ORIGINADOR]_[ZONA]_[TIPO]_[DISCIPLINA]_[ESTADO].[ext]\n\nEjemplo: PRY2026-001_INNOVARQZ_ZZ_M3_ARQ_S0.rvt`);
        return;
    }

    const estadoArchivo = extraerEstadoDeNombre(isoNameInput);

    if (targetTab === "01_WIP" && estadoArchivo !== "S0" && !estadoArchivo.startsWith("P0")) {
        alert(`⛔ VIOLACIÓN DE NORMA ISO 19650:\n\nEl archivo tiene el estado "${estadoArchivo}". En la carpeta 01_WIP solo se permiten entregables nativos en estado "S0" (o borradores P0).\n\nRenombre el archivo a S0 o seleccione la carpeta correspondiente.`);
        return;
    }

    if (targetTab === "02_SHARED" && (!estadoArchivo.startsWith("S") || estadoArchivo === "S0")) {
        alert(`⛔ VIOLACIÓN DE NORMA ISO 19650:\n\nEl archivo tiene el estado "${estadoArchivo}". En la carpeta 02_SHARED solo se permiten entregables de coordinación en estado S1, S2, S3, etc.\n\nPromueva el archivo desde WIP o corrija el nombre antes de subir.`);
        return;
    }

    if (targetTab === "03_PUBLISHED" && !estadoArchivo.startsWith("A")) {
        alert(`⛔ VIOLACIÓN DE NORMA ISO 19650:\n\nEl archivo tiene el estado "${estadoArchivo}". En 03_PUBLISHED solo se permiten entregables aprobados en estado A1, A2, etc.\n\nPromueva el archivo desde SHARED para asignarle su estado publicado.`);
        return;
    }

    const extEscrita = isoNameInput.split('.').pop().toLowerCase();

    btnSubmit.disabled = true;
    btnSubmit.innerText = "Procesando e integrando al CDE...";

    try {
        let payload = {
            accion: "IMPORTAR_DESDE_URL",
            proyecto_id: activeProjectId,
            estado_destino: targetTab,
            nombre_iso: isoNameInput,
            usuario_nombre: currentUser.nombre_completo
        };

        if (method === "LINK") {
            const driveUrlInput = document.getElementById("driveUrlInput").value.trim();
            if (!driveUrlInput) {
                alert("⚠️ Por favor ingrese el enlace público de Google Drive.");
                btnSubmit.disabled = false;
                btnSubmit.innerText = "Procesar Entregable";
                return;
            }
            payload.tipo_carga = "URL";
            payload.url_origen = driveUrlInput;
        } else {
            const fileInput = document.getElementById("fileLocalInput");
            if (!fileInput.files || fileInput.files.length === 0) {
                alert("⚠️ Por favor seleccione un archivo local.");
                btnSubmit.disabled = false;
                btnSubmit.innerText = "Procesar Entregable";
                return;
            }
            
            const file = fileInput.files[0];
            const extReal = file.name.split('.').pop().toLowerCase();

            if (extReal !== extEscrita) {
                alert(`❌ CONFLICTO DE EXTENSIÓN:\n\nEl archivo seleccionado es (.${extReal}) pero en el CDE escribió (.${extEscrita}). Corrija el nombre para que coincida exactamente.`);
                btnSubmit.disabled = false;
                btnSubmit.innerText = "Procesar Entregable";
                return;
            }

            const base64File = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(file);
            });

            payload.tipo_carga = "DIRECTA";
            payload.file_base64 = base64File;
            payload.mime_type = file.type || "application/octet-stream";
        }

        const res = await fetch(WEBHOOK_APPS_SCRIPT, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.status === "success") {
            alert(`✅ ¡Entregable "${isoNameInput}" procesado e integrado al CDE!`);
            closeUploadModal();
            loadFiles();
            cargarTimelineActividad();
        } else {
            alert("⚠️ " + data.message);
        }
    } catch (err) {
        alert("Error de comunicación: " + err.message);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = "Procesar Entregable";
    }
}

async function promoverArchivo(nombreArchivo, estadoOrigen, estadoDestino) {
    let nuevoEstadoISO = (estadoDestino === "02_SHARED") ? "S1" : "A1";
    let nuevoNombreCalculado = recalcularEstadoEnNombre(nombreArchivo, nuevoEstadoISO);

    if (!confirm(`¿Confirma promover el archivo "${nombreArchivo}" a ${estadoDestino} como "${nuevoNombreCalculado}"?`)) return;

    const payload = {
        accion: "PROMOVER_ARCHIVO",
        proyecto_id: activeProjectId,
        codigo_proyecto: activeProjectCode,
        nombre_archivo: nombreArchivo,
        nuevo_nombre_archivo: nuevoNombreCalculado,
        estado_origen: estadoOrigen,
        estado_destino: estadoDestino,
        usuario_email: currentUser.email,
        usuario_nombre: currentUser.nombre_completo
    };

    try {
        const res = await fetch(WEBHOOK_APPS_SCRIPT, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });
        const responseData = await res.json();

        if (responseData.status === "success") {
            alert("¡Promoción física en Drive procesada exitosamente!");
            loadFiles();
            cargarTimelineActividad();
        } else {
            alert("⚠️ Error de promoción: " + responseData.message);
        }
    } catch (err) {
        alert("Error de comunicación: " + err.message);
    }
}

async function procesarAprobacionCliente(estadoAprobacion) {
    const asunto = document.getElementById("clientSubject").value.trim();
    const observaciones = document.getElementById("clientComments").value.trim();

    if (!asunto) {
        alert("⚠️ Por favor ingrese un asunto/resumen corto para la firma/solicitud.");
        return;
    }

    if (estadoAprobacion === "RECHAZADO" && !observaciones) {
        alert("⚠️ Por favor ingrese sus observaciones detalladas.");
        return;
    }

    if (!confirm(`¿Confirma marcar este entregable como ${estadoAprobacion}?`)) return;

    if (estadoAprobacion === "APROBADO") {
        alert("Generando Acta de Recibo Formal en PDF...");
        const pdfBase64 = await generarPDFActaRecibo();

        const payload = {
            accion: "APROBACION_CLIENTE",
            proyecto_id: activeProjectId,
            codigo_proyecto: activeProjectCode,
            usuario_nombre: currentUser.nombre_completo,
            usuario_email: currentUser.email,
            estado_aprobacion: "APROBADO",
            asunto: asunto,
            observaciones: observaciones,
            pdf_acta_base64: pdfBase64,
            nombre_acta: `${activeProjectCode}_INNOVARQZ_ZZ_ACTA_CLI_A1.pdf`
        };

        const res = await fetch(WEBHOOK_APPS_SCRIPT, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === "success") {
            alert("✅ Acta formal generada e integrada en Drive.");
            loadFiles();
            cargarTimelineActividad();
        }
    } else {
        const payload = {
            accion: "APROBACION_CLIENTE",
            proyecto_id: activeProjectId,
            codigo_proyecto: activeProjectCode,
            usuario_nombre: currentUser.nombre_completo,
            usuario_email: currentUser.email,
            estado_aprobacion: "RECHAZADO",
            asunto: asunto,
            observaciones: observaciones
        };

        await fetch(WEBHOOK_APPS_SCRIPT, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });
        alert("🚨 Solicitud de ajustes notificada en la bitácora.");
        evaluarNotasTecnicasActivas();
        cargarTimelineActividad();
    }
}

// ==============================================================================
// GENERACIÓN DE ACTA PDF FORMAL
// ==============================================================================
async function generarPDFActaRecibo() {
    if (!window.PDFLib) {
        await new Promise(resolve => {
            const script = document.createElement("script");
            script.src = "https://unpkg.com/pdf-lib/dist/pdf-lib.min.js";
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }

    const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    page.drawText("INNOVARQZ SOLUCIONES INTEGRALES S.A.S.", { x: 50, y: 740, size: 15, font: fontBold, color: rgb(0.85, 0.47, 0.02) });
    page.drawText("NIT: 901.654.321-0 | CDE ISO 19650 PLATFORM", { x: 50, y: 725, size: 9, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
    page.drawText("ACTA DE RECIBO A SATISFACCIÓN Y CIERRE DE HITO", { x: 50, y: 700, size: 12, font: fontBold });

    const fechaStr = new Date().toLocaleString();
    page.drawText(`Proyecto: ${activeProjectCode}`, { x: 50, y: 665, size: 10, font: fontBold });
    page.drawText(`Cliente / Razón Social: ${currentUser.nombre_completo}`, { x: 50, y: 650, size: 10, font: fontRegular });
    page.drawText(`Identificación / Correo: ${currentUser.email}`, { x: 50, y: 635, size: 10, font: fontRegular });
    page.drawText(`Fecha y Hora de Firma Digital: ${fechaStr}`, { x: 50, y: 620, size: 10, font: fontRegular });

    page.drawText("DECLARACIÓN DE CONFORMIDAD", { x: 50, y: 585, size: 11, font: fontBold });
    const textoClausula = "Por medio del presente documento, el cliente hace constar que INNOVARQZ SOLUCIONES INTEGRALES S.A.S. cumplió a cabalidad con los entregables técnicos de información y modelos acordados. Se confirma la recepción a satisfacción de la documentación aprobada y se autoriza el cierre del hito correspondiente.";
    
    page.drawText(textoClausula, { x: 50, y: 565, size: 9, font: fontRegular, maxWidth: 500, lineHeight: 12 });

    page.drawText("LISTA DE ENTREGABLES APROBADOS (03_PUBLISHED):", { x: 50, y: 505, size: 10, font: fontBold });

    const { data: files } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("proyecto_id", activeProjectId)
        .eq("estado_destino", "03_PUBLISHED")
        .eq("activo", true);

    let yPos = 485;
    if (files && files.length > 0) {
        const unicosPublished = new Map();
        files.forEach(f => {
            if (!f.archivo_nombre.includes("ACTA_") && !f.archivo_nombre.includes("NOTA_TECNICA")) {
                if (!unicosPublished.has(f.archivo_nombre)) unicosPublished.set(f.archivo_nombre, f);
            }
        });

        unicosPublished.forEach(f => {
            if (yPos > 180) {
                page.drawText(`• ${f.archivo_nombre} (${f.version || 'V1.0'})`, { x: 60, y: yPos, size: 8, font: fontRegular });
                yPos -= 16;
            }
        });
    } else {
        page.drawText("• Sin entregables registrados en 03_PUBLISHED", { x: 60, y: yPos, size: 8, font: fontRegular });
    }

    page.drawLine({ start: { x: 50, y: 130 }, end: { x: 250, y: 130 }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
    page.drawText("ARQ. JAMES RAMIRO ZUÑIGA CAIPE", { x: 50, y: 115, size: 9, font: fontBold });
    page.drawText("Representante Legal", { x: 50, y: 102, size: 8, font: fontRegular });
    page.drawText("INNOVARQZ SOLUCIONES INTEGRALES S.A.S.", { x: 50, y: 90, size: 8, font: fontRegular });

    page.drawLine({ start: { x: 330, y: 130 }, end: { x: 530, y: 130 }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(`${currentUser.nombre_completo.toUpperCase()}`, { x: 330, y: 115, size: 9, font: fontBold });
    page.drawText("Firma Digital y Sello CDE", { x: 330, y: 102, size: 8, font: fontRegular });
    page.drawText(`Verificación: ${currentUser.email}`, { x: 330, y: 90, size: 8, font: fontRegular });

    const pdfBytes = await pdfDoc.saveAsBase64({ dataUri: false });
    return pdfBytes;
}

// ==============================================================================
// GESTIÓN DEL VISOR EN MODAL
// ==============================================================================
function openViewerModal(driveUrl, nombreArchivo) {
    const modal = document.getElementById("viewerModal");
    const frame = document.getElementById("modalViewerFrame");
    const title = document.getElementById("viewerTitle");

    if (!modal || !frame) return;

    title.innerText = `Previsualizando: ${nombreArchivo}`;

    let previewUrl = driveUrl;
    if (driveUrl.includes("drive.google.com/file/d/")) {
        previewUrl = driveUrl.replace("/view?usp=drivesdk", "/preview").replace("/view", "/preview");
    }

    frame.src = previewUrl;
    modal.className = "modal-overlay";
}

function closeViewerModal() {
    const modal = document.getElementById("viewerModal");
    const frame = document.getElementById("modalViewerFrame");
    if (frame) frame.src = "";
    if (modal) modal.className = "modal-hidden";
}

// ==============================================================================
// RENDERIZADO DE ENTREGABLES CON FILTRO POR SUBCARPETAS
// ==============================================================================
async function loadFiles() {
    const tbody = document.getElementById("filesTableBody");
    if (!tbody || !activeProjectId) return;

    if (!validarAccesoPestana(activeTab)) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444; font-weight:bold;">⛔ Acceso restringido a ${activeTab}.</td></tr>`;
        return;
    }

    const { data: files, error } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("proyecto_id", activeProjectId)
        .eq("activo", true)
        .order("id", { ascending: false });

    tbody.innerHTML = "";

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444;">Error al cargar datos: ${error.message}</td></tr>`;
        return;
    }

    if (!files || files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No hay entregables activos en esta carpeta.</td></tr>`;
        return;
    }

    let listaAProcesar = [];

    if (activeTab === "04_ARCHIVED") {
        listaAProcesar = files.filter(f => f.estado_origen === "04_ARCHIVED" || f.estado_destino === "04_ARCHIVED");
    } else {
        const mapaUnicos = new Map();

        files.forEach(f => {
            if (f.archivo_nombre.startsWith("ACTA_DECISION_CLIENTE") || f.archivo_nombre.startsWith("NOTA_TECNICA_")) {
                return;
            }

            const eDestino = f.estado_destino || "";
            const eOrigen = f.estado_origen || "";

            let perteneceAPestana = (eDestino === activeTab || eOrigen === activeTab);

            const partes = f.archivo_nombre.split("_");
            if (!perteneceAPestana && partes.length >= 6) {
                const codigoEstado = partes[5].split(".")[0].toUpperCase();
                if (activeTab === "01_WIP" && (codigoEstado === "S0" || eOrigen === "01_WIP")) perteneceAPestana = true;
                if (activeTab === "02_SHARED" && (codigoEstado === "S1" || eOrigen === "02_SHARED")) perteneceAPestana = true;
                if (activeTab === "03_PUBLISHED" && (codigoEstado.startsWith("A") || eOrigen === "03_PUBLISHED")) perteneceAPestana = true;
            }

            if (perteneceAPestana) {
                if (!mapaUnicos.has(f.archivo_nombre)) {
                    mapaUnicos.set(f.archivo_nombre, f);
                }
            }
        });

        listaAProcesar = Array.from(mapaUnicos.values());
    }

    // FILTRADO ADICIONAL POR SUBCARPERTA SELECCIONADA
    if (activeSubfolder !== "TODAS" && activeTab !== "04_ARCHIVED") {
        listaAProcesar = listaAProcesar.filter(f => {
            const nameUpper = f.archivo_nombre.toUpperCase();
            
            if (activeTab === "01_WIP") {
                if (activeSubfolder === "ARQ_Arquitectura") return nameUpper.includes("_ARQ_");
                if (activeSubfolder === "EST_Estructura") return nameUpper.includes("_EST_");
                if (activeSubfolder === "MEP_Instalaciones") return nameUpper.includes("_MEP_");
            } else if (activeTab === "02_SHARED") {
                if (activeSubfolder === "01_Modelos_3D") return nameUpper.includes("_M3_") || nameUpper.endsWith(".IFC") || nameUpper.endsWith(".RVT");
                if (activeSubfolder === "02_Planos_Coordinados") return nameUpper.includes("_PL_") || nameUpper.includes("_DR_") || nameUpper.endsWith(".DWG");
                if (activeSubfolder === "03_Informes_Interferencias") return !nameUpper.includes("_M3_") && !nameUpper.includes("_PL_") && !nameUpper.endsWith(".DWG");
            } else if (activeTab === "03_PUBLISHED") {
                if (activeSubfolder === "01_Modelos_Aprobados") return nameUpper.includes("_M3_") || nameUpper.endsWith(".IFC");
                if (activeSubfolder === "02_Planos_Contractuales") return nameUpper.includes("_PL_") || nameUpper.includes("_DR_");
                if (activeSubfolder === "03_Actas_y_Memorias") return !nameUpper.includes("_M3_") && !nameUpper.includes("_PL_");
            }
            return true;
        });
    }

    if (listaAProcesar.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No hay entregables en ${activeTab} ${activeSubfolder !== "TODAS" ? `(${activeSubfolder.replace(/_/g, " ")})` : ''}.</td></tr>`;
        return;
    }

    listaAProcesar.forEach(f => {
        const nombreCompleto = f.archivo_nombre || "";
        const parts = nombreCompleto.split("_");
        
        const esValidoISO = parts.length >= 6;
        const disciplina = esValidoISO ? parts[4] : "SIN_FORMATO";
        const estadoISO = esValidoISO ? parts[5].split(".")[0] : activeTab;

        const ext = nombreCompleto.split('.').pop().toLowerCase();
        const esVisualizable = ["pdf", "png", "jpg", "jpeg", "html", "htm"].includes(ext);
        const fechaUltimaModificacion = f.version || "N/A";

        if (activeTab === "04_ARCHIVED") {
            tbody.innerHTML += `
                <tr style="opacity: 0.85;">
                    <td style="font-size:0.85rem;">${nombreCompleto}</td>
                    <td><strong>${disciplina}</strong></td>
                    <td><span class="badge" style="background:#64748b;">${estadoISO}</span></td>
                    <td><small style="color:var(--text-muted); font-size:0.75rem;">${fechaUltimaModificacion}</small></td>
                    <td><small style="color:var(--text-muted); font-style:italic;">Solo Lectura / Histórico</small></td>
                </tr>
            `;
            return;
        }

        let botonPromocion = "";
        if (currentUser && currentUser.cargo !== "CLIENTE") {
            if (activeTab === "01_WIP" && (currentUser.cargo.includes("MODELADOR") || currentUser.cargo.includes("SUPER_ADMIN") || currentUser.cargo.includes("BIM Manager"))) {
                botonPromocion = `<button class="btn-secondary" style="font-size:0.75rem; padding:0.25rem 0.5rem;" onclick="promoverArchivo('${nombreCompleto}', '01_WIP', '02_SHARED')">Promover a SHARED</button>`;
            } else if (activeTab === "02_SHARED" && (currentUser.cargo.includes("REVISOR") || currentUser.cargo.includes("SUPER_ADMIN") || currentUser.cargo.includes("BIM Manager"))) {
                botonPromocion = `<button class="btn-secondary" style="font-size:0.75rem; padding:0.25rem 0.5rem; background:#10b981; color:#fff;" onclick="promoverArchivo('${nombreCompleto}', '02_SHARED', '03_PUBLISHED')">Publicar a Cliente</button>`;
            }
        }

        if (esValidoISO || ext === "html") {
            tbody.innerHTML += `
                <tr>
                    <td style="font-size:0.85rem;">${nombreCompleto}</td>
                    <td><strong>${disciplina}</strong></td>
                    <td><span class="badge">${estadoISO}</span></td>
                    <td><small style="color:var(--text-muted); font-size:0.75rem;">${fechaUltimaModificacion}</small></td>
                    <td>
                        ${esVisualizable ? `<button class="btn-secondary" style="font-size:0.75rem; padding:0.25rem 0.5rem;" onclick="openViewerModal('${f.drive_file_url}', '${nombreCompleto}')">Ver</button>` : ''}
                        <a href="${f.drive_file_url}" target="_blank" class="btn-primary" style="text-decoration:none; font-size: 0.75rem; padding: 0.25rem 0.5rem;">Descargar</a>
                        ${botonPromocion}
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML += `
                <tr style="background-color: rgba(239, 68, 68, 0.05);">
                    <td style="color: #ef4444; font-size:0.85rem;">${nombreCompleto}</td>
                    <td><strong style="color: #ef4444;">${disciplina}</strong></td>
                    <td><span class="badge" style="background: #ef4444;">NO_CONFORME</span></td>
                    <td><small style="color:#ef4444; font-size:0.75rem;">${fechaUltimaModificacion}</small></td>
                    <td><small style="color: #ef4444;">⚠️ Renombrar bajo ISO 19650</small></td>
                </tr>
            `;
        }
    });
}

// Helpers Modales
async function prepareAndOpenProjectModal() {
    const yearCurrent = new Date().getFullYear();
    const prefix = `PRY${yearCurrent}`;

    const { data: proyectos } = await supabaseClient.from("proyectos").select("codigo_proyecto");

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
        alert("⚠️ El cliente ingresado no es válido.");
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
        const res = await fetch(WEBHOOK_APPS_SCRIPT, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });
        const responseData = await res.json();

        if (responseData.status === "success") {
            closeProjectModal();
            alert("¡Estructura generada exitosamente!");
            loadProjects();
        } else {
            alert("⚠️ Error en creación: " + responseData.message);
        }
    } catch (err) {
        alert("Error de envío: " + err.message);
    }
}

function closeProjectModal() {
    const modal = document.getElementById("projectModal");
    if (modal) modal.className = "modal-hidden";
}
