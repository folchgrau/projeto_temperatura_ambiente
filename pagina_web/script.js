const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

let grafico;
let monitorRef;

// --- INICIALIZAÇÃO E TEMA ---
document.addEventListener('DOMContentLoaded', () => {
    const salvo = localStorage.getItem('theme');
    if (salvo === 'dark') toggleTheme(true);
});

function toggleTheme(forceDark = false) {
    const isDark = forceDark || document.body.classList.toggle('dark-mode');
    if (forceDark) document.body.classList.add('dark-mode');
    
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.getElementById('theme-icon').innerText = isDark ? '☀️' : '🌙';
    document.getElementById('theme-text').innerText = isDark ? 'Modo Claro' : 'Modo Escuro';
    if (grafico) atualizarCoresGrafico(isDark);
}

// --- AUTENTICAÇÃO ---
auth.onAuthStateChanged(user => {
    const loginUI = document.getElementById('login-container');
    const dashUI = document.getElementById('dashboard');
    if (user) {
        loginUI.style.display = 'none';
        dashUI.style.display = 'flex';
        iniciarApp();
    } else {
        loginUI.style.display = 'flex';
        dashUI.style.display = 'none';
        if (monitorRef) monitorRef.off();
    }
});

document.getElementById('meuFormLogin').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    auth.signInWithEmailAndPassword(email, password).catch(() => {
        document.getElementById('erro-login').style.display = 'block';
    });
});

function fazerLogout() { auth.signOut(); }

// --- DASHBOARD ---
function trocarTela(tela) {
    document.getElementById('tela-inicio').style.display = (tela === 'inicio' ? 'block' : 'none');
    document.getElementById('tela-configuracao').style.display = (tela === 'configuracao' ? 'block' : 'none');
    document.getElementById('btn-inicio').classList.toggle('active', tela === 'inicio');
    document.getElementById('btn-config').classList.toggle('active', tela === 'configuracao');
    document.getElementById('main-content').focus();
}

function iniciarApp() {
    // Sincronização em Tempo Real das Configurações
    database.ref('setup').on('value', snapshot => {
        const d = snapshot.val();
        if (d) {
            document.getElementById('sw-automatico').checked = d.automatico;
            document.getElementById('sw-liga').checked = d.liga;
            document.getElementById('setpoint').value = d.setpoint;
            document.getElementById('var_max').value = d.var_max;
            document.getElementById('var_min').value = d.var_min;
            
            document.getElementById('group-manual').classList.toggle('disabled', d.automatico);
            document.getElementById('sw-liga').disabled = d.automatico;
        }
    });
    atualizarFiltroGrafico();
}

function salvarToggle(campo, valor) {
    database.ref('setup').update({ [campo]: valor });
}

document.getElementById('form-setup').addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = {
        setpoint: parseFloat(document.getElementById('setpoint').value),
        var_max: parseFloat(document.getElementById('var_max').value),
        var_min: parseFloat(document.getElementById('var_min').value)
    };
    database.ref('setup').update(dados).then(() => {
        const msg = document.getElementById('msg-config');
        msg.style.display = 'block';
        setTimeout(() => msg.style.display = 'none', 3000);
    });
});

// --- GRÁFICO ---
function atualizarFiltroGrafico() {
    const horas = parseInt(document.getElementById('filtro-tempo').value);
    const tempoCorte = Date.now() - (horas * 60 * 60 * 1000);
    if (monitorRef) monitorRef.off();

    monitorRef = database.ref('dados').orderByChild('timestamp').startAt(tempoCorte);
    monitorRef.on('value', snapshot => {
        const labels = [], valores = [];
        let ultima = null;
        snapshot.forEach(child => {
            const r = child.val();
            labels.push(r.hora_leitura.split(' ')[1].substring(0, 5));
            valores.push(r.temp_media);
            ultima = r.temp_media;
        });
        desenharGrafico(labels, valores);
        if (ultima) document.getElementById('temp-atual').innerText = ultima.toFixed(2) + " °C";
        document.getElementById('status').innerText = "Última leitura: " + new Date().toLocaleTimeString();
    });
}

function desenharGrafico(labels, valores) {
    const ctx = document.getElementById('meuGrafico').getContext('2d');
    const isDark = document.body.classList.contains('dark-mode');
    
    if (grafico) grafico.destroy();
    
    grafico = new Chart(ctx, {
        type: 'line',
        data: { 
            labels, 
            datasets: [{ 
                data: valores, 
                borderColor: isDark ? '#4dadff' : '#1a73e8', 
                backgroundColor: 'rgba(26, 115, 232, 0.1)', 
		pointRadius: 1,
                fill: true, 
                tension: 0.3 
            }] 
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    ticks: { color: isDark ? '#bbb' : '#666', callback: v => v.toFixed(1) + '°' },
                    grid: { color: isDark ? '#333' : '#eee' },
                    afterDataLimits: a => { a.max += 5; a.min -= 5; }
                },
                x: {
                    ticks: { color: isDark ? '#bbb' : '#666' },
                    grid: { display: false }
                }
            }
        }
    });
}

function atualizarCoresGrafico(isDark) {
    if (!grafico) return;
    grafico.options.scales.y.grid.color = isDark ? '#333' : '#eee';
    grafico.options.scales.y.ticks.color = isDark ? '#bbb' : '#666';
    grafico.options.scales.x.ticks.color = isDark ? '#bbb' : '#666';
    grafico.data.datasets[0].borderColor = isDark ? '#4dadff' : '#1a73e8';
    grafico.update();
}

let nivelZoom = 1;

function alterarZoom(delta) {
    nivelZoom += delta;
    if (nivelZoom < 0.5) nivelZoom = 0.5;
    if (nivelZoom > 2) nivelZoom = 2;
    document.body.style.zoom = nivelZoom;
}

function resetarZoom() {
    nivelZoom = 1;
    document.body.style.zoom = 1;
}