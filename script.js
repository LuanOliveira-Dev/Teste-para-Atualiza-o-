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

// ============================================================
// 1. GERENCIAMENTO DE SETORES (LÓGICA MANUAL)
// ============================================================
let setores = JSON.parse(localStorage.getItem('web_validade_setores')) || [];

function salvarSetores() {
    localStorage.setItem('web_validade_setores', JSON.stringify(setores));
    renderizarSetores();
}

function renderizarSetores() {
    const lista = document.getElementById('lista-setores-render');
    if(!lista) return;
    
    lista.innerHTML = '';
    if (setores.length === 0) {
        lista.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Nenhum setor cadastrado.</p>';
        return;
    }

    setores.forEach((setor, index) => {
        const div = document.createElement('div');
        div.className = 'setor-card';
        div.innerHTML = `
            <span>${setor}</span>
            <button onclick="excluirSetor(${index})" style="background:none; border:none; cursor:pointer; font-size:18px;">🗑️</button>
        `;
        lista.appendChild(div);
    });
}

// Função global para o botão de excluir setor
window.excluirSetor = (index) => {
    Swal.fire({
        title: 'Excluir setor?',
        text: `Deseja remover o setor "${setores[index]}"?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        confirmButtonText: 'Sim, excluir'
    }).then((result) => {
        if (result.isConfirmed) {
            setores.splice(index, 1);
            salvarSetores();
        }
    });
};

// ============================================================
// 2. UTILITÁRIOS E SCANNER
// ============================================================
const formatarDataBR = (dataStr) => {
    if(!dataStr) return "";
    const [ano, mes, dia] = dataStr.split("-");
    return `${dia}/${mes}/${ano}`;
};

async function atualizarStatusContagemCloud() {
    try {
        const snapshot = await getDocs(collection(db, "produtos_base"));
        const statusEl = document.getElementById('statusCloud');
        if(statusEl) statusEl.innerText = `${snapshot.size} PRODUTOS NA NUVEM`;
    } catch (e) { console.error("Erro ao contar nuvem:", e); }
}

async function buscarProdutoNoFirebase(ean) {
    const q = query(collection(db, "produtos_base"), where("__name__", "==", ean));
    const snap = await getDocs(q);
    if (!snap.empty) {
        document.getElementById('descricao').value = snap.docs[0].data().nome;
        document.getElementById('validade').focus();
    }
}

const pararLeitor = () => {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            document.getElementById('reader').style.display = 'none';
            document.getElementById('btnScan').style.display = 'block';
            document.getElementById('btnStopCam').style.display = 'none';
        }).catch(err => console.error(err));
    }
};

// ============================================================
// 3. ATRIBUIÇÃO DE EVENTOS PRINCIPAIS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {

    // --- Navegação entre Abas (Tab Bar) ---
    const navInicio = document.getElementById('nav-link-inicio');
    const navSetores = document.getElementById('nav-link-setores');
    const tabInicio = document.getElementById('tab-inicio');
    const tabSetores = document.getElementById('tab-setores');

    const alternarAba = (aba) => {
        tabInicio.classList.add('hidden');
        tabSetores.classList.add('hidden');
        navInicio.classList.remove('active');
        navSetores.classList.remove('active');

        if (aba === 'inicio') {
            tabInicio.classList.remove('hidden');
            navInicio.classList.add('active');
        } else {
            tabSetores.classList.remove('hidden');
            navSetores.classList.add('active');
            renderizarSetores();
        }
    };

    navInicio.onclick = (e) => { e.preventDefault(); alternarAba('inicio'); };
    navSetores.onclick = (e) => { e.preventDefault(); alternarAba('setores'); };
    document.getElementById('btn-back-home').onclick = () => alternarAba('inicio');

    // --- Lógica da Modal de Setores ---
    const modalSetor = document.getElementById('modal-setor');
    const inputNomeSetor = document.getElementById('input-nome-setor');

    document.getElementById('btn-open-modal-setor').onclick = () => modalSetor.classList.remove('hidden');
    document.getElementById('btn-close-modal').onclick = () => {
        modalSetor.classList.add('hidden');
        inputNomeSetor.value = '';
    };

    document.getElementById('btn-confirm-setor').onclick = () => {
        const nome = inputNomeSetor.value.trim();
        if (nome) {
            setores.push(nome);
            salvarSetores();
            inputNomeSetor.value = '';
            modalSetor.classList.add('hidden');
        }
    };

    document.getElementById('btn-clear-all-setores').onclick = () => {
        if (setores.length === 0) return;
        Swal.fire({
            title: 'Limpar tudo?',
            text: "Apagar todos os setores?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sim, apagar'
        }).then((result) => {
            if (result.isConfirmed) {
                setores = [];
                salvarSetores();
            }
        });
    };

    // --- Funções Originais (Login, Cadastro, Firebase) ---
    document.getElementById('btn-login').addEventListener('click', () => {
        const email = document.getElementById('email').value;
        const senha = document.getElementById('senha').value;
        signInWithEmailAndPassword(auth, email, senha)
            .catch(() => Swal.fire('Erro', "E-mail ou senha incorretos.", 'error'));
    });

    document.getElementById('btn-cadastrar').addEventListener('click', () => {
        const nome = document.getElementById('nome_usuario').value;
        const email = document.getElementById('email').value;
        const senha = document.getElementById('senha').value;
        createUserWithEmailAndPassword(auth, email, senha)
            .then(res => updateProfile(res.user, { displayName: nome }))
            .then(() => location.reload())
            .catch(err => Swal.fire('Erro no Cadastro', err.message, 'error'));
    });

    document.getElementById('btn-toggle-reg').addEventListener('click', () => {
        document.getElementById('register-fields').classList.toggle('hidden');
        document.getElementById('btn-cadastrar').classList.toggle('hidden');
        document.getElementById('btn-login').classList.toggle('hidden');
        const isReg = !document.getElementById('register-fields').classList.contains('hidden');
        document.getElementById('btn-toggle-reg').innerText = isReg ? "Já tenho conta? Entrar" : "Não tenho conta? Cadastrar";
    });

    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

    document.getElementById('btnScan').addEventListener('click', () => {
        document.getElementById('reader').style.display = 'block';
        document.getElementById('btnScan').style.display = 'none';
        document.getElementById('btnStopCam').style.display = 'block';
        
        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start(
            { facingMode: "environment" }, 
            { fps: 15, qrbox: { width: 250, height: 120 } }, 
            (text) => {
                document.getElementById('codigo').value = text;
                buscarProdutoNoFirebase(text);
                pararLeitor();
            }
        ).catch(err => console.error(err));
    });

    document.getElementById('btnStopCam').addEventListener('click', pararLeitor);

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

    // (Mantenha aqui as demais funções de exportar, limpar tudo e importar CSV do seu código original)
});

// --- LISTAGEM E EXCLUSÃO FIREBASE ---
window.excluirItem = (id) => {
    deleteDoc(doc(db, "estoque", id));
};

function carregarEstoque(uid) {
    onSnapshot(query(collection(db, "estoque"), where("uid", "==", uid)), (snap) => {
        const lista = document.getElementById('listaProdutos');
        if(!lista) return;
        document.getElementById('countItens').innerText = snap.size;
        lista.innerHTML = '';
        listaAtualParaExportar = [];
        snap.forEach(d => {
            const p = d.data();
            listaAtualParaExportar.push(p);
            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `<div><strong>${p.descricao}</strong><br><small>${p.codigo} | Qtd: ${p.quantidade} | Val: ${formatarDataBR(p.validade)}</small></div>
                             <button onclick="excluirItem('${d.id}')" style="width:auto; background:none; border:none; color:red; cursor:pointer">✕</button>`;
            lista.appendChild(div);
        });
    });
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        document.getElementById('display-user-name').innerText = user.displayName || user.email;
        carregarEstoque(user.uid);
        atualizarStatusContagemCloud();
    } else {
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('app-section').classList.add('hidden');
    }
});
