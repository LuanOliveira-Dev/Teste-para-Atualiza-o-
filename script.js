import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, addDoc, query, where, onSnapshot, 
    deleteDoc, doc, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let html5QrCode;
let listaAtualParaExportar = [];

// --- 1. UTILITÁRIOS ---
const formatarDataBR = (dataStr) => {
    if(!dataStr) return "";
    const [ano, mes, dia] = dataStr.split("-");
    return `${dia}/${mes}/${ano}`;
};

// --- 2. SINCRONIZAÇÃO E BUSCA (BANCO DE DADOS) ---

async function atualizarStatusContagemCloud() {
    try {
        const snapshot = await getDocs(collection(db, "produtos_base"));
        const statusEl = document.getElementById('statusCloud');
        if(statusEl) statusEl.innerText = `${snapshot.size} PRODUTOS NA NUVEM`;
    } catch (e) { console.error("Erro ao contar nuvem:", e); }
}

async function buscarProdutoNoFirebase(ean) {
    if (!ean) return;
    const q = query(collection(db, "produtos_base"), where("__name__", "==", ean));
    const snap = await getDocs(q);
    if (!snap.empty) {
        document.getElementById('descricao').value = snap.docs[0].data().nome;
        document.getElementById('validade').focus();
    }
}

function carregarEstoque(uid) {
    onSnapshot(query(collection(db, "estoque"), where("uid", "==", uid)), (snap) => {
        const lista = document.getElementById('listaProdutos');
        document.getElementById('countItens').innerText = snap.size;
        lista.innerHTML = '';
        listaAtualParaExportar = [];
        snap.forEach(d => {
            const p = d.data();
            listaAtualParaExportar.push(p);
            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `
                <div><strong>${p.descricao}</strong><br>
                <small>${p.codigo} | Qtd: ${p.quantidade} | Val: ${formatarDataBR(p.validade)}</small></div>
                <button onclick="window.excluirItem('${d.id}')" style="width:auto; background:none; border:none; color:red; cursor:pointer">✕</button>
            `;
            lista.appendChild(div);
        });
    });
}

// --- 3. NAVEGAÇÃO ---

function trocarTela(idTela) {
    // Esconde todas as seções
    document.querySelectorAll('.secao-tela').forEach(s => s.classList.add('hidden'));
    // Remove classe ativa da nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const mapeamento = {
        'inicio': 'app-section',
        'setores': 'setores-section'
    };

    const targetId = mapeamento[idTela];
    if (document.getElementById(targetId)) {
        document.getElementById(targetId).classList.remove('hidden');
        document.getElementById(`nav-${idTela}`).classList.add('active');
    }
}

// --- 4. EVENTOS E FORMULÁRIOS ---

document.addEventListener('DOMContentLoaded', () => {
    // Nav links
    document.getElementById('nav-inicio').addEventListener('click', (e) => { e.preventDefault(); trocarTela('inicio'); });
    document.getElementById('nav-setores').addEventListener('click', (e) => { e.preventDefault(); trocarTela('setores'); });

    // Busca ao perder o foco do campo código
    document.getElementById('codigo').addEventListener('blur', (e) => buscarProdutoNoFirebase(e.target.value));

    // Salvar Estoque
    document.getElementById('formEstoque').addEventListener('submit', async (e) => {
        e.preventDefault();
        await addDoc(collection(db, "estoque"), {
            uid: auth.currentUser.uid,
            codigo: document.getElementById('codigo').value,
            descricao: document.getElementById('descricao').value,
            validade: document.getElementById('validade').value,
            quantidade: document.getElementById('quantidade').value,
            criadoEm: Date.now()
        });
        e.target.reset();
        document.getElementById('codigo').focus();
    });

    // Scanner
    document.getElementById('btnScan').addEventListener('click', () => {
        document.getElementById('reader').style.display = 'block';
        document.getElementById('btnScan').style.display = 'none';
        document.getElementById('btnStopCam').style.display = 'block';
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start({ facingMode: "environment" }, { fps: 15, qrbox: 250 }, (text) => {
            document.getElementById('codigo').value = text;
            buscarProdutoNoFirebase(text);
            document.getElementById('btnStopCam').click();
        });
    });

    document.getElementById('btnStopCam').addEventListener('click', () => {
        if (html5QrCode) html5QrCode.stop().then(() => {
            document.getElementById('reader').style.display = 'none';
            document.getElementById('btnScan').style.display = 'block';
            document.getElementById('btnStopCam').style.display = 'none';
        });
    });

    // Auth
    document.getElementById('btn-login').addEventListener('click', () => {
        const email = document.getElementById('email').value;
        const senha = document.getElementById('senha').value;
        signInWithEmailAndPassword(auth, email, senha).catch(() => Swal.fire('Erro', 'Acesso inválido', 'error'));
    });

    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
});

// --- 5. MONITOR DE ESTADO (LOGIN) ---

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('auth-section').classList.add('hidden');
        trocarTela('inicio');
        document.getElementById('display-user-name').innerText = user.displayName || user.email;
        
        // Ativa as funções de sincronização
        carregarEstoque(user.uid);
        atualizarStatusContagemCloud();
    } else {
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('app-section').classList.add('hidden');
        document.getElementById('setores-section').classList.add('hidden');
    }
});

// Funções globais para botões dinâmicos
window.excluirItem = (id) => deleteDoc(doc(db, "estoque", id));
