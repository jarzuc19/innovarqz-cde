// ==============================================================================
// GESTOR DE VISUALIZACIÓN LIGERA (PDF E IMÁGENES) — INNOVARQZ S.A.S.
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

    // ARCHIVOS DE LECTURA 2D E IMÁGENES -> Previsualización en Modal
    if (["pdf", "png", "jpg", "jpeg"].includes(extension)) {
        if (!viewerContainer || !ifcFrame) return;

        const embedUrl = fileId ? `https://drive.google.com/file/d/${fileId}/preview` : driveUrl;
        
        ifcFrame.src = embedUrl;
        ifcFrame.style.display = "block";

        viewerContainer.classList.remove("hidden");
        viewerContainer.style.display = "block";
        viewerContainer.scrollIntoView({ behavior: "smooth" });
    } 
    // OTROS FORMATOS (VIDEOS, RVT, IFC, DWG) -> Descarga Directa
    else {
        if (viewerContainer) closeViewer();
        const downloadUrl = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : driveUrl;
        window.location.href = downloadUrl;
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
