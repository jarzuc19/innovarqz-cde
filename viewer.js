// ==============================================================================
// GESTOR DE VISUALIZACIÓN Y DESCARGA CDE ISO 19650 — INNOVARQZ S.A.S.
// ==============================================================================

function openViewer(driveUrl, nombreArchivo) {
    if (!driveUrl) {
        alert("⚠️ No hay una URL de archivo válida asociada a este entregable.");
        return;
    }

    const extension = nombreArchivo.split('.').pop().toLowerCase();
    const viewerContainer = document.getElementById("viewerContainer");
    const ifcFrame = document.getElementById("ifcViewerFrame");

    // Extraer el File ID de Google Drive
    let fileId = "";
    const fileIdMatch = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
        fileId = fileIdMatch[1];
    }

    // 1. ARCHIVOS 2D E IMÁGENES (.pdf, .png, .jpg) -> Previsualización en Modal
    if (["pdf", "png", "jpg", "jpeg"].includes(extension)) {
        if (!viewerContainer || !ifcFrame) return;

        const embedUrl = fileId ? `https://drive.google.com/file/d/${fileId}/preview` : driveUrl;
        
        ifcFrame.src = embedUrl;
        ifcFrame.style.display = "block";

        viewerContainer.classList.remove("hidden");
        viewerContainer.style.display = "block";
        viewerContainer.scrollIntoView({ behavior: "smooth" });
    } 
    // 2. MODELOS 3D E INTERCHANGE (.ifc, .rvt, .dwg) -> Descarga Directa
    else if (["ifc", "rvt", "dwg", "nwd"].includes(extension)) {
        if (viewerContainer) closeViewer();

        const downloadUrl = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : driveUrl;
        
        // Descarga inmediata del archivo para revisión en software de escritorio
        window.location.href = downloadUrl;
    } 
    // 3. OTROS FORMATOS
    else {
        window.open(driveUrl, "_blank");
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
