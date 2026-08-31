// ==============================================================================
// VISOR MULTIMEDIA Y RENDERIZADOR 3D OPENBIM (IFC.js) - INNOVARQZ S.A.S.
// ==============================================================================

let ifcViewerInstance = null;

async function openViewer(driveUrl, nombreArchivo) {
    if (!driveUrl) {
        alert("⚠️ No hay una URL válida asociada a este entregable.");
        return;
    }

    const extension = nombreArchivo.split('.').pop().toLowerCase();
    const viewerContainer = document.getElementById("viewerContainer");
    const ifcFrame = document.getElementById("ifcViewerFrame");
    const canvasContainer = document.getElementById("threeCanvasContainer");

    if (!viewerContainer || !ifcFrame || !canvasContainer) return;

    // Extraer File ID de Google Drive
    let fileId = "";
    const fileIdMatch = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
        fileId = fileIdMatch[1];
    }

    // --------------------------------------------------------------------------
    // 1. CASO DOCUMENTOS 2D E IMÁGENES (.pdf, .png, .jpg)
    // --------------------------------------------------------------------------
    if (["pdf", "png", "jpg", "jpeg"].includes(extension)) {
        canvasContainer.style.display = "none";
        
        const embedUrl = fileId ? `https://drive.google.com/file/d/${fileId}/preview` : driveUrl;
        
        ifcFrame.src = embedUrl;
        ifcFrame.style.display = "block";

        viewerContainer.classList.remove("hidden");
        viewerContainer.style.display = "block";
    } 
    // --------------------------------------------------------------------------
    // 2. CASO MODELO 3D IFC (.ifc) -> Renderizado 3D con IFC.js / WebGL
    // --------------------------------------------------------------------------
    else if (extension === "ifc") {
        ifcFrame.style.display = "none";
        canvasContainer.style.display = "block";
        canvasContainer.innerHTML = ""; // Limpiar lienzo anterior

        viewerContainer.classList.remove("hidden");
        viewerContainer.style.display = "block";

        try {
            // Inicializar el visor WebGL de IFC.js
            const container = document.getElementById("threeCanvasContainer");
            ifcViewerInstance = new IFCViewerAPI.IfcViewerAPI({ container, backgroundColor: new THREE.Color(0x0f172a) });
            ifcViewerInstance.axes.setAxes();
            ifcViewerInstance.grid.setGrid();

            // Configurar WASM para el decodificador nativo
            ifcViewerInstance.IFC.setWasmPath("https://unpkg.com/web-ifc@0.0.34/");

            // URL de descarga directa desde Google Drive
            const directDownloadUrl = fileId 
                ? `https://drive.google.com/uc?export=download&id=${fileId}` 
                : driveUrl;

            // Descargar el modelo en segundo plano y cargarlo en el lienzo 3D
            const response = await fetch(directDownloadUrl);
            const blob = await response.blob();
            const file = new File([blob], nombreArchivo);

            await ifcViewerInstance.IFC.loadIfc(file, true);
        } catch (error) {
            console.error("Error cargando el modelo IFC:", error);
            alert("⚠️ No se pudo procesar la geometría 3D directamente desde Drive. Utilice el botón 'Descargar' para abrirlo localmente.");
        }
    } 
    // --------------------------------------------------------------------------
    // 3. ARCHIVOS NATIVOS (.rvt, .dwg)
    // --------------------------------------------------------------------------
    else {
        alert(`ℹ️ Los modelos nativos (.${extension}) no se pueden procesar directamente en el navegador de forma gratuita.\n\nUtilice el botón 'Descargar' para inspeccionarlo en Revit o AutoCAD.`);
    }
}

function closeViewer() {
    const viewerContainer = document.getElementById("viewerContainer");
    const ifcFrame = document.getElementById("ifcViewerFrame");
    const canvasContainer = document.getElementById("threeCanvasContainer");
    
    if (ifcFrame) ifcFrame.src = "";
    if (canvasContainer) canvasContainer.innerHTML = "";
    
    if (viewerContainer) {
        viewerContainer.classList.add("hidden");
        viewerContainer.style.display = "none";
    }
}
