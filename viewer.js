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
    const videoTag = document.getElementById("videoViewerTag");

    // Extraer el File ID de Google Drive
    let fileId = "";
    const fileIdMatch = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
        fileId = fileIdMatch[1];
    }

    // Ocultar elementos previos por seguridad
    if (ifcFrame) ifcFrame.style.display = "none";
    if (videoTag) {
        videoTag.pause();
        videoTag.style.display = "none";
        videoTag.src = "";
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
    // 2. ARCHIVOS DE VIDEO (.mp4, .webm, .mov) -> Reproductor de Video en Modal
    else if (["mp4", "webm", "mov"].includes(extension)) {
        if (!viewerContainer || !videoTag) return;

        const streamUrl = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : driveUrl;

        videoTag.src = streamUrl;
        videoTag.style.display = "block";

        viewerContainer.classList.remove("hidden");
        viewerContainer.style.display = "block";
        viewerContainer.scrollIntoView({ behavior: "smooth" });
        
        videoTag.play().catch(err => console.log("Reproducción automática bloqueada por el navegador:", err));
    }
    // 3. OTROS FORMATOS O NATIVOS -> Descarga Directa
    else {
        if (viewerContainer) closeViewer();
        const downloadUrl = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : driveUrl;
        window.location.href = downloadUrl;
    }
}

function closeViewer() {
    const viewerContainer = document.getElementById("viewerContainer");
    const ifcFrame = document.getElementById("ifcViewerFrame");
    const videoTag = document.getElementById("videoViewerTag");
    
    if (ifcFrame) ifcFrame.src = "";
    if (videoTag) {
        videoTag.pause();
        videoTag.src = "";
        videoTag.style.display = "none";
    }

    if (viewerContainer) {
        viewerContainer.classList.add("hidden");
        viewerContainer.style.display = "none";
    }
}
