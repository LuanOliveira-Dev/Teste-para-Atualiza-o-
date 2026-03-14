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

// --- UTILITÁRIOS ---
const formatarDataBR = (dataStr) => {
    if(!dataStr) return "";
    const [ano, mes, dia] = dataStr.split("-");
    return `${dia}/${mes}/${ano}`;
};

// --- FUNÇÕES DE LÓGICA DO BANCO ---
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
        const data = snap.docs[0].data();
        document.getElementById('descricao').value = data.nome || "";
    }
}

// --- AUTENTICAÇÃO E CONTROLE DE TELAS ---
onAuthStateChanged(auth, (user) => {
    const authSection = document.getElementById('auth-section');
    const appSection = document.getElementById('app-section');
    const userHeader = document.getElementById('user-header');
    const userNameDisplay = document.getElementById('display-user-name');

    if (user) {
        authSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        if(userHeader) userHeader.classList.remove('hidden');
        if(userNameDisplay) userNameDisplay.innerText = user.displayName || user.email;
        carregarEstoque(user.uid);
        atualizarStatusContagemCloud();
    } else {
        authSection.classList.remove('hidden');
        appSection.classList.add('hidden');
        if(userHeader) userHeader.classList.add('hidden');
    }
});

// --- EVENTOS DE LOGIN / CADASTRO ---
document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    try {
        await signInWithEmailAndPassword(auth, email, senha);
    } catch (e) { Swal.fire('Erro', 'Falha no login: ' + e.message, 'error'); }
});

document.getElementById('btn-toggle-reg').addEventListener('click', () => {
    document.getElementById('register-fields').classList.toggle('hidden');
    document.getElementById('btn-login').classList.toggle('hidden');
    document.getElementById('btn-cadastrar').classList.toggle('hidden');
    const isRegister = !document.getElementById('register-fields').classList.contains('hidden');
    document.getElementById('btn-toggle-reg').innerText = isRegister ? "➔ Voltar ao Login" : "Criar conta ➔";
});

document.getElementById('btn-cadastrar').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    const nome = document.getElementById('nome_usuario').value;
    try {
        const res = await createUserWithEmailAndPassword(auth, email, senha);
        await updateProfile(res.user, { displayName: nome });
        Swal.fire('Sucesso', 'Conta criada!', 'success');
    } catch (e) { Swal.fire('Erro', 'Falha no cadastro: ' + e.message, 'error'); }
});

document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

// --- SCANNER (html5-qrcode) ---
document.getElementById('btnScan').addEventListener('click', () => {
    document.getElementById('reader').style.display = 'block';
    document.getElementById('btnStopCam').style.display = 'block';
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
            document.getElementById('codigo').value = decodedText;
            buscarProdutoNoFirebase(decodedText);
            pararScanner();
        }
    ).catch(err => console.error("Erro camera:", err));
});

function pararScanner() {
    if(html5QrCode) {
        html5QrCode.stop().then(() => {
            document.getElementById('reader').style.display = 'none';
            document.getElementById('btnStopCam').style.display = 'none';
        });
    }
}
document.getElementById('btnStopCam').addEventListener('click', pararScanner);

// --- SALVAR COLETA ---
document.getElementById('formEstoque').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if(!user) return;

    const dados = {
        uid: user.uid,
        codigo: document.getElementById('codigo').value,
        descricao: document.getElementById('descricao').value,
        validade: document.getElementById('validade').value,
        quantidade: document.getElementById('quantidade').value,
        timestamp: Date.now()
    };

    try {
        await addDoc(collection(db, "estoque"), dados);
        document.getElementById('formEstoque').reset();
        Swal.fire({ title: 'Salvo!', icon: 'success', timer: 1000, showConfirmButton: false });
    } catch (e) { Swal.fire('Erro', 'Erro ao salvar', 'error'); }
});

// --- CARREGAR LISTA ---
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
                             <button onclick="window.excluirItem('${d.id}')" style="width:auto; background:none; border:none; color:red; cursor:pointer">✕</button>`;
            lista.appendChild(div);
        });
    });
}

// Tornar excluir global para o onclick do HTML
window.excluirItem = async (id) => {
    const result = await Swal.fire({
        title: 'Excluir item?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim'
    });
    if(result.isConfirmed) deleteDoc(doc(db, "estoque", id));
};

// --- EXPORTAR EXCEL (Efeito Moderno com Spinner) ---
document.getElementById('btnExportar').addEventListener('click', () => {
    if (listaAtualParaExportar.length === 0) return Swal.fire('Vazio', 'Nada para exportar!', 'info');
    
    const btn = document.getElementById('btnExportar');
    const spinner = document.getElementById('exportSpinner');
    const btnText = btn.querySelector('span');

    Swal.fire({
        title: 'Exportar para Excel?',
        text: `Deseja gerar o arquivo com ${listaAtualParaExportar.length} itens?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#1d6f42',
        confirmButtonText: 'Sim, exportar!'
    }).then((result) => {
        if (result.isConfirmed) {
            // Efeito Visual de Processamento
            if(spinner) spinner.style.display = 'block';
            if(btnText) btnText.innerText = 'Processando...';
            btn.disabled = true;

            setTimeout(() => {
                const ws = XLSX.utils.json_to_sheet(listaAtualParaExportar.map(item => ({
                    "Código": item.codigo, 
                    "Descrição": item.descricao, 
                    "Validade": formatarDataBR(item.validade), 
                    "Quantidade": item.quantidade
                })));
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Coleta");
                XLSX.writeFile(wb, `Coleta_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`);
                
                // Resetar o botão para o estado original
                if(spinner) spinner.style.display = 'none';
                if(btnText) btnText.innerText = '📊 EXPORTAR PARA EXCEL (.XLSX)';
                btn.disabled = false;
                Swal.fire('Sucesso', 'Arquivo gerado com sucesso!', 'success');
            }, 1200); 
        }
    });
});

// --- LIMPAR TUDO ---
document.getElementById('btnLimparTudo').addEventListener('click', async () => {
    const result = await Swal.fire({
        title: 'Limpar lista inteira?',
        text: "Essa ação não pode ser desfeita!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        confirmButtonText: 'Sim, limpar tudo'
    });

    if (result.isConfirmed) {
        const user = auth.currentUser;
        if (!user) return;
        const q = query(collection(db, "estoque"), where("uid", "==", user.uid));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
        Swal.fire('Limpo!', 'Sua lista foi apagada.', 'success');
    }
});
