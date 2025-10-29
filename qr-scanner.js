const video = document.getElementById('qr-video');
const canvasElement = document.getElementById('qr-canvas');
const canvas = canvasElement.getContext('2d');
const fileInput = document.getElementById('qr-file-input');

let stream = null;
let animationFrameId = null;
let onQrFoundCallback = null;

function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvasElement.height = video.videoHeight;
        canvasElement.width = video.videoWidth;
        canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
        const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });
        if (code) {
            if (onQrFoundCallback) {
                onQrFoundCallback(code.data);
            }
            return; // Stop scanning once found
        }
    }
    animationFrameId = requestAnimationFrame(tick);
}

async function startCamera() {
    try {
        const constraints = {
            video: {
                facingMode: "environment"
            }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
        await video.play();
        animationFrameId = requestAnimationFrame(tick);
    } catch (err) {
        console.error("Camera Error:", err);
        alert("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
    }
}

export function stopScanner() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    onQrFoundCallback = null;
}

export function startScanner(onQrFound) {
    onQrFoundCallback = onQrFound;
    startCamera();
}

fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) {
        return;
    }
    const reader = new FileReader();
    reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
            canvasElement.width = img.width;
            canvasElement.height = img.height;
            canvas.drawImage(img, 0, 0, img.width, img.height);
            const imageData = canvas.getImageData(0, 0, img.width, img.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
                if (onQrFoundCallback) {
                    onQrFoundCallback(code.data);
                }
            } else {
                alert("Nenhum QR code encontrado na imagem.");
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

