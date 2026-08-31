// ==============================================================================
// VISOR DE ENTREGABLES MULTIMEDIA E INTERACTIVOS (PDF, IFC, IMÁGENES)
// ==============================================================================

function openViewer(driveUrl, nombreArchivo) {
    if (!driveUrl) {
        alert("⚠️ No hay una URL de archivo válida asociada a este entregable.");
        return;
    }

    const extension = nombreArchivo.split('.').pop().toLowerCase();
    const viewerContainer = document.getElementById("viewerContainer");
    const ifcFrame = document.getElementById("ifcViewerFrame");
    const pdfCanvas = document.getElementById("pdfViewerCanvas");

    if (!viewerContainer || !ifcFrame) return;

    // Convertir URL estándar de Google Drive a la versión incrustable (preview)
    let embedUrl = driveUrl;
    if (driveUrl.includes("drive.google.com")) {
        const fileIdMatch = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch && fileIdMatch[1]) {
            embedUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
        }
    }

    // Lógica según formato de entregable
    if (extension === "pdf" || extension === "ifc" || extension === "png" || extension === "jpg" || extension === "jpeg") {
        if (pdfCanvas) pdfCanvas.style.display = "none";
        
        ifcFrame.src = embedUrl;
        ifcFrame.style.display = "block";
        ifcFrame.style.width = "100%";
        ifcFrame.style.height = "500px";

        viewerContainer.classList.remove("hidden");
        viewerContainer.style.display = "block";
        viewerContainer.scrollIntoView({ behavior: "smooth" });
    } else {
        alert(`ℹ️ La previsualización directa no está disponible para archivos .${extension}.\n\nUtilice el botón 'Descargar' para abrir el modelo en su software nativo (Revit, Civil 3D, AutoCAD).`);
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
