// ==============================================================================
// BITÁCORA REAL (ACCIONES HUMANAS E INTERACCIONES CRONOLÓGICAS)
// ==============================================================================
async function cargarTimelineActividad() {
    let timelineDiv = document.getElementById("activityTimeline");
    if (!timelineDiv || !activeProjectId) return;

    // Consulta solo eventos registrados explícitamente en la bitácora
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
