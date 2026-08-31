function openViewer(fileUrl) {
    const container = document.getElementById("viewerContainer");
    const pdfContainer = document.getElementById("pdfViewerCanvas");
    const ifcFrame = document.getElementById("ifcViewerFrame");

    container.classList.remove("hidden");
    pdfContainer.innerHTML = "";
    ifcFrame.src = "";

    if (fileUrl.toLowerCase().includes(".pdf")) {
        ifcFrame.style.display = "none";
        pdfContainer.style.display = "block";

        pdfjsLib.getDocument(fileUrl).promise.then(pdf => {
            pdf.getPage(1).then(page => {
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                const viewport = page.getViewport({ scale: 1.2 });
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                page.render({ canvasContext: context, viewport: viewport });
                pdfContainer.appendChild(canvas);
            });
        });
    } else if (fileUrl.toLowerCase().includes(".ifc")) {
        pdfContainer.style.display = "none";
        ifcFrame.style.display = "block";
        ifcFrame.src = `https://web-ifc-viewer.web.app/?modelUrl=${encodeURIComponent(fileUrl)}`;
    } else {
        alert("Visualización previa disponible para .pdf y .ifc. Descargue el archivo nativo.");
        closeViewer();
    }
}

function closeViewer() {
    document.getElementById("viewerContainer").classList.add("hidden");
}
