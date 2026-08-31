// ==============================================================================
// RENDERIZADO Y VALIDACIÓN SINTÁCTICA ISO 19650 (Nomenclatura por Guiones Bajos)
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

    const archivosUnicos = new Map();
    archivosFiltrados.forEach(f => {
        if (!archivosUnicos.has(f.archivo_nombre)) {
            archivosUnicos.set(f.archivo_nombre, f);
        }
    });

    archivosUnicos.forEach(f => {
        const nombreCompleto = f.archivo_nombre || "";
        // Desglose sintáctico por guion bajo (_) 
        // [PROYECTO]_[ORIGINADOR]_[ZONA_NIVEL]_[TIPO]_[DISCIPLINA]_[ESTADO]
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
                        <small style="color: #ef4444; display: block; margin-bottom: 4px;">⚠️ Renombrar bajo norma ISO 19650 (Usa guiones bajos)</small>
                        <a href="${f.drive_file_url}" target="_blank" class="btn-secondary" style="text-decoration:none; font-size: 0.75rem; padding: 0.2rem 0.5rem;">Descargar</a>
                    </td>
                </tr>
            `;
        }
    });
}
```[cite: 1, 4]

---

### 2. Validación en el Webhook de Google Apps Script (`Código.gs`)

Para la **creación de carpetas de proyectos**, la validación de la estructura del nombre (`[CODIGO_PROYECTO]_[CLIENTE]_[UBICACION]_[TIPO_OBRA]`) se implementa con una expresión regular que bloquea la creación si no se respetan los campos y los guiones bajos, devolviendo una alerta clara al usuario[cite: 1]:

```javascript
// Validación previa en doPost para la creación de proyectos
function validarEstructuraCarpetaProyecto(codigo, cliente, ubicacion, tipoObra) {
  // Verifica que los campos no contengan espacios vacíos indebidos y usen guiones medios o bajos adecuadamente
  const regexCodigo = /^[A-Z0-9\-]+$/i;
  const regexTexto = /^[A-Za-zÁÉÍÓÚáéíóúÑñ0-9\-]+$/;

  if (!regexCodigo.test(codigo) || !regexTexto.test(cliente) || !regexTexto.test(ubicacion) || !regexTexto.test(tipoObra)) {
    return false;
  }
  return true;
}
```[cite: 1]
