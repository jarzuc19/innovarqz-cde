// ==============================================================================
// CONFIGURACIÓN CENTRALIZADA DE SERVICIOS - CDE INNOVARQZ S.A.S.
// ==============================================================================
const SUPABASE_URL = "https://bjlqtzrcrofpqlmyvoob.supabase.co";
const SUPABASE_KEY = "sb_publishable_htPtQvL-1wrLfu7ACHBg1w_epAZsu1E";
const WEBHOOK_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbyZROxo0lJW9ImGGlRfS-Ila6H5pMAgN4RupXKV4_WwKcBewLku3kgyvh_Tr359Oij01w/exec";
const GOOGLE_DRIVE_API_KEY = "AIzaSyDeV3Idy0ZPoCkzDcdEmO78VkdR7t0HpDQ";

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
// VARIABLES DEL MOTOR 3D IFC (THAT OPEN COMPANY WEB-IFC v0.0.78)
// ==============================================================================
let ifcScene = null;
let ifcRenderer = null;
let ifcCamera = null;
let ifcControls = null;
let ifcAnimationId = null;
let ifcApiInstance = null;
let ifcGridHelper = null;
let ifcCurrentGroup = null;
let ifcModelBounds = { center: new THREE.Vector3(), size: new THREE.Vector3(), maxDim: 30 };
let currentLoadedModelID = null;

// ÁRBOL DE NIVELES BIM
let ifcBuildingStoreys = [];

// GESTIÓN DE PLANOS DE CORTE / SECCIONES (CLIPPING PLANES)
let ifcClippingPlane = null;
let ifcClipInverted = false;
let ifcClipAxis = 'Y';
let isSectionToolActive = false;

// GESTIÓN Y ALTERNANCIA DE LÍNEAS DE ARISTA (EDGES)
const ifcEdgesList = [];
let ifcEdgesVisible = true;

// HERRAMIENTA DE MEDICIÓN 3D PUNTO A PUNTO
let isMeasureToolActive = false;
let measurePoints = [];
const measureVisualObjects = [];

// HERRAMIENTA DE RECORRIDO EN PRIMERA PERSONA (WALK MODE)
let isWalkModeActive = false;
const walkMovement = { forward: false, backward: false, left: false, right: false };
const walkClock = new THREE.Clock();
const walkSpeed = 3.6; // metros por segundo
let walkPitch = 0;
let walkYaw = 0;
let walkIsDraggingLook = false;
let walkLastMousePos = { x: 0, y: 0 };

// INTERACCIÓN Y SELECCIÓN DE PROPIEDADES BIM
let raycaster = null;
let mousePointer = null;
let highlightedMesh = null;
let originalMaterial = null;
const ifcMeshesList = [];

// GESTIÓN DE PUNTERO TÁCTIL Y RATÓN
let pointerDownPos = { x: 0, y: 0 };

// ESTADO DE ZOOM Y PANEO UNIVERSAL (IMÁGENES Y PDF)
let activeZoomScale = 1;
let activePanX = 0;
let activePanY = 0;
let isPanningActive = false;
let startPanX = 0;
let startPanY = 0;
let touchStartDist = 0;
let activeZoomTarget = null;
let currentExternalUrl = "";

// CONTROL DE PILA DE HISTORIAL
let modalActivoId = null;

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
    setupUniversalZoomInteractions();
    setupWalkKeyboardListeners();
    setupWalkTouchListeners();

    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") cerrarCualquierModalAbierto();
    });

    window.addEventListener("popstate", () => {
        cerrarCualquierModalAbierto(false);
    });

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

// GESTIÓN DE PILA DE MODALES
function registrarAperturaModalEnHistorial(modalId) {
    modalActivoId = modalId;
    history.pushState({ modalOpen: true, modalId: modalId }, "");
}

function cerrarCualquierModalAbierto(triggerHistoryBack = true) {
    let seCerro = false;

    const vModal = document.getElementById("viewerModal");
    if (vModal && (vModal.style.display === "flex" || vModal.classList.contains("modal-overlay"))) {
        closeViewerModal(false);
        seCerro = true;
    }

    const uModal = document.getElementById("uploadModal");
    if (uModal && (uModal.style.display === "flex" || uModal.classList.contains("modal-overlay"))) {
        closeUploadModal(false);
        seCerro = true;
    }

    const rModal = document.getElementById("revisorInstructionModal");
    if (rModal && (rModal.style.display === "flex" || rModal.classList.contains("modal-overlay"))) {
        closeRevisorInstructionModal(false);
        seCerro = true;
    }

    const pModal = document.getElementById("projectModal");
    if (pModal && (pModal.style.display === "flex" || pModal.classList.contains("modal-overlay"))) {
        closeProjectModal(false);
        seCerro = true;
    }

    modalActivoId = null;

    if (seCerro && triggerHistoryBack && window.history.state && window.history.state.modalOpen) {
        window.history.back();
    }
}

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
    const esInstalacion = ["_MEP_", "_HID_", "_SAN_", "_ELE_", "_MEC_", "_PCI_", "_GAS_", "_VAC_"].some(tag => isoName.includes(tag));

    if (targetTab === "01_WIP") {
        if (isoName.includes("_ARQ_")) subDetectada = "01_WIP / ARQ_Arquitectura";
        else if (isoName.includes("_EST_")) subDetectada = "01_WIP / EST_Estructura";
        else if (esInstalacion) subDetectada = "01_WIP / MEP_Instalaciones";
        else subDetectada = "01_WIP / ARQ_Arquitectura (Default)";
    } else if (targetTab === "02_SHARED") {
        if (isoName.includes("_M3_") || isoName.endsWith(".IFC") || isoName.endsWith(".RVT")) subDetectada = "02_SHARED / 01_Modelos_3D";
        else if (isoName.includes("_PL_") || isoName.includes("_DR_") || isoName.includes("_IM_") || isoName.includes("_VI_") || isoName.endsWith(".DWG")) subDetectada = "02_SHARED / 02_Planos_Coordinados";
        else subDetectada = "02_SHARED / 03_Informes_Interferencias";
    } else if (targetTab === "03_PUBLISHED") {
        if (isoName.includes("_ACT_") || isoName.includes("ACTA") || isoName.includes("_MEM_") || isoName.includes("_INF_") || isoName.includes("_CON_") || isoName.includes("_POL_")) {
            subDetectada = "03_PUBLISHED / 03_Actas_y_Memorias";
        } else if (isoName.includes("_M3_") || isoName.endsWith(".IFC")) {
            subDetectada = "03_PUBLISHED / 01_Modelos_Aprobados";
        } else if (isoName.includes("_PL_") || isoName.includes("_DR_") || isoName.includes("_IM_") || isoName.includes("_VI_") || isoName.endsWith(".DWG")) {
            subDetectada = "03_PUBLISHED / 02_Planos_Contractuales";
        } else {
            subDetectada = "03_PUBLISHED / 03_Actas_y_Memorias (Default Admin)";
        }
    }

    hintSpan.innerText = subDetectada;
    hintSpan.style.color = "#10b981";
}

// ==============================================================================
// AUTENTICACIÓN ORIGINAL (RESTAURADA EXACTA)
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
        if (b.dataset.tab === activeTab) b.classList.add("active");
        else b.classList.remove("active");
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
    registrarAperturaModalEnHistorial("revisorInstructionModal");
    const modal = document.getElementById("revisorInstructionModal");
    if (modal) {
        modal.style.display = "flex";
        modal.classList.remove("modal-hidden");
        modal.classList.add("modal-overlay");
    }
}

function closeRevisorInstructionModal(triggerHistory = true) {
    const modal = document.getElementById("revisorInstructionModal");
    if (modal) {
        modal.style.display = "none";
        modal.classList.remove("modal-overlay");
        modal.classList.add("modal-hidden");
    }
    if (triggerHistory && window.history.state && window.history.state.modalOpen) {
        window.history.back();
    }
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
// GESTIÓN DE SUBIDAS Y VALIDACIÓN RIGUROSA ISO 19650
// ==============================================================================
function openUploadModal() {
    registrarAperturaModalEnHistorial("uploadModal");
    const optWip = document.getElementById("optUploadWip");
    const optShared = document.getElementById("optUploadShared");
    const optPublished = document.getElementById("optUploadPublished");

    const esSuperAdminOBimManager = currentUser && (
        currentUser.cargo.includes("SUPER_ADMIN") || 
        currentUser.cargo.includes("BIM Manager") || 
        currentUser.cargo.includes("Director General")
    );

    if (optPublished) optPublished.style.display = esSuperAdminOBimManager ? "block" : "none";

    if (currentUser && currentUser.cargo.includes("REVISOR") && !esSuperAdminOBimManager) {
        if (optWip) optWip.style.display = "none";
        if (optShared) optShared.selected = true;
    } else {
        if (optWip) optWip.style.display = "block";
    }

    actualizarPistaSubcarpetaModal();
    const modal = document.getElementById("uploadModal");
    if (modal) {
        modal.style.display = "flex";
        modal.classList.remove("modal-hidden");
        modal.classList.add("modal-overlay");
    }
}

function closeUploadModal(triggerHistory = true) {
    const modal = document.getElementById("uploadModal");
    if (modal) {
        modal.style.display = "none";
        modal.classList.remove("modal-overlay");
        modal.classList.add("modal-hidden");
    }
    if (triggerHistory && window.history.state && window.history.state.modalOpen) {
        window.history.back();
    }
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
    return (partes.length >= 6) ? partes[5].toUpperCase() : "";
}

function extraerTipoDeNombre(nombreArchivo) {
    const nombreSinExt = nombreArchivo.split('.').slice(0, -1).join('.');
    const partes = nombreSinExt.split('_');
    return (partes.length >= 6) ? partes[3].toUpperCase() : "";
}

function validarCoherenciaTipoYExtension(tipo, extension) {
    const ext = extension.toLowerCase();
    const REGLAS_EXTENSIONES = {
        "M3": ["ifc", "rvt", "pln", "nwc", "nwd"],
        "PL": ["dwg", "pdf", "dxf", "plt"],
        "DR": ["dwg", "pdf", "dxf"],
        "VI": ["mp4", "mov", "webm", "mkv", "avi"],
        "IM": ["png", "jpg", "jpeg", "webp", "tiff", "tif"],
        "INF": ["pdf", "xlsx", "xls", "docx", "doc", "html"],
        "MEM": ["pdf", "docx", "doc", "xlsx"],
        "ACT": ["pdf"],
        "CON": ["pdf"]
    };
    return REGLAS_EXTENSIONES[tipo] ? REGLAS_EXTENSIONES[tipo].includes(ext) : true;
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
        alert(`❌ REGLA ISO 19650 INCUMPLIDA:\n\nEl nombre "${isoNameInput}" no cumple la estructura de 6 campos:\n[PROYECTO]_[ORIGINADOR]_[ZONA]_[TIPO]_[DISCIPLINA]_[ESTADO].[ext]`);
        return;
    }

    const estadoArchivo = extraerEstadoDeNombre(isoNameInput);
    const tipoArchivo = extraerTipoDeNombre(isoNameInput);
    const extEscrita = isoNameInput.split('.').pop().toLowerCase();

    if (!validarCoherenciaTipoYExtension(tipoArchivo, extEscrita)) {
        alert(`❌ CONFLICTO TÉCNICO TIPO vs. EXTENSIÓN:\n\nEl tipo declarado es [${tipoArchivo}], pero la extensión ingresada es [.${extEscrita}].`);
        return;
    }

    if (targetTab === "01_WIP" && estadoArchivo !== "S0" && !estadoArchivo.startsWith("P0")) {
        alert(`⛔ VIOLACIÓN DE NORMA ISO 19650:\n\nEn 01_WIP solo se permiten entregables en estado "S0" (o borradores P0).`);
        return;
    }

    if (targetTab === "02_SHARED" && (!estadoArchivo.startsWith("S") || estadoArchivo === "S0")) {
        alert(`⛔ VIOLACIÓN DE NORMA ISO 19650:\n\nEn 02_SHARED solo se permiten entregables en estado S1, S2, S3, etc.`);
        return;
    }

    const estadosValidosPublished = ["CR", "ACT", "AP", "CON"];
    const esValidoEnPublished = estadoArchivo.startsWith("A") || estadosValidosPublished.includes(estadoArchivo);

    if (targetTab === "03_PUBLISHED" && !esValidoEnPublished) {
        alert(`⛔ VIOLACIÓN DE NORMA ISO 19650:\n\nEn 03_PUBLISHED solo se permiten entregables en estado A1, A2... o códigos especiales (${estadosValidosPublished.join(', ')}).`);
        return;
    }

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
                alert(`❌ CONFLICTO DE EXTENSIÓN:\n\nEl archivo seleccionado es (.${extReal}) pero en el CDE escribió (.${extEscrita}).`);
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

    const { PDFDocument, rgb, degrees, StandardFonts } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();
    const pageWidth = 612;
    const pageHeight = 792;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const colorDark = rgb(15 / 255, 23 / 255, 42 / 255);
    const colorCopper = rgb(217 / 255, 119 / 255, 6 / 255);
    const colorSlate = rgb(100 / 255, 116 / 255, 139 / 255);
    const colorBorder = rgb(203 / 255, 213 / 255, 225 / 255);

    const leftMargin = 50;
    const rightMargin = pageWidth - 50;
    const printableWidth = rightMargin - leftMargin;

    page.drawText("InnovArqZ", {
        x: 140, y: 290, size: 72, font: fontBold,
        color: rgb(15 / 255, 23 / 255, 42 / 255),
        opacity: 0.035, rotate: degrees(32)
    });

    page.drawText("Innov", { x: leftMargin, y: 738, size: 24, font: fontBold, color: colorDark });
    page.drawText("ArqZ", { x: leftMargin + 65, y: 738, size: 24, font: fontBold, color: colorCopper });
    page.drawText("SOLUCIONES INTEGRALES", { x: leftMargin, y: 724, size: 8, font: fontBold, color: colorSlate });
    page.drawText("Consultoría BIM/CIM • Arquitectura • Ingeniería", { x: leftMargin, y: 711, size: 7.5, font: fontBold, color: colorCopper });

    const credDirector = "DIRECTOR: Arq. James R. Zuñiga C.";
    const credMatricula = "M.P CPNAA No: A137812026-1122783013";
    const credWeb = "PORTAFOLIO: www.innovarqzsas.com/portafolio";

    page.drawText(credDirector, { x: rightMargin - fontRegular.widthOfTextAtSize(credDirector, 7.5), y: 738, size: 7.5, font: fontRegular, color: colorDark });
    page.drawText(credMatricula, { x: rightMargin - fontRegular.widthOfTextAtSize(credMatricula, 7.5), y: 724, size: 7.5, font: fontRegular, color: colorDark });
    page.drawText(credWeb, { x: rightMargin - fontRegular.widthOfTextAtSize(credWeb, 7.5), y: 711, size: 7.5, font: fontRegular, color: colorDark });

    const yLine = 698;
    const copperWidth = printableWidth * 0.32;
    page.drawLine({ start: { x: leftMargin, y: yLine }, end: { x: leftMargin + copperWidth, y: yLine }, thickness: 2.5, color: colorCopper });
    page.drawLine({ start: { x: leftMargin + copperWidth, y: yLine }, end: { x: rightMargin, y: yLine }, thickness: 2.5, color: colorDark });

    page.drawText("ACTA DE RECIBO A SATISFACCIÓN Y CIERRE DE HITO", { x: leftMargin, y: 668, size: 11.5, font: fontBold, color: colorDark });

    const fechaStr = new Date().toLocaleString();
    let yMeta = 642;
    page.drawText(`Proyecto: ${activeProjectCode || 'PRY-GENERAL'}`, { x: leftMargin, y: yMeta, size: 9, font: fontBold, color: colorDark });
    yMeta -= 14;
    page.drawText(`Cliente / Razón Social: ${currentUser.nombre_completo || 'Cliente'}`, { x: leftMargin, y: yMeta, size: 9, font: fontRegular, color: colorDark });
    yMeta -= 14;
    page.drawText(`Identificación / Correo: ${currentUser.email || ''}`, { x: leftMargin, y: yMeta, size: 9, font: fontRegular, color: colorDark });
    yMeta -= 14;
    page.drawText(`Fecha y Hora de Firma Digital: ${fechaStr}`, { x: leftMargin, y: yMeta, size: 8.5, font: fontRegular, color: colorSlate });

    let yDecl = yMeta - 22;
    page.drawText("DECLARACIÓN DE CONFORMIDAD", { x: leftMargin, y: yDecl, size: 10, font: fontBold, color: colorCopper });
    yDecl -= 15;
    page.drawText("Por medio del presente documento, el cliente hace constar que INNOVARQZ SOLUCIONES INTEGRALES S.A.S. cumplió a cabalidad con los entregables técnicos de información, planos y modelos acordados. Se confirma la recepción a satisfacción de la documentación aprobada y se autoriza formalmente el cierre del hito correspondiente.", {
        x: leftMargin, y: yDecl, size: 8.5, font: fontRegular, color: colorDark, maxWidth: printableWidth, lineHeight: 12
    });

    let yList = yDecl - 40;
    page.drawText("LISTA DE ENTREGABLES APROBADOS (03_PUBLISHED):", { x: leftMargin, y: yList, size: 9.5, font: fontBold, color: colorDark });

    const { data: files } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("proyecto_id", activeProjectId)
        .eq("estado_destino", "03_PUBLISHED")
        .eq("activo", true);

    let yPos = yList - 16;
    if (files && files.length > 0) {
        const unicosPublished = new Map();
        files.forEach(f => {
            if (!f.archivo_nombre.includes("ACTA_") && !f.archivo_nombre.includes("NOTA_TECNICA") && !f.archivo_nombre.includes("CARGA DE ENTREGABLE") && !f.archivo_nombre.includes("PROMOCIÓN_")) {
                if (!unicosPublished.has(f.archivo_nombre)) unicosPublished.set(f.archivo_nombre, f);
            }
        });

        unicosPublished.forEach(f => {
            if (yPos > 175) {
                page.drawText(`• ${f.archivo_nombre} (${f.version || 'V1.0'})`, { x: leftMargin + 10, y: yPos, size: 8, font: fontRegular, color: colorDark });
                yPos -= 14;
            }
        });
    }

    const yFirmaLine = 135;
    page.drawLine({ start: { x: leftMargin, y: yFirmaLine }, end: { x: leftMargin + 200, y: yFirmaLine }, thickness: 1, color: colorSlate });
    page.drawText("ARQ. JAMES RAMIRO ZUÑIGA CAIPE", { x: leftMargin, y: yFirmaLine - 14, size: 8.5, font: fontBold, color: colorDark });
    page.drawText("Representante Legal", { x: leftMargin, y: yFirmaLine - 25, size: 8, font: fontRegular, color: colorSlate });
    page.drawText("INNOVARQZ SOLUCIONES INTEGRALES S.A.S.", { x: leftMargin, y: yFirmaLine - 36, size: 7.5, font: fontBold, color: colorDark });

    const colRightX = rightMargin - 200;
    page.drawLine({ start: { x: colRightX, y: yFirmaLine }, end: { x: rightMargin, y: yFirmaLine }, thickness: 1, color: colorSlate });
    page.drawText(currentUser.nombre_completo ? currentUser.nombre_completo.toUpperCase() : "CLIENTE FINAL", { x: colRightX, y: yFirmaLine - 14, size: 8.5, font: fontBold, color: colorDark });
    page.drawText("Firma Digital y Sello CDE", { x: colRightX, y: yFirmaLine - 25, size: 8, font: fontRegular, color: colorSlate });
    page.drawText(`Verificación: ${currentUser.email || ''}`, { x: colRightX, y: yFirmaLine - 36, size: 7.5, font: fontRegular, color: colorDark });

    const yFooterLine = 68;
    page.drawLine({ start: { x: leftMargin, y: yFooterLine }, end: { x: rightMargin, y: yFooterLine }, thickness: 1, color: colorBorder });
    page.drawText("InnovArqZ Soluciones Integrales", { x: leftMargin, y: 53, size: 8, font: fontBold, color: colorDark });
    page.drawText('"Construimos juntos el valor de tus espacios', { x: leftMargin, y: 41, size: 7.5, font: fontOblique, color: colorDark });
    page.drawText('DE PRINCIPIO A FIN"', { x: leftMargin, y: 28, size: 10, font: fontBold, color: colorCopper });

    const lineWeb = "Web Oficial: www.innovarqzsas.com";
    const lineEmail = "Email: gerenciabim@innovarqzsas.com";
    const lineTel = "TEL / WA: +57 315 850 5885";

    page.drawText(lineWeb, { x: rightMargin - fontRegular.widthOfTextAtSize(lineWeb, 7.5), y: 53, size: 7.5, font: fontRegular, color: colorDark });
    page.drawText(lineEmail, { x: rightMargin - fontRegular.widthOfTextAtSize(lineEmail, 7.5), y: 41, size: 7.5, font: fontRegular, color: colorDark });
    page.drawText(lineTel, { x: rightMargin - fontRegular.widthOfTextAtSize(lineTel, 7.5), y: 28, size: 7.5, font: fontBold, color: colorDark });

    return await pdfDoc.saveAsBase64({ dataUri: false });
}

// ==============================================================================
// GESTIÓN DEL VISOR MULTIMODAL
// ==============================================================================
async function openViewerModal(driveUrl, nombreArchivo) {
    const ext = nombreArchivo.split('.').pop().toLowerCase();
    const esMovilPequeno = window.innerWidth < 600;

    let targetDirectUrl = driveUrl;
    if (driveUrl.includes("drive.google.com/file/d/")) {
        targetDirectUrl = driveUrl.replace("/view?usp=drivesdk", "/preview").replace("/view", "/preview");
    }
    currentExternalUrl = targetDirectUrl;

    if (["mp4", "webm", "mov"].includes(ext)) {
        if (esMovilPequeno) { window.open(targetDirectUrl, "_blank"); return; }
        registrarAperturaModalEnHistorial("viewerModal");
        desplegarModalIframe(targetDirectUrl, nombreArchivo, false);
        return;
    }

    if (ext === "ifc") {
        registrarAperturaModalEnHistorial("viewerModal");
        desplegarModalIFC(driveUrl, nombreArchivo);
        return;
    }

    if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
        registrarAperturaModalEnHistorial("viewerModal");
        desplegarModalImagen(driveUrl, nombreArchivo);
        return;
    }

    registrarAperturaModalEnHistorial("viewerModal");
    desplegarModalIframe(targetDirectUrl, nombreArchivo, esMovilPequeno);
}

function openCurrentInExternalTab() {
    if (currentExternalUrl) window.open(currentExternalUrl, "_blank");
}

function desplegarModalIframe(url, titulo, mostrarZoomControls) {
    const modal = document.getElementById("viewerModal");
    const scalerWrapper = document.getElementById("iframeScalerWrapper");
    const frame = document.getElementById("modalViewerFrame");
    const imgWrapper = document.getElementById("imageViewerWrapper");
    const ifcCont = document.getElementById("modalIfcContainer");
    const loading = document.getElementById("viewerLoadingIndicator");
    const title = document.getElementById("viewerTitle");
    const zoomControls = document.getElementById("viewerFloatingZoomControls");

    if (!modal) return;
    title.innerText = `Previsualizando: ${titulo}`;

    if (imgWrapper) imgWrapper.style.display = "none";
    if (ifcCont) ifcCont.style.display = "none";
    if (loading) loading.style.display = "none";

    resetActiveZoom();
    activeZoomTarget = "PDF";

    scalerWrapper.style.display = "flex";
    if (zoomControls) zoomControls.style.display = mostrarZoomControls ? "flex" : "none";

    modal.style.display = "flex";
    modal.classList.remove("modal-hidden");
    modal.classList.add("modal-overlay");

    setTimeout(() => {
        if (frame.contentWindow) frame.contentWindow.location.replace(url);
        else frame.src = url;
    }, 40);
}

function desplegarModalImagen(driveUrl, titulo) {
    const modal = document.getElementById("viewerModal");
    const scalerWrapper = document.getElementById("iframeScalerWrapper");
    const frame = document.getElementById("modalViewerFrame");
    const imgWrapper = document.getElementById("imageViewerWrapper");
    const imgElement = document.getElementById("modalImageViewer");
    const ifcCont = document.getElementById("modalIfcContainer");
    const loading = document.getElementById("viewerLoadingIndicator");
    const title = document.getElementById("viewerTitle");
    const zoomControls = document.getElementById("viewerFloatingZoomControls");

    if (!modal) return;
    title.innerText = `Previsualizando: ${titulo}`;

    if (scalerWrapper) scalerWrapper.style.display = "none";
    if (frame) frame.src = "about:blank";
    if (ifcCont) ifcCont.style.display = "none";
    if (loading) loading.style.display = "none";

    resetActiveZoom();
    activeZoomTarget = "IMAGE";

    imgWrapper.style.display = "flex";
    if (zoomControls) zoomControls.style.display = "flex";

    let imgDirectUrl = driveUrl;
    if (driveUrl.includes("drive.google.com")) {
        const match = driveUrl.match(/[-\w]{25,}/);
        if (match) imgDirectUrl = `https://drive.google.com/uc?export=view&id=${match[0]}`;
    }
    imgElement.src = imgDirectUrl;

    modal.style.display = "flex";
    modal.classList.remove("modal-hidden");
    modal.classList.add("modal-overlay");
}

async function desplegarModalIFC(driveUrl, titulo) {
    const modal = document.getElementById("viewerModal");
    const scalerWrapper = document.getElementById("iframeScalerWrapper");
    const frame = document.getElementById("modalViewerFrame");
    const imgWrapper = document.getElementById("imageViewerWrapper");
    const ifcCont = document.getElementById("modalIfcContainer");
    const loading = document.getElementById("viewerLoadingIndicator");
    const title = document.getElementById("viewerTitle");
    const zoomControls = document.getElementById("viewerFloatingZoomControls");

    if (!modal) return;
    title.innerText = `Previsualizando BIM 3D: ${titulo}`;

    if (scalerWrapper) scalerWrapper.style.display = "none";
    if (frame) frame.src = "about:blank";
    if (imgWrapper) imgWrapper.style.display = "none";
    if (zoomControls) zoomControls.style.display = "none";

    resetActiveZoom();
    activeZoomTarget = null;

    ifcCont.style.display = "block";
    if (loading) {
        loading.style.display = "block";
        loading.innerHTML = `<div style="margin-bottom:6px;">⏳ Descargando modelo desde Google Drive...</div><small style="color:#94a3b8;">(Procesando geometría BIM 3D con That Open Company v0.0.78)</small>`;
    }

    modal.style.display = "flex";
    modal.classList.remove("modal-hidden");
    modal.classList.add("modal-overlay");

    try {
        await inicializarVisorIFC(driveUrl, ifcCont);
    } catch (err) {
        console.error("Error al cargar IFC 3D:", err);
        alert("⚠️ No se pudo inicializar la geometría del modelo IFC: " + err.message);
    } finally {
        if (loading) loading.style.display = "none";
    }
}

function closeViewerModal(triggerHistory = true) {
    const modal = document.getElementById("viewerModal");
    const scalerWrapper = document.getElementById("iframeScalerWrapper");
    const frame = document.getElementById("modalViewerFrame");
    const imgWrapper = document.getElementById("imageViewerWrapper");
    const ifcCont = document.getElementById("modalIfcContainer");
    const loading = document.getElementById("viewerLoadingIndicator");
    const zoomControls = document.getElementById("viewerFloatingZoomControls");
    const dragOverlay = document.getElementById("dragCaptureOverlay");

    if (frame) frame.src = "about:blank";
    if (scalerWrapper) scalerWrapper.style.display = "none";
    if (imgWrapper) imgWrapper.style.display = "none";
    if (zoomControls) zoomControls.style.display = "none";
    if (dragOverlay) dragOverlay.style.display = "none";
    if (loading) loading.style.display = "none";

    resetActiveZoom();
    cerrarCardPropiedadesIFC();
    desactivarModoMedicion();
    desactivarModoCaminar();
    cerrarPanelNivelesIFC();

    if (ifcAnimationId) {
        cancelAnimationFrame(ifcAnimationId);
        ifcAnimationId = null;
    }
    if (ifcRenderer) {
        if (ifcRenderer.domElement && ifcRenderer.domElement.parentNode) {
            ifcRenderer.domElement.parentNode.removeChild(ifcRenderer.domElement);
        }
        ifcRenderer.dispose();
        ifcRenderer = null;
    }
    if (ifcCont) ifcCont.style.display = "none";

    if (ifcApiInstance && currentLoadedModelID !== null) {
        try { ifcApiInstance.CloseModel(currentLoadedModelID); } catch(e){}
        currentLoadedModelID = null;
    }

    modalActivoId = null;
    currentExternalUrl = "";

    if (modal) {
        modal.style.setProperty("display", "none", "important");
        modal.classList.remove("modal-overlay");
        modal.classList.add("modal-hidden");
    }

    if (triggerHistory && window.history.state && window.history.state.modalOpen) {
        window.history.back();
    }
}

// ==============================================================================
// GESTIÓN UNIVERSAL DE ZOOM Y PANEO
// ==============================================================================
function setupUniversalZoomInteractions() {
    const container = document.getElementById("viewerContainer");
    const dragOverlay = document.getElementById("dragCaptureOverlay");
    if (!container || !dragOverlay) return;

    container.addEventListener("wheel", (e) => {
        if (activeZoomTarget === "IMAGE" || activeZoomTarget === "PDF") {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.25 : 0.25;
            zoomActiveElement(delta);
        }
    }, { passive: false });

    dragOverlay.addEventListener("mousedown", (e) => {
        if (activeZoomScale <= 1) return;
        isPanningActive = true;
        startPanX = e.clientX - activePanX;
        startPanY = e.clientY - activePanY;
    });

    window.addEventListener("mousemove", (e) => {
        if (!isPanningActive) return;
        activePanX = e.clientX - startPanX;
        activePanY = e.clientY - startPanY;
        applyActiveTransform();
    });

    window.addEventListener("mouseup", () => { isPanningActive = false; });

    dragOverlay.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1 && activeZoomScale > 1) {
            isPanningActive = true;
            startPanX = e.touches[0].clientX - activePanX;
            startPanY = e.touches[0].clientY - activePanY;
        } else if (e.touches.length === 2) {
            touchStartDist = getTouchDistance(e.touches);
        }
    }, { passive: true });

    dragOverlay.addEventListener("touchmove", (e) => {
        if (e.touches.length === 1 && isPanningActive) {
            activePanX = e.touches[0].clientX - startPanX;
            activePanY = e.touches[0].clientY - startPanY;
            applyActiveTransform();
        } else if (e.touches.length === 2) {
            const currentDist = getTouchDistance(e.touches);
            const diff = currentDist - touchStartDist;
            if (Math.abs(diff) > 5) {
                zoomActiveElement(diff * 0.006);
                touchStartDist = currentDist;
            }
        }
    }, { passive: true });

    dragOverlay.addEventListener("touchend", () => { isPanningActive = false; });
}

function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function zoomActiveElement(delta) {
    activeZoomScale = Math.min(Math.max(1, activeZoomScale + delta), 4.5);
    const dragOverlay = document.getElementById("dragCaptureOverlay");
    if (dragOverlay) dragOverlay.style.display = (activeZoomScale > 1) ? "block" : "none";
    if (activeZoomScale === 1) { activePanX = 0; activePanY = 0; }
    applyActiveTransform();
}

function resetActiveZoom() {
    activeZoomScale = 1;
    activePanX = 0;
    activePanY = 0;
    const dragOverlay = document.getElementById("dragCaptureOverlay");
    if (dragOverlay) dragOverlay.style.display = "none";
    applyActiveTransform();
}

function applyActiveTransform() {
    const transformStyle = `translate(${activePanX}px, ${activePanY}px) scale(${activeZoomScale})`;
    if (activeZoomTarget === "IMAGE") {
        const img = document.getElementById("modalImageViewer");
        if (img) img.style.transform = transformStyle;
    } else if (activeZoomTarget === "PDF") {
        const frame = document.getElementById("modalViewerFrame");
        if (frame) frame.style.transform = transformStyle;
    }
}

// ==============================================================================
// MOTOR BIM OPEN SOURCE 3D (THAT OPEN COMPANY WEB-IFC v0.0.78 CON CLIPPING Y VISTAS)
// ==============================================================================
async function obtenerConstructorIfcAPI() {
    if (window.WebIFC && window.WebIFC.IfcAPI) return window.WebIFC.IfcAPI;
    if (window.IfcAPI) return window.IfcAPI;

    try {
        const modulo = await import("https://cdn.jsdelivr.net/npm/web-ifc@0.0.78/web-ifc-api.js");
        if (modulo && modulo.IfcAPI) return modulo.IfcAPI;
    } catch (e) {
        console.warn("Fallback dynamic import v0.0.78 no disponible:", e);
    }
    throw new Error("No se pudo cargar la librería WebIFC v0.0.78 en el navegador.");
}

async function inicializarVisorIFC(fileUrl, container) {
    if (ifcRenderer && ifcRenderer.domElement && ifcRenderer.domElement.parentNode === container) {
        container.removeChild(ifcRenderer.domElement);
    }
    ifcMeshesList.length = 0;
    ifcEdgesList.length = 0;
    ifcBuildingStoreys = [];
    limpiarMedicionIFC();
    desactivarModoCaminar();
    cerrarPanelNivelesIFC();

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 550;

    ifcScene = new THREE.Scene();
    ifcScene.background = new THREE.Color(0xf1f5f9);

    ifcCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 3000);
    ifcCamera.position.set(35, 25, 35);

    ifcRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    ifcRenderer.setSize(width, height);
    ifcRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    ifcRenderer.outputEncoding = THREE.sRGBEncoding;
    ifcRenderer.localClippingEnabled = true;
    container.insertBefore(ifcRenderer.domElement, container.firstChild);

    ifcControls = new THREE.OrbitControls(ifcCamera, ifcRenderer.domElement);
    ifcControls.enableDamping = true;
    ifcControls.dampingFactor = 0.08;

    // Iluminación Técnica BIM
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcfd8dc, 0.85);
    hemiLight.position.set(0, 60, 0);
    ifcScene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffdfa, 0.75);
    sunLight.position.set(50, 70, 40);
    ifcScene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xe2e8f0, 0.4);
    fillLight.position.set(-50, 20, -40);
    ifcScene.add(fillLight);

    ifcGridHelper = new THREE.GridHelper(60, 60, 0x94a3b8, 0xe2e8f0);
    ifcGridHelper.position.y = -0.01;
    ifcScene.add(ifcGridHelper);

    // Inicializar Raycaster
    raycaster = new THREE.Raycaster();
    mousePointer = new THREE.Vector2();

    // REGISTRO UNIFICADO DE PUNTERO (MÓVIL, TABLET Y PC)
    ifcRenderer.domElement.addEventListener('pointerdown', (e) => {
        pointerDownPos.x = e.clientX;
        pointerDownPos.y = e.clientY;

        if (isWalkModeActive) {
            walkIsDraggingLook = true;
            walkLastMousePos.x = e.clientX;
            walkLastMousePos.y = e.clientY;
        }
    });

    window.addEventListener('pointermove', (e) => {
        if (isWalkModeActive && walkIsDraggingLook) {
            const deltaX = e.clientX - walkLastMousePos.x;
            const deltaY = e.clientY - walkLastMousePos.y;
            walkLastMousePos.x = e.clientX;
            walkLastMousePos.y = e.clientY;

            // Sensibilidad de mirada ergonómica
            walkYaw -= deltaX * 0.0035;
            walkPitch -= deltaY * 0.0035;
            walkPitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, walkPitch));

            aplicarRotacionCaminar();
        }
    });

    window.addEventListener('pointerup', (e) => {
        if (isWalkModeActive) {
            walkIsDraggingLook = false;
        }

        const deltaX = Math.abs(e.clientX - pointerDownPos.x);
        const deltaY = Math.abs(e.clientY - pointerDownPos.y);
        // Si el desplazamiento es mínimo (menor a 6px), se procesa como toque/clic
        if (deltaX < 6 && deltaY < 6 && !isWalkModeActive) {
            onIfcModelClick(e);
        }
    });

    function animate() {
        ifcAnimationId = requestAnimationFrame(animate);

        if (isWalkModeActive) {
            actualizarFisicaCaminar(walkClock.getDelta());
        } else if (ifcControls) {
            ifcControls.update();
        }

        if (ifcRenderer && ifcScene && ifcCamera) {
            ifcRenderer.render(ifcScene, ifcCamera);
        }
    }
    walkClock.start();
    animate();

    // 1. Motor WebIFC v0.0.78 de That Open Company
    const IfcAPIClass = await obtenerConstructorIfcAPI();
    if (!ifcApiInstance) {
        ifcApiInstance = new IfcAPIClass();
        ifcApiInstance.SetWasmPath("https://cdn.jsdelivr.net/npm/web-ifc@0.0.78/");
        await ifcApiInstance.Init();
    }

    // 2. Extraer ID del archivo en Drive
    let fileId = "";
    const match = fileUrl.match(/[-\w]{25,}/);
    if (match) fileId = match[0];
    if (!fileId) throw new Error("No se pudo detectar el ID del archivo en Google Drive.");

    // 3. Descarga Directa Binaria con Google Drive API Key
    const directApiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GOOGLE_DRIVE_API_KEY}`;
    const response = await fetch(directApiUrl);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error en Google Drive API (${response.status}): ${errorText}`);
    }

    const buffer = await response.arrayBuffer();
    const bytesArray = new Uint8Array(buffer);

    // 4. Apertura con configuración avanzada de That Open Company
    const modelSettings = {
        COORDINATE_TO_ORIGIN: true,
        USE_FAST_BOOLS: true
    };

    currentLoadedModelID = ifcApiInstance.OpenModel(bytesArray, modelSettings);
    ifcCurrentGroup = new THREE.Group();

    // Inicializar plano de corte en Y
    ifcClippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);

    // Material de aristas técnicas: vinculado al plano de corte para desaparecer en la sección
    const edgeLineMaterial = new THREE.LineBasicMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0.35,
        clippingPlanes: [ifcClippingPlane]
    });

    // 5. Procesamiento de mallas con aristas y planos de corte activos
    ifcApiInstance.StreamAllMeshes(currentLoadedModelID, (flatMesh) => {
        const placedGeometries = flatMesh.geometries;
        for (let i = 0; i < placedGeometries.size(); i++) {
            const placedGeometry = placedGeometries.get(i);
            const meshGeometry = ifcApiInstance.GetGeometry(currentLoadedModelID, placedGeometry.geometryExpressID);

            const verts = ifcApiInstance.GetVertexArray(meshGeometry.GetVertexData(), meshGeometry.GetVertexDataSize());
            const indices = ifcApiInstance.GetIndexArray(meshGeometry.GetIndexData(), meshGeometry.GetIndexDataSize());

            if (verts.length === 0 || indices.length === 0) continue;

            const bufferGeometry = new THREE.BufferGeometry();
            const posFloats = new Float32Array(verts.length / 2);
            for (let j = 0; j < verts.length; j += 6) {
                posFloats[j / 2] = verts[j];
                posFloats[j / 2 + 1] = verts[j + 1];
                posFloats[j / 2 + 2] = verts[j + 2];
            }

            bufferGeometry.setAttribute('position', new THREE.BufferAttribute(posFloats, 3));
            bufferGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
            bufferGeometry.computeVertexNormals();

            const col = placedGeometry.color;
            const esTransparente = col.w < 0.95;

            const material = new THREE.MeshStandardMaterial({
                color: new THREE.Color(col.x, col.y, col.z),
                opacity: col.w,
                transparent: esTransparente,
                roughness: 0.45,
                metalness: 0.05,
                side: THREE.DoubleSide,
                clippingPlanes: [ifcClippingPlane],
                clipShadows: true
            });

            const mesh = new THREE.Mesh(bufferGeometry, material);
            const matrix = new THREE.Matrix4().fromArray(placedGeometry.flatTransformation);
            mesh.applyMatrix4(matrix);

            mesh.userData = {
                expressID: placedGeometry.geometryExpressID,
                modelID: currentLoadedModelID
            };

            if (!esTransparente && posFloats.length < 6000) {
                const edges = new THREE.EdgesGeometry(bufferGeometry, 24);
                const lineSegments = new THREE.LineSegments(edges, edgeLineMaterial);
                lineSegments.visible = ifcEdgesVisible;
                mesh.add(lineSegments);
                ifcEdgesList.push(lineSegments);
            }

            ifcCurrentGroup.add(mesh);
            ifcMeshesList.push(mesh);
        }
    });

    // 6. Centrado y caja de encuadre
    const box = new THREE.Box3().setFromObject(ifcCurrentGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    ifcCurrentGroup.position.x -= center.x;
    ifcCurrentGroup.position.y -= center.y - (size.y / 2);
    ifcCurrentGroup.position.z -= center.z;

    ifcScene.add(ifcCurrentGroup);

    ifcModelBounds.center.set(0, size.y / 2, 0);
    ifcModelBounds.size.copy(size);
    ifcModelBounds.maxDim = Math.max(size.x, size.y, size.z);

    // 7. Extraer el árbol espacial de niveles IFC
    extraerNivelesDelModeloIFC();

    configurarPlanoCorte();
    ajustarVistaModeloIFC();
}

// ==============================================================================
// GESTIÓN DEL ÁRBOL DE NIVELES BIM (IFCBUILDINGSTOREY CON TRY-CATCH SEGURO)
// ==============================================================================
function extraerNivelesDelModeloIFC() {
    ifcBuildingStoreys = [];
    if (!ifcApiInstance || currentLoadedModelID === null) return;

    try {
        if (window.WebIFC && window.WebIFC.IFCBUILDINGSTOREY) {
            const storeyIDs = ifcApiInstance.GetLineIDsWithType(currentLoadedModelID, window.WebIFC.IFCBUILDINGSTOREY);
            for (let i = 0; i < storeyIDs.size(); i++) {
                const id = storeyIDs.get(i);
                const storey = ifcApiInstance.GetLine(currentLoadedModelID, id);
                let nombre = storey.Name ? storey.Name.value : `Nivel ${i + 1}`;
                let elevacion = storey.Elevation ? parseFloat(storey.Elevation.value) : (i * 2.80);
                ifcBuildingStoreys.push({ id, nombre, elevacion });
            }
        }
    } catch (e) {
        console.warn("Lectura de IfcBuildingStorey omitida por fallback:", e);
    }

    // Estimación segura de pisos si no se detectan en el encabezado
    if (ifcBuildingStoreys.length === 0) {
        const totalAltura = ifcModelBounds.size.y || 10;
        const pisosEstimados = Math.max(1, Math.round(totalAltura / 2.80));
        for (let p = 0; p < pisosEstimados; p++) {
            ifcBuildingStoreys.push({
                id: p,
                nombre: (p === 0) ? "Planta Baja (Nivel 1)" : `Piso ${p + 1}`,
                elevacion: p * 2.80
            });
        }
    }

    ifcBuildingStoreys.sort((a, b) => a.elevacion - b.elevacion);
    renderizarListaNivelesIFC();
}

function renderizarListaNivelesIFC() {
    const listCont = document.getElementById("ifcLevelsList");
    if (!listCont) return;

    if (ifcBuildingStoreys.length === 0) {
        listCont.innerHTML = `<small style="color:#94a3b8;">No se detectaron niveles definidos en el IFC.</small>`;
        return;
    }

    let html = "";
    ifcBuildingStoreys.forEach((lvl) => {
        const elevStr = lvl.elevacion >= 0 ? `+${lvl.elevacion.toFixed(2)}` : `${lvl.elevacion.toFixed(2)}`;
        html += `
            <div class="ifc-level-item">
                <div>
                    <strong>${lvl.nombre}</strong><br>
                    <small style="color: #38bdf8;">Cota: ${elevStr} m</small>
                </div>
                <div class="ifc-level-actions">
                    <button type="button" class="btn-level-act" style="background: #0284c7; color:#fff;" onclick="cortarEnNivel(${lvl.elevacion})" title="Cortar sección en este piso">✂️ Cortar</button>
                    <button type="button" class="btn-level-act" style="background: #10b981; color:#fff;" onclick="caminarEnNivel(${lvl.elevacion})" title="Entrar a caminar en este piso">🚶 Entrar</button>
                </div>
            </div>
        `;
    });
    listCont.innerHTML = html;
}

function alternarPanelNivelesIFC() {
    const panel = document.getElementById("ifcLevelsCard");
    const btn = document.getElementById("btnToggleLevels");
    if (!panel) return;

    const visible = panel.style.display === "block";
    panel.style.display = visible ? "none" : "block";
    if (btn) btn.style.background = visible ? "#1e293b" : "#10b981";
    if (btn) btn.style.color = visible ? "#10b981" : "#fff";
}

function cerrarPanelNivelesIFC() {
    const panel = document.getElementById("ifcLevelsCard");
    const btn = document.getElementById("btnToggleLevels");
    if (panel) panel.style.display = "none";
    if (btn) {
        btn.style.background = "#1e293b";
        btn.style.color = "#10b981";
    }
}

function cortarEnNivel(elevacionPiso) {
    if (!ifcClippingPlane) return;

    isSectionToolActive = true;
    const panel = document.getElementById("ifcSectionToolPanel");
    const btn = document.getElementById("btnToggleSectionBox");
    if (panel) panel.style.display = "block";
    if (btn) btn.style.background = "#10b981";

    const radios = document.getElementsByName("clipAxis");
    radios.forEach(r => { if (r.value === 'Y') r.checked = true; });
    ifcClipAxis = 'Y';
    ifcClipInverted = false;
    ifcClippingPlane.normal.set(0, -1, 0);

    const cotaCorte = elevacionPiso + 1.20;
    ifcClippingPlane.constant = cotaCorte;

    const max = ifcModelBounds.size.y || 20;
    const pct = Math.min(100, Math.max(0, (cotaCorte / max) * 100));
    const slider = document.getElementById("clipSlider");
    if (slider) slider.value = pct;
}

function caminarEnNivel(elevacionPiso) {
    cerrarPanelNivelesIFC();
    if (!isWalkModeActive) {
        alternarModoCaminarIFC(elevacionPiso);
    } else {
        const cotaOjo = elevacionPiso + 1.65;
        ifcCamera.position.set(0, cotaOjo, 0.5);
    }
}

// ==============================================================================
// BOTONERA COMPLETA DE VISTAS ORTOGONALES Y 3D
// ==============================================================================
function ajustarVistaModeloIFC() {
    if (!ifcCamera || !ifcControls) return;
    desactivarModoCaminar();
    cerrarPanelNivelesIFC();
    const d = ifcModelBounds.maxDim || 25;
    ifcCamera.position.set(d * 1.3, d * 1.0, d * 1.3);
    ifcControls.target.copy(ifcModelBounds.center);
    ifcControls.update();
}

function cambiarVistaIFC(tipo) {
    if (!ifcCamera || !ifcControls) return;
    desactivarModoCaminar();
    cerrarPanelNivelesIFC();
    const d = ifcModelBounds.maxDim || 25;
    const cy = ifcModelBounds.center.y;

    if (tipo === 'ISO') {
        ifcCamera.position.set(d * 1.3, d * 1.0, d * 1.3);
    } else if (tipo === 'FRONTAL') {
        ifcCamera.position.set(0, cy, d * 1.8);
    } else if (tipo === 'POSTERIOR') {
        ifcCamera.position.set(0, cy, -d * 1.8);
    } else if (tipo === 'LATERAL_IZQ') {
        ifcCamera.position.set(-d * 1.8, cy, 0);
    } else if (tipo === 'LATERAL_DER') {
        ifcCamera.position.set(d * 1.8, cy, 0);
    } else if (tipo === 'PLANTA') {
        ifcCamera.position.set(0, d * 2.2, 0.001);
    } else if (tipo === 'INFERIOR') {
        ifcCamera.position.set(0, -d * 2.2, 0.001);
    }

    ifcControls.target.copy(ifcModelBounds.center);
    ifcControls.update();
}

function alternarCuadriculaIFC() {
    if (ifcGridHelper) ifcGridHelper.visible = !ifcGridHelper.visible;
}

function alternarAristasIFC() {
    ifcEdgesVisible = !ifcEdgesVisible;
    ifcEdgesList.forEach(line => {
        if (line) line.visible = ifcEdgesVisible;
    });
    const btn = document.getElementById("btnToggleEdges");
    if (btn) {
        btn.style.color = ifcEdgesVisible ? "#cbd5e1" : "#ef4444";
        btn.style.borderColor = ifcEdgesVisible ? "#475569" : "#ef4444";
    }
}

// ==============================================================================
// HERRAMIENTA DE RECORRIDO EN PRIMERA PERSONA (WALK MODE CORREGIDA)
// ==============================================================================
function alternarModoCaminarIFC(cotaSueloManual = null) {
    isWalkModeActive = !isWalkModeActive;
    const btn = document.getElementById("btnToggleWalk");
    const pcHint = document.getElementById("walkPcHint");
    const touchDpad = document.getElementById("walkTouchContainer");
    const container = document.getElementById("modalIfcContainer");
    const esDispositivoTactil = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 992);

    if (isWalkModeActive) {
        desactivarModoMedicion();
        cerrarCardPropiedadesIFC();

        if (ifcControls) ifcControls.enabled = false;

        let cotaBase = 0;
        if (cotaSueloManual !== null) {
            cotaBase = cotaSueloManual;
        } else if (ifcBuildingStoreys.length > 0) {
            cotaBase = ifcBuildingStoreys[0].elevacion;
        } else {
            cotaBase = Math.max(0, ifcModelBounds.center.y - (ifcModelBounds.size.y / 2));
        }

        const alturaOjoHumano = cotaBase + 1.65;
        ifcCamera.position.set(0, alturaOjoHumano, 0.5);

        walkYaw = Math.PI;
        walkPitch = 0;
        aplicarRotacionCaminar();

        if (btn) {
            btn.style.background = "#10b981";
            btn.style.color = "#fff";
            const spanText = btn.querySelector(".btn-nav-text");
            if (spanText) spanText.innerText = "Caminando...";
        }

        if (container) container.style.cursor = "move";

        if (esDispositivoTactil) {
            if (touchDpad) touchDpad.style.display = "flex";
            if (pcHint) pcHint.style.display = "none";
        } else {
            if (pcHint) pcHint.style.display = "block";
            if (touchDpad) touchDpad.style.display = "none";
        }
    } else {
        desactivarModoCaminar();
    }
}

function desactivarModoCaminar() {
    isWalkModeActive = false;
    walkMovement.forward = false;
    walkMovement.backward = false;
    walkMovement.left = false;
    walkMovement.right = false;

    const btn = document.getElementById("btnToggleWalk");
    const pcHint = document.getElementById("walkPcHint");
    const touchDpad = document.getElementById("walkTouchContainer");
    const container = document.getElementById("modalIfcContainer");

    if (btn) {
        btn.style.background = "#1e293b";
        btn.style.color = "#10b981";
        const spanText = btn.querySelector(".btn-nav-text");
        if (spanText) spanText.innerText = "Caminar";
    }

    if (pcHint) pcHint.style.display = "none";
    if (touchDpad) touchDpad.style.display = "none";
    if (container) container.style.cursor = "grab";

    if (ifcControls) {
        ifcControls.enabled = true;
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(ifcCamera.rotation);
        ifcControls.target.copy(ifcCamera.position).add(forward.multiplyScalar(5));
        ifcControls.update();
    }
}

function aplicarRotacionCaminar() {
    if (!ifcCamera) return;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.x = walkPitch;
    euler.y = walkYaw;
    ifcCamera.quaternion.setFromEuler(euler);
}

function actualizarFisicaCaminar(delta) {
    if (!isWalkModeActive || !ifcCamera) return;

    const moveVector = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), walkYaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), walkYaw);

    if (walkMovement.forward) moveVector.add(forward);
    if (walkMovement.backward) moveVector.sub(forward);
    if (walkMovement.left) moveVector.sub(right);
    if (walkMovement.right) moveVector.add(right);

    if (moveVector.lengthSq() > 0) {
        moveVector.normalize();
        const step = moveVector.multiplyScalar(walkSpeed * delta);
        ifcCamera.position.add(step);
    }
}

function setupWalkKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
        if (!isWalkModeActive) return;
        const key = e.key.toLowerCase();
        if (key === 'w' || key === 'arrowup') walkMovement.forward = true;
        if (key === 's' || key === 'arrowdown') walkMovement.backward = true;
        if (key === 'a' || key === 'arrowleft') walkMovement.left = true;
        if (key === 'd' || key === 'arrowright') walkMovement.right = true;
    });

    window.addEventListener('keyup', (e) => {
        if (!isWalkModeActive) return;
        const key = e.key.toLowerCase();
        if (key === 'w' || key === 'arrowup') walkMovement.forward = false;
        if (key === 's' || key === 'arrowdown') walkMovement.backward = false;
        if (key === 'a' || key === 'arrowleft') walkMovement.left = false;
        if (key === 'd' || key === 'arrowright') walkMovement.right = false;
    });
}

function setupWalkTouchListeners() {
    const bindBtn = (id, direction) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        const startMove = (e) => {
            e.preventDefault();
            e.stopPropagation();
            walkMovement[direction] = true;
        };
        const endMove = (e) => {
            e.preventDefault();
            e.stopPropagation();
            walkMovement[direction] = false;
        };

        btn.addEventListener('pointerdown', startMove);
        btn.addEventListener('pointerup', endMove);
        btn.addEventListener('pointercancel', endMove);
        btn.addEventListener('pointerleave', endMove);
    };

    bindBtn('btnWalkForward', 'forward');
    bindBtn('btnWalkBackward', 'backward');
    bindBtn('btnWalkLeft', 'left');
    bindBtn('btnWalkRight', 'right');
}

// ==============================================================================
// HERRAMIENTA DE MEDICIÓN 3D PUNTO A PUNTO (TOUCH & MOUSE COMPATIBLE)
// ==============================================================================
function alternarModoMedicionIFC() {
    isMeasureToolActive = !isMeasureToolActive;
    const btn = document.getElementById("btnToggleMeasure");
    const card = document.getElementById("ifcMeasureCard");
    const container = document.getElementById("modalIfcContainer");

    if (isMeasureToolActive) {
        desactivarModoCaminar();
        cerrarPanelNivelesIFC();
        if (btn) {
            btn.style.background = "#0284c7";
            btn.style.color = "#fff";
            const spanText = btn.querySelector(".btn-nav-text");
            if (spanText) spanText.innerText = "Midiendo...";
        }
        if (card) card.style.display = "block";
        if (container) container.style.cursor = "crosshair";
        cerrarCardPropiedadesIFC();
        limpiarMedicionIFC();
    } else {
        desactivarModoMedicion();
    }
}

function desactivarModoMedicion() {
    isMeasureToolActive = false;
    const btn = document.getElementById("btnToggleMeasure");
    const card = document.getElementById("ifcMeasureCard");
    const container = document.getElementById("modalIfcContainer");

    if (btn) {
        btn.style.background = "#1e293b";
        btn.style.color = "#38bdf8";
        const spanText = btn.querySelector(".btn-nav-text");
        if (spanText) spanText.innerText = "Medir";
    }
    if (card) card.style.display = "none";
    if (container && !isWalkModeActive) container.style.cursor = "grab";
    limpiarMedicionIFC();
}

function limpiarMedicionIFC() {
    measurePoints = [];
    measureVisualObjects.forEach(obj => {
        if (ifcScene) ifcScene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
    });
    measureVisualObjects.length = 0;

    const status = document.getElementById("ifcMeasureStatus");
    const dataDiv = document.getElementById("ifcMeasureData");
    if (status) {
        status.innerText = "Toca o haz clic en el Punto A...";
        status.style.color = "#fbbf24";
    }
    if (dataDiv) dataDiv.style.display = "none";
}

function procesarClickMedicion(intersectPoint) {
    if (measurePoints.length >= 2) {
        limpiarMedicionIFC();
    }

    measurePoints.push(intersectPoint.clone());

    const sphereGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ 
        color: (measurePoints.length === 1) ? 0x38bdf8 : 0x10b981, 
        depthTest: false,
        depthWrite: false 
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    sphereMesh.renderOrder = 9999;
    sphereMesh.position.copy(intersectPoint);
    ifcScene.add(sphereMesh);
    measureVisualObjects.push(sphereMesh);

    const status = document.getElementById("ifcMeasureStatus");
    const dataDiv = document.getElementById("ifcMeasureData");

    if (measurePoints.length === 1) {
        if (status) {
            status.innerText = "📍 Punto A fijado. Toca el Punto B...";
            status.style.color = "#38bdf8";
        }
    } else if (measurePoints.length === 2) {
        const p1 = measurePoints[0];
        const p2 = measurePoints[1];

        const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const lineMat = new THREE.LineBasicMaterial({ 
            color: 0x10b981, 
            linewidth: 3, 
            depthTest: false,
            depthWrite: false 
        });
        const lineObj = new THREE.Line(lineGeo, lineMat);
        lineObj.renderOrder = 9998;
        ifcScene.add(lineObj);
        measureVisualObjects.push(lineObj);

        const distReal = p1.distanceTo(p2);
        const distY = Math.abs(p2.y - p1.y);
        const distXZ = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2));

        if (status) {
            status.innerText = "✅ Medición completada:";
            status.style.color = "#10b981";
        }
        if (dataDiv) {
            dataDiv.style.display = "block";
            document.getElementById("measureDistReal").innerText = `${distReal.toFixed(2)} m`;
            document.getElementById("measureDistY").innerText = `${distY.toFixed(2)} m`;
            document.getElementById("measureDistXZ").innerText = `${distXZ.toFixed(2)} m`;
        }
    }
}

// ==============================================================================
// HERRAMIENTA DE SECCIÓN Y CORTES 3D DINÁMICOS (CLIPPING)
// ==============================================================================
function alternarPanelCorteIFC() {
    const panel = document.getElementById("ifcSectionToolPanel");
    const btn = document.getElementById("btnToggleSectionBox");
    if (!panel) return;

    isSectionToolActive = !isSectionToolActive;
    panel.style.display = isSectionToolActive ? "block" : "none";
    if (btn) btn.style.background = isSectionToolActive ? "#10b981" : "#0284c7";

    if (!isSectionToolActive && ifcClippingPlane) {
        ifcClippingPlane.constant = 5000;
    } else {
        configurarPlanoCorte();
    }
}

function configurarPlanoCorte() {
    if (!ifcClippingPlane) return;
    const radios = document.getElementsByName("clipAxis");
    radios.forEach(r => { if (r.checked) ifcClipAxis = r.value; });

    let normal = new THREE.Vector3(0, -1, 0);
    if (ifcClipAxis === 'X') normal.set(-1, 0, 0);
    else if (ifcClipAxis === 'Z') normal.set(0, 0, -1);

    if (ifcClipInverted) normal.negate();
    ifcClippingPlane.normal.copy(normal);

    const slider = document.getElementById("clipSlider");
    if (slider) actualizarPosicionCorte(slider.value);
}

function actualizarPosicionCorte(valPercent) {
    if (!ifcClippingPlane) return;
    const pct = parseFloat(valPercent) / 100;
    let min = 0, max = 0;

    if (ifcClipAxis === 'Y') {
        min = 0;
        max = ifcModelBounds.size.y || 20;
    } else if (ifcClipAxis === 'X') {
        min = -ifcModelBounds.size.x / 2;
        max = ifcModelBounds.size.x / 2;
    } else if (ifcClipAxis === 'Z') {
        min = -ifcModelBounds.size.z / 2;
        max = ifcModelBounds.size.z / 2;
    }

    const currentPos = min + (max - min) * pct;
    ifcClippingPlane.constant = ifcClipInverted ? -currentPos : currentPos;
}

function invertirPlanoCorte() {
    ifcClipInverted = !ifcClipInverted;
    configurarPlanoCorte();
}

// ==============================================================================
// INSPECCIÓN DE PROPIEDADES BIM Y DISPATCHER DE CLICS / TOQUES
// ==============================================================================
function onIfcModelClick(event) {
    if (!ifcRenderer || !ifcCamera) return;

    const rect = ifcRenderer.domElement.getBoundingClientRect();
    mousePointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mousePointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mousePointer, ifcCamera);
    
    const mallasValidas = ifcMeshesList.filter(m => m.visible);
    const intersects = raycaster.intersectObjects(mallasValidas, false);

    if (intersects.length > 0) {
        let hit = null;
        for (let i = 0; i < intersects.length; i++) {
            const p = intersects[i].point;
            if (ifcClippingPlane && isSectionToolActive) {
                if (ifcClippingPlane.distanceToPoint(p) >= 0) {
                    hit = intersects[i];
                    break;
                }
            } else {
                hit = intersects[i];
                break;
            }
        }

        if (!hit) return;

        if (isMeasureToolActive) {
            procesarClickMedicion(hit.point);
            return;
        }

        resaltarElementoIFC(hit.object);
        mostrarPropiedadesElementoIFC(hit.object.userData);
    }
}

function resaltarElementoIFC(mesh) {
    if (highlightedMesh && originalMaterial) {
        highlightedMesh.material = originalMaterial;
    }
    highlightedMesh = mesh;
    originalMaterial = mesh.material;

    mesh.material = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.2,
        metalness: 0.1,
        side: THREE.DoubleSide,
        clippingPlanes: [ifcClippingPlane]
    });
}

function mostrarPropiedadesElementoIFC(userData) {
    const card = document.getElementById("ifcPropertyCard");
    const title = document.getElementById("ifcPropTitle");
    const content = document.getElementById("ifcPropContent");
    if (!card || !content) return;

    card.style.display = "block";
    title.innerText = `Elemento BIM (ID: ${userData.expressID || 'N/A'})`;

    let html = `
        <div style="margin-bottom: 4px;"><strong>ExpressID:</strong> ${userData.expressID}</div>
        <div style="margin-bottom: 4px;"><strong>Modelo ID:</strong> ${userData.modelID}</div>
        <div style="margin-bottom: 4px;"><strong>Norma:</strong> ISO 19650 Compliance</div>
    `;

    if (ifcApiInstance && userData.modelID !== undefined && userData.expressID !== undefined) {
        try {
            const props = ifcApiInstance.GetLine(userData.modelID, userData.expressID);
            if (props) {
                html += `
                    <div style="margin-bottom: 4px;"><strong>Tipo IFC:</strong> ${props.__proto__.constructor.name || 'IfcElement'}</div>
                    ${props.Name ? `<div><strong>Nombre:</strong> ${props.Name.value}</div>` : ''}
                    ${props.ObjectType ? `<div><strong>Objeto:</strong> ${props.ObjectType.value}</div>` : ''}
                `;
            }
        } catch (e) {
            console.warn("Propiedad no consultable directamente:", e);
        }
    }

    content.innerHTML = html;
}

function cerrarCardPropiedadesIFC() {
    const card = document.getElementById("ifcPropertyCard");
    if (card) card.style.display = "none";
    if (highlightedMesh && originalMaterial) {
        highlightedMesh.material = originalMaterial;
        highlightedMesh = null;
        originalMaterial = null;
    }
}

// ==============================================================================
// RENDERIZADO DE ENTREGABLES CON EXCLUSIÓN DE EVENTOS DE AUDITORÍA
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
        listaAProcesar = files.filter(f => f.estado_origen === "04_ARCHIVED" || f.estado_destino === "04_ARCHIVED" || f.archivo_nombre.includes("_OLD_"));
    } else {
        const mapaUnicos = new Map();
        files.forEach(f => {
            if (
                f.archivo_nombre.startsWith("ACTA_DECISION_CLIENTE") || 
                f.archivo_nombre.startsWith("NOTA_TECNICA_") ||
                f.archivo_nombre.startsWith("CARGA DE ENTREGABLE") ||
                f.archivo_nombre.startsWith("PROMOCIÓN_")
            ) return;

            if (f.archivo_nombre.includes("_OLD_")) return;

            const eDestino = f.estado_destino || "";
            const eOrigen = f.estado_origen || "";
            let perteneceAPestana = (eDestino === activeTab || eOrigen === activeTab);

            const partes = f.archivo_nombre.split("_");
            if (!perteneceAPestana && partes.length >= 6) {
                const codigoEstado = partes[5].split(".")[0].toUpperCase();
                const estadosValidosPublished = ["CR", "ACT", "AP", "CON"];
                if (activeTab === "01_WIP" && (codigoEstado === "S0" || eOrigen === "01_WIP")) perteneceAPestana = true;
                if (activeTab === "02_SHARED" && (codigoEstado.startsWith("S") || eOrigen === "02_SHARED")) perteneceAPestana = true;
                if (activeTab === "03_PUBLISHED" && (codigoEstado.startsWith("A") || estadosValidosPublished.includes(codigoEstado) || eOrigen === "03_PUBLISHED")) perteneceAPestana = true;
            }

            if (perteneceAPestana && !mapaUnicos.has(f.archivo_nombre)) {
                mapaUnicos.set(f.archivo_nombre, f);
            }
        });

        listaAProcesar = Array.from(mapaUnicos.values());
    }

    if (activeSubfolder !== "TODAS" && activeTab !== "04_ARCHIVED") {
        listaAProcesar = listaAProcesar.filter(f => {
            const nameUpper = f.archivo_nombre.toUpperCase();
            const esInstalacion = ["_MEP_", "_HID_", "_SAN_", "_ELE_", "_MEC_", "_PCI_", "_GAS_", "_VAC_"].some(tag => nameUpper.includes(tag));
            if (activeTab === "01_WIP") {
                if (activeSubfolder === "ARQ_Arquitectura") return nameUpper.includes("_ARQ_");
                if (activeSubfolder === "EST_Estructura") return nameUpper.includes("_EST_");
                if (activeSubfolder === "MEP_Instalaciones") return esInstalacion;
            } else if (activeTab === "02_SHARED") {
                if (activeSubfolder === "01_Modelos_3D") return nameUpper.includes("_M3_") || nameUpper.endsWith(".IFC") || nameUpper.endsWith(".RVT");
                if (activeSubfolder === "02_Planos_Coordinados") return nameUpper.includes("_PL_") || nameUpper.includes("_DR_") || nameUpper.includes("_IM_") || nameUpper.includes("_VI_") || nameUpper.endsWith(".DWG");
                if (activeSubfolder === "03_Informes_Interferencias") return !nameUpper.includes("_M3_") && !nameUpper.includes("_PL_") && !nameUpper.includes("_IM_") && !nameUpper.includes("_VI_") && !nameUpper.endsWith(".DWG");
            } else if (activeTab === "03_PUBLISHED") {
                if (activeSubfolder === "01_Modelos_Aprobados") return nameUpper.includes("_M3_") || nameUpper.endsWith(".IFC");
                if (activeSubfolder === "02_Planos_Contractuales") return nameUpper.includes("_PL_") || nameUpper.includes("_DR_") || nameUpper.includes("_IM_") || nameUpper.includes("_VI_");
                if (activeSubfolder === "03_Actas_y_Memorias") return nameUpper.includes("_ACT_") || nameUpper.includes("ACTA") || nameUpper.includes("_MEM_") || nameUpper.includes("_INF_") || (!nameUpper.includes("_M3_") && !nameUpper.includes("_PL_") && !nameUpper.includes("_IM_") && !nameUpper.includes("_VI_"));
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
        const esVisualizable = ["pdf", "png", "jpg", "jpeg", "webp", "html", "htm", "mp4", "webm", "mov", "ifc"].includes(ext);
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

// Helpers Modales Proyectos
async function prepareAndOpenProjectModal() {
    registrarAperturaModalEnHistorial("projectModal");
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
    if (modal) {
        modal.style.display = "flex";
        modal.classList.remove("modal-hidden");
        modal.classList.add("modal-overlay");
    }
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
    return !(!val || val.length < 3 || /^\d+$/.test(val));
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

function closeProjectModal(triggerHistory = true) {
    const modal = document.getElementById("projectModal");
    if (modal) {
        modal.style.display = "none";
        modal.classList.remove("modal-overlay");
        modal.classList.add("modal-hidden");
    }
    modalActivoId = null;
    if (triggerHistory && window.history.state && window.history.state.modalOpen) {
        window.history.back();
    }
}
