// ==============================================================================
// VISOR MULTIMEDIA E INTERACTIVO CDE ISO 19650 — INNOVARQZ S.A.S.
// ==============================================================================

function openViewer(driveUrl, nombreArchivo) {
    if (!driveUrl) {
        alert("⚠️ No hay una URL válida asociada a este entregable.");
        return;
    }

    const extension = nombreArchivo.split('.').pop().toLowerCase();
    const viewerContainer = document.getElementById("viewerContainer");
    const ifcFrame = document.getElementById("ifcViewerFrame");
    const pdfCanvas = document.getElementById("pdfViewerCanvas");

    if (!viewerContainer || !ifcFrame) return;

    // Extraer el File ID de Google Drive
    let fileId = "";
    const fileIdMatch = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
        fileId = fileIdMatch[1];
    }

    // 1. CASO DOCUMENTOS 2D E IMÁGENES (PDF, PNG, JPG) -> Vista Previa Integrada
    if (["pdf", "png", "jpg", "jpeg"].includes(extension)) {
        if (pdfCanvas) pdfCanvas.style.display = "none";
        
        const embedUrl = fileId ? `https://drive.google.com/file/d/${fileId}/preview` : driveUrl;
        
        ifcFrame.src = embedUrl;
        ifcFrame.style.display = "block";
        ifcFrame.style.width = "100%";
        ifcFrame.style.height = "550px";

        viewerContainer.classList.remove("hidden");
        viewerContainer.style.display = "block";
        viewerContainer.scrollIntoView({ behavior: "smooth" });
    } 
    // 2. CASO MODELOS 3D IFC -> Redirección limpia a descarga/inspección
    else if (extension === "ifc") {
        if (viewerContainer) {
            viewerContainer.classList.add("hidden");
            viewerContainer.style.display = "none";
        }

        const downloadUrl = fileId 
            ? `https://drive.google.com/uc?export=download&id=${fileId}` 
            : driveUrl;

        // Abrir ventana directa de descarga/inspección sin pasar por la vista previa gris de Drive
        const confirmDownload = confirm(
            `📦 Modelo IFC detectado: ${nombreArchivo}\n\n` +
            `Google Drive no posee renderizador 3D nativo.\n` +
            `¿Desea descargar el archivo directamente para abrirlo en Solibri, BIMvision o su visor OpenBIM local?`
        );

        if (confirmDownload) {
            window.location.href = downloadUrl;
        }
    } 
    // 3. CASO MODELOS NATIVOS (RVT, DWG) -> Notificación Pedagógica
    else {
        if (viewerContainer) {
            viewerContainer.classList.add("hidden");
            viewerContainer.style.display = "none";
        }
        
        alert(
            `ℹ️ Archivo nativo (.${extension}).\n\n` +
            `Utilice el botón 'Descargar' para abrirlo en su software de escritorio (Revit, Civil 3D, AutoCAD).`
        );
    }
}

function closeViewer() {
    const viewerContainer = document.getElementById("viewerContainer");
    const ifcFrame = document.getElementById("ifcViewerFrame");
    
    if (ifcFrame) ifcFrame.src = "";
    if (viewerContainer) {
        viewerContainer.classList.add("hidden");
        viewerContainer.style.display = "none";
    }
}
