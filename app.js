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

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    if (loginForm) loginForm.addEventListener("submit", handleLogin);

    const projectSelect = document.getElementById("projectSelect");
    if (projectSelect) projectSelect.addEventListener("change", handleProjectChange);

    const btnNewProject = document.getElementById("btnNewProject");
    if (btnNewProject) btnNewProject.addEventListener("click", prepareAndOpenProjectModal);

    const createProjectForm = document.getElementById("createProjectForm");
    if (createProjectForm) createProjectForm.addEventListener("submit", handleCreateProject);

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            activeTab = e.target.dataset.tab;
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
        alert("Usuario no registrado en la base de datos.");
        return;
    }

    currentUser = user;
    document.getElementById("userInfo").innerHTML = `
        <strong>${user.nombre_completo}</strong><br>
        <small style="color: var(--accent-copper);">${user.cargo || 'SuperAdmin'}</small>
    `;

    document.getElementById("loginView").style.display = "none";
    document.getElementById("dashboardView").style.display = "block";

    loadProjects();
}

async function loadProjects() {
    // Filtrado estricto: Solo cargar proyectos asignados al usuario activo
    const { data: permisos } = await supabaseClient
        .from("permisos_proyecto")
        .select("proyecto_id, proyectos(*)")
        .eq("usuario_id", currentUser.id);

    const select = document.getElementById("projectSelect");
    select.innerHTML = '<option value="">-- Seleccionar Proyecto --</option>';

    if (permisos && permisos.length > 0) {
        permisos.forEach(p => {
            if (p.proyectos && p.proyectos.activo) {
                select.innerHTML += `<option value="${p.proyectos.id}" data-code="${p.proyectos.codigo_proyecto}">${p.proyectos.nombre}</option>`;
            }
        });
    } else if (currentUser.cargo === "SUPER_ADMIN" || currentUser.cargo?.includes("Director General")) {
        const { data: todosProyectos } = await supabaseClient.from("proyectos").select("*").eq("activo", true);
        todosProyectos.forEach(pr => {
            select.innerHTML += `<option value="${pr.id}" data-code="${pr.codigo_proyecto}">${pr.nombre}</option>`;
        });
    }
}

async function handleProjectChange(e) {
    activeProjectId = e.target.value;
    activeProjectCode = e.target.options[e.target.selectedIndex]?.getAttribute("data-code");

    if (!activeProjectId) return;

    // Validación de seguridad de la matriz de permisos por proyecto
    const { data: permiso } = await supabaseClient
        .from("permisos_proyecto")
        .select("*")
        .eq("usuario_id", currentUser.id)
        .eq("proyecto_id", activeProjectId)
        .single();

    if (!permiso && (currentUser.cargo === "SUPER_ADMIN" || currentUser.cargo?.includes("Director General"))) {
        userPermissions = { permiso_wip: true, permiso_shared: true, permiso_published: true };
    } else {
        userPermissions = permiso || { permiso_wip: false, permiso_shared: false, permiso_published: false };
    }

    aplicarRestriccionPestanas();
    cargarTimelineActividad();
    loadFiles();
}

function aplicarRestriccionPestanas() {
    const tabWip = document.querySelector('.tab-btn[data-tab="01_WIP"]');
    const tabShared = document.querySelector('.tab-btn[data-tab="02_SHARED"]');
    const tabPublished = document.querySelector('.tab-btn[data-tab="03_PUBLISHED"]');

    if (tabWip) tabWip.style.display = userPermissions.permiso_wip ? "inline-block" : "none";
    if (tabShared) tabShared.style.display = userPermissions.permiso_shared ? "inline-block" : "none";
    if (tabPublished) tabPublished.style.display = userPermissions.permiso_published ? "inline-block" : "none";

    const clientCard = document.getElementById("clientApprovalCard");
    if (clientCard) clientCard.style.display = (currentUser.cargo === "CLIENTE" && activeTab === "03_PUBLISHED") ? "block" : "none";
}

// ==============================================================================
// BARRA SUPERIOR DE ACTIVIDAD / HISTORIAL EN TIEMPO REAL
// ==============================================================================
async function cargarTimelineActividad() {
    let timelineDiv = document.getElementById("activityTimeline");
    if (!timelineDiv) {
        timelineDiv = document.createElement("div");
        timelineDiv.id = "activityTimeline";
        timelineDiv.className = "card";
        timelineDiv.style.cssText = "background: rgba(15, 23, 42, 0.6); padding: 10px 15px; margin-bottom: 1rem; border-left: 3px solid var(--accent-copper); font-size: 0.85rem;";
        document.querySelector(".tabs").after(timelineDiv);
    }

    const { data: logs } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("proyecto_id", activeProjectId)
        .order("created_at", { ascending: false })
        .limit(3);

    if (!logs || logs.length === 0) {
        timelineDiv.innerHTML = "🕒 <strong>Bitácora de Eventos:</strong> Sin registro de actividad reciente.";
        return;
    }

    let html = "🕒 <strong>Última Actividad Registrada:</strong><ul style='margin-left: 20px; margin-top: 5px;'>";
    logs.forEach(l => {
        const fecha = new Date(l.created_at).toLocaleString();
        html += `<li><strong>${fecha}</strong> — Archivo: <em>${l.archivo_nombre}</em> (Estado: ${l.estado_destino})</li>`;
    });
    html += "</ul>";
    timelineDiv.innerHTML = html;
}

// ==============================================================================
// GENERADOR DE ACTA PDF FORMAL Y APROBACIÓN DEL CLIENTE
// ==============================================================================
async function procesarAprobacionCliente(estadoAprobacion) {
    const observaciones = document.getElementById("clientComments").value.trim();

    if (estadoAprobacion === "RECHAZADO" && !observaciones) {
        alert("⚠️ Por favor explicite los ajustes requeridos.");
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
        }
    } else {
        // Solicitud de ajustes
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
        alert("🚨 Solicitud de ajustes notificada al equipo de diseño.");
    }
}

async function generarPDFActaRecibo(observaciones) {
    // Carga dinámica de PDF-LIB vía CDN
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
            if (!f.archivo_nombre.includes("ACTA_DECISION")) {
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
// CARGA Y RENDERIZADO DE ENTREGABLES ISO 19650
// ==============================================================================
async function loadFiles() {
    const tbody = document.getElementById("filesTableBody");
    if (!tbody || !activeProjectId) return;

    const { data: files, error } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("proyecto_id", activeProjectId)
        .eq("estado_destino", activeTab);

    tbody.innerHTML = "";

    if (error || !files || files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No hay entregables en la pestaña <strong>${activeTab}</strong>.</td></tr>`;
        return;
    }

    const archivosUnicos = new Map();
    files.forEach(f => {
        // Filtrar registros del sistema que no sean archivos reales
        if (!f.archivo_nombre.startsWith("ACTA_DECISION_CLIENTE")) {
            archivosUnicos.set(f.archivo_nombre, f);
        }
    });

    archivosUnicos.forEach(f => {
        const nombreCompleto = f.archivo_nombre || "";
        const parts = nombreCompleto.split("_");
        const esValidoISO = parts.length >= 6;
        const disciplina = esValidoISO ? parts[4] : "SIN_FORMATO";
        const estadoISO = esValidoISO ? parts[5].split(".")[0] : activeTab;

        const ext = nombreCompleto.split('.').pop().toLowerCase();
        const esVisualizable = ["pdf", "png", "jpg", "jpeg", "html", "htm"].includes(ext);

        tbody.innerHTML += `
            <tr>
                <td>${nombreCompleto}</td>
                <td><strong>${disciplina}</strong></td>
                <td><span class="badge">${estadoISO}</span></td>
                <td>${f.version || 'V1.0'}</td>
                <td>
                    ${esVisualizable ? `<button class="btn-secondary" onclick="openViewer('${f.drive_file_url}', '${nombreCompleto}')">Ver</button>` : ''}
                    <a href="${f.drive_file_url}" target="_blank" class="btn-primary" style="text-decoration:none; font-size: 0.8rem; padding: 0.4rem 0.8rem;">Descargar</a>
                </td>
            </tr>
        `;
    });
}
