// CONFIGURACIÓN DE SERVICIOS
const SUPABASE_URL = "https://bjlqtzrcrofpqlmyvoob.supabase.co";
const SUPABASE_KEY = "sb_publishable_htPtQvL-1wrLfu7ACHBg1w_epAZsu1E";
const WEBHOOK_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbyrLMTUnmYqkABhNTFQpQNGvmc0MpspzjvEv2EqUNklQ5a2jMxpRtytzuPwPwPwoyCWtQ/exec";

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let activeProject = null;
let activeTab = "01_WIP";

// INICIALIZACIÓN
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("loginForm").addEventListener("submit", handleLogin);
    document.getElementById("projectSelect").addEventListener("change", handleProjectChange);
    document.getElementById("btnNewProject").addEventListener("click", () => document.getElementById("projectModal").className = "modal-overlay");
    document.getElementById("createProjectForm").addEventListener("submit", handleCreateProject);

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
    const email = document.getElementById("emailInput").value;

    const { data: user, error } = await supabase
        .from("usuarios")
        .select("*")
        .eq("email", email)
        .single();

    if (error || !user) {
        alert("Usuario no registrado en CDE.");
        return;
    }

    currentUser = user;
    document.getElementById("userInfo").innerText = `${user.nombre_completo} (${user.empresa})`;
    document.getElementById("loginView").className = "dashboard-hidden";
    document.getElementById("dashboardView").className = "";

    if (user.cargo && user.cargo.includes("BIM Manager")) {
        document.getElementById("btnNewProject").style.display = "block";
    }

    loadProjects();
}

async function loadProjects() {
    const { data: proyectos } = await supabase.from("proyectos").select("*");
    const select = document.getElementById("projectSelect");
    select.innerHTML = '<option value="">-- Seleccionar --</option>';

    proyectos.forEach(p => {
        select.innerHTML += `<option value="${p.id}" data-code="${p.codigo_proyecto}">${p.nombre}</option>`;
    });
}

function handleProjectChange(e) {
    activeProject = e.target.value;
    loadFiles();
}

async function loadFiles() {
    if (!activeProject) return;

    const { data: files } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("estado_destino", activeTab);

    const tbody = document.getElementById("filesTableBody");
    tbody.innerHTML = "";

    if (!files || files.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No hay entregables en este estado.</td></tr>';
        return;
    }

    files.forEach(f => {
        const parts = f.archivo_nombre.split("-");
        const disciplina = parts[4] || "GEN";
        const estadoISO = parts[5] ? parts[5].split(".")[0] : "S0";

        tbody.innerHTML += `
            <tr>
                <td>${f.archivo_nombre}</td>
                <td><strong>${disciplina}</strong></td>
                <td><span class="badge">${estadoISO}</span></td>
                <td>${f.version}</td>
                <td>
                    <button onclick="openViewer('${f.drive_file_url}')">Ver</button>
                    <a href="${f.drive_file_url}" target="_blank">Descargar</a>
                </td>
            </tr>
        `;
    });
}

async function handleCreateProject(e) {
    e.preventDefault();
    const payload = {
        accion: "CREAR_PROYECTO",
        codigo_proyecto: document.getElementById("codigoProj").value,
        cliente: document.getElementById("clienteProj").value,
        ubicacion: document.getElementById("ubicacionProj").value,
        tipo_obra: document.getElementById("tipoProj").value
    };

    alert("Creando jerarquía ISO 19650 en Google Drive...");

    await fetch(WEBHOOK_APPS_SCRIPT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    closeProjectModal();
    setTimeout(() => loadProjects(), 3000);
}

function closeProjectModal() {
    document.getElementById("projectModal").className = "modal-hidden";
}
