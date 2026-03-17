import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut, 
    updateProfile 
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

// --- 2. NAVEGAÇÃO (TROCA DE ABAS) ---
function trocarTela(idTela) {
    // Esconde todas as secções principais
    document.getElementById('app-section').classList.add('hidden');
    const setoresSec = document.getElementById('setores-section');
    if(setoresSec) setoresSec.classList.add('hidden');
    
    // Remove a classe 'active' de todos os itens da nav
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    // Mostra a tela correta
    if (idTela === 'inicio') {
        document.getElementById('app-section').classList.remove('hidden');
        document.querySelector('#nav-inicio').classList.add('active');
    } else if (idTela === 'setores') {
        document.getElementById('setores-section').classList.remove('hidden');
        document.querySelector('#nav-setores').classList.add('active');
        carregarSetores();
    }
}

// --- 3. LÓGICA DE SETORES ---
function carregarSetores() {
    const lista = document.getElementById('listaSetores');
    const q = query(collection(db, "setores"), where("uid", "==", auth.currentUser.uid));
    
    onSnapshot(q, (snap) => {
        lista.innerHTML = '';
        if (snap.empty) {
            lista.innerHTML = '<p style="text-align:center; color:#666; font-size:13px; padding:20px;">Nenhum setor cadastrado.</p>';
            return;
        }
        snap.forEach(d => {
            const s = d.data();
            const div = document.createElement('div');
            div.className = 'item';
            div.style.borderLeft = '6px solid var(--primary)';
            div.innerHTML = `
                <span><strong>${s.nome}</strong></span>
                <button onclick="window.excluirSetor('${d.id}')" style="width:auto; background:none; border:none; color:red; cursor:pointer; font-weight:bold;">✕</button>
            `;
            lista.appendChild(div);
        });
    });
}

window.excluirSetor = async (id) => {
    const result = await Swal.fire({ title: 'Excluir setor?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545' });
    if (result.isConfirmed) await deleteDoc(doc(db, "setores", id));
};

// --- 4. LÓGICA DE ESTOQUE ---
async function buscarProdutoNoFirebase(ean) {
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
            div.innerHTML = `<div><strong>${p.descricao}</strong><br><small>${p.codigo} | Qtd: ${p.quantidade} | Val: ${formatarDataBR(p.validade)}</small></div>
                             <button onclick=\"window.excluirItem('${d.id}')\" style=\"width:auto; background:none; border:none; color:red; cursor:pointer\">✕</button>`;
            lista.appendChild(div);
        });
    });
}

window.excluirItem = (id) => {
    Swal.fire({ title: 'Eliminar item?', icon: 'warning', showCancelButton: true }).then(r => {
        if(r.isConfirmed) deleteDoc(doc(db, "estoque", id));
    });
};

// --- 5. EVENTOS ---
document.addEventListener('DOMContentLoaded', () => {

    // Ouvintes da Barra de Navegação (IMPORTANTE)
    document.getElementById('nav-inicio').addEventListener('click', (e) => { e.preventDefault(); trocarTela('inicio'); });
    document.getElementById('nav-setores').addEventListener('click', (e) => { e.preventDefault(); trocarTela('setores'); });

    // Cadastro de Setor
    const formSetores = document.getElementById('formSetores');
    if(formSetores) {
        formSetores.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = document.getElementById('nome_setor').value;
            await addDoc(collection(db, "setores"), {
                uid: auth.currentUser.uid,
                nome: nome.toUpperCase(),
                criadoEm: Date.now()
            });
            e.target.reset();
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Setor salvo!', showConfirmButton: false, timer: 2000 });
        });
    }

    // Restante das funções de Estoque e Scanner (Código Original Integrado)
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

    // Autenticação
    document.getElementById('btn-login').addEventListener('click', () => {
        const email = document.getElementById('email').value;
        const senha = document.getElementById('senha').value;
        signInWithEmailAndPassword(auth, email, senha).catch(() => Swal.fire('Erro', 'Acesso negado', 'error'));
    });

    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
});

// --- 6. ESTADO DA SESSÃO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('auth-section').classList.add('hidden');
        trocarTela('inicio');
        document.getElementById('display-user-name').innerText = user.displayName || user.email;
        carregarEstoque(user.uid);
    } else {
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('app-section').classList.add('hidden');
        const setSec = document.getElementById('setores-section');
        if(setSec) setSec.classList.add('hidden');
    }
});
