import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- VARIABLES GLOBALES ---
let puerto;
let miGrafica;
let scene, camera, renderer, droneModel;
let targetRotation = { x: 0, y: 0, z: 0 };
let staticScene, staticCamera, staticRenderer, staticDroneModel;
const staticVisualMotores = { m1: null, m2: null, m3: null, m4: null };
// Almacenamos las esferas de los motores
const visualMotores = { m1: null, m2: null, m3: null, m4: null };

const maxPuntos = 50;
const smoothing = 0.1; 
let ultimoRenderTerminal = 0;
let bufferLineasTerminal = [];
const MAX_LINEAS_VISIBLES = 20;
const FRECUENCIA_TERMINAL = 100;

// --- 1. INICIALIZACIÓN PRINCIPAL ---
document.addEventListener("DOMContentLoaded", () => {
    initChart();
    init3D();
    initTabs();
    initControls();
    animate();
});

// --- 2. CONFIGURACIÓN DE GRÁFICA ---
function initChart() {
    const ctx = document.getElementById("graficaRealTime").getContext("2d");
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
                    yAxisID: 'y1',
                    pointRadius: 0 
                }
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                y: { type: 'linear', position: 'left', title: { display: true, text: 'Deg', color: '#fff' } },
                y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } },
                x: { display: false }
            },
            plugins: { legend: { labels: { color: 'white', boxWidth: 10, font: { size: 10 } } } }
        },
    });
}

// --- 3. VISUALIZACIÓN 3D (Actualizada con Motores) ---
function init3D() {
    const container = document.getElementById("container3d");
    const staticContainer = document.getElementById("staticContainer3d");
    if (!container || !staticContainer) return;

    // --- ESCENA PRINCIPAL (Animada) ---
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 1, 6);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // --- ESCENA ESTÁTICA ---
    staticScene = new THREE.Scene();
    staticCamera = new THREE.PerspectiveCamera(75, staticContainer.clientWidth / staticContainer.clientHeight, 0.1, 1000);
    staticCamera.position.set(0, 3.5, 4); // Un poco más lejos para verlo completo
    staticCamera.lookAt(0, 0, 0);
    staticRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    staticRenderer.setSize(staticContainer.clientWidth, staticContainer.clientHeight);
    staticContainer.appendChild(staticRenderer.domElement);

    // Luces para ambas
    [scene, staticScene].forEach(s => {
        s.add(new THREE.AmbientLight(0xffffff, 0.8));
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(5, 10, 7.5);
        s.add(sun);
    });

    const crearIndicadorMotor = () => {
        const geo = new THREE.SphereGeometry(0.001, 16, 16); 
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0,
            transparent: true, opacity: 0.8
        });
        return new THREE.Mesh(geo, mat);
    };

    // Crear esferas para AMBOS modelos
    ['m1', 'm2', 'm3', 'm4'].forEach(m => {
        visualMotores[m] = crearIndicadorMotor();
        staticVisualMotores[m] = crearIndicadorMotor();
    });

    const loader = new GLTFLoader();
    loader.load('./drone.glb', (gltf) => {
        // Modelo principal
        droneModel = gltf.scene;
        const box = new THREE.Box3().setFromObject(droneModel);
    const center = box.getCenter(new THREE.Vector3());
    droneModel.position.sub(center); // Mueve el modelo para que su centro sea 0,0,0
    
    // Crear un contenedor para que el desplazamiento anterior no afecte el movimiento
    const wrapper = new THREE.Group();
    wrapper.add(droneModel);
    scene.add(wrapper);
    
    droneModel = wrapper; // Ahora droneModel es el grupo centrado
    droneModel.scale.set(200, 200, 200);
        scene.add(droneModel);
        
        // Clonar para el modelo estático
        staticDroneModel = droneModel.clone();
        staticScene.add(staticDroneModel);

        // Posicionar y agregar esferas a ambos
        const pos = { x: 0.009, z: 0.009, y: -0.001 };
        const setupMotores = (model, visuales) => {
            visuales.m1.position.set(pos.x, pos.y, pos.z);
            visuales.m2.position.set(-pos.x, pos.y, pos.z);
            visuales.m3.position.set(pos.x, pos.y, -pos.z);
            visuales.m4.position.set(-pos.x, pos.y, -pos.z);
            model.add(visuales.m1, visuales.m2, visuales.m3, visuales.m4);
        };

        setupMotores(droneModel, visualMotores);
        setupMotores(staticDroneModel, staticVisualMotores);
    });

    window.addEventListener('resize', () => {
        // Actualizar ambos renderers
        [
            { r: renderer, c: camera, cont: container },
            { r: staticRenderer, c: staticCamera, cont: staticContainer }
        ].forEach(obj => {
            obj.c.aspect = obj.cont.clientWidth / obj.cont.clientHeight;
            obj.c.updateProjectionMatrix();
            obj.r.setSize(obj.cont.clientWidth, obj.cont.clientHeight);
        });
    });
}

// --- 6. PROCESAMIENTO DE DATOS ---
function procesarLinea(linea) {
    const cleanLine = linea.trim();
    if (!cleanLine) return;

    // --- CASO 1: TELEMETRÍA (Prefijo $) ---
    if (cleanLine.startsWith('$')) {
        const valoresStr = cleanLine.substring(1).split(',');
        if (valoresStr.length === 8) {
            const [r, p, y, m1, m2, m3, m4, thr] = valoresStr.map(parseFloat);
            const toRad = Math.PI / 180;

            targetRotation.z = r * toRad; 
            targetRotation.x = p * toRad; 
            targetRotation.y = y * toRad; 
            
            // Actualizar indicadores de motores
            [m1, m2, m3, m4].forEach((val, i) => {
                actualizarColorMotor(visualMotores[`m${i+1}`], val);
                actualizarColorMotor(staticVisualMotores[`m${i+1}`], val);
            });

            if (miGrafica) {
                const valores = [r, p, y, thr];
                miGrafica.data.datasets.forEach((dataset, i) => {
                    dataset.data.push(valores[i]);
                    if (dataset.data.length > maxPuntos) dataset.data.shift();
                });
            }
        }
    } 
    // --- CASO 2: STATUS PID (Prefijo #) ---
    else if (cleanLine.startsWith('#')) {
        actualizarUI_PID(cleanLine.substring(1));
    }
}
function actualizarUI_PID(data) {
    const v = data.split(',').map(parseFloat);
    if (v.length < 9) return;

    // Roll
    actualizarElemento('sliderRP', 'valRP', v[0]);
    actualizarElemento('sliderRI', 'valRI', v[1]);
    actualizarElemento('sliderRD', 'valRD', v[2]);
    // Pitch
    actualizarElemento('sliderPP', 'valPP', v[3]);
    actualizarElemento('sliderPI', 'valPI', v[4]);
    actualizarElemento('sliderPD', 'valPD', v[5]);
    // Yaw
    actualizarElemento('sliderYP', 'valYP', v[6]);
    actualizarElemento('sliderYI', 'valYI', v[7]);
    actualizarElemento('sliderYD', 'valYD', v[8]);
}
function actualizarElemento(sliderId, textId, valor) {
    const slider = document.getElementById(sliderId);
    const text = document.getElementById(textId);
    if (slider) slider.value = valor;
    if (text) text.textContent = valor.toFixed(4);
}
// Lógica de color proporcional
function actualizarColorMotor(mesh, valor) {
    if (!mesh) return;
    
    // --- CONFIGURACIÓN PARA RANGO 0-600 ---
    const minValor = 0;   // Motor detenido (Verde)
    const maxValor = 600; // Motor a tope (Rojo)
    // --------------------------------------

    // Calculamos el factor (de 0 a 1)
    let factor = (valor - minValor) / (maxValor - minValor);
    
    // Seguridad para no salir del rango HSL
    factor = Math.min(Math.max(factor, 0), 1);
    
    // Mapeo HSL: 0.3 es verde, 0.0 es rojo
    const hue = (0.3 * (1 - factor)); 
    
    // Aplicamos los colores
    mesh.material.color.setHSL(hue, 1, 0.5);
    mesh.material.emissive.setHSL(hue, 1, 0.5);
    
    // La intensidad del brillo ahora sí puede subir con la potencia
    // para dar más feedback visual de "fuerza"
    mesh.material.emissiveIntensity = 0.2 + (factor * 0.8); 
}

// --- (Resto de funciones: initTabs, initControls, conectarSerial, etc. permanecen igual) ---

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(boton => {
        boton.addEventListener('click', () => {
            if (boton.classList.contains('git-btn')) return;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            boton.classList.add('active');
            const tabId = boton.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

function initControls() {
    document.getElementById("btnRefreshPID")?.addEventListener('click', () => {
    enviarComando('S'); // Pedir estatus al firmware
});
    const bindAxis = (axisPrefix, commandChar) => {
        ['P', 'I', 'D'].forEach(type => {
            const id = `slider${axisPrefix}${type}`;
            const disp = `val${axisPrefix}${type}`;
            const slider = document.getElementById(id);
            if (!slider) return;

            slider.addEventListener('input', () => { 
                document.getElementById(disp).textContent = slider.value; 
            });
            // Enviar comando: ej 'RP1.5' (Roll P), 'PI0.1' (Pitch I)
            slider.addEventListener('change', () => { 
                enviarComando(`${axisPrefix}${type}${slider.value}`); 
            });
        });
    };

    bindAxis('R', 'R'); // Roll
    bindAxis('P', 'P'); // Pitch
    bindAxis('Y', 'Y'); // Yaw
    document.getElementById("btnEnviar").onclick = () => {
        const input = document.getElementById("inputEnviar");
        enviarComando(input.value);
        input.value = "";
    };
    document.getElementById("btnConectar").onclick = conectarSerial;
}

async function conectarSerial() {
    try {
        puerto = await navigator.serial.requestPort();
        await puerto.open({ baudRate: 115200 });
        setTimeout(() => enviarComando('S'), 1000);
        const textDecoder = new TextDecoderStream();
        puerto.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable
            .pipeThrough(new TransformStream(new LineBreakTransformer()))
            .getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            actualizarTerminal(value);
            procesarLinea(value);
        }
    } catch (error) {
        console.error("Error Serial:", error);
    }
}

async function enviarComando(texto) {
    if (!puerto || !puerto.writable) return;
    const writer = puerto.writable.getWriter();
    await writer.write(new TextEncoder().encode(texto + "\n"));
    writer.releaseLock();
}

function actualizarTerminal(texto) {
    bufferLineasTerminal.push(texto);
    if (bufferLineasTerminal.length > MAX_LINEAS_VISIBLES) bufferLineasTerminal.shift();
    const ahora = performance.now();
    if (ahora - ultimoRenderTerminal > FRECUENCIA_TERMINAL) {
        const terminal = document.getElementById("terminal");
        if (terminal) {
            terminal.textContent = bufferLineasTerminal.join("\n");
            terminal.scrollTop = terminal.scrollHeight;
        }
        ultimoRenderTerminal = ahora;
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    // 1. EL MODELO PRINCIPAL: Sigue la telemetría (SÍ rota)
    if (droneModel) {
        droneModel.rotation.x += (targetRotation.x - droneModel.rotation.x) * smoothing;
        droneModel.rotation.y += (targetRotation.y - droneModel.rotation.y) * smoothing;
        droneModel.rotation.z += (targetRotation.z - droneModel.rotation.z) * smoothing;
    }

    // 2. EL MODELO ESTÁTICO: No hacemos NADA con su rotación aquí.
    // Si se mueve, asegurate de que NO haya ninguna línea que diga:
    // staticDroneModel.rotation.y += ...

    if (miGrafica) { miGrafica.update('none'); }
    
    // Renderizado de ambos paneles
    if (renderer) renderer.render(scene, camera);
    if (staticRenderer) staticRenderer.render(staticScene, staticCamera);
}

class LineBreakTransformer {
    constructor() { this.container = ""; }
    transform(chunk, controller) {
        this.container += chunk;
        const lines = this.container.split("\n");
        this.container = lines.pop();
        lines.forEach(line => controller.enqueue(line));
    }
    flush(controller) { controller.enqueue(this.container); }
}

window.confirmarMotor = () => {
    const valor = prompt("Potencia Test Motor (0-2000):", "0");
    if (valor) enviarComando('M' + valor);
};