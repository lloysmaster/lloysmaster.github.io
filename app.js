let puerto;
let lector;
let buffer = "";
const maxPuntos = 50;
let miGrafica;
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// 1. CONFIGURACIÓN DE LA GRÁFICA MULTI-EJE
document.addEventListener("DOMContentLoaded", () => {
    const ctx = document.getElementById("graficaRealTime").getContext("2d");
    setupSlider('sliderP', 'P', 'valP');
    setupSlider('sliderI', 'I', 'valI');
    setupSlider('sliderD', 'D', 'valD');
    miGrafica = new Chart(ctx, {
        type: "line",
        data: {
            labels: Array(maxPuntos).fill(""),
            datasets: [
                { label: "Roll", data: [], borderColor: "#ff6384", tension: 0.1, pointRadius: 0 },
                { label: "Pitch", data: [], borderColor: "#36a2eb", tension: 0.1, pointRadius: 0 },
                { label: "Yaw", data: [], borderColor: "#ffce56", tension: 0.1, pointRadius: 0 },
                { 
                    label: "Throttle", 
                    data: [], 
                    borderColor: "#4bc0c0", 
                    borderWidth: 3,
                    fill: true,
                    backgroundColor: "rgba(75, 192, 192, 0.1)",
                    yAxisID: 'y1', // Eje independiente para potencia
                    pointRadius: 0 
                }
            ],
        },
        options: {
            responsive: true,
            animation: false,
            scales: {
                y: { // Eje para ángulos
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Ángulos (deg)', color: '#fff' }
                },
                y1: { // Eje para Throttle
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    grid: { drawOnChartArea: false }, // No ensuciar la gráfica
                    title: { display: true, text: 'Potencia (Thr)', color: '#4bc0c0' }
                },
                x: { display: false }
            },
            plugins: {
                legend: { labels: { color: 'white' } }
            }
        },
    });

    document.getElementById("btnEnviar").onclick = () => {
        const input = document.getElementById("inputEnviar");
        enviarComando(input.value);
        input.value = "";
    };
    document.querySelectorAll('.tab-btn').forEach(boton => {
    boton.addEventListener('click', () => {
        // 1. Quitar clase active de todos los botones y contenidos
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        // 2. Activar el botón clicado
        boton.classList.add('active');

        // 3. Activar el contenido correspondiente
        const tabId = boton.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');

        // 4. Opcional: Pausar el renderizado 3D si no estás en la pestaña de Telemetría 
        // para ahorrar recursos en la RP2040 o tu PC.
    });
});
const setupSlider = (id, prefijo, displayId) => {
        const slider = document.getElementById(id);
        const display = document.getElementById(displayId);

        // Actualizar valor visual y enviar comando al soltar el mouse (input para tiempo real)
        slider.addEventListener('input', () => {
            display.textContent = slider.value;
        });

        slider.addEventListener('change', () => {
            const comando = prefijo + slider.value;
            enviarComando(comando);
            console.log("Enviando:", comando);
        });
    };

    setupSlider('sliderP', 'P', 'valP');
    setupSlider('sliderI', 'I', 'valI');
    setupSlider('sliderD', 'D', 'valD');

// });

// Función auxiliar para el test de motores (seguridad)
window.confirmarMotor = () => {
    const valor = prompt("Ingrese valor de potencia para Test Motor (0-2000):", "0");
    if (valor !== null) {
        enviarComando('M' + valor);
    }
}


// Variables para guardar los objetivos (donde queremos llegar)
let targetRotation = { x: 0, y: 0, z: 0 };
const smoothing = 0.1; // Ajusta esto: 0.05 es muy suave, 0.3 es más reactivo
// 2. PARSER DE DATOS
function procesarLinea(linea) {
    // 1. Limpiamos espacios y verificamos que empiece con el prefijo '$'
    const cleanLine = linea.trim();
    if (!cleanLine.startsWith('$')) return;

    // 2. Quitamos el '$' y separamos por comas
    const valoresStr = cleanLine.substring(1).split(',');

    // 3. Verificamos que tengamos los 8 campos (R, P, Y, M1, M2, M3, M4, Thr)
    if (valoresStr.length === 8) {
        const [r, p, y, m1, m2, m3, m4, thr] = valoresStr.map(parseFloat);

        const toRad = Math.PI / 180;

        // Actualizamos OBJETIVO para el modelo 3D (Three.js)
        targetRotation.z = r * toRad; // Roll
        targetRotation.x = p * toRad; // Pitch
        targetRotation.y = y * toRad; // Yaw
        
        // Enviamos a la gráfica (Ajusta los índices según qué quieras graficar)
        // Aquí graficamos Roll, Pitch, Yaw y Throttle
        actualizarGrafica([r, p, y, thr]);

        // Opcional: Si quieres mostrar los motores en consola o algún indicador
        // console.log(`Motores: ${m1}, ${m2}, ${m3}, ${m4}`);
    }
}

function actualizarGrafica(valores) {
    if (!miGrafica) return;
    miGrafica.data.datasets.forEach((dataset, i) => {
        dataset.data.push(valores[i]);
        if (dataset.data.length > maxPuntos) dataset.data.shift();
    });
    // Quitamos el .update() de aquí
}
function actualizarDron3D(r, p, y) {
    if (!droneModel) return;

    // Convertimos grados a radianes: (grados * Math.PI / 180)
    const toRad = Math.PI / 180;

    // Aplicar rotaciones (Ajusta los ejes según cómo oriente el dron tu sensor)
    droneModel.rotation.x = p * toRad; // Pitch
    droneModel.rotation.y = y * toRad; // Yaw
    droneModel.rotation.z = r * toRad; // Roll
}
// En el bucle de animación, hacemos el acercamiento gradual
function animate() {
    requestAnimationFrame(animate);

    if (droneModel) {
        // LERP: valor_actual += (objetivo - valor_actual) * suavizado
        droneModel.rotation.x += (targetRotation.x - droneModel.rotation.x) * smoothing;
        droneModel.rotation.y += (targetRotation.y - droneModel.rotation.y) * smoothing;
        droneModel.rotation.z += (targetRotation.z - droneModel.rotation.z) * smoothing;
    }
    if (miGrafica) {
        miGrafica.update('none'); // Se actualiza solo 60 veces por segundo
    }
    renderer.render(scene, camera);
}
let ultimoRenderTerminal = 0;
let bufferLineasTerminal = [];
const MAX_LINEAS_VISIBLES = 20; // Cuántas líneas quieres ver a la vez
const FRECUENCIA_TERMINAL = 100; // ms (actualiza la terminal cada 0.1s)

function actualizarTerminal(texto) {
    // 1. Acumulamos en un array simple (operación de memoria, muy rápida)
    bufferLineasTerminal.push(texto);
    
    // 2. Limitamos el tamaño del buffer
    if (bufferLineasTerminal.length > MAX_LINEAS_VISIBLES) {
        bufferLineasTerminal.shift();
    }

    // 3. Solo actualizamos el DOM cada X milisegundos
    const ahora = performance.now();
    if (ahora - ultimoRenderTerminal > FRECUENCIA_TERMINAL) {
        const terminal = document.getElementById("terminal");
        
        // Unimos el array con saltos de línea y actualizamos de golpe
        // Usar textContent es mucho más seguro y rápido que innerHTML
        terminal.textContent = bufferLineasTerminal.join("\n");
        
        // Auto-scroll al final
        terminal.scrollTop = terminal.scrollHeight;
        ultimoRenderTerminal = ahora;
    }
}
// 3. CONEXIÓN SERIAL (Mejorada con manejo de flujo)
document.getElementById("btnConectar").addEventListener("click", async () => {
    try {
        puerto = await navigator.serial.requestPort();
        await puerto.open({ baudRate: 115200 });

        // Configuramos la tubería (Pipeline)
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = puerto.readable.pipeTo(textDecoder.writable);
        
        // Aquí conectamos el decoder con nuestro separador de líneas
        const reader = textDecoder.readable
            .pipeThrough(new TransformStream(new LineBreakTransformer()))
            .getReader();

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                // 'value' ahora es directamente una línea completa (gracias al TransformStream)
                actualizarTerminal(value);
                procesarLinea(value);
            }
        } catch (error) {
            console.error("Error de lectura:", error);
        } finally {
            reader.releaseLock();
        }
        
    } catch (error) {
        console.error("Error de conexión:", error);
    }
});

async function enviarComando(texto) {
    if (!puerto || !puerto.writable) return;
    const writer = puerto.writable.getWriter();
    await writer.write(new TextEncoder().encode(texto + "\n"));
    writer.releaseLock();
}

let scene, camera, renderer, droneModel;

function init3D() {
    const container = document.getElementById("container3d");
    
    // 1. Escena y Cámara
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 2, 5); // Un poco elevados para ver mejor el dron

    // 2. Renderizador (CONFIGURACIÓN CRÍTICA)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    
    // Esto evita que el modelo se vea blanco/brillante de más o sin color
    renderer.outputColorSpace = THREE.SRGBColorSpace; 
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0; 
    
    container.appendChild(renderer.domElement);

    // 3. Iluminación Balanceada
    // Luz ambiental suave para que las sombras no sean negras
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
    scene.add(ambientLight);
    
    // Luz direccional para dar relieve (el "sol")
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.position.set(5, 10, 7.5);
    scene.add(sunLight);

    // 4. Mapa de Entorno (Para que el metal/plástico brille bien)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    // Generamos un entorno neutral a partir de la escena
    scene.environment = pmremGenerator.fromScene(new THREE.Scene()).texture;

    // 5. Carga del Modelo
    const loader = new GLTFLoader();
    loader.load('./drone.glb', (gltf) => {
        droneModel = gltf.scene;
        
        // Escalado y centrado
        droneModel.scale.set(200, 200, 200); // Prueba con 1 primero
        
        // Opcional: Forzar a que los materiales reaccionen bien a la luz
        droneModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Si sigue viéndose raro, podrías ajustar child.material.envMapIntensity = 1;
            }
        });

        scene.add(droneModel);
        console.log("Dron cargado correctamente");
    }, 
    undefined, 
    (error) => {
        console.error("Error cargando el dron:", error);
    });
}

// Llamar a la inicialización al cargar la página
document.addEventListener("DOMContentLoaded", () => {
    init3D();    // Inicializa la escena
    animate();   // Arranca el bucle de renderizado global
    
    // ... (aquí va el resto de tu lógica de Chart.js y botones)
});

class LineBreakTransformer {
    constructor() {
        this.container = "";
    }
    transform(chunk, controller) {
        this.container += chunk;
        const lines = this.container.split("\n");
        this.container = lines.pop(); // Guarda lo que quedó incompleto
        lines.forEach(line => controller.enqueue(line));
    }
    flush(controller) {
        controller.enqueue(this.container);
    }
}
