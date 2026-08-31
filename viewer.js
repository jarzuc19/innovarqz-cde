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

    // 1. CASO DOCUMENTOS 2D E IMÁGENES (PDF, PNG, JPG) -> Vista Previa Nativa en iframe
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
    // 2. CASO MODELOS B3D / IFC -> Redirección a Visor OpenBIM WebGL
    else if (extension === "ifc") {
        // Opción A: Abrir el visualizador 3D OpenBIM online especializado
        const directDownloadUrl = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : driveUrl;
        const bimViewerUrl = `https://ifcviewer.com/`;

        alert("ℹ️ Los modelos IFC 3D requieren un motor de renderizado WebGL.\n\nSe abrirá el archivo en el visor OpenBIM. Si prefiere trabajar localmente, utilice el botón 'Descargar'.");
        
        // Copiar o abrir enlace en nueva pestaña para inspección 3D
        window.open(driveUrl, "_blank");
    } 
    // 3. CASO MODELOS NATIVOS (RVT, DWG) -> Notificación Pedagógica
    else {
        alert(`ℹ️ Los archivos nativos (.${extension}) no poseen previsualización 3D en el navegador.\n\nUtilice el botón 'Descargar' para abrirlos en su software de escritorio (Revit, Civil 3D, AutoCAD).`);
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
