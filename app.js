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
            
            const clientCard = document.getElementById("clientApprovalCard");
            if (clientCard && currentUser) {
                clientCard.style.display = (currentUser.cargo === "CLIENTE" && activeTab === "03_PUBLISHED") ? "block" : "none";
            }
            
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
// PROYECTOS Y CONFIGURACIÓN DE VISTA
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

    aplicarRestriccionPestanasVisuales();
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
}

// ==============================================================================
// HILO DE NOTAS TÉCNICAS
// ==============================================================================
async function evaluarNotasTecnicasActivas() {
    const card = document.getElementById("technicalNoteCard");
    if (!card || !activeProjectId) return;

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
        .limit(10);

    if (error || !notas || notas.length === 0) {
        card.style.display = "none";
        return;
    }

    card.style.display = "block";
    const ultimaNota = notas[0];
    const esSolicitudCliente = ultimaNota.archivo_nombre.includes("AJUSTES_SOLICITADOS");
    const esModelador = currentUser.cargo.includes("MODELADOR") || currentUser.cargo.includes("SUPER_ADMIN");

    if (esSolicitudCliente) {
        card.style.borderColor = "#ef4444";
        card.style.background = "rgba(239, 68, 68, 0.08)";
    } else if (ultimaNota.archivo_nombre.includes("CONFIRMADO_RECIBIDO")) {
        card.style.borderColor = "#10b981";
        card.style.background = "rgba(16, 185, 129, 0.08)";
    } else {
        card.style.borderColor = "#d97706";
        card.style.background = "rgba(217, 119, 6, 0.08)";
    }

    let html = `<h4 style="color: var(--accent-copper); margin-bottom: 10px;">💬 Hilo de Interacción y Notas Técnicas</h4>`;
    html += `<div style="max-height: 220px; overflow-y: auto; padding-right: 5px; margin-bottom: 12px;">`;

    const notasInvertidas = [...notas].reverse();
    notasInvertidas.forEach(n => {
        let tipo = n.archivo_nombre.replace("NOTA_TECNICA_", "");
        let colorTexto = "#f8fafc";
        let icono = "💬";

        if (tipo === "AJUSTES_SOLICITADOS") { colorTexto = "#ef4444"; icono = "🚨 Cliente:"; }
        else if (tipo === "CONFIRMADO_RECIBIDO") { colorTexto = "#10b981"; icono = "✅ Modelador:"; }
        else if (tipo === "SOLICITUD_REUNION") { colorTexto = "#d97706"; icono = "📅 Modelador:"; }

        html += `
            <div style="background: rgba(15, 23, 42, 0.6); padding: 8px 12px; border-radius: 6px; margin-bottom: 6px; border-left: 3px solid ${colorTexto};">
                <strong style="color: ${colorTexto}; font-size: 0.85rem;">${icono}</strong> 
                <span style="font-size: 0.88rem; color: #fff;">${n.drive_file_url}</span>
                <div style="text-align: right;"><small style="color: var(--text-muted); font-size: 0.72rem;">${n.version}</small></div>
            </div>
        `;
    });

    html += `</div>`;

    if (esModelador) {
        html += `
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #334155; display: flex; gap: 10px;">
                <button id="btnConfirmarLectura" class="btn-primary" style="background: #10b981; font-size: 0.82rem;">
                    ✅ Confirmar Lectura
                </button>
                <button id="btnSolicitarComite" class="btn-secondary" style="background: #d97706; color: #fff; font-size: 0.82rem;">
                    📅 Solicitar Comité Técnico
                </button>
            </div>
        `;
    } else {
        html += `<small style="color: var(--text-muted); display: block; margin-top: 5px;"><em>Vista de supervisión para Revisor / SuperAdmin.</em></small>`;
    }

    card.innerHTML = html;

    const btnConfirmar = document.getElementById("btnConfirmarLectura");
    if (btnConfirmar) {
        btnConfirmar.onclick = function() {
            responderNotaTecnica('CONFIRMADO_RECIBIDO', 'Entendido. Se inician ajustes en modelos nativos.');
        };
    }

    const btnComite = document.getElementById("btnSolicitarComite");
    if (btnComite) {
        btnComite.onclick = function() {
            responderNotaTecnica('SOLICITUD_REUNION', 'Solicitud de mesa de trabajo técnica para aclarar observaciones.');
        };
    }
}

async function responderNotaTecnica(tipoRespuesta, comentario) {
    if (!confirm("¿Confirma registrar esta respuesta en la bitácora del proyecto?")) return;

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
        .ilike("archivo_nombre", "NOTA_TECNICA_%")
        .order("id", { ascending: false })
        .limit(15);

    if (error || !logs || logs.length === 0) {
        timelineDiv.style.display = "block";
        timelineDiv.innerHTML = "🕒 <strong>Bitácora de Eventos:</strong> El proyecto se encuentra sin actividad registrada.";
        return;
    }

    timelineDiv.style.display = "block";
    let html = "🕒 <strong>Bitácora de Eventos e Interacciones (ISO 19650):</strong><ul style='margin-left: 20px; margin-top: 5px; list-style-type: square;'>";
    
    logs.forEach(l => {
        const fecha = l.version || "Sin fecha";
        let eventoNombre = l.archivo_nombre.replace("NOTA_TECNICA_", "");
        
        let icono = "💬";
        let estiloTexto = "color: #fbbf24;";

        if (eventoNombre.includes("CARGA")) { icono = "📄"; estiloTexto = "color: #38bdf8;"; }
        else if (eventoNombre.includes("PROMOCIÓN")) { icono = "🚀"; estiloTexto = "color: #34d399;"; }
        else if (eventoNombre.includes("AJUSTES")) { icono = "🚨"; estiloTexto = "color: #f87171;"; }

        html += `<li style='${estiloTexto}'><strong>${fecha}</strong> — ${icono} <strong>[${eventoNombre}]</strong>: <em>${l.drive_file_url}</em></li>`;
    });
    
    html += "</ul>";
    timelineDiv.innerHTML = html;
}

// ==============================================================================
// SUBIDA DE ARCHIVOS POR FRAGMENTOS ULTRA-LIGEROS (1.5 MB)
// ==============================================================================
function openUploadModal() {
    const modal = document.getElementById("uploadModal");
    if (modal) modal.className = "modal-overlay";
}

function closeUploadModal() {
    const modal = document.getElementById("uploadModal");
    if (modal) modal.className = "modal-hidden";
}

function validarNomenclaturaISO19650(nombreArchivo) {
    const nombreSinExt = nombreArchivo.split('.').slice(0, -1).join('.');
    const partes = nombreSinExt.split('_');
    return partes.length >= 6;
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
    const fileInput = document.getElementById("fileInput");
    const targetTab = document.getElementById("uploadTargetTab").value;
    const btnSubmit = document.getElementById("btnSubmitUpload");

    if (!fileInput.files || fileInput.files.length === 0) {
        alert("Por favor seleccione un archivo.");
        return;
    }

    const file = fileInput.files[0];

    if (!validarNomenclaturaISO19650(file.name) && !file.name.endsWith(".html")) {
        alert(`❌ REGLA ISO 19650 INCUMPLIDA:\n\nEl archivo "${file.name}" no cumple con el estándar de denominación:\n[PROYECTO]_[ORIGINADOR]_[ZONA]_[TIPO]_[DISCIPLINA]_[ESTADO]\n\nEjemplo válido: PRY2026-001_INNOVARQZ_ZZ_M3_ARQ_S1.ifc`);
        return;
    }

    btnSubmit.disabled = true;

    // Fragmentos ultraligeros de 1.5 MB para prevenir fallos HTTP
    const chunkSize = 1.5 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);

    try {
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(file.size, start + chunkSize);
            const chunk = file.slice(start, end);

            const base64Chunk = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(chunk);
            });

            const porcentaje = Math.round(((i + 1) / totalChunks) * 100);
            btnSubmit.innerText = `Subiendo: ${porcentaje}% (${i + 1}/${totalChunks})`;

            const payload = {
                accion: "SUBIR_CHUNK",
                proyecto_id: activeProjectId,
                estado_destino: targetTab,
                nombre_archivo: file.name,
                chunk_base64: base64Chunk,
                chunk_index: i,
                total_chunks: totalChunks,
                es_ultimo: (i === totalChunks - 1),
                mime_type: file.type || "application/octet-stream",
                usuario_nombre: currentUser.nombre_completo
            };

            const res = await fetch(WEBHOOK_APPS_SCRIPT, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (data.status !== "success") {
                throw new Error(data.message || "Error procesando el bloque de modelo.");
            }

            if (data.completo) {
                alert("✅ ¡Modelo subido e integrado exitosamente al CDE!");
                closeUploadModal();
                loadFiles();
                cargarTimelineActividad();
            }
        }
    } catch (err) {
        alert("Error durante la transmisión: " + err.message);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = "Subir al CDE";
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
            alert("¡Promoción física en Drive y renombrado procesado exitosamente!");
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
    const observaciones = document.getElementById("clientComments").value.trim();

    if (estadoAprobacion === "RECHAZADO" && !observaciones) {
        alert("⚠️ Por favor ingrese sus observaciones especificando los ajustes requeridos.");
        return;
    }

    if (!confirm(`¿Confirma marcar este entregable como ${estadoAprobacion}?`)) return;

    if (estadoAprobacion === "APROBADO") {
        alert("Generando Acta de Recibo en PDF...");
        const pdfBase64 = await generarPDFActaRecibo(observaciones);

        const payload = {
            accion: "APROBACION_CLIENTE",
            proyecto_id: activeProjectId,
            codigo_proyecto: activeProjectCode,
            usuario_nombre: currentUser.nombre_completo,
            usuario_email: currentUser.email,
            estado_aprobacion: "APROBADO",
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
            alert("✅ Acta formal generada, notificada e integrada en Drive.");
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
            observaciones: observaciones
        };

        await fetch(WEBHOOK_APPS_SCRIPT, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });
        alert("🚨 Solicitud de ajustes notificada y registrada en la bitácora.");
        evaluarNotasTecnicasActivas();
        cargarTimelineActividad();
    }
}

async function generarPDFActaRecibo(observaciones) {
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
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    page.drawText("INNOVARQZ SOLUCIONES INTEGRALES S.A.S.", { x: 50, y: 750, size: 16, font, color: rgb(0.85, 0.47, 0.02) });
    page.drawText("ACTA DE RECIBO A SATISFACCIÓN Y FIRMA DE ENTREGABLES", { x: 50, y: 725, size: 12, font });

    const fechaStr = new Date().toLocaleString();
    page.drawText(`Proyecto: ${activeProjectCode}`, { x: 50, y: 680, size: 10, font: fontRegular });
    page.drawText(`Cliente: ${currentUser.nombre_completo} (${currentUser.email})`, { x: 50, y: 665, size: 10, font: fontRegular });
    page.drawText(`Fecha/Hora de Firma: ${fechaStr}`, { x: 50, y: 650, size: 10, font: fontRegular });

    page.drawText("Lista de Archivos Recibidos a Satisfacción:", { x: 50, y: 610, size: 11, font });

    const { data: files } = await supabaseClient.from("audit_logs").select("*").eq("proyecto_id", activeProjectId).eq("activo", true);

    let yPos = 585;
    if (files) {
        files.forEach(f => {
            if (!f.archivo_nombre.includes("ACTA_DECISION") && !f.archivo_nombre.includes("NOTA_TECNICA")) {
                page.drawText(`• ${f.archivo_nombre} (${f.version || 'V1.0'})`, { x: 60, y: yPos, size: 9, font: fontRegular });
                yPos -= 18;
            }
        });
    }

    page.drawText(`Observaciones del Cliente: ${observaciones || 'Sin observaciones'}`, { x: 50, y: yPos - 20, size: 10, font: fontRegular });
    page.drawText("________________________________________", { x: 50, y: 100, fontRegular });
    page.drawText("Firma Digital y Sello de Verificación CDE", { x: 50, y: 85, size: 9, font: fontRegular });

    const pdfBytes = await pdfDoc.saveAsBase64({ dataUri: false });
    return pdfBytes;
}

// ==============================================================================
// RENDERIZADO DE ENTREGABLES
// ==============================================================================
async function loadFiles() {
    const tbody = document.getElementById("filesTableBody");
    if (!tbody || !activeProjectId) return;

    if (!validarAccesoPestana(activeTab)) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444; font-weight:bold;">⛔ Acceso restringido a la carpeta ${activeTab} según su perfil de usuario.</td></tr>`;
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
        console.error("Error al consultar Supabase:", error);
        tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444;">Error al cargar datos: ${error.message}</td></tr>`;
        return;
    }

    if (!files || files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No hay entregables activos en esta carpeta.</td></tr>`;
        return;
    }

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

    if (mapaUnicos.size === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No hay entregables en la pestaña <strong>${activeTab}</strong> para este proyecto.</td></tr>`;
        return;
    }

    mapaUnicos.forEach(f => {
        const nombreCompleto = f.archivo_nombre || "";
        const parts = nombreCompleto.split("_");
        
        const esValidoISO = parts.length >= 6;
        const disciplina = esValidoISO ? parts[4] : "SIN_FORMATO";
        const estadoISO = esValidoISO ? parts[5].split(".")[0] : activeTab;

        const ext = nombreCompleto.split('.').pop().toLowerCase();
        const esVisualizable = ["pdf", "png", "jpg", "jpeg", "html", "htm"].includes(ext);
        const fechaUltimaModificacion = f.version || "N/A";

        let botonPromocion = "";
        if (currentUser && currentUser.cargo !== "CLIENTE") {
            if (activeTab === "01_WIP" && (currentUser.cargo.includes("MODELADOR") || currentUser.cargo.includes("SUPER_ADMIN") || currentUser.cargo.includes("BIM Manager"))) {
                botonPromocion = `<button class="btn-secondary" style="font-size:0.75rem; padding:0.3rem 0.6rem;" onclick="promoverArchivo('${nombreCompleto}', '01_WIP', '02_SHARED')">Promover a SHARED</button>`;
            } else if (activeTab === "02_SHARED" && (currentUser.cargo.includes("REVISOR") || currentUser.cargo.includes("SUPER_ADMIN") || currentUser.cargo.includes("BIM Manager"))) {
                botonPromocion = `<button class="btn-secondary" style="font-size:0.75rem; padding:0.3rem 0.6rem; background:#10b981; color:#fff;" onclick="promoverArchivo('${nombreCompleto}', '02_SHARED', '03_PUBLISHED')">Publicar a Cliente</button>`;
            }
        }

        if (esValidoISO || ext === "html") {
            tbody.innerHTML += `
                <tr>
                    <td>${nombreCompleto}</td>
                    <td><strong>${disciplina}</strong></td>
                    <td><span class="badge">${estadoISO}</span></td>
                    <td><small style="color:var(--text-muted);">${fechaUltimaModificacion}</small></td>
                    <td>
                        ${esVisualizable ? `<button class="btn-secondary" onclick="openViewer('${f.drive_file_url}', '${nombreCompleto}')">Ver</button>` : ''}
                        <a href="${f.drive_file_url}" target="_blank" class="btn-primary" style="text-decoration:none; font-size: 0.8rem; padding: 0.4rem 0.8rem;">Descargar</a>
                        ${botonPromocion}
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML += `
                <tr style="background-color: rgba(239, 68, 68, 0.05);">
                    <td style="color: #ef4444;">${nombreCompleto}</td>
                    <td><strong style="color: #ef4444;">${disciplina}</strong></td>
                    <td><span class="badge" style="background: #ef4444;">NO_CONFORME</span></td>
                    <td><small style="color:#ef4444;">${fechaUltimaModificacion}</small></td>
                    <td>
                        <small style="color: #ef4444; display: block; line-height: 1.2;">⚠️ Renombrar bajo ISO 19650 ([PROY]_[ORIG]_[ZONA]_[TIPO]_[DISC]_[EST])</small>
                    </td>
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
        const res = await fetch(WEBHOOK_APPS_SCRIPT, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });
        const responseData = await res.json();

        if (responseData.status === "success") {
            closeProjectModal();
            alert("¡Estructura generada exitosamente! Actualizando...");
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
