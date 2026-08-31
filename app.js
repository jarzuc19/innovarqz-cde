// ==============================================================================
// CONFIGURACIÓN CENTRALIZADA DE SERVICIOS - CDE INNOVARQZ S.A.S.
// ==============================================================================
const SUPABASE_URL = "https://bjlqtzrcrofpqlmyvoob.supabase.co";
const SUPABASE_KEY = "sb_publishable_htPtQvL-1wrLfu7ACHBg1w_epAZsu1E";
const WEBHOOK_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbzMVm1I9wM6NOMQQcv08A_nOJbBNO0RYldyixTydLLGIr6i1Xx_kmWpFFKNqodlBqqxGQ/exec";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let userPermissions = null;
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
    if (btnNewProject) btnNewProject.addEventListener("click", prepareAndOpenProjectModal);

    const createProjectForm = document.getElementById("createProjectForm");
    if (createProjectForm) createProjectForm.addEventListener("submit", handleCreateProject);

    setupDropdownWithOther("ubicacionSelect", "ubicacionOtherInput");
    setupDropdownWithOther("tipoSelect", "tipoOtherInput");

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            activeTab = e.target.dataset.tab;
            
            const clientCard = document.getElementById("clientApprovalCard");
            if (clientCard && currentUser) {
                clientCard.style.display = (currentUser.cargo === "CLIENTE" && activeTab === "03_PUBLISHED") ? "block" : "none";
            }
            
            loadFiles();
        });
    });
});

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("emailInput").value.trim();

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

    document.getElementById("userInfo").innerHTML = `
        <strong>${user.nombre_completo}</strong><br>
        <small style="color: var(--accent-copper);">${user.cargo || 'SuperAdmin'}</small>
    `;

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
}

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

    aplicarRestriccionPestanas();
    cargarTimelineActividad();
    loadFiles();
}

function aplicarRestriccionPestanas() {
    const tabWip = document.querySelector('.tab-btn[data-tab="01_WIP"]');
    const tabShared = document.querySelector('.tab-btn[data-tab="02_SHARED"]');
    const tabPublished = document.querySelector('.tab-btn[data-tab="03_PUBLISHED"]');
    const tabArchived = document.querySelector('.tab-btn[data-tab="04_ARCHIVED"]');

    if (tabWip) tabWip.style.display = userPermissions.permiso_wip ? "inline-block" : "none";
    if (tabShared) tabShared.style.display = userPermissions.permiso_shared ? "inline-block" : "none";
    if (tabPublished) tabPublished.style.display = userPermissions.permiso_published ? "inline-block" : "none";
    if (tabArchived) tabArchived.style.display = userPermissions.permiso_wip ? "inline-block" : "none";

    const clientCard = document.getElementById("clientApprovalCard");
    if (clientCard) {
        clientCard.style.display = (currentUser.cargo === "CLIENTE" && activeTab === "03_PUBLISHED") ? "block" : "none";
    }
}

// ==============================================================================
// BARRA SUPERIOR DE ACTIVIDAD / HISTORIAL EN TIEMPO REAL
// ==============================================================================
async function cargarTimelineActividad() {
    let timelineDiv = document.getElementById("activityTimeline");
    if (!timelineDiv) return;

    const { data: logs } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("proyecto_id", activeProjectId)
        .order("created_at", { ascending: false })
        .limit(5);

    if (!logs || logs.length === 0) {
        timelineDiv.style.display = "block";
        timelineDiv.innerHTML = "🕒 <strong>Bitácora de Eventos:</strong> Sin registro de actividad reciente para este proyecto.";
        return;
    }

    timelineDiv.style.display = "block";
    let html = "🕒 <strong>Bitácora de Eventos e Interacciones (ISO 19650):</strong><ul style='margin-left: 20px; margin-top: 5px; list-style-type: square;'>";
    logs.forEach(l => {
        const fecha = l.created_at ? new Date(l.created_at).toLocaleString() : l.version;
        if (l.archivo_nombre.startsWith("NOTA_TECNICA_")) {
            html += `<li style='color: #ef4444;'><strong>${fecha}</strong> — ⚠️ <strong>${l.drive_file_url}</strong></li>`;
        } else {
            html += `<li><strong>${fecha}</strong> — Entregable: <em>${l.archivo_nombre}</em> en <span class="badge" style="font-size:0.75rem;">${l.estado_destino}</span></li>`;
        }
    });
    html += "</ul>";
    timelineDiv.innerHTML = html;
}

// ==============================================================================
// SUBIDA DE ARCHIVOS CON REGLA ESTRICTA DE NOMENCLATURA ISO 19650
// ==============================================================================
function openUploadModal() {
    const modal = document.getElementById("uploadModal");
    if (modal) modal.className = "modal-overlay";
}

function closeUploadModal() {
    const modal = document.getElementById("uploadModal");
    if (modal) modal.className = "modal-hidden";
}

// VALIDADOR ESTRICTO DE NOMENCLATURA ISO 19650 ([PROY]_[ORIG]_[ZONA]_[TIPO]_[DISC]_[EST])
function validarNomenclaturaISO19650(nombreArchivo) {
    const nombreSinExt = nombreArchivo.split('.').slice(0, -1).join('.');
    const partes = nombreSinExt.split('_');
    return partes.length >= 6;
}

async function handleFileUpload(e) {
    e.preventDefault();
    const fileInput = document.getElementById("fileInput");
    const targetTab = document.getElementById("uploadTargetTab").value;
    const comment = document.getElementById("uploadComment").value;
    const btnSubmit = document.getElementById("btnSubmitUpload");

    if (!fileInput.files || fileInput.files.length === 0) {
        alert("Por favor seleccione un archivo.");
        return;
    }

    const file = fileInput.files[0];

    // REGLA FUNDAMENTAL ISO 19650: Bloqueo de subida si no cumple la nomenclatura
    if (!validarNomenclaturaISO19650(file.name) && !file.name.endsWith(".html")) {
        alert(`❌ REGLA ISO 19650 INCUMPLIDA:\n\nEl archivo "${file.name}" no cumple con el estándar de denominación:\n[PROYECTO]_[ORIGINADOR]_[ZONA]_[TIPO]_[DISCIPLINA]_[ESTADO]\n\nEjemplo válido: PRY2026-001_INNOVARQZ_ZZ_M3_ARQ_S1.ifc\n\nPor favor renómbrelo localmente antes de volver a subirlo.`);
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerText = "Subiendo archivo...";

    const reader = new FileReader();
    reader.onload = async function(event) {
        const base64Data = event.target.result.split(',')[1];

        const payload = {
            accion: "SUBIR_INFORME",
            proyecto_id: activeProjectId,
            codigo_proyecto: activeProjectCode,
            nombre_archivo: file.name,
            estado_destino: targetTab,
            usuario_email: currentUser.email,
            usuario_nombre: currentUser.nombre_completo,
            archivo_base64: base64Data,
            mime_type: file.type,
            comentario: comment
        };

        try {
            const res = await fetch(WEBHOOK_APPS_SCRIPT, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload)
            });
            const responseData = await res.json();

            if (responseData.status === "success") {
                alert("✅ Archivo subido e integrado exitosamente.");
                closeUploadModal();
                loadFiles();
                cargarTimelineActividad();
            } else {
                alert("⚠️ Error en servidor: " + responseData.message);
            }
        } catch (err) {
            alert("Error al subir archivo: " + err.message);
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerText = "Subir al CDE";
        }
    };
    reader.readAsDataURL(file);
}

async function promoverArchivo(nombreArchivo, estadoOrigen, estadoDestino) {
    if (!confirm(`¿Confirma promover el archivo "${nombreArchivo}" de ${estadoOrigen} a ${estadoDestino}?`)) return;

    const payload = {
        accion: "PROMOVER_ARCHIVO",
        proyecto_id: activeProjectId,
        codigo_proyecto: activeProjectCode,
        nombre_archivo: nombreArchivo,
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

    const { data: files } = await supabaseClient.from("audit_logs").select("*").eq("proyecto_id", activeProjectId).eq("estado_destino", "03_PUBLISHED");

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
// RENDERIZADO DE ENTREGABLES (MOSTRANDO TODAS LAS RE-SUBIDAS CON SU HORA)
// ==============================================================================
async function loadFiles() {
    const tbody = document.getElementById("filesTableBody");
    if (!tbody || !activeProjectId) return;

    const { data: files, error } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("proyecto_id", activeProjectId)
        .eq("estado_destino", activeTab)
        .order("created_at", { ascending: false });

    tbody.innerHTML = "";

    if (error || !files || files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No hay entregables en la pestaña <strong>${activeTab}</strong> para este proyecto.</td></tr>`;
        return;
    }

    files.forEach(f => {
        // Ignorar las notas técnicas internas en la lista principal
        if (f.archivo_nombre.startsWith("ACTA_DECISION_CLIENTE") || f.archivo_nombre.startsWith("NOTA_TECNICA_")) {
            return;
        }

        const nombreCompleto = f.archivo_nombre || "";
        const parts = nombreCompleto.split("_");
        
        const esValidoISO = parts.length >= 6;
        const disciplina = esValidoISO ? parts[4] : "SIN_FORMATO";
        const estadoISO = esValidoISO ? parts[5].split(".")[0] : activeTab;

        const ext = nombreCompleto.split('.').pop().toLowerCase();
        const esVisualizable = ["pdf", "png", "jpg", "jpeg", "html", "htm"].includes(ext);

        const fechaSubidaStr = f.created_at ? new Date(f.created_at).toLocaleString() : (f.version || "N/A");

        let botonPromocion = "";
        if (currentUser.cargo !== "CLIENTE") {
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
                    <td><small style="color:var(--text-muted);">${fechaSubidaStr}</small></td>
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
                    <td><small style="color:#ef4444;">${fechaSubidaStr}</small></td>
                    <td>
                        <small style="color: #ef4444; display: block; line-height: 1.2;">⚠️ Renombrar bajo ISO 19650 ([PROY]_[ORIG]_[ZONA]_[TIPO]_[DISC]_[EST])</small>
                    </td>
                </tr>
            `;
        }
    });
}

// Helpers para Modales de Proyectos
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
