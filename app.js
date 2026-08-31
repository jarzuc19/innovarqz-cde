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

    // Eventos para desplegables con opción "Otro"
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
// GESTIÓN DE PROYECTOS (DESDUPLICADOS Y ACTIVOS)
// ==============================================================================
async function loadProjects() {
    const { data: proyectos, error } = await supabaseClient
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
// MODAL DE NUEVO PROYECTO (AUTOGENERACIÓN CÓDIGO Y VALIDACIÓN)
// ==============================================================================
async function prepareAndOpenProjectModal() {
    const yearCurrent = new Date().getFullYear();
    const prefix = `PRY${yearCurrent}`;

    // Obtener proyectos existentes para calcular el correlativo
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
        inputCodigo.readOnly = true; // Bloqueado para garantizar consistencia
    }

    document.getElementById("projectModal").className = "modal-overlay";
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
    if (/^\d+$/.test(val)) return false; // Bloquea si son solo números como "0", "1", "00"
    return true;
}

async function handleCreateProject(e) {
    e.preventDefault();
    
    const codigo = document.getElementById("codigoProj").value.trim();
    const cliente = document.getElementById("clienteProj").value.trim();
    const ubicacion = obtenerValorCampo("ubicacionSelect", "ubicacionOtherInput");
    const tipoObra = obtenerValorCampo("tipoSelect", "tipoOtherInput");

    // Validaciones estrictas antes de enviar
    if (!esValidoTextoCampo(cliente)) {
        alert("⚠️ El nombre del cliente no es válido (Mínimo 3 caracteres, no solo números).");
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

    alert("Creando estructura normativa ISO 19650 en Google Drive...");

    try {
        await fetch(WEBHOOK_APPS_SCRIPT, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        closeProjectModal();
        alert("¡Creado con éxito! Actualizando lista de proyectos...");
        setTimeout(() => loadProjects(), 3000);
    } catch (err) {
        alert("Error al enviar la orden al servidor: " + err.message);
    }
}

function closeProjectModal() {
    const modal = document.getElementById("projectModal");
    if (modal) modal.className = "modal-hidden";
}

// ==============================================================================
// GESTIÓN Y RENDERIZADO DE ENTREGABLES ISO 19650
// ==============================================================================
async function loadFiles() {
    const tbody = document.getElementById("filesTableBody");
    if (!tbody) return;

    if (!activeProjectId) {
        tbody.innerHTML = '<tr><td colspan="5">Seleccione un proyecto para visualizar los entregables.</td></tr>';
        return;
    }

    const { data: files, error } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("estado_destino", activeTab)
        .order("creado_en", { ascending: false });

    tbody.innerHTML = "";

    if (error || !files || files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No hay entregables registrados en la pestaña <strong>${activeTab}</strong>.</td></tr>`;
        return;
    }

    // Filtrar entregables pertenecientes al proyecto seleccionado
    const archivosFiltrados = files.filter(f => {
        if (!f.proyecto_id && !f.codigo_proyecto) return true;
        return f.proyecto_id === activeProjectId || 
               f.proyecto_id === activeProjectCode || 
               f.codigo_proyecto === activeProjectCode ||
               f.codigo_proyecto === activeProjectId;
    });

    if (archivosFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">No hay entregables registrados en la pestaña <strong>${activeTab}</strong> para este proyecto.</td></tr>`;
        return;
    }

    // Mapa de desduplicación por archivo_nombre
    const archivosUnicos = new Map();
    archivosFiltrados.forEach(f => {
        if (!archivosUnicos.has(f.archivo_nombre)) {
            archivosUnicos.set(f.archivo_nombre, f);
        }
    });

    archivosUnicos.forEach(f => {
        const nombreCompleto = f.archivo_nombre || "";
        // Desglose sintáctico por guion bajo (_) [PROY]_[ORIG]_[ZONA]_[TIPO]_[DISC]_[ESTADO]
        const parts = nombreCompleto.split("_");
        
        const esValidoISO = parts.length >= 6;
        const disciplina = esValidoISO ? parts[4] : "SIN_FORMATO";
        const estadoISO = esValidoISO ? parts[5].split(".")[0] : activeTab;

        if (esValidoISO) {
            // Archivo Conforme: Habilita Ver y Descargar
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
            // Archivo No Conforme: Oculta botones y muestra advertencia
            tbody.innerHTML += `
                <tr style="background-color: rgba(239, 68, 68, 0.05);">
                    <td style="color: #ef4444;">${nombreCompleto}</td>
                    <td><strong style="color: #ef4444;">${disciplina}</strong></td>
                    <td><span class="badge" style="background: #ef4444;">NO_CONFORME</span></td>
                    <td>${f.version || 'V1.0'}</td>
                    <td>
                        <small style="color: #ef4444; display: block; line-height: 1.2;">⚠️ Renombrar bajo norma ISO 19650 ([PROY]_[ORIG]_[ZONA]_[TIPO]_[DISC]_[EST]) para habilitar gestión.</small>
                    </td>
                </tr>
            `;
        }
    });
}
```[cite: 1, 4]

---

### Código Completo 2: `Código.gs` (Google Apps Script - Servidor)

Reemplaza todo el contenido en Google Apps Script por esta versión con validaciones estrictas y codificación de URLs[cite: 1]:

```javascript
// ==============================================================================
// CONFIGURACIÓN CENTRALIZADA — CDE INNOVARQZ S.A.S.
// ==============================================================================
const SUPABASE_URL = "https://bjlqtzrcrofpqlmyvoob.supabase.co";
const SUPABASE_KEY = "sb_publishable_htPtQvL-1wrLfu7ACHBg1w_epAZsu1E"; 
const CARPETA_RAIZ_ID = "1ELTffWYnIrYphB_WswY3le7WIKDfTTyQ"; // Carpeta Maestra

// ==============================================================================
// 1. WEBHOOK API (doPost): CREACIÓN AUTÓNOMA DE PROYECTOS ISO 19650
// ==============================================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const accion = data.accion;

    if (accion === "CREAR_PROYECTO") {
      const codigo = data.codigo_proyecto;
      const cliente = data.cliente;
      const ubicacion = data.ubicacion;
      const tipoObra = data.tipo_obra;

      // Validación estricta de nomenclatura antes de crear la carpeta
      if (!validarEstructuraCarpetaProyecto(codigo, cliente, ubicacion, tipoObra)) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: "Nombre inválido. Debe seguir estrictamente: [CODIGO]_[CLIENTE]_[UBICACION]_[TIPO]"
        })).setMimeType(ContentService.MimeType.JSON);
      }

      const nombreCarpetaRaiz = `${codigo}_${cliente}_${ubicacion}_${tipoObra}`;
      const carpetaRaizMaestra = DriveApp.getFolderById(CARPETA_RAIZ_ID);

      // Crear carpetas en Drive
      const nuevaCarpetaProyecto = carpetaRaizMaestra.createFolder(nombreCarpetaRaiz);
      const proyectoFolderId = nuevaCarpetaProyecto.getId();

      nuevaCarpetaProyecto.createFolder("01_WIP");
      nuevaCarpetaProyecto.createFolder("02_SHARED");
      nuevaCarpetaProyecto.createFolder("03_PUBLISHED");
      nuevaCarpetaProyecto.createFolder("04_ARCHIVED");

      // Registrar en Supabase
      actualizarEstadoProyectoEnSupabase(codigo, nombreCarpetaRaiz, proyectoFolderId, true);

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Estructura ISO 19650 creada exitosamente.",
        codigo_proyecto: codigo,
        drive_folder_id: proyectoFolderId
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Acción no reconocida."
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function validarEstructuraCarpetaProyecto(codigo, cliente, ubicacion, tipoObra) {
  if (!codigo || !cliente || !ubicacion || !tipoObra) return false;
  
  // Prohibir que cliente, ubicación o tipo sean números aislados como "0", "1", "00"
  if (/^\d+$/.test(cliente) || /^\d+$/.test(ubicacion) || /^\d+$/.test(tipoObra)) return false;
  if (cliente.length < 3 || ubicacion.length < 3 || tipoObra.length < 3) return false;

  const regexCodigo = /^[A-Z0-9\-]+$/i;
  const regexTexto = /^[A-Za-zÁÉÍÓÚáéíóúÑñ0-9\-]+$/;
  return regexCodigo.test(codigo) && regexTexto.test(cliente) && regexTexto.test(ubicacion) && regexTexto.test(tipoObra);
}

// ==============================================================================
// 2. SINCRONIZACIÓN AUTOMÁTICA RECURSIVA
// ==============================================================================
function sincronizarCDEConSupabase() {
  const carpetaRaiz = DriveApp.getFolderById(CARPETA_RAIZ_ID);
  const carpetasProyectos = carpetaRaiz.getFolders();
  let folderIdsEnDrive = [];

  while (carpetasProyectos.hasNext()) {
    let proyectoFolder = carpetasProyectos.next();
    let nombreProyectoFolder = proyectoFolder.getName();
    let codigoProyecto = extraerCodigoProyecto(nombreProyectoFolder);
    let folderId = proyectoFolder.getId();

    folderIdsEnDrive.push(folderId);

    actualizarEstadoProyectoEnSupabase(codigoProyecto, nombreProyectoFolder, folderId, true);
    recorrerSubcarpetas(proyectoFolder, codigoProyecto, "");
  }

  desactivarProyectosEliminados(folderIdsEnDrive);
}

function recorrerSubcarpetas(carpetaPadre, codigoProyecto, estadoActual) {
  let subcarpetas = carpetaPadre.getFolders();
  
  while (subcarpetas.hasNext()) {
    let sub = subcarpetas.next();
    let nombreSub = sub.getName();
    let nuevoEstado = estadoActual ? estadoActual : nombreSub;

    let archivos = sub.getFiles();
    while (archivos.hasNext()) {
      let archivo = archivos.next();
      registrarArchivoEnSupabase(codigoProyecto, nuevoEstado, archivo);
    }

    recorrerSubcarpetas(sub, codigoProyecto, nuevoEstado);
  }
}

// ==============================================================================
// 3. COMUNICACIÓN HTTP Y BÚSQUEDA DE PROYECTOS
// ==============================================================================
function extraerCodigoProyecto(nombreCarpeta) {
  if (nombreCarpeta && nombreCarpeta.includes("_")) {
    return nombreCarpeta.split("_")[0];
  }
  return nombreCarpeta;
}

function actualizarEstadoProyectoEnSupabase(codigo, nombre, folderId, activo) {
  const url = `${SUPABASE_URL}/rest/v1/proyectos`;
  const payload = {
    codigo_proyecto: codigo,
    nombre: nombre,
    drive_folder_id: folderId,
    activo: activo
  };
  const options = {
    method: "post",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch(url, options);
}

function desactivarProyectosEliminados(folderIdsActuales) {
  const urlGet = `${SUPABASE_URL}/rest/v1/proyectos?select=id,drive_folder_id`;
  const optionsGet = {
    method: "get",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`
    }
  };
  
  try {
    const res = UrlFetchApp.fetch(urlGet, optionsGet);
    const proyectosBD = JSON.parse(res.getContentText());

    proyectosBD.forEach(p => {
      if (p.drive_folder_id && !folderIdsActuales.includes(p.drive_folder_id)) {
        const urlPatch = `${SUPABASE_URL}/rest/v1/proyectos?id=eq.${p.id}`;
        const optionsPatch = {
          method: "patch",
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json"
          },
          payload: JSON.stringify({ activo: false }),
          muteHttpExceptions: true
        };
        UrlFetchApp.fetch(urlPatch, optionsPatch);
      }
    });
  } catch (e) {
    Logger.log("Error al desactivar proyectos: " + e.toString());
  }
}

function registrarArchivoEnSupabase(codigoProyecto, estadoISO, archivo) {
  const url = `${SUPABASE_URL}/rest/v1/audit_logs`;
  const proyectoUUID = obtenerIdProyectoPorCodigo(codigoProyecto);

  const payload = {
    proyecto_id: proyectoUUID,
    codigo_proyecto: codigoProyecto,
    archivo_nombre: archivo.getName(),
    version: "V1.0",
    estado_origen: estadoISO,
    estado_destino: estadoISO,
    drive_file_url: archivo.getUrl()
  };

  const options = {
    method: "post",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=ignore-duplicates"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch(url, options);
}

function obtenerIdProyectoPorCodigo(codigo) {
  try {
    const codigoLimpio = encodeURIComponent(codigo.trim());
    const url = `${SUPABASE_URL}/rest/v1/proyectos?codigo_proyecto=eq.${codigoLimpio}&select=id`;
    
    const options = {
      method: "get",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    };
    
    const res = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(res.getContentText());
    if (data && data.length > 0) return data[0].id;
  } catch(e) {
    Logger.log("Error obteniendo UUID del proyecto: " + e.toString());
  }
  return null;
}
```[cite: 1]

---

### Mantenimiento Rápido en Supabase (Opcional)

Para limpiar los datos de prueba anteriores y arrancar con la base limpia, ejecuta esto en el **SQL Editor** de Supabase[cite: 1]:

```sql
TRUNCATE TABLE public.audit_logs CASCADE;
DELETE FROM public.proyectos WHERE codigo_proyecto LIKE 'PRY%';
```[cite: 1]

Una vez guardados los archivos, publica una **nueva versión** de la implementación en Apps Script y recarga el navegador en `[https://cde.innovarqzsas.com/](https://cde.innovarqzsas.com/)`[cite: 1, 4].
