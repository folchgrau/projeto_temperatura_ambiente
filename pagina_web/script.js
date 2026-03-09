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
let monitoramentoRef;

window.addEventListener('beforeunload', () => auth.signOut());

// --- Autenticação ---
auth.onAuthStateChanged(user => {
    const loginUI = document.getElementById('login-container');
    const dashUI = document.getElementById('dashboard');
    if (user) {
        loginUI.style.display = 'none';
        dashUI.style.display = 'flex';
        atualizarFiltroGrafico();
    } else {
        loginUI.style.display = 'flex';
        dashUI.style.display = 'none';
        if (monitoramentoRef) monitoramentoRef.off();
    }
});

document.getElementById('meuFormLogin').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).then(() => {
        return auth.signInWithEmailAndPassword(email, password);
    }).catch(() => document.getElementById('erro-login').style.display = 'block');
});

function fazerLogout() { auth.signOut(); }

// --- Navegação ---
function trocarTela(tela) {
    const inicio = document.getElementById('tela-inicio');
    const config = document.getElementById('tela-configuracao');
    document.getElementById('btn-inicio').classList.toggle('active', tela === 'inicio');
    document.getElementById('btn-config').classList.toggle('active', tela === 'configuracao');

    if (tela === 'inicio') {
        inicio.style.display = 'block';
        config.style.display = 'none';
        atualizarFiltroGrafico();
    } else {
        inicio.style.display = 'none';
        config.style.display = 'block';
        carregarSetup();
    }
}

// --- Gráfico e Filtros ---
function atualizarFiltroGrafico() {
    const horas = parseInt(document.getElementById('filtro-tempo').value);
    const tempoCorte = Date.now() - (horas * 60 * 60 * 1000);
    iniciarGrafico(tempoCorte);
}

function iniciarGrafico(tempoCorte) {
    const ctx = document.getElementById('meuGrafico').getContext('2d');
    if (!grafico) {
        grafico = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Temperatura (°C)', borderColor: '#1a73e8', backgroundColor: 'rgba(26, 115, 232, 0.1)', data: [], fill: true, tension: 0.3, pointRadius: 1 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }
    if (monitoramentoRef) monitoramentoRef.off();
    monitoramentoRef = database.ref('dados').orderByChild('timestamp').startAt(tempoCorte);
    monitoramentoRef.on('value', snapshot => {
        const labels = [], valores = [];
        let ultimaTemp = null;
        snapshot.forEach(child => {
            const reg = child.val();
            labels.push(new Date(reg.timestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'}));
            valores.push(Number(reg.temp_media).toFixed(2));
            ultimaTemp = reg.temp_media;
        });
        grafico.data.labels = labels;
        grafico.data.datasets[0].data = valores;
        grafico.update();
        if (ultimaTemp !== null) {
            document.getElementById('temp-atual').innerText = Number(ultimaTemp).toFixed(2) + " °C";
            document.getElementById('status').innerText = "Sincronizado: " + new Date().toLocaleTimeString();
        }
    });
}

// --- Setup (Configurações e Toggles) ---

function carregarSetup() {
    database.ref('setup').once('value').then(snapshot => {
        const d = snapshot.val();
        if (d) {
            // Inputs numéricos
            document.getElementById('setpoint').value = d.setpoint || "";
            document.getElementById('var_max').value = d.var_max || "";
            document.getElementById('var_min').value = d.var_min || "";
            
            // Switches (Booleans)
            document.getElementById('sw-automatico').checked = d.automatico || false;
            document.getElementById('sw-liga').checked = d.liga || false;
            
            // Logica visual: se tiver no automático, esconde/desativa o controle manual
            gerenciarVisibilidadeManual(d.automatico);
        }
    });
}

// Função para salvar os Switches (true/false)
function salvarToggle(campo, valor) {
    const update = {};
    update[campo] = valor;
    database.ref('setup').update(update);
    
    if (campo === 'automatico') {
        gerenciarVisibilidadeManual(valor);
    }
}

// Oculta o controle manual se o sistema estiver no Automático
function gerenciarVisibilidadeManual(isAuto) {
    const manualGroup = document.getElementById('group-manual');
    manualGroup.style.opacity = isAuto ? "0.3" : "1";
    document.getElementById('sw-liga-tudo').disabled = isAuto;
}

document.getElementById('form-setup').addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = {
        setpoint: parseFloat(document.getElementById('setpoint').value),
        var_max: parseFloat(document.getElementById('var_max').value),
        var_min: parseFloat(document.getElementById('var_min').value)
    };
    database.ref('setup').update(dados).then(() => {
        document.getElementById('msg-config').style.display = 'block';
        setTimeout(() => document.getElementById('msg-config').style.display = 'none', 3000);
    });
});