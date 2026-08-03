// ================= FIREBASE =================
// Cole aqui as configurações do seu Firebase Web App.
const firebaseConfig = {
  apiKey: "AIzaSyDrtZxbKXk7hjlqBL_BLoZMTBdc5iqBCXo",
  authDomain: "ferramentas-projeto.firebaseapp.com",
  databaseURL: "https://ferramentas-projeto.firebaseio.com",
  projectId: "ferramentas-projeto",
  storageBucket: "ferramentas-projeto.appspot.com",
  messagingSenderId: "877191590019",
  appId: "1:877191590019:web:152d4d35bdd3024c53abb6"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// ================= CONFIGURAÇÃO =================
const LOGIN_ADMIN = "admin";
const SENHA_ADMIN = "870@Passadoria";
let promocaoAtual = "";
let jaGirou = false;
let premioAtual = "";
let telefoneAtual = "";
let usuarioIdAtual = "";        // ID protegido para mostrar na tela
let usuarioKeyAtual = "";       // chave segura/hash para salvar no Firebase
let avaliacaoJaEnviada = false;

const visitanteIdEl = document.getElementById("visitanteId");
if (visitanteIdEl) visitanteIdEl.textContent = "Digite seu telefone para gerar o ID";

function limparTelefone(telefone) {
  return String(telefone || "").replace(/\D/g, "");
}

function mascararTelefone(telefone) {
  const limpo = limparTelefone(telefone);
  if (!limpo) return "";
  const ultimos = limpo.slice(-4);
  return "••••••" + ultimos;
}

function gerarUsuarioIdProtegido(telefone) {
  const limpo = limparTelefone(telefone);
  if (!limpo) return "";
  return "TEL-" + mascararTelefone(limpo);
}

async function gerarChaveTelefone(telefone) {
  const limpo = limparTelefone(telefone);
  const encoder = new TextEncoder();
  const data = encoder.encode(limpo);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "tel_" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function telefoneValido(telefone) {
  return limparTelefone(telefone).length >= 10;
}

function atualizarUsuarioAtual() {
  const telefoneInput = document.getElementById("telefone");
  telefoneAtual = telefoneInput ? telefoneInput.value.trim() : "";
  usuarioIdAtual = gerarUsuarioIdProtegido(telefoneAtual);
  if (visitanteIdEl) visitanteIdEl.textContent = usuarioIdAtual || "Digite seu telefone para gerar o ID";
  return usuarioIdAtual;
}

function desbloquearFormulario() {
  const ids = ["nome", "telefone", "categoria", "comentario"];
  ids.forEach((id) => { const el = document.getElementById(id); if (el) el.disabled = false; });
  estrelas.forEach((s) => { s.style.pointerEvents = "auto"; });
}


function preencherDadosSalvos(dados) {
  if (!dados) return;
  const nomeEl = document.getElementById("nome");
  const telEl = document.getElementById("telefone");
  const catEl = document.getElementById("categoria");
  const comEl = document.getElementById("comentario");
  const notaEl = document.getElementById("nota");

  if (nomeEl && dados.nome) nomeEl.value = dados.nome;
  if (telEl && dados.telefoneOriginal) telEl.value = dados.telefoneOriginal;
  if (catEl && dados.categoria) catEl.value = dados.categoria;
  if (comEl && dados.comentario) comEl.value = dados.comentario;
  if (notaEl && dados.nota) notaEl.value = dados.nota;

  const n = Number(dados.nota || 0);
  estrelas.forEach((st) => st.classList.toggle("ativa", Number(st.dataset.star) <= n));
}

function bloquearFormularioParaVisualizacao(mensagem) {
  const ids = ["nome", "telefone", "categoria", "comentario"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });
  estrelas.forEach((s) => { s.style.pointerEvents = "none"; });
  if (btnGirar) {
    btnGirar.disabled = true;
    btnGirar.textContent = "BLOQUEADO";
  }
  if (btnEnviarAvaliacao) {
    btnEnviarAvaliacao.disabled = true;
    btnEnviarAvaliacao.classList.add("hidden");
  }
  if (statusEl) statusEl.textContent = mensagem || "Você já participou desta promoção. Agora é somente visualização.";
}

async function limparConfiguracaoDuplicada() {
  // Remove a pasta antiga inteira. O projeto agora usa SOMENTE config/promocaoAtual.
  try {
    await db.ref("configuracoes").remove();
  } catch (error) {
    console.warn("Não foi possível apagar configuracoes antigas:", error);
  }
}

async function carregarPromocaoAtual() {
  // Caminho ÚNICO oficial da promoção atual: config/promocaoAtual.
  try {
    await limparConfiguracaoDuplicada();

    const [snapConfig, snapPromos] = await Promise.all([
      db.ref("config/promocaoAtual").once("value"),
      db.ref("promocoes").once("value")
    ]);

    let atual = snapConfig.exists() ? String(snapConfig.val() || "").trim() : "";

    // Se /config estiver vazio ou com promo_1, pega a última promoção real criada em /promocoes.
    if (!atual || atual === "promo_1" || atual === "carregando...") {
      const promos = [];
      if (snapPromos.exists()) {
        snapPromos.forEach((child) => {
          if (child.key && child.key !== "promo_1") promos.push(child.key);
        });
      }
      promos.sort();
      if (promos.length) atual = promos[promos.length - 1];
    }

    // Primeira instalação: cria uma promoção real.
    if (!atual || atual === "promo_1" || atual === "carregando...") {
      atual = "promo_" + Date.now();
      await db.ref("promocoes/" + atual).set({
        criadaEm: new Date().toLocaleString("pt-BR"),
        timestamp: Date.now(),
        ativa: true
      });
    }

    promocaoAtual = atual;
    await db.ref("config/promocaoAtual").set(promocaoAtual);
    if (promoAtualTexto) promoAtualTexto.textContent = promocaoAtual;
    await atualizarContadoresVisitasPublicos();
    return promocaoAtual;
  } catch (error) {
    console.error("Erro ao carregar promoção atual:", error);
    const snap = await db.ref("config/promocaoAtual").once("value").catch(() => null);
    const atual = snap && snap.exists() ? String(snap.val() || "").trim() : "";
    promocaoAtual = atual && atual !== "promo_1" ? atual : ("promo_" + Date.now());
    try { await db.ref("config/promocaoAtual").set(promocaoAtual); } catch(e) {}
    if (promoAtualTexto) promoAtualTexto.textContent = promocaoAtual;
    return promocaoAtual;
  }
}

async function registrarEntrada() {
  try {
    await db.ref("entradas").push({
      data: new Date().toLocaleString("pt-BR"),
      timestamp: Date.now(),
      pagina: location.href,
      promocaoAtual,
      navegador: navigator.userAgent || ""
    });
  } catch (error) {
    console.error("Erro ao registrar entrada:", error);
  }
}

async function atualizarContadoresVisitasPublicos() {
  const totalSiteEl = document.getElementById("totalVisitasSite");
  const totalPromoEl = document.getElementById("totalVisitasPromocao");
  try {
    const snapTotal = await db.ref("entradas").once("value");
    if (totalSiteEl) totalSiteEl.textContent = snapTotal.exists() ? snapTotal.numChildren() : 0;

    const snapPromo = await db.ref("entradas").orderByChild("promocaoAtual").equalTo(promocaoAtual || "").once("value");
    if (totalPromoEl) totalPromoEl.textContent = snapPromo.exists() ? snapPromo.numChildren() : 0;

    const totalAdminEl = document.getElementById("totalVisualizacoesTexto");
    if (totalAdminEl) totalAdminEl.textContent = snapTotal.exists() ? snapTotal.numChildren() : 0;
  } catch (error) {
    console.error("Erro ao atualizar visualizações:", error);
  }
}

// ================= RODA DA SORTE =================
const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const btnGirar = document.getElementById("btnGirar");
const resultado = document.getElementById("resultado");

// A roda continua mostrando descontos de 0% até 20%.
// Os descontos acima de 10% são raros e o prêmio de 20% tem 1% de chance.
const premios = ["0%", "2%", "4%", "6%", "8%", "10%", "12%", "14%", "16%", "18%", "20%"];
const probabilidadesPremios = [25, 20, 17, 14, 12, 8, 1, 0.8, 0.6, 0.6, 1];
const cores = ["#facc15", "#22c55e", "#3b82f6", "#ef4444", "#a855f7", "#fb923c", "#14b8a6", "#ec4899", "#84cc16", "#f97316", "#38bdf8"];
let anguloAtual = 0;
let girando = false;

function sortearIndicePorProbabilidade() {
  const totalPeso = probabilidadesPremios.reduce((soma, peso) => soma + peso, 0);
  let sorteio = Math.random() * totalPeso;

  for (let i = 0; i < probabilidadesPremios.length; i++) {
    sorteio -= probabilidadesPremios[i];
    if (sorteio < 0) return i;
  }

  return 0;
}

function desenharRoda() {
  const centro = canvas.width / 2;
  const raio = centro - 5;
  const fatia = (2 * Math.PI) / premios.length;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < premios.length; i++) {
    const inicio = anguloAtual + i * fatia;
    const fim = inicio + fatia;
    ctx.beginPath();
    ctx.moveTo(centro, centro);
    ctx.arc(centro, centro, raio, inicio, fim);
    ctx.closePath();
    ctx.fillStyle = cores[i];
    ctx.fill();

    ctx.save();
    ctx.translate(centro, centro);
    ctx.rotate(inicio + fatia / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#111827";
    ctx.font = "bold 18px Arial";
    ctx.fillText(premios[i], raio - 22, 7);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(centro, centro, 35, 0, 2 * Math.PI);
  ctx.fillStyle = "#111827";
  ctx.fill();
  ctx.fillStyle = "#facc15";
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";
  ctx.fillText("SORTE", centro, centro + 5);
}

desenharRoda();

async function verificarSeJaGirou() {
  atualizarUsuarioAtual();
  if (!telefoneValido(telefoneAtual)) {
    jaGirou = false;
    avaliacaoJaEnviada = false;
    premioAtual = "";
    resultado.textContent = "Digite seu telefone antes de girar.";
    desbloquearFormulario();
    atualizarBotaoGirar();
    atualizarBotaoEnviar();
    return false;
  }

  usuarioKeyAtual = await gerarChaveTelefone(telefoneAtual);

  // Primeiro olha o bloqueio final. Esse é o registro principal no Firebase.
  const snapParticipante = await db.ref(`participantesPorTelefone/${promocaoAtual}/${usuarioKeyAtual}`).once("value");
  if (snapParticipante.exists()) {
    const dados = snapParticipante.val();
    jaGirou = true;
    avaliacaoJaEnviada = true;
    premioAtual = dados.descontoSorteado || "";
    preencherDadosSalvos(dados);
    carregarMeuComentario();
    resultado.textContent = `Você já participou desta promoção. Desconto: ${premioAtual}`;
    bloquearFormularioParaVisualizacao("✅ Você já avaliou e já usou seu giro. Agora é somente visualização.");
    return true;
  }

  const snapAvaliacao = await db.ref(`avaliacoesPorTelefone/${promocaoAtual}/${usuarioKeyAtual}`).once("value");
  avaliacaoJaEnviada = snapAvaliacao.exists();

  const snapGiro = await db.ref(`girosPorTelefone/${promocaoAtual}/${usuarioKeyAtual}`).once("value");
  jaGirou = snapGiro.exists();

  if (avaliacaoJaEnviada) {
    const dados = snapAvaliacao.val();
    premioAtual = dados.descontoSorteado || "";
    preencherDadosSalvos(dados);
    carregarMeuComentario();
    await db.ref(`participantesPorTelefone/${promocaoAtual}/${usuarioKeyAtual}`).set({ ...dados, bloqueado: true });
    resultado.textContent = `Você já participou desta promoção. Desconto: ${premioAtual}`;
    bloquearFormularioParaVisualizacao("✅ Sua avaliação já foi enviada. Você só pode visualizar.");
    return true;
  }

  if (jaGirou) {
    const dados = snapGiro.val();
    premioAtual = dados.descontoSorteado || "";
    preencherDadosSalvos(dados);
    carregarMeuComentario();
    resultado.textContent = `Você já utilizou seu giro. Desconto: ${premioAtual}`;
    btnGirar.disabled = true;
    btnGirar.textContent = "GIRO JÁ UTILIZADO";
  } else {
    desbloquearFormulario();
    resultado.textContent = "Preencha todos os dados para liberar o giro.";
    atualizarBotaoGirar();
  }
  atualizarBotaoEnviar();
  return jaGirou || avaliacaoJaEnviada;
}


const telefoneInput = document.getElementById("telefone");
if (telefoneInput) {
  telefoneInput.addEventListener("blur", async () => { await verificarSeJaGirou(); await carregarMeuComentario(); });
  telefoneInput.addEventListener("input", () => { atualizarUsuarioAtual(); atualizarBotaoGirar(); atualizarBotaoEnviar(); });
}

btnGirar.addEventListener("click", async () => {
  if (girando) return;

  atualizarUsuarioAtual();
  const nome = document.getElementById("nome").value.trim();
  const categoria = document.getElementById("categoria").value;
  const nota = Number(document.getElementById("nota").value);
  const comentario = document.getElementById("comentario").value.trim();

  if (!nomeCompletoValido(nome)) return alert("Digite seu nome e sobrenome antes de girar.");
  if (!telefoneValido(telefoneAtual)) return alert("Digite um telefone válido com DDD antes de girar.");
  if (!categoria) return alert("Selecione uma categoria antes de girar.");
  if (!nota) return alert("Escolha a quantidade de estrelas antes de girar.");
  if (!comentario) return alert("Escreva seu comentário antes de girar.");

  await verificarSeJaGirou();
  if (jaGirou) {
    alert("Você já utilizou seu giro de desconto.");
    return;
  }

  girando = true;
  btnGirar.disabled = true;
  resultado.textContent = "Girando...";

  const indiceSorteado = sortearIndicePorProbabilidade();
  const fatia = (2 * Math.PI) / premios.length;
  const anguloAlvo = (1.5 * Math.PI - ((indiceSorteado + 0.5) * fatia) + 2 * Math.PI) % (2 * Math.PI);
  const anguloNormalizado = ((anguloAtual % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const deslocamentoFinal = (anguloAlvo - anguloNormalizado + 2 * Math.PI) % (2 * Math.PI);
  const voltas = 6 + Math.floor(Math.random() * 4);
  const total = voltas * 2 * Math.PI + deslocamentoFinal;
  const inicio = anguloAtual;
  const duracao = 4200;
  const start = performance.now();

  function animar(tempo) {
    const progresso = Math.min((tempo - start) / duracao, 1);
    const ease = 1 - Math.pow(1 - progresso, 4);
    anguloAtual = inicio + total * ease;
    desenharRoda();

    if (progresso < 1) {
      requestAnimationFrame(animar);
    } else {
      const anguloFinal = (anguloAtual % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const fatiaFinal = (2 * Math.PI) / premios.length;
      const ponteiro = (1.5 * Math.PI - anguloFinal + 2 * Math.PI) % (2 * Math.PI);
      const indice = Math.floor(ponteiro / fatiaFinal) % premios.length;
      premioAtual = premios[indice];

      const telefoneProtegido = mascararTelefone(telefoneAtual);
      const dadosGiro = {
        usuarioKey: usuarioKeyAtual,
        usuarioId: usuarioIdAtual,
        nome,
        telefone: telefoneProtegido,
        telefoneOriginal: limparTelefone(telefoneAtual),
        promocaoId: promocaoAtual,
        descontoSorteado: premioAtual,
        data: new Date().toLocaleString("pt-BR"),
        timestamp: Date.now()
      };

      // Salva no Firebase pelo telefone. Não usa localStorage.
      db.ref(`girosPorTelefone/${promocaoAtual}/${usuarioKeyAtual}`).set(dadosGiro)
        .then(() => db.ref("giros").push(dadosGiro))
        .then(() => db.ref("notificacoesAdm").push({
          tipo: "giro",
          titulo: "Novo giro realizado",
          nome,
          telefone: telefoneProtegido,
          telefoneOriginal: limparTelefone(telefoneAtual),
          usuarioId: usuarioIdAtual,
          descontoSorteado: premioAtual,
          promocaoId: promocaoAtual,
          data: new Date().toLocaleString("pt-BR"),
          timestamp: Date.now(),
          lida: false
        }))
        .then(() => {
          girando = false;
          jaGirou = true;
          resultado.textContent = `🎉 Você ganhou ${premioAtual} de desconto!`;
          btnGirar.textContent = "GIRO JÁ UTILIZADO";
          btnGirar.disabled = true;
          atualizarBotaoEnviar();
          // Se todos os dados já estiverem preenchidos, envia a avaliação automaticamente após o giro.
          setTimeout(() => {
            if (formularioCompletoValido() && form && !avaliacaoJaEnviada) {
              if (form.requestSubmit) form.requestSubmit();
              else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
            }
          }, 300);
        })
        .catch((error) => {
          console.error("Erro ao salvar giro:", error);
          girando = false;
          resultado.textContent = "❌ Erro ao salvar o giro. Confira as regras do Firebase.";
          atualizarBotaoGirar();
          atualizarBotaoEnviar();
        });
    }
  }

  requestAnimationFrame(animar);
});

// ================= AVALIAÇÃO =================
const estrelas = document.querySelectorAll("#estrelas span");
const notaInput = document.getElementById("nota");

estrelas.forEach((estrela) => {
  estrela.addEventListener("click", () => {
    const nota = Number(estrela.dataset.star);
    notaInput.value = nota;
    estrelas.forEach((s) => s.classList.toggle("ativa", Number(s.dataset.star) <= nota));
    atualizarBotaoGirar();
    atualizarBotaoEnviar();
  });
});

function nomeCompletoValido(nome) {
  return String(nome || "").trim().split(/\s+/).length >= 2;
}

const form = document.getElementById("formAvaliacao");
const statusEl = document.getElementById("status");
const btnEnviarAvaliacao = document.getElementById("btnEnviarAvaliacao");
const camposObrigatorios = ["nome", "telefone", "categoria", "comentario"].map((id) => document.getElementById(id));

function dadosAntesDoGiroValidos() {
  const nome = document.getElementById("nome").value.trim();
  const telefone = document.getElementById("telefone").value.trim();
  const categoria = document.getElementById("categoria").value;
  const nota = Number(notaInput.value);
  const comentario = document.getElementById("comentario").value.trim();

  return nomeCompletoValido(nome) && telefoneValido(telefone) && !!categoria && !!nota && !!comentario;
}

function atualizarBotaoGirar() {
  if (!btnGirar || girando) return;

  if (jaGirou || avaliacaoJaEnviada) {
    btnGirar.disabled = true;
    btnGirar.textContent = avaliacaoJaEnviada ? "BLOQUEADO" : "GIRO JÁ UTILIZADO";
    return;
  }

  const liberar = dadosAntesDoGiroValidos();
  btnGirar.disabled = !liberar;
  btnGirar.textContent = liberar ? "GIRAR RODA" : "PREENCHA TODOS OS DADOS";

  if (resultado && !premioAtual && !liberar) {
    resultado.textContent = "Preencha nome, telefone, categoria, estrelas e comentário para liberar o giro.";
  } else if (resultado && !premioAtual && liberar) {
    resultado.textContent = "Tudo preenchido! Agora você pode girar a roda.";
  }
}

function formularioCompletoValido() {
  const nome = document.getElementById("nome").value.trim();
  const telefone = document.getElementById("telefone").value.trim();
  const categoria = document.getElementById("categoria").value;
  const nota = Number(notaInput.value);
  const comentario = document.getElementById("comentario").value.trim();

  return nomeCompletoValido(nome) && telefoneValido(telefone) && !!categoria && !!nota && !!comentario && !!premioAtual && jaGirou && !avaliacaoJaEnviada;
}

function atualizarBotaoEnviar() {
  if (!btnEnviarAvaliacao) return;
  const liberar = formularioCompletoValido();
  btnEnviarAvaliacao.disabled = !liberar;
  btnEnviarAvaliacao.classList.toggle("hidden", !liberar);

  if (statusEl && !liberar && !statusEl.textContent.startsWith("✅")) {
    statusEl.textContent = "Preencha todos os dados, escolha as estrelas e gire a roda para liberar o envio.";
  }
}


camposObrigatorios.forEach((campo) => {
  if (campo) campo.addEventListener("input", () => { atualizarBotaoGirar(); atualizarBotaoEnviar(); });
  if (campo) campo.addEventListener("change", () => { atualizarBotaoGirar(); atualizarBotaoEnviar(); });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("nome").value.trim();
  const telefone = document.getElementById("telefone").value.trim();
  const categoria = document.getElementById("categoria").value;
  const nota = Number(notaInput.value);
  const comentario = document.getElementById("comentario").value.trim();
  const usuarioId = gerarUsuarioIdProtegido(telefone);
  const usuarioKey = await gerarChaveTelefone(telefone);
  const telefoneProtegido = mascararTelefone(telefone);

  if (!nomeCompletoValido(nome)) return alert("Digite nome e sobrenome.");
  if (!telefoneValido(telefone)) return alert("Digite um telefone válido com DDD.");
  if (!categoria || !nota || !comentario) return alert("Preencha todos os campos.");
  if (!jaGirou || !premioAtual) return alert("Gire a roda primeiro para liberar o envio da avaliação.");

  const snapAvaliacaoExistente = await db.ref(`avaliacoesPorTelefone/${promocaoAtual}/${usuarioKey}`).once("value");
  if (snapAvaliacaoExistente.exists()) {
    avaliacaoJaEnviada = true;
    bloquearFormularioParaVisualizacao("✅ Você já enviou sua avaliação nesta promoção. Agora é somente visualização.");
    return;
  }

  const snapGiro = await db.ref(`girosPorTelefone/${promocaoAtual}/${usuarioKey}`).once("value");
  const dadosGiro = snapGiro.exists() ? snapGiro.val() : null;

  const dados = {
    usuarioKey,
    usuarioId,
    promocaoId: promocaoAtual,
    nome,
    telefone: telefoneProtegido,
    telefoneOriginal: limparTelefone(telefone),
    categoria,
    nota,
    comentario,
    descontoSorteado: dadosGiro ? dadosGiro.descontoSorteado : "Não girou a roda",
    data: new Date().toLocaleString("pt-BR"),
    timestamp: Date.now()
  };

  try {
    const novaRef = await db.ref("avaliacoes").push(dados);
    await db.ref(`avaliacoesPorTelefone/${promocaoAtual}/${usuarioKey}`).set({ ...dados, avaliacaoId: novaRef.key });
    await db.ref(`participantesPorTelefone/${promocaoAtual}/${usuarioKey}`).set({ ...dados, avaliacaoId: novaRef.key, bloqueado: true });
    await db.ref("notificacoesAdm").push({
      tipo: "avaliacao",
      titulo: "Nova avaliação enviada",
      nome,
      telefone: telefoneProtegido,
      telefoneOriginal: limparTelefone(telefone),
      usuarioId,
      categoria,
      nota,
      comentario,
      descontoSorteado: dados.descontoSorteado,
      promocaoId: promocaoAtual,
      data: new Date().toLocaleString("pt-BR"),
      timestamp: Date.now(),
      lida: false
    });
    avaliacaoJaEnviada = true;
    statusEl.textContent = "✅ Avaliação enviada e salva com sucesso no Firebase!";
    await carregarMeuComentario();
    await carregarTodosComentariosPublicos();
    bloquearFormularioParaVisualizacao("✅ Sua avaliação foi enviada. Você só pode visualizar.");
    atualizarBotaoEnviar();
  } catch (error) {
    console.error(error);
    statusEl.textContent = "❌ Erro ao salvar. Confira as regras do Firebase Realtime Database.";
  }
});

// ================= LISTAS DE COMENTÁRIOS DO FIREBASE =================
const meuComentarioLista = document.getElementById("meuComentarioLista");
const comentariosLista = document.getElementById("comentariosLista");

function cardMeuComentario(item) {
  return `
    <div class="comentario-card meu-card">
      <h3>${escapeHtml(item.nome || "Seu comentário")}</h3>
      <p class="estrelas-salvas">${renderizarEstrelas(item.nota)}</p>
      <p>Categoria: <strong>${escapeHtml(item.categoria || "")}</strong></p>
      <p>Desconto: <strong>${escapeHtml(item.descontoSorteado || "")}</strong></p>
      <p>💬 ${escapeHtml(item.comentario || "")}</p>
      <small>${escapeHtml(item.data || "")}</small>
    </div>
  `;
}

function cardComentarioPublico(item, avaliacaoKey) {
  const keyRaw = String(avaliacaoKey || montarChaveUnicaAvaliacao(item));
  const keyAttr = escapeHtml(keyRaw);
  const idSafe = respostaDomId(keyRaw);
  return `
    <div class="comentario-card publico-card" data-avaliacao-key="${keyAttr}">
      <div class="cabecalho-avaliacao">
        <button type="button" class="nome-cliente-clicavel" data-user-key="${escapeHtml(item.usuarioKey || "")}" data-nome="${escapeHtml(item.nome || "Cliente")}" title="Abrir perfil do cliente">👤 ${escapeHtml(item.nome || "Cliente")}</button>
        <div class="reacoes-avaliacao" aria-label="Reações da avaliação">
          <button type="button" class="btn-reacao btn-coracao" data-tipo="coracao" data-key="${keyAttr}" title="Dar coração">❤️ <span id="coracoes-${idSafe}">0</span></button>
          <button type="button" class="btn-reacao btn-curtida" data-tipo="curtida" data-key="${keyAttr}" title="Curtir">👍 <span id="curtidas-${idSafe}">0</span></button>
        </div>
      </div>
      <p class="estrelas-salvas">${renderizarEstrelas(item.nota)}</p>
      <p>Categoria: <strong>${escapeHtml(item.categoria || "")}</strong></p>
      <p>💬 ${escapeHtml(item.comentario || "")}</p>

      <div class="respostas-area">
        <h4 class="titulo-respostas">💬 Comentários dessa avaliação</h4>
        <div class="respostas-lista" id="respostas-${idSafe}">
          <p class="vazio pequeno">Carregando comentários...</p>
        </div>
        <button type="button" class="btn-toggle-respostas" data-key="${keyAttr}">➕ Comentar nessa avaliação</button>
        <div class="responder-box hidden" id="responder-${idSafe}">
          <input type="text" class="resposta-nome" placeholder="Seu nome" maxlength="60" />
          <textarea class="resposta-texto" rows="3" placeholder="Escreva seu comentário sobre esta avaliação..." maxlength="300"></textarea>
          <button type="button" class="btn-enviar-resposta" data-key="${keyAttr}">Enviar comentário</button>
        </div>
      </div>
    </div>
  `;
}


// ================= CURTIDAS E CORAÇÕES NAS AVALIAÇÕES =================
const observadoresReacoes = new Map();

function limparObservadoresReacoes() {
  observadoresReacoes.forEach(({ ref, callback }) => ref.off("value", callback));
  observadoresReacoes.clear();
}

function observarReacoesAvaliacao(avaliacaoKey) {
  const safeKey = respostaPathKey(avaliacaoKey);
  const idSafe = respostaDomId(avaliacaoKey);
  const ref = db.ref("curtidasAvaliacoes/" + safeKey);
  const callback = (snap) => {
    const dados = snap.val() || {};
    const curtidasEl = document.getElementById("curtidas-" + idSafe);
    const coracoesEl = document.getElementById("coracoes-" + idSafe);
    if (curtidasEl) curtidasEl.textContent = Number(dados.curtidas || 0);
    if (coracoesEl) coracoesEl.textContent = Number(dados.coracoes || 0);
  };
  ref.on("value", callback);
  observadoresReacoes.set(safeKey, { ref, callback });
}

async function obterTelefoneParaReacao() {
  const campo = document.getElementById("telefone");
  let telefone = campo ? limparTelefone(campo.value) : "";
  if (!telefoneValido(telefone)) {
    telefone = limparTelefone(prompt("Digite seu telefone com DDD para registrar sua reação:"));
  }
  if (!telefoneValido(telefone)) {
    alert("Digite um telefone válido com DDD.");
    return null;
  }
  return telefone;
}

async function registrarReacao(avaliacaoKey, tipo, botao) {
  const telefone = await obterTelefoneParaReacao();
  if (!telefone) return;

  const usuarioKey = await gerarChaveTelefone(telefone);
  const safeKey = respostaPathKey(avaliacaoKey);
  const campoContador = tipo === "coracao" ? "coracoes" : "curtidas";
  const campoUsuario = tipo === "coracao" ? "coracao" : "curtida";
  const ref = db.ref("curtidasAvaliacoes/" + safeKey);

  botao.disabled = true;
  try {
    const resultadoTx = await ref.transaction((atual) => {
      atual = atual || { curtidas: 0, coracoes: 0, usuarios: {} };
      atual.usuarios = atual.usuarios || {};
      atual.usuarios[usuarioKey] = atual.usuarios[usuarioKey] || {};

      if (atual.usuarios[usuarioKey][campoUsuario] === true) {
        return;
      }

      atual.usuarios[usuarioKey][campoUsuario] = true;
      atual[campoContador] = Number(atual[campoContador] || 0) + 1;
      atual.atualizadoEm = Date.now();
      return atual;
    });

    if (!resultadoTx.committed) {
      alert(tipo === "coracao" ? "Você já deixou um coração nesta avaliação." : "Você já curtiu esta avaliação.");
      return;
    }

    botao.classList.add("reagiu");
    setTimeout(() => botao.classList.remove("reagiu"), 350);
  } catch (error) {
    console.error("Erro ao registrar reação:", error);
    alert("Não foi possível registrar a reação. Confira a conexão e as regras do Firebase.");
  } finally {
    botao.disabled = false;
  }
}

async function carregarMeuComentario() {
  if (!meuComentarioLista) return;
  atualizarUsuarioAtual();

  if (!telefoneValido(telefoneAtual)) {
    meuComentarioLista.innerHTML = '<p class="vazio">Digite seu telefone para localizar seu comentário.</p>';
    return;
  }

  try {
    const usuarioKey = await gerarChaveTelefone(telefoneAtual);
    const snapParticipante = await db.ref(`participantesPorTelefone/${promocaoAtual}/${usuarioKey}`).once("value");
    const snapAvaliacao = await db.ref(`avaliacoesPorTelefone/${promocaoAtual}/${usuarioKey}`).once("value");
    const dados = snapParticipante.exists() ? snapParticipante.val() : (snapAvaliacao.exists() ? snapAvaliacao.val() : null);

    if (!dados || !dados.comentario) {
      meuComentarioLista.innerHTML = '<p class="vazio">Seu comentário ainda não foi enviado.</p>';
      return;
    }

    meuComentarioLista.innerHTML = cardMeuComentario(dados);
  } catch (error) {
    console.error(error);
    meuComentarioLista.innerHTML = '<p class="vazio">Não foi possível carregar seu comentário agora.</p>';
  }
}

function montarChaveUnicaAvaliacao(item) {
  return item.avaliacaoId || item.usuarioKey || (String(item.telefoneOriginal || "") + "_" + String(item.timestamp || ""));
}

function desenharComentariosPublicos(mapa) {
  if (!comentariosLista) return;
  const dados = Object.values(mapa)
    .filter((item) => item && item.comentario)
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

  window.__comentariosPublicosMapa = mapa;
  window.__comentariosPublicosLista = dados;
  comentariosLista.innerHTML = "";
  if (!dados.length) {
    comentariosLista.innerHTML = '<p class="vazio">Nenhum comentário ainda.</p>';
    return;
  }

  limparObservadoresReacoes();
  dados.forEach((item) => {
    const avaliacaoKey = montarChaveUnicaAvaliacao(item);
    const div = document.createElement("div");
    div.innerHTML = cardComentarioPublico(item, avaliacaoKey);
    comentariosLista.appendChild(div.firstElementChild);
    carregarRespostasDaAvaliacao(avaliacaoKey);
    observarReacoesAvaliacao(avaliacaoKey);
  });
}

function respostaPathKey(key) {
  return String(key || "").replace(/[.#$\[\]/]/g, "_");
}
function respostaDomId(key) {
  return respostaPathKey(key).replace(/[^A-Za-z0-9_-]/g, "_");
}
function possiveisChavesResposta(itemOuKey) {
  const item = typeof itemOuKey === "object" ? itemOuKey : null;
  const base = item ? [item.avaliacaoId, item.key, item.usuarioKey, montarChaveUnicaAvaliacao(item)] : [itemOuKey];
  const out = [];
  base.filter(Boolean).forEach((k) => {
    const raw = String(k);
    const safe = respostaPathKey(raw);
    if (!out.includes(raw)) out.push(raw);
    if (!out.includes(safe)) out.push(safe);
  });
  return out;
}

async function carregarRespostasDaAvaliacao(avaliacaoKey) {
  const idSafe = respostaDomId(avaliacaoKey);
  const el = document.getElementById("respostas-" + idSafe);
  if (!el) return;

  try {
    const respostasMap = {};
    for (const key of possiveisChavesResposta(avaliacaoKey)) {
      const safeKey = respostaPathKey(key);
      const snap = await db.ref("respostasAvaliacoes/" + safeKey).orderByChild("timestamp").limitToLast(80).once("value");
      if (snap.exists()) {
        snap.forEach((child) => {
          const r = { id: child.key, ...child.val() };
          respostasMap[child.key + "_" + (r.timestamp || "")] = r;
        });
      }
    }
    const respostas = Object.values(respostasMap).sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

    if (!respostas.length) {
      el.innerHTML = '<p class="vazio pequeno">Nenhum comentário nessa avaliação ainda.</p>';
      return;
    }

    el.innerHTML = respostas.map((r) => `
      <div class="resposta-item">
        <strong>👤 ${escapeHtml(r.nome || "Cliente")}</strong>
        <p>💬 ${escapeHtml(r.comentario || "")}</p>
        <small>${escapeHtml(r.data || "")}</small>
      </div>
    `).join("");
  } catch (error) {
    console.error(error);
    el.innerHTML = '<p class="vazio pequeno">Erro ao carregar comentários dessa avaliação.</p>';
  }
}

async function enviarRespostaAvaliacao(avaliacaoKey, card) {
  const nomeEl = card.querySelector(".resposta-nome");
  const textoEl = card.querySelector(".resposta-texto");
  const nome = nomeEl ? nomeEl.value.trim() : "";
  const comentario = textoEl ? textoEl.value.trim() : "";

  if (!nome) return alert("Digite seu nome para comentar.");
  if (!comentario) return alert("Digite o comentário.");

  const safeKey = respostaPathKey(avaliacaoKey);
  const dados = {
    avaliacaoKey: safeKey,
    nome,
    comentario,
    data: new Date().toLocaleString("pt-BR"),
    timestamp: Date.now()
  };

  try {
    await db.ref("respostasAvaliacoes/" + safeKey).push(dados);
    await db.ref("notificacoesAdm").push({
      tipo: "resposta_avaliacao",
      titulo: "Nova resposta em avaliação",
      nome,
      comentario,
      promocaoId: promocaoAtual,
      data: dados.data,
      timestamp: dados.timestamp,
      lida: false
    });
    if (textoEl) textoEl.value = "";
    await carregarRespostasDaAvaliacao(avaliacaoKey);
    alert("Comentário enviado com sucesso.");
  } catch (error) {
    console.error(error);
    alert("Erro ao enviar comentário. Confira as regras do Firebase.");
  }
}

// ================= PERFIL PÚBLICO DO CLIENTE =================
const perfilClienteModal = document.getElementById("perfilClienteModal");
const perfilClienteConteudo = document.getElementById("perfilClienteConteudo");
const btnFecharPerfilCliente = document.getElementById("btnFecharPerfilCliente");

function normalizarNomePerfil(nome) {
  return String(nome || "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function buscarAvaliacoesDoCliente(usuarioKey, nome) {
  const mapa = {};
  const nomeNormalizado = normalizarNomePerfil(nome);
  const adicionar = (item, keyExtra = "") => {
    if (!item || !item.comentario) return;
    const mesmoUsuario = usuarioKey && item.usuarioKey === usuarioKey;
    const mesmoNome = !usuarioKey && normalizarNomePerfil(item.nome) === nomeNormalizado;
    if (!mesmoUsuario && !mesmoNome) return;
    const chave = montarChaveUnicaAvaliacao(item) || keyExtra || String(item.timestamp || Math.random());
    mapa[chave] = { ...mapa[chave], ...item, avaliacaoKey: chave };
  };

  const listaMemoria = window.__comentariosPublicosLista || [];
  listaMemoria.forEach((item) => adicionar(item));

  const [snapAvaliacoes, snapPorTelefone, snapParticipantes] = await Promise.all([
    db.ref("avaliacoes").once("value"),
    db.ref("avaliacoesPorTelefone").once("value"),
    db.ref("participantesPorTelefone").once("value")
  ]);

  if (snapAvaliacoes.exists()) snapAvaliacoes.forEach((c) => adicionar({ avaliacaoId: c.key, ...c.val() }, c.key));
  if (snapPorTelefone.exists()) snapPorTelefone.forEach((promo) => promo.forEach((c) => adicionar({ promocaoId: promo.key, ...c.val() }, c.key)));
  if (snapParticipantes.exists()) snapParticipantes.forEach((promo) => promo.forEach((c) => adicionar({ promocaoId: promo.key, ...c.val() }, c.key)));

  return Object.values(mapa).sort((a,b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}

async function carregarResumoAvaliacaoPerfil(item) {
  const key = montarChaveUnicaAvaliacao(item);
  const safeKey = respostaPathKey(key);
  const [snapReacoes, snapRespostas] = await Promise.all([
    db.ref("curtidasAvaliacoes/" + safeKey).once("value"),
    db.ref("respostasAvaliacoes/" + safeKey).once("value")
  ]);
  const reacoes = snapReacoes.val() || {};
  const respostas = [];
  if (snapRespostas.exists()) snapRespostas.forEach((c) => respostas.push({ id: c.key, ...c.val() }));
  respostas.sort((a,b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  return { reacoes, respostas };
}

async function abrirPerfilCliente(usuarioKey, nome) {
  if (!perfilClienteModal || !perfilClienteConteudo) return;
  perfilClienteModal.classList.remove("hidden");
  perfilClienteConteudo.innerHTML = '<p class="vazio">Carregando todos os registros públicos deste cliente...</p>';
  try {
    const avaliacoes = await buscarAvaliacoesDoCliente(usuarioKey, nome);
    if (!avaliacoes.length) {
      perfilClienteConteudo.innerHTML = '<p class="vazio">Nenhum registro público encontrado para este cliente.</p>';
      return;
    }
    const detalhes = await Promise.all(avaliacoes.map(carregarResumoAvaliacaoPerfil));
    const totalCurtidas = detalhes.reduce((s,d) => s + Number(d.reacoes.curtidas || 0), 0);
    const totalCoracoes = detalhes.reduce((s,d) => s + Number(d.reacoes.coracoes || 0), 0);
    const totalRespostas = detalhes.reduce((s,d) => s + d.respostas.length, 0);

    perfilClienteConteudo.innerHTML = `
      <div class="perfil-resumo">
        <h3>👤 ${escapeHtml(nome || avaliacoes[0].nome || "Cliente")}</h3>
        <p><strong>${avaliacoes.length}</strong> avaliação(ões) pública(s)</p>
        <p>❤️ ${totalCoracoes} &nbsp; 👍 ${totalCurtidas} &nbsp; 💬 ${totalRespostas}</p>
      </div>
      <div class="perfil-avaliacoes-lista">
        ${avaliacoes.map((item, i) => {
          const d = detalhes[i];
          return `
            <article class="perfil-avaliacao-item">
              <div class="perfil-avaliacao-topo">
                <span>${renderizarEstrelas(item.nota)}</span>
                <span>❤️ ${Number(d.reacoes.coracoes || 0)} &nbsp; 👍 ${Number(d.reacoes.curtidas || 0)}</span>
              </div>
              <p>Categoria: <strong>${escapeHtml(item.categoria || "")}</strong></p>
              <p>🎁 Desconto: <strong>${escapeHtml(item.descontoSorteado || "")}</strong></p>
              <p>💬 ${escapeHtml(item.comentario || "")}</p>
              <small>${escapeHtml(item.data || "")} ${item.promocaoId ? "• " + escapeHtml(item.promocaoId) : ""}</small>
              <div class="perfil-respostas">
                <strong>Respostas (${d.respostas.length})</strong>
                ${d.respostas.length ? d.respostas.map(r => `<div class="perfil-resposta-item"><b>👤 ${escapeHtml(r.nome || "Cliente")}</b><p>${escapeHtml(r.comentario || "")}</p><small>${escapeHtml(r.data || "")}</small></div>`).join("") : '<p class="vazio pequeno">Sem respostas nessa avaliação.</p>'}
              </div>
            </article>`;
        }).join("")}
      </div>`;
  } catch (error) {
    console.error("Erro ao abrir perfil público:", error);
    perfilClienteConteudo.innerHTML = '<p class="vazio">Não foi possível carregar o perfil agora.</p>';
  }
}

if (btnFecharPerfilCliente) btnFecharPerfilCliente.addEventListener("click", () => perfilClienteModal.classList.add("hidden"));
if (perfilClienteModal) perfilClienteModal.addEventListener("click", (e) => { if (e.target === perfilClienteModal) perfilClienteModal.classList.add("hidden"); });

if (comentariosLista) {
  comentariosLista.addEventListener("click", async (e) => {
    const nomeClicavel = e.target.closest(".nome-cliente-clicavel");
    if (nomeClicavel) {
      await abrirPerfilCliente(nomeClicavel.dataset.userKey || "", nomeClicavel.dataset.nome || "Cliente");
      return;
    }

    const reacao = e.target.closest(".btn-reacao");
    if (reacao) {
      await registrarReacao(reacao.dataset.key, reacao.dataset.tipo, reacao);
      return;
    }

    const toggle = e.target.closest(".btn-toggle-respostas");
    if (toggle) {
      const key = toggle.dataset.key;
      const box = document.getElementById("responder-" + respostaDomId(key));
      if (box) box.classList.toggle("hidden");
      return;
    }

    const enviar = e.target.closest(".btn-enviar-resposta");
    if (enviar) {
      const key = enviar.dataset.key;
      const card = enviar.closest(".publico-card");
      enviar.disabled = true;
      await enviarRespostaAvaliacao(key, card);
      enviar.disabled = false;
    }
  });
}

async function carregarTodosComentariosPublicos() {
  if (!comentariosLista) return;
  comentariosLista.innerHTML = '<p class="vazio">Carregando todos os comentários...</p>';

  const mapa = {};

  // 1) Lista principal de avaliações.
  const snapAvaliacoes = await db.ref("avaliacoes").orderByChild("timestamp").limitToLast(200).once("value");
  if (snapAvaliacoes.exists()) {
    snapAvaliacoes.forEach((child) => {
      const item = { avaliacaoId: child.key, ...child.val() };
      mapa[montarChaveUnicaAvaliacao(item)] = item;
    });
  }

  // 2) Backup por telefone de todas as promoções. Assim aparece mesmo quando a lista principal foi apagada no ADM.
  const snapPorTelefoneTodas = await db.ref("avaliacoesPorTelefone").once("value");
  if (snapPorTelefoneTodas.exists()) {
    snapPorTelefoneTodas.forEach((promoSnap) => {
      promoSnap.forEach((child) => {
        const item = { promocaoId: promoSnap.key, ...child.val() };
        mapa[montarChaveUnicaAvaliacao(item)] = item;
      });
    });
  }

  // 3) Participantes bloqueados de todas as promoções. Mantém todos que já avaliaram visíveis na lista pública.
  const snapParticipantesTodas = await db.ref("participantesPorTelefone").once("value");
  if (snapParticipantesTodas.exists()) {
    snapParticipantesTodas.forEach((promoSnap) => {
      promoSnap.forEach((child) => {
        const item = { promocaoId: promoSnap.key, ...child.val() };
        mapa[montarChaveUnicaAvaliacao(item)] = item;
      });
    });
  }

  desenharComentariosPublicos(mapa);
}

db.ref("avaliacoes").on("value", carregarTodosComentariosPublicos);
function ouvirPromocaoAtual() {
  db.ref("config/promocaoAtual").on("value", async (snap) => {
    const val = snap.exists() ? String(snap.val() || "").trim() : "";
    if (val && val !== "promo_1" && val !== "carregando...") {
      promocaoAtual = val;
      if (promoAtualTexto) promoAtualTexto.textContent = promocaoAtual;
      await atualizarContadoresVisitasPublicos();
      await carregarTodosComentariosPublicos();
      if (adminPainel && !adminPainel.classList.contains("hidden")) await atualizarPainelAdmin();
    }
  });
}
ouvirPromocaoAtual();

// ================= ADM =================
const adminModal = document.getElementById("adminModal");
const btnAbrirAdmin = document.getElementById("btnAbrirAdmin");
const btnFecharAdmin = document.getElementById("btnFecharAdmin");
const btnEntrarAdmin = document.getElementById("btnEntrarAdmin");
const loginAdmin = document.getElementById("loginAdmin");
const senhaAdmin = document.getElementById("senhaAdmin");
const adminErro = document.getElementById("adminErro");
const adminLogin = document.getElementById("adminLogin");
const adminPainel = document.getElementById("adminPainel");
const promoAtualTexto = document.getElementById("promoAtualTexto");
const totalGirosTexto = document.getElementById("totalGirosTexto");
const totalAvaliacoesTexto = document.getElementById("totalAvaliacoesTexto");
const btnNovaPromocao = document.getElementById("btnNovaPromocao");
const btnLimparPromocao = document.getElementById("btnLimparPromocao");
const btnVerAvaliacoes = document.getElementById("btnVerAvaliacoes");
const btnExportarPDF = document.getElementById("btnExportarPDF");
const btnExcluirComentarios = document.getElementById("btnExcluirComentarios");
const btnVerGiros = document.getElementById("btnVerGiros");
const btnVerNotificacoes = document.getElementById("btnVerNotificacoes");
const btnRecuperarSenha = document.getElementById("btnRecuperarSenha");
const btnSairAdmin = document.getElementById("btnSairAdmin");
const adminUsuarioLogado = document.getElementById("adminUsuarioLogado");
const adminAvaliacoes = document.getElementById("adminAvaliacoes");
const adminGiros = document.getElementById("adminGiros");
const adminNotificacoes = document.getElementById("adminNotificacoes");
const btnVerAgendamentos = document.getElementById("btnVerAgendamentos");
const adminAgendamentos = document.getElementById("adminAgendamentos");

btnAbrirAdmin.addEventListener("click", () => adminModal.classList.remove("hidden"));
btnFecharAdmin.addEventListener("click", () => adminModal.classList.add("hidden"));

btnEntrarAdmin.addEventListener("click", async () => {
  const email = loginAdmin.value.trim();
  const senha = senhaAdmin.value.trim();
  if (!email || !senha) {
    adminErro.textContent = "Digite e-mail e senha do ADM.";
    return;
  }
  try {
    adminErro.textContent = "Entrando...";
    await auth.signInWithEmailAndPassword(email, senha);
    adminErro.textContent = "";
  } catch (error) {
    console.error(error);
    adminErro.textContent = "Erro no login. Confira o e-mail/senha ou ative E-mail/Senha no Firebase Authentication.";
  }
});

if (btnRecuperarSenha) {
  btnRecuperarSenha.addEventListener("click", async () => {
    const email = loginAdmin.value.trim();
    if (!email) return alert("Digite o e-mail do ADM primeiro.");
    try {
      await auth.sendPasswordResetEmail(email);
      alert("E-mail de recuperação enviado.");
    } catch (error) {
      console.error(error);
      alert("Não foi possível enviar recuperação. Confira o e-mail.");
    }
  });
}

if (btnSairAdmin) {
  btnSairAdmin.addEventListener("click", async () => {
    await auth.signOut();
  });
}

auth.onAuthStateChanged(async (user) => {
  if (user) {
    adminLogin.classList.add("hidden");
    adminPainel.classList.remove("hidden");
    if (adminUsuarioLogado) adminUsuarioLogado.textContent = user.email || "ADM conectado";
    await atualizarPainelAdmin();
    ativarNotificacoesTempoRealAdm();
  } else {
    adminLogin.classList.remove("hidden");
    adminPainel.classList.add("hidden");
    if (adminUsuarioLogado) adminUsuarioLogado.textContent = "";
  }
});

async function atualizarPainelAdmin() {
  if (!promocaoAtual || promocaoAtual === "promo_1") await carregarPromocaoAtual();
  if (promoAtualTexto) promoAtualTexto.textContent = promocaoAtual || "carregando...";

  let totalGiros = 0;
  try {
    const snapGirosPromo = await db.ref(`girosPorTelefone/${promocaoAtual}`).once("value");
    totalGiros = snapGirosPromo.exists() ? snapGirosPromo.numChildren() : 0;
  } catch (e) { console.warn(e); }
  if (totalGirosTexto) totalGirosTexto.textContent = totalGiros;

  await atualizarContadoresVisitasPublicos();
  const listaAvaliacoesCompleta = await carregarTodasAvaliacoesAdmin();
  if (totalAvaliacoesTexto) totalAvaliacoesTexto.textContent = listaAvaliacoesCompleta.length;
  await atualizarResumoAgendamentosAdm();
}

btnNovaPromocao.addEventListener("click", async () => {
  if (!confirm("Criar uma nova promoção? Todos poderão girar novamente.")) return;
  promocaoAtual = "promo_" + Date.now();
  await db.ref("config/promocaoAtual").set(promocaoAtual);
  await limparConfiguracaoDuplicada();
  await db.ref("promocoes/" + promocaoAtual).set({ criadaEm: new Date().toLocaleString("pt-BR"), ativa: true });
  jaGirou = false;
  avaliacaoJaEnviada = false;
  premioAtual = "";
  desbloquearFormulario();
  await verificarSeJaGirou();
  await atualizarPainelAdmin();
  alert("Nova promoção criada. Agora todos podem girar novamente.");
});

btnLimparPromocao.addEventListener("click", async () => {
  if (!confirm("Limpar todos os giros da promoção atual? Isso libera todos para girar de novo.")) return;
  await db.ref(`girosPorTelefone/${promocaoAtual}`).remove();
  await db.ref(`participantesPorTelefone/${promocaoAtual}`).remove();
  await db.ref(`avaliacoesPorTelefone/${promocaoAtual}`).remove();
  jaGirou = false;
  avaliacaoJaEnviada = false;
  premioAtual = "";
  desbloquearFormulario();
  await verificarSeJaGirou();
  await atualizarPainelAdmin();
  alert("Giros da promoção atual limpos. Agora todos podem girar novamente.");
});

btnVerAvaliacoes.addEventListener("click", async () => {
  adminAvaliacoes.classList.toggle("hidden");
  if (!adminAvaliacoes.classList.contains("hidden")) {
    await carregarAvaliacoesAdmin();
  }
});

function chaveAdminItem(item) {
  return item.avaliacaoId || item.key || ((item.promocaoId || "sem_promo") + "_" + (item.usuarioKey || item.telefoneOriginal || item.timestamp || Math.random()));
}

async function carregarTodasAvaliacoesAdmin() {
  const mapa = {};

  // Lista principal de avaliações.
  const snapAvaliacoes = await db.ref("avaliacoes").orderByChild("timestamp").once("value");
  if (snapAvaliacoes.exists()) {
    snapAvaliacoes.forEach((child) => {
      const item = { key: child.key, avaliacaoId: child.key, origem: "avaliacoes", ...child.val() };
      mapa[chaveAdminItem(item)] = item;
    });
  }

  // Todas as avaliações salvas por telefone, de todas as promoções.
  const snapPorTelefoneTodas = await db.ref("avaliacoesPorTelefone").once("value");
  if (snapPorTelefoneTodas.exists()) {
    snapPorTelefoneTodas.forEach((promoSnap) => {
      promoSnap.forEach((userSnap) => {
        const item = { origem: "avaliacoesPorTelefone", promocaoId: promoSnap.key, ...userSnap.val() };
        mapa[chaveAdminItem(item)] = { ...mapa[chaveAdminItem(item)], ...item };
      });
    });
  }

  // Participantes bloqueados, para não sumir cliente quando a avaliação principal tiver sido apagada.
  const snapParticipantesTodas = await db.ref("participantesPorTelefone").once("value");
  if (snapParticipantesTodas.exists()) {
    snapParticipantesTodas.forEach((promoSnap) => {
      promoSnap.forEach((userSnap) => {
        const item = { origem: "participantesPorTelefone", promocaoId: promoSnap.key, ...userSnap.val() };
        if (item.comentario) mapa[chaveAdminItem(item)] = { ...item, ...mapa[chaveAdminItem(item)] };
      });
    });
  }

  return Object.values(mapa)
    .filter((item) => item && (item.nome || item.telefone || item.comentario))
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}

async function carregarAvaliacoesAdmin() {
  adminAvaliacoes.innerHTML = "<p>Carregando lista completa...</p>";
  const lista = await carregarTodasAvaliacoesAdmin();

  if (!lista.length) {
    adminAvaliacoes.innerHTML = '<p class="vazio">Nenhuma avaliação salva.</p>';
    return;
  }

  window.__listaAvaliacoesAdmin = lista;
  adminAvaliacoes.innerHTML = `
    <div class="admin-ajuda-pdf">✅ Marque 1 perfil abaixo e clique em <strong>COMPARTILHAR WHATSAPP</strong>.</div>
  ` + lista.map((item, index) => {
    const key = item.key || item.avaliacaoId || "";
    return `
      <div class="admin-item">
        <label class="check-pdf">
          <input type="checkbox" class="selecionar-pdf" value="${index}">
          <span>Marcar para WhatsApp</span>
        </label>
        <strong>${escapeHtml(item.nome || "Sem nome")}</strong><br>
        🆔 ${escapeHtml(item.usuarioId || "")}<br>
        📞 ${escapeHtml(item.telefone || "")}<br>
        ${renderizarEstrelas(item.nota)} | ${escapeHtml(item.categoria || "")}<br>
        🎁 Desconto: ${escapeHtml(item.descontoSorteado || "")}<br>
        💬 ${escapeHtml(item.comentario || "")}<br>
        <small>${escapeHtml(item.data || "")} | ${escapeHtml(item.promocaoId || "")}</small>
        ${key ? `<button class="btn-mini perigo-mini" onclick="excluirUmaAvaliacao('${escapeHtml(key)}', '${escapeHtml(item.promocaoId || "")}', '${escapeHtml(item.usuarioKey || "")}')">Excluir</button>` : ""}
      </div>
    `;
  }).join("");
}

window.excluirUmaAvaliacao = async function(key, promocaoId, usuarioKey) {
  if (!confirm("Excluir esta avaliação?")) return;
  try {
    const snap = await db.ref("avaliacoes/" + key).once("value");
    const dados = snap.exists() ? snap.val() : {};
    const promo = promocaoId || dados.promocaoId;
    const userKey = usuarioKey || dados.usuarioKey;

    if (key) await db.ref("avaliacoes/" + key).remove();
    if (promo && userKey) {
      await db.ref(`avaliacoesPorTelefone/${promo}/${userKey}`).remove();
      await db.ref(`participantesPorTelefone/${promo}/${userKey}`).update({
        comentario: null,
        categoria: null,
        nota: null,
        avaliacaoId: null,
        avaliacaoExcluida: true
      });
    }

    // Mantém participantesPorTelefone e girosPorTelefone para o cliente continuar bloqueado.
    // Assim ele não consegue enviar outra avaliação depois que o comentário foi excluído do painel.

    await carregarAvaliacoesAdmin();
    await carregarTodosComentariosPublicos();
    await atualizarPainelAdmin();
    alert("Avaliação excluída com sucesso.");
  } catch (error) {
    console.error(error);
    alert("Erro ao excluir avaliação. Confira as regras do Firebase.");
  }
};

btnExportarPDF.addEventListener("click", async () => {
  let listaBase = window.__listaAvaliacoesAdmin || [];
  if (!listaBase.length) {
    listaBase = await carregarTodasAvaliacoesAdmin();
    window.__listaAvaliacoesAdmin = listaBase;
  }
  if (!listaBase.length) return alert("Não tem avaliações para compartilhar.");

  const marcados = Array.from(document.querySelectorAll(".selecionar-pdf:checked"))
    .map((el) => listaBase[Number(el.value)])
    .filter(Boolean);

  if (!marcados.length) {
    alert("Marque 1 perfil na lista para compartilhar no WhatsApp.");
    if (adminAvaliacoes && adminAvaliacoes.classList.contains("hidden")) {
      adminAvaliacoes.classList.remove("hidden");
      await carregarAvaliacoesAdmin();
    }
    return;
  }

  if (marcados.length > 1) {
    alert("Marque somente 1 perfil por vez para enviar no WhatsApp do cliente.");
    return;
  }

  const a = marcados[0];
  const telefoneOriginal = String(a.telefoneOriginal || a.telefone || "").replace(/\D/g, "");
  if (!telefoneOriginal) {
    alert("Este perfil não tem telefone salvo.");
    return;
  }

  let telefoneComDDD = telefoneOriginal;
  let telefoneSemDDD = telefoneOriginal;

  if (telefoneOriginal.length >= 10) {
    telefoneSemDDD = telefoneOriginal.slice(-9);
  } else {
    const ddd = prompt("Digite o DDD do cliente para enviar com DDD. Exemplo: 34\n\nSe quiser tentar sem DDD, deixe vazio e aperte OK.");
    const dddLimpo = String(ddd || "").replace(/\D/g, "");
    if (dddLimpo) telefoneComDDD = dddLimpo + telefoneOriginal;
  }

  const mensagem = [
    "*Avaliação do Cliente - Passadoria*",
    "",
    `*Nome:* ${a.nome || "Sem nome"}`,
    `*Telefone:* ${a.telefoneOriginal || a.telefone || ""}`,
    `*ID:* ${a.usuarioId || ""}`,
    `*Categoria:* ${a.categoria || ""}`,
    `*Estrelas:* ${a.nota || ""}/5`,
    `*Desconto:* ${a.descontoSorteado || ""}`,
    `*Comentário:* ${a.comentario || ""}`,
    `*Promoção:* ${a.promocaoId || ""}`,
    `*Data:* ${a.data || ""}`
  ].join("\n");

  function abrirWhats(numero) {
    let n = String(numero || "").replace(/\D/g, "");
    if (!n) return alert("Número inválido.");
    // Para número brasileiro com DDD, usa código do Brasil 55.
    if (n.length >= 10 && !n.startsWith("55")) n = "55" + n;
    const url = "https://wa.me/" + n + "?text=" + encodeURIComponent(mensagem);
    window.open(url, "_blank");
  }

  if (telefoneOriginal.length >= 10) {
    abrirWhats(telefoneComDDD);
  } else {
    const escolher = confirm("Quer tentar enviar COM DDD?\n\nOK = com DDD\nCancelar = sem DDD");
    abrirWhats(escolher ? telefoneComDDD : telefoneSemDDD);
  }
});

btnExcluirComentarios.addEventListener("click", async () => {
  if (!confirm("Excluir TODOS os comentários/avaliações da lista? Os usuários que já participaram continuarão bloqueados nesta promoção.")) return;
  await db.ref("avaliacoes").remove();
  // Não apaga participantesPorTelefone nem girosPorTelefone. Isso mantém o bloqueio de quem já participou.
  adminAvaliacoes.innerHTML = '<p class="vazio">Comentários apagados. Os participantes continuam bloqueados.</p>';
  await carregarTodosComentariosPublicos();
  await atualizarPainelAdmin();
  alert("Comentários excluídos. Quem já participou continua bloqueado.");
});


async function carregarGirosAdmin() {
  if (!adminGiros) return;
  adminGiros.innerHTML = "<p>Carregando lista completa de giros...</p>";
  const mapa = {};

  function addGiro(item) {
    if (!item || typeof item !== "object") return;
    if (!item.descontoSorteado && !item.premioAtual && !item.premio && !item.desconto) return;
    const chave = (item.promocaoId || item.promocaoAtual || item.promo || "sem_promo") + "_" +
      (item.usuarioKey || item.key || item.telefoneOriginal || item.telefone || item.timestamp || Math.random());
    mapa[chave] = { ...mapa[chave], ...item };
  }

  function varrerNo(obj, caminho = "") {
    if (!obj || typeof obj !== "object") return;
    const pareceGiro = obj.descontoSorteado || obj.premioAtual || obj.premio || obj.desconto;
    if (pareceGiro) addGiro({ key: caminho.split("/").pop(), ...obj });
    Object.keys(obj).forEach((k) => {
      const v = obj[k];
      if (v && typeof v === "object") varrerNo(v, caminho ? caminho + "/" + k : k);
    });
  }

  // Lê todos os índices possíveis, inclusive estruturas antigas/aninhadas.
  const caminhos = ["girosPorTelefone", "giros", "participantesPorTelefone", "avaliacoesPorTelefone"];
  for (const caminho of caminhos) {
    try {
      const snap = await db.ref(caminho).once("value");
      if (snap.exists()) varrerNo(snap.val(), caminho);
    } catch (e) { console.warn("Erro ao ler", caminho, e); }
  }

  const lista = Object.values(mapa).sort((a,b) => Number(b.timestamp||0)-Number(a.timestamp||0));
  if (!lista.length) {
    adminGiros.innerHTML = '<p class="vazio">Nenhum giro salvo ainda.</p>';
    return;
  }

  adminGiros.innerHTML = `<div class="admin-ajuda-pdf">🎯 Lista completa com todos os giros encontrados no Firebase.</div>` + lista.map((g) => `
    <div class="admin-item">
      <strong>${escapeHtml(g.nome || "Sem nome")}</strong><br>
      🆔 ${escapeHtml(g.usuarioId || "")}
      <br>📞 ${escapeHtml(g.telefone || "")}
      <br>🎁 Desconto sorteado: <strong>${escapeHtml(g.descontoSorteado || g.premioAtual || g.premio || g.desconto || "")}</strong>
      <br><small>${escapeHtml(g.data || "")} | ${escapeHtml(g.promocaoId || g.promocaoAtual || "")}</small>
    </div>`).join("");
}

if (btnVerGiros) {
  btnVerGiros.addEventListener("click", async () => {
    if (!adminGiros) return;
    adminGiros.classList.toggle("hidden");
    if (!adminGiros.classList.contains("hidden")) await carregarGirosAdmin();
  });
}

async function carregarNotificacoesAdm() {
  if (!adminNotificacoes) return;
  adminNotificacoes.innerHTML = "<p>Carregando notificações...</p>";
  const mapa = {};

  function addNotif(item) {
    if (!item || typeof item !== "object") return;
    const temConteudo = item.titulo || item.tipo || item.nome || item.descontoSorteado || item.comentario || item.data;
    if (!temConteudo) return;
    const chave = item.key || item.notificacaoId || (String(item.tipo || "notif") + "_" + String(item.timestamp || Math.random()) + "_" + String(item.usuarioKey || item.telefone || ""));
    mapa[chave] = { ...mapa[chave], ...item };
  }

  function varrerNo(obj, caminho = "") {
    if (!obj || typeof obj !== "object") return;
    const pareceNotif = obj.titulo || obj.tipo || obj.descontoSorteado || obj.comentario || obj.nome;
    if (pareceNotif) addNotif({ key: caminho.split("/").pop(), ...obj });
    Object.keys(obj).forEach((k) => {
      const v = obj[k];
      if (v && typeof v === "object") varrerNo(v, caminho ? caminho + "/" + k : k);
    });
  }

  // Lê todos os índices possíveis de notificação.
  const caminhos = ["notificacoesAdm", "notificacoes", "notificacoesAdmin", "notificacoes_adm"];
  for (const caminho of caminhos) {
    try {
      const snap = await db.ref(caminho).once("value");
      if (snap.exists()) varrerNo(snap.val(), caminho);
    } catch (e) { console.warn("Erro ao ler", caminho, e); }
  }

  // Garante que cada giro também apareça na lista de notificações.
  try {
    const snapGiros = await db.ref("giros").once("value");
    if (snapGiros.exists()) {
      snapGiros.forEach((child) => {
        const g = child.val() || {};
        addNotif({ key: "giro_" + child.key, tipo: "giro", titulo: "Novo giro realizado", ...g });
      });
    }
  } catch(e) { console.warn(e); }

  const lista = Object.values(mapa).sort((a,b) => Number(b.timestamp||0)-Number(a.timestamp||0));
  if (!lista.length) {
    adminNotificacoes.innerHTML = '<p class="vazio">Nenhuma notificação ainda.</p>';
    return;
  }

  adminNotificacoes.innerHTML = `<div class="admin-ajuda-pdf">🔔 Lista completa com todas as notificações encontradas.</div>` + lista.map((n) => `
    <div class="admin-item ${n.lida ? '' : 'notificacao-nova'}">
      <strong>🔔 ${escapeHtml(n.titulo || n.tipo || "Notificação")}</strong><br>
      👤 ${escapeHtml(n.nome || "Sem nome")}<br>
      📞 ${escapeHtml(n.telefone || "")}<br>
      🎁 ${escapeHtml(n.descontoSorteado || n.premioAtual || n.premio || n.desconto || "")}<br>
      ${n.categoria ? `⭐ ${escapeHtml(n.nota || "")}/5 | ${escapeHtml(n.categoria || "")}<br>` : ""}
      ${n.comentario ? `💬 ${escapeHtml(n.comentario || "")}<br>` : ""}
      <small>${escapeHtml(n.data || "")} | ${escapeHtml(n.promocaoId || n.promocaoAtual || "")}</small>
    </div>`).join("");

  const updates = {};
  lista.filter(n => n.key && !String(n.key).startsWith("giro_") && !n.lida).forEach(n => updates[`notificacoesAdm/${n.key}/lida`] = true);
  if (Object.keys(updates).length) await db.ref().update(updates);
}

if (btnVerNotificacoes) {
  btnVerNotificacoes.addEventListener("click", async () => {
    if (!adminNotificacoes) return;
    adminNotificacoes.classList.toggle("hidden");
    if (!adminNotificacoes.classList.contains("hidden")) await carregarNotificacoesAdm();
  });
}

let notificacaoAdmListenerAtivo = false;
function ativarNotificacoesTempoRealAdm() {
  if (notificacaoAdmListenerAtivo) return;
  notificacaoAdmListenerAtivo = true;
  const inicio = Date.now();
  db.ref("notificacoesAdm").orderByChild("timestamp").startAt(inicio).on("child_added", (snap) => {
    const n = snap.val() || {};
    if (adminPainel && !adminPainel.classList.contains("hidden")) {
      alert(`🔔 ${n.titulo || "Nova notificação"}\nCliente: ${n.nome || ""}\nDesconto: ${n.descontoSorteado || ""}`);
    }
    if (adminNotificacoes && !adminNotificacoes.classList.contains("hidden")) carregarNotificacoesAdm();
  });
}

function renderizarEstrelas(nota) {
  const total = 5;
  const n = Math.max(0, Math.min(total, Number(nota) || 0));
  return `<span class="stars-ok">${"★".repeat(n)}</span><span class="stars-off">${"☆".repeat(total - n)}</span>`;
}

function escapeHtml(texto) {
  return String(texto || "").replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[c]));
}



// Funções globais para os botões do HTML. Isso evita falha do onclick no celular.
window.abrirListaGirosAdm = async function() {
  if (!adminGiros) return;
  if (adminNotificacoes) adminNotificacoes.classList.add("hidden");
  if (adminAvaliacoes) adminAvaliacoes.classList.add("hidden");
  adminGiros.classList.toggle("hidden");
  if (!adminGiros.classList.contains("hidden")) await carregarGirosAdmin();
};

window.abrirNotificacoesAdm = async function() {
  if (!adminNotificacoes) return;
  if (adminGiros) adminGiros.classList.add("hidden");
  if (adminAvaliacoes) adminAvaliacoes.classList.add("hidden");
  adminNotificacoes.classList.toggle("hidden");
  if (!adminNotificacoes.classList.contains("hidden")) await carregarNotificacoesAdm();
};

// Pega telefone direto do link, se você enviar assim: index.html?tel=34998607006
(function preencherTelefonePeloLink() {
  const params = new URLSearchParams(location.search);
  const tel = params.get("tel") || params.get("telefone");
  const telEl = document.getElementById("telefone");
  if (tel && telEl) {
    telEl.value = limparTelefone(tel);
    atualizarUsuarioAtual();
  }
})();

// Inicialização
carregarPromocaoAtual()
  .then(registrarEntrada)
  .then(atualizarContadoresVisitasPublicos)
  .then(async () => {
    if (telefoneValido(telefoneAtual)) { await verificarSeJaGirou(); } else { atualizarBotaoGirar(); atualizarBotaoEnviar(); }
    await carregarMeuComentario();
    if (adminPainel && !adminPainel.classList.contains("hidden")) await atualizarPainelAdmin();
  })
  .catch((e) => console.error(e));


// ================= PWA =================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(() => console.log('PWA ativo: service worker registrado.'))
      .catch((erro) => console.warn('Falha ao registrar PWA:', erro));
  });
}

// ================= AGENDA DA PASSADORIA =================
const LIMITE_AGENDAMENTOS_DIA = 4;
let agendaMesVisivel = new Date();
agendaMesVisivel.setDate(1);
let dataAgendaSelecionada = "";
const gradeAgenda = document.getElementById("gradeAgenda");
const tituloMesAgenda = document.getElementById("tituloMesAgenda");
const statusAgenda = document.getElementById("statusAgenda");
const agendaModal = document.getElementById("agendaModal");
const dataAgendaEscolhida = document.getElementById("dataAgendaEscolhida");
const formAgenda = document.getElementById("formAgenda");
const agendaModalStatus = document.getElementById("agendaModalStatus");
const meuAgendamentoPainel = document.getElementById("meuAgendamentoPainel");
let telefoneAgendaConsultado = "";

function doisDigitos(n) { return String(n).padStart(2, "0"); }
function chaveDataAgenda(ano, mesZero, dia) { return `${ano}-${doisDigitos(mesZero + 1)}-${doisDigitos(dia)}`; }
function dataLocalSemHora(data) { return new Date(data.getFullYear(), data.getMonth(), data.getDate()); }
function registrosDoDia(valor) {
  if (!valor || typeof valor !== "object") return {};
  // Compatibilidade com a versão antiga, que guardava apenas um cliente diretamente no dia.
  if (valor.nome && valor.telefoneOriginal) return { [limparTelefone(valor.telefoneOriginal) || "legado"]: valor };
  return valor;
}
function quantidadeAtivosDia(valor) {
  return Object.values(registrosDoDia(valor)).filter(r => r && r.status !== "cancelado").length;
}
function textoVagas(qtd) {
  const vagas = Math.max(0, LIMITE_AGENDAMENTOS_DIA - qtd);
  if (vagas === 0) return "Lotado";
  return `${vagas} vaga${vagas === 1 ? "" : "s"}`;
}

async function carregarAgendaMes() {
  if (!gradeAgenda || !tituloMesAgenda) return;
  const ano = agendaMesVisivel.getFullYear();
  const mes = agendaMesVisivel.getMonth();
  tituloMesAgenda.textContent = agendaMesVisivel.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  gradeAgenda.innerHTML = '<p style="grid-column:1/-1">Carregando dias...</p>';

  try {
    const prefixo = `${ano}-${doisDigitos(mes + 1)}`;
    const snap = await db.ref("agendamentos").orderByKey().startAt(prefixo + "-01").endAt(prefixo + "-31").once("value");
    const dadosMes = snap.exists() ? snap.val() : {};
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const totalDias = new Date(ano, mes + 1, 0).getDate();
    const hoje = dataLocalSemHora(new Date());
    gradeAgenda.innerHTML = "";

    for (let i = 0; i < primeiroDiaSemana; i++) {
      const vazio = document.createElement("div");
      vazio.className = "dia-vazio";
      gradeAgenda.appendChild(vazio);
    }

    for (let dia = 1; dia <= totalDias; dia++) {
      const chave = chaveDataAgenda(ano, mes, dia);
      const data = new Date(ano, mes, dia);
      const passou = dataLocalSemHora(data) < hoje;
      const quantidade = quantidadeAtivosDia(dadosMes?.[chave]);
      const lotado = quantidade >= LIMITE_AGENDAMENTOS_DIA;
      const registrosHoje = Object.values(registrosDoDia(dadosMes?.[chave])).filter(Boolean);
      const agendamentoDesteId = telefoneAgendaConsultado && registrosHoje.find(r => limparTelefone(r.telefoneOriginal || r.telefone) === telefoneAgendaConsultado && r.status !== "cancelado");
      const classe = passou ? "passado" : lotado ? "ocupado" : quantidade > 0 ? "parcial" : "livre";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dia-agenda " + classe;
      btn.disabled = passou || lotado || Boolean(agendamentoDesteId);
      btn.innerHTML = `<strong>${dia}</strong><small>${agendamentoDesteId ? "Seu dia agendado" : passou ? "Indisponível" : textoVagas(quantidade)}</small><em>${passou ? "" : `${quantidade}/${LIMITE_AGENDAMENTOS_DIA}`}</em>`;
      if (!passou && !lotado && !agendamentoDesteId) btn.addEventListener("click", () => abrirReservaAgenda(chave, data, quantidade));
      gradeAgenda.appendChild(btn);
    }
  } catch (error) {
    console.error("Erro ao carregar agenda:", error);
    gradeAgenda.innerHTML = '<p style="grid-column:1/-1" class="vazio">Não foi possível carregar a agenda. Confira a internet e as regras do Firebase.</p>';
  }
}

function abrirReservaAgenda(chave, data, quantidade = 0) {
  dataAgendaSelecionada = chave;
  const vagas = LIMITE_AGENDAMENTOS_DIA - quantidade;
  if (dataAgendaEscolhida) dataAgendaEscolhida.textContent = `${data.toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" })} • ${vagas} vaga${vagas === 1 ? "" : "s"} disponível${vagas === 1 ? "" : "is"}`;
  if (agendaModalStatus) agendaModalStatus.textContent = "";
  const btnConfirmar = document.getElementById("btnConfirmarAgenda");
  if (btnConfirmar) { btnConfirmar.disabled = false; btnConfirmar.textContent = "CONFIRMAR AGENDAMENTO"; }
  if (agendaModal) agendaModal.classList.remove("hidden");
}

document.getElementById("btnFecharAgenda")?.addEventListener("click", () => agendaModal?.classList.add("hidden"));
document.getElementById("mesAnterior")?.addEventListener("click", () => { agendaMesVisivel.setMonth(agendaMesVisivel.getMonth() - 1); carregarAgendaMes(); });
document.getElementById("mesSeguinte")?.addEventListener("click", () => { agendaMesVisivel.setMonth(agendaMesVisivel.getMonth() + 1); carregarAgendaMes(); });

formAgenda?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nome = document.getElementById("agendaNome")?.value.trim() || "";
  const telefone = limparTelefone(document.getElementById("agendaTelefone")?.value || "");
  const pecas = Number(document.getElementById("agendaPecas")?.value || 0);
  const endereco = document.getElementById("agendaEndereco")?.value.trim() || "";
  const observacoes = document.getElementById("agendaObservacoes")?.value.trim() || "";
  if (nome.split(/\s+/).length < 2) return alert("Digite nome e sobrenome.");
  if (telefone.length < 10) return alert("Digite um telefone válido com DDD.");
  if (!dataAgendaSelecionada) return alert("Escolha um dia da agenda.");

  const btn = document.getElementById("btnConfirmarAgenda");
  if (btn) { btn.disabled = true; btn.textContent = "VERIFICANDO..."; }
  let motivoFalha = "";
  let agendamentoFoiSalvo = false;
  try {
    // Cada telefone só pode manter um agendamento ativo em todo o calendário.
    const todos = await obterTodosAgendamentos();
    const jaPossuiAtivo = todos.some(r => limparTelefone(r.telefoneOriginal || r.telefone) === telefone && !["cancelado","concluido","faltou"].includes(r.status));
    if (jaPossuiAtivo) {
      if (agendaModalStatus) agendaModalStatus.textContent = "⚠️ Este telefone já possui um agendamento ativo. Aguarde a conclusão ou o cancelamento para reservar novamente.";
      return;
    }

    if (btn) btn.textContent = "SALVANDO...";
    const refDia = db.ref(`agendamentos/${dataAgendaSelecionada}`);
    const resultadoTransacao = await refDia.transaction((atual) => {
      const registros = registrosDoDia(atual);
      const existentes = Object.values(registros).filter(Boolean);
      const duplicado = existentes.some(r => limparTelefone(r.telefoneOriginal) === telefone && r.status !== "cancelado");
      if (duplicado) { motivoFalha = "duplicado"; return; }
      const ativos = existentes.filter(r => r.status !== "cancelado").length;
      if (ativos >= LIMITE_AGENDAMENTOS_DIA) { motivoFalha = "lotado"; return; }
      registros[telefone] = {
        nome,
        telefone: mascararTelefone(telefone),
        telefoneOriginal: telefone,
        dataAgenda: dataAgendaSelecionada,
        pecas: pecas > 0 ? pecas : "",
        endereco,
        observacoes,
        criadoEm: new Date().toLocaleString("pt-BR"),
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        status: "agendado"
      };
      return registros;
    });
    if (!resultadoTransacao.committed) {
      if (agendaModalStatus) agendaModalStatus.textContent = motivoFalha === "duplicado" ? "⚠️ Este telefone já possui agendamento nessa data." : "❌ As 4 vagas desse dia acabaram de ser preenchidas.";
      try { await carregarAgendaMes(); } catch (e) { console.warn("Agenda não atualizou após bloqueio:", e); }
      return;
    }
    agendamentoFoiSalvo = true;
    const registroConfirmado = {
      nome,
      telefone: mascararTelefone(telefone),
      telefoneOriginal: telefone,
      dataAgenda: dataAgendaSelecionada,
      pecas: pecas > 0 ? pecas : "",
      endereco,
      observacoes,
      criadoEm: new Date().toLocaleString("pt-BR"),
      status: "agendado"
    };
    telefoneAgendaConsultado = telefone;
    if (agendaModalStatus) {
      agendaModalStatus.innerHTML = `<div class="agenda-confirmacao-modal">${montarResumoMeuAgendamento(registroConfirmado)}</div>`;
    }
    if (statusAgenda) statusAgenda.textContent = `✅ ${nome}, sua reserva para ${dataAgendaSelecionada.split("-").reverse().join("/")} foi confirmada.`;
    if (meuAgendamentoPainel) {
      meuAgendamentoPainel.classList.remove("hidden");
      meuAgendamentoPainel.innerHTML = montarResumoMeuAgendamento(registroConfirmado);
    }
    if (btn) { btn.disabled = true; btn.textContent = "AGENDAMENTO CONFIRMADO"; }
    try { await carregarAgendaMes(); } catch (e) { console.warn("Agendamento salvo, mas o calendário não atualizou:", e); }
  } catch (error) {
    console.error("Erro no fluxo do agendamento:", error);

    // Em alguns celulares a gravação termina corretamente, mas uma atualização de tela
    // feita logo depois falha. Antes de mostrar erro, confirmamos diretamente no Firebase.
    try {
      const confirmacao = await db.ref(`agendamentos/${dataAgendaSelecionada}/${telefone}`).once("value");
      if (confirmacao.exists()) {
        agendamentoFoiSalvo = true;
        const salvo = confirmacao.val() || {};
        telefoneAgendaConsultado = telefone;
        if (agendaModalStatus) {
          agendaModalStatus.innerHTML = `<div class="agenda-confirmacao-modal">${montarResumoMeuAgendamento(salvo)}</div>`;
        }
        if (statusAgenda) statusAgenda.textContent = `✅ ${salvo.nome || nome}, sua reserva foi confirmada.`;
        if (meuAgendamentoPainel) {
          meuAgendamentoPainel.classList.remove("hidden");
          meuAgendamentoPainel.innerHTML = montarResumoMeuAgendamento(salvo);
        }
        if (btn) { btn.disabled = true; btn.textContent = "AGENDAMENTO CONFIRMADO"; }
      } else if (agendaModalStatus) {
        agendaModalStatus.textContent = "❌ Não foi possível confirmar o agendamento. Tente novamente.";
      }
    } catch (confirmError) {
      console.error("Falha ao confirmar gravação:", confirmError);
      if (agendaModalStatus) agendaModalStatus.textContent = "❌ Não foi possível confirmar o agendamento. Tente novamente.";
    }
  } finally {
    if (btn && !agendamentoFoiSalvo && btn.textContent !== "AGENDAMENTO CONFIRMADO") { btn.disabled = false; btn.textContent = "CONFIRMAR AGENDAMENTO"; }
  }
});

function rotuloStatusAgenda(status) {
  return ({ agendado:"Agendado", confirmado:"Confirmado", em_atendimento:"Em atendimento", concluido:"Concluído", faltou:"Não compareceu", cancelado:"Cancelado" })[status] || "Agendado";
}
function normalizarDataAgenda(valor, fallback = "") {
  const texto = String(valor || fallback || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = texto.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : fallback;
}

async function obterTodosAgendamentos() {
  const snap = await db.ref("agendamentos").once("value");
  const lista = [];

  // Estrutura oficial usada pelo site:
  // agendamentos/AAAA-MM-DD/TELEFONE/dados
  snap.forEach((diaSnap) => {
    const diaKey = String(diaSnap.key || "");
    const grupoDia = diaSnap.val();
    if (!grupoDia || typeof grupoDia !== "object") return;

    diaSnap.forEach((clienteSnap) => {
      const telefoneKey = String(clienteSnap.key || "");
      const dados = clienteSnap.val();
      if (!dados || typeof dados !== "object") return;

      const telefoneOriginal = limparTelefone(
        dados.telefoneOriginal || dados.telefone || dados.celular || dados.phone || telefoneKey
      );
      const dataAgenda = normalizarDataAgenda(
        dados.dataAgenda || dados.data || dados.dia,
        /^\d{4}-\d{2}-\d{2}$/.test(diaKey) ? diaKey : ""
      );

      lista.push({
        ...dados,
        nome: String(dados.nome || dados.nomeCompleto || dados.cliente || "Cliente"),
        telefoneOriginal: telefoneOriginal || limparTelefone(telefoneKey),
        telefone: dados.telefone || mascararTelefone(telefoneOriginal || telefoneKey),
        dataAgenda: dataAgenda || diaKey,
        diaKey,
        telefoneKey,
        indiceFirebase: `${diaKey}/${telefoneKey}`,
        status: dados.status || "agendado"
      });
    });
  });

  console.log("[AGENDA ADM] registros lidos:", lista.length, lista);
  return lista;
}

function dataHoraReserva(item) {
  if (item.criadoEm) return String(item.criadoEm);
  const ts = Number(item.timestamp || 0);
  return ts ? new Date(ts).toLocaleString("pt-BR") : "Não informada";
}

function montarResumoMeuAgendamento(item) {
  const data = String(item.dataAgenda || "");
  const dataBR = data ? data.split("-").reverse().join("/") : "Não informada";
  return `<h3>✅ Seu dia está reservado</h3>
    <p><strong>📅 Dia:</strong> ${safe(dataBR)}</p>
    <p><strong>🕒 Reserva registrada em:</strong> ${safe(dataHoraReserva(item))}</p>
    <p><strong>👤 Nome:</strong> ${safe(item.nome || "")}</p>
    <p><strong>📞 Telefone:</strong> ${safe(item.telefone || mascararTelefone(item.telefoneOriginal || ""))}</p>
    ${item.pecas ? `<p><strong>🧺 Peças:</strong> ${safe(item.pecas)}</p>` : ""}
    ${item.endereco ? `<p><strong>📍 Endereço:</strong> ${safe(item.endereco)}</p>` : ""}
    ${item.observacoes ? `<p><strong>📝 Observações:</strong> ${safe(item.observacoes)}</p>` : ""}
    <p><strong>Situação:</strong> ${safe(rotuloStatusAgenda(item.status || "agendado"))}</p>
    <button class="btn-reserva-bloqueada" type="button" disabled>ESTE ID JÁ POSSUI AGENDAMENTO</button>`;
}

async function consultarMeuAgendamento(telefoneInformado) {
  const telefone = limparTelefone(telefoneInformado || "");
  if (telefone.length < 10) {
    if (meuAgendamentoPainel) {
      meuAgendamentoPainel.classList.remove("hidden");
      meuAgendamentoPainel.innerHTML = '<p>Digite um telefone válido com DDD.</p>';
    }
    return null;
  }
  telefoneAgendaConsultado = telefone;
  const lista = await obterTodosAgendamentos();
  const item = lista
    .filter(r => limparTelefone(r.telefoneOriginal || r.telefone) === telefone && !["cancelado","concluido","faltou"].includes(r.status || "agendado"))
    .sort((a,b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))[0] || null;
  if (meuAgendamentoPainel) {
    meuAgendamentoPainel.classList.remove("hidden");
    meuAgendamentoPainel.innerHTML = item ? montarResumoMeuAgendamento(item) : '<p>📭 Nenhum agendamento ativo encontrado para este telefone.</p>';
  }
  await carregarAgendaMes();
  return item;
}

async function atualizarResumoAgendamentosAdm() {
  try {
    const lista = await obterTodosAgendamentos();
    const agora = new Date();
    const hoje = chaveDataAgenda(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const amanhaData = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
    const amanha = chaveDataAgenda(amanhaData.getFullYear(), amanhaData.getMonth(), amanhaData.getDate());
    const ativos = lista.filter(i => !["cancelado","concluido","faltou"].includes(i.status));
    const set = (id, valor) => { const el = document.getElementById(id); if (el) el.textContent = valor; };
    set("totalAgendamentosAdm", ativos.length);
    set("agendamentosHojeAdm", ativos.filter(i => i.dataAgenda === hoje).length);
    set("agendamentosAmanhaAdm", ativos.filter(i => i.dataAgenda === amanha).length);
    set("proximosAgendamentosAdm", ativos.filter(i => i.dataAgenda >= hoje).length);
    set("concluidosAgendamentosAdm", lista.filter(i => i.status === "concluido").length);
    set("canceladosAgendamentosAdm", lista.filter(i => i.status === "cancelado").length);
  } catch(e) { console.warn("Resumo da agenda:", e); }
}

function normalizarBuscaAgenda(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function filtrarListaAgendamentos(lista) {
  const campoBusca = document.getElementById("buscarAgendamentoAdm");
  const buscaOriginal = String(campoBusca?.value || "").trim();
  const busca = normalizarBuscaAgenda(buscaOriginal);
  const buscaNumerica = limparTelefone(buscaOriginal);
  const filtro = document.getElementById("filtroAgendamentoAdm")?.value || "todos";
  const dataInicio = document.getElementById("dataInicioAgendamentoAdm")?.value || "";
  const dataFim = document.getElementById("dataFimAgendamentoAdm")?.value || "";
  const ordem = document.getElementById("ordenarAgendamentoAdm")?.value || "data_asc";

  const agora = new Date();
  const hoje = chaveDataAgenda(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const amanhaData = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()+1);
  const amanha = chaveDataAgenda(amanhaData.getFullYear(), amanhaData.getMonth(), amanhaData.getDate());
  const fimSemanaData = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()+6);
  const fimSemana = chaveDataAgenda(fimSemanaData.getFullYear(), fimSemanaData.getMonth(), fimSemanaData.getDate());

  const filtrada = (Array.isArray(lista) ? lista : []).filter((i) => {
    const dataAgenda = String(i.dataAgenda || i.diaKey || "");
    const dataBR = dataAgenda.split("-").reverse().join("/");
    const telefoneIndice = limparTelefone(i.telefoneKey || "");
    const telefoneOriginal = limparTelefone(i.telefoneOriginal || i.telefone || "");
    const texto = normalizarBuscaAgenda([
      i.nome, telefoneOriginal, telefoneIndice, i.telefone,
      dataAgenda, dataBR, i.endereco, i.observacoes,
      i.pecas, i.status, i.indiceFirebase
    ].join(" "));

    if (busca) {
      const achouTexto = texto.includes(busca);
      const achouNumero = buscaNumerica && (
        telefoneOriginal.includes(buscaNumerica) ||
        telefoneIndice.includes(buscaNumerica) ||
        limparTelefone(i.indiceFirebase || "").includes(buscaNumerica)
      );
      if (!achouTexto && !achouNumero) return false;
    }

    // Quando há uma pesquisa digitada, ela procura em TODOS os registros,
    // sem ser bloqueada pelos filtros de Hoje, período ou situação.
    if (!busca) {
      if (dataInicio && dataAgenda < dataInicio) return false;
      if (dataFim && dataAgenda > dataFim) return false;
      if (filtro === "hoje" && dataAgenda !== hoje) return false;
      if (filtro === "amanha" && dataAgenda !== amanha) return false;
      if (filtro === "semana" && !(dataAgenda >= hoje && dataAgenda <= fimSemana)) return false;
      if (["agendado","confirmado","em_atendimento","concluido","faltou","cancelado"].includes(filtro) && (i.status || "agendado") !== filtro) return false;
    }
    return true;
  });

  return filtrada.sort((a,b) => {
    if (ordem === "data_desc") return String(b.dataAgenda||"").localeCompare(String(a.dataAgenda||"")) || Number(b.timestamp||0)-Number(a.timestamp||0);
    if (ordem === "novo") return Number(b.timestamp||0)-Number(a.timestamp||0);
    if (ordem === "antigo") return Number(a.timestamp||0)-Number(b.timestamp||0);
    if (ordem === "nome") return String(a.nome||"").localeCompare(String(b.nome||""), "pt-BR");
    return String(a.dataAgenda||"").localeCompare(String(b.dataAgenda||"")) || Number(a.timestamp||0)-Number(b.timestamp||0);
  });
}

async function carregarAgendamentosAdmin() {
  if (!adminAgendamentos) return;
  adminAgendamentos.innerHTML = '<p class="vazio">⏳ Carregando agendamentos...</p>';

  try {
    const todos = await obterTodosAgendamentos();
    const lista = filtrarListaAgendamentos(todos);

    if (!lista.length) {
      adminAgendamentos.innerHTML = `<div class="vazio"><strong>📭 Nenhum agendamento encontrado.</strong><br><small>Total lido do Firebase: ${todos.length}. Limpe os filtros ou pesquise pelo nome/telefone completo.</small></div>`;
      return;
    }

    const cards = lista.map((i) => {
      try {
        const dataAgenda = String(i.dataAgenda || i.diaKey || '');
        const dataBR = dataAgenda.includes('-') ? dataAgenda.split('-').reverse().join('/') : dataAgenda;
        const tel = limparTelefone(i.telefoneOriginal || i.telefone || '');
        const nome = String(i.nome || 'Cliente');
        const status = String(i.status || 'agendado').replace(/[^a-z_]/gi, '') || 'agendado';
        const whats = `https://wa.me/55${tel}?text=${encodeURIComponent(`Olá ${nome}, falando sobre seu agendamento na Passadoria para ${dataBR}.`)}`;

        return `<div class="admin-item agenda-admin-item status-${status}">
          <div class="agenda-admin-topo"><strong>📅 ${safe(dataBR || 'Data não informada')}</strong><span>${safe(rotuloStatusAgenda(status))}</span></div>
          <h3>${safe(nome)}</h3>
          <p>📞 ${safe(tel || 'Telefone não informado')}</p>
          ${i.pecas ? `<p>🧺 Aproximadamente ${safe(i.pecas)} peça(s)</p>` : ''}
          ${i.endereco ? `<p>📍 ${safe(i.endereco)}</p>` : ''}
          ${i.observacoes ? `<p>📝 ${safe(i.observacoes)}</p>` : ''}
          <p>🕒 Reserva feita em: ${safe(dataHoraReserva(i))}</p>
          <p class="indice-registro">Índice Firebase: agendamentos/${safe(i.indiceFirebase || `${i.diaKey}/${i.telefoneKey}`)}</p>
          <div class="agenda-contato-acoes">
            ${tel ? `<a href="tel:${tel}">📞 Ligar</a><a href="${whats}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
          </div>
          <div class="agenda-admin-acoes">
            <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','confirmado')">Confirmar</button>
            <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','em_atendimento')">Em atendimento</button>
            <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','concluido')">Concluído</button>
            <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','faltou')">Não veio</button>
            <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','cancelado')">Cancelar</button>
            <button class="excluir" type="button" onclick="excluirAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}')">Excluir</button>
          </div>
        </div>`;
      } catch (erroItem) {
        console.warn('Registro de agendamento inválido:', i, erroItem);
        return '';
      }
    }).filter(Boolean);

    adminAgendamentos.innerHTML = `<div class="admin-ajuda-pdf">📅 ${cards.length} registro(s) encontrado(s). Use a busca, os filtros e os botões de atendimento.</div>${cards.join('')}`;
  } catch (error) {
    console.error('Erro ao carregar lista de agendamentos:', error);
    adminAgendamentos.innerHTML = `<div class="vazio"><strong>❌ Não foi possível carregar os agendamentos.</strong><br><small>${safe(error?.message || 'Confira a internet e as regras do Firebase.')}</small><br><button type="button" class="btn secundario" onclick="carregarAgendamentosAdmin()">TENTAR NOVAMENTE</button></div>`;
  }
}
window.carregarAgendamentosAdmin = carregarAgendamentosAdmin;

window.alterarStatusAgendamento = async (dia, telefoneKey, status) => {
  await db.ref(`agendamentos/${dia}/${telefoneKey}/status`).set(status);
  await carregarAgendamentosAdmin();
  await atualizarResumoAgendamentosAdm();
  await carregarAgendaMes();
};
window.excluirAgendamento = async (dia, telefoneKey) => {
  if (!confirm("Excluir este agendamento definitivamente?")) return;
  await db.ref(`agendamentos/${dia}/${telefoneKey}`).remove();
  const snap = await db.ref(`agendamentos/${dia}`).once("value");
  if (!snap.exists() || snap.numChildren() === 0) await db.ref(`agendamentos/${dia}`).remove();
  await carregarAgendamentosAdmin();
  await atualizarResumoAgendamentosAdm();
  await carregarAgendaMes();
};
btnVerAgendamentos?.addEventListener("click", async () => {
  if (adminAvaliacoes) adminAvaliacoes.classList.add("hidden");
  if (adminGiros) adminGiros.classList.add("hidden");
  if (adminNotificacoes) adminNotificacoes.classList.add("hidden");
  adminAgendamentos?.classList.toggle("hidden");
  if (adminAgendamentos && !adminAgendamentos.classList.contains("hidden")) {
    const busca = document.getElementById("buscarAgendamentoAdm");
    const filtro = document.getElementById("filtroAgendamentoAdm");
    const inicio = document.getElementById("dataInicioAgendamentoAdm");
    const fim = document.getElementById("dataFimAgendamentoAdm");
    const ordem = document.getElementById("ordenarAgendamentoAdm");
    if (busca) busca.value = "";
    if (filtro) filtro.value = "todos";
    if (inicio) inicio.value = "";
    if (fim) fim.value = "";
    if (ordem) ordem.value = "data_asc";
    await carregarAgendamentosAdmin();
  }
});
document.getElementById("btnAtualizarAgendamentos")?.addEventListener("click", async () => {
  adminAgendamentos?.classList.remove("hidden");
  await carregarAgendamentosAdmin();
  await atualizarResumoAgendamentosAdm();
});
document.getElementById("btnBuscarAgendamentos")?.addEventListener("click", () => {
  // A busca deve funcionar sozinha. Ao pesquisar nome ou telefone,
  // não deixa filtros antigos esconderem o resultado.
  const filtro = document.getElementById("filtroAgendamentoAdm");
  const inicio = document.getElementById("dataInicioAgendamentoAdm");
  const fim = document.getElementById("dataFimAgendamentoAdm");
  if (filtro) filtro.value = "todos";
  if (inicio) inicio.value = "";
  if (fim) fim.value = "";
  adminAgendamentos?.classList.remove("hidden");
  carregarAgendamentosAdmin();
});
document.getElementById("buscarAgendamentoAdm")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); adminAgendamentos?.classList.remove("hidden"); carregarAgendamentosAdmin(); }
});
document.getElementById("buscarAgendamentoAdm")?.addEventListener("input", () => {
  if (adminAgendamentos && !adminAgendamentos.classList.contains("hidden")) carregarAgendamentosAdmin();
});
document.getElementById("filtroAgendamentoAdm")?.addEventListener("change", () => {
  adminAgendamentos?.classList.remove("hidden");
  carregarAgendamentosAdmin();
});

document.getElementById("btnConsultarAgenda")?.addEventListener("click", async () => {
  const campo = document.getElementById("consultarAgendaTelefone");
  await consultarMeuAgendamento(campo?.value || "");
});
document.getElementById("consultarAgendaTelefone")?.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") { e.preventDefault(); await consultarMeuAgendamento(e.currentTarget.value); }
});
["dataInicioAgendamentoAdm","dataFimAgendamentoAdm","ordenarAgendamentoAdm"].forEach(id => {
  document.getElementById(id)?.addEventListener("change", () => {
    adminAgendamentos?.classList.remove("hidden");
    carregarAgendamentosAdmin();
  });
});
document.getElementById("btnLimparBuscaAgendamentos")?.addEventListener("click", () => {
  const ids = ["buscarAgendamentoAdm","dataInicioAgendamentoAdm","dataFimAgendamentoAdm"];
  ids.forEach(id => { const el=document.getElementById(id); if(el) el.value=""; });
  const filtro=document.getElementById("filtroAgendamentoAdm"); if(filtro) filtro.value="todos";
  const ordem=document.getElementById("ordenarAgendamentoAdm"); if(ordem) ordem.value="data_asc";
  adminAgendamentos?.classList.remove("hidden");
  carregarAgendamentosAdmin();
});

db.ref("agendamentos").on("value", () => {
  carregarAgendaMes();
  atualizarResumoAgendamentosAdm();
  if (adminAgendamentos && !adminAgendamentos.classList.contains("hidden")) carregarAgendamentosAdmin();
});
carregarAgendaMes();



// ================= AGENDA ADM V27 — BUSCA RECONSTRUÍDA =================
// Este módulo lê diretamente: agendamentos/AAAA-MM-DD/TELEFONE/dados.
// Ele não depende dos filtros antigos para localizar nome ou telefone.
(function instalarBuscaAgendaV27(){
  const listaEl = document.getElementById("adminAgendamentos");
  const buscaEl = document.getElementById("buscarAgendamentoAdm");
  const btnBuscar = document.getElementById("btnBuscarAgendamentos");
  const btnVer = document.getElementById("btnVerAgendamentos");
  const btnAtualizar = document.getElementById("btnAtualizarAgendamentos");
  const btnLimpar = document.getElementById("btnLimparBuscaAgendamentos");
  if (!listaEl) return;

  function textoBuscaV27(valor){
    return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  async function lerAgendaDiretoV27(){
    const snap = await db.ref("agendamentos").once("value");
    const raiz = snap.val() || {};
    const registros = [];
    Object.entries(raiz).forEach(([dataKey, clientes]) => {
      if (!clientes || typeof clientes !== "object") return;
      Object.entries(clientes).forEach(([telefoneKey, dadosBrutos]) => {
        if (!dadosBrutos || typeof dadosBrutos !== "object") return;
        const d = dadosBrutos;
        const telefoneOriginal = limparTelefone(d.telefoneOriginal || d.telefone || telefoneKey);
        registros.push({
          ...d,
          dataAgenda: normalizarDataAgenda(d.dataAgenda || d.data || d.dia, dataKey) || dataKey,
          diaKey: dataKey,
          telefoneKey,
          telefoneOriginal: telefoneOriginal || limparTelefone(telefoneKey),
          nome: String(d.nome || d.nomeCompleto || d.cliente || "Cliente"),
          status: String(d.status || "agendado"),
          indiceFirebase: `agendamentos/${dataKey}/${telefoneKey}`
        });
      });
    });
    return registros;
  }

  function filtrarV27(registros){
    const termoOriginal = String(buscaEl?.value || "").trim();
    const termo = textoBuscaV27(termoOriginal);
    const numero = limparTelefone(termoOriginal);
    const filtro = document.getElementById("filtroAgendamentoAdm")?.value || "todos";
    const inicio = document.getElementById("dataInicioAgendamentoAdm")?.value || "";
    const fim = document.getElementById("dataFimAgendamentoAdm")?.value || "";
    const ordem = document.getElementById("ordenarAgendamentoAdm")?.value || "data_asc";

    const agora = new Date();
    const hoje = chaveDataAgenda(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const amanhaD = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()+1);
    const amanha = chaveDataAgenda(amanhaD.getFullYear(), amanhaD.getMonth(), amanhaD.getDate());
    const fimSemD = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()+6);
    const fimSem = chaveDataAgenda(fimSemD.getFullYear(), fimSemD.getMonth(), fimSemD.getDate());

    let resultado = registros.filter((r) => {
      const data = String(r.dataAgenda || r.diaKey || "");
      const dataBR = /^\d{4}-\d{2}-\d{2}$/.test(data) ? data.split("-").reverse().join("/") : data;
      const telCampo = limparTelefone(r.telefoneOriginal || r.telefone || "");
      const telIndice = limparTelefone(r.telefoneKey || "");
      const alvo = textoBuscaV27([
        r.nome, r.telefone, telCampo, telIndice, r.telefoneKey,
        data, dataBR, r.endereco, r.observacoes, r.pecas,
        r.status, r.indiceFirebase
      ].join(" "));

      if (termo) {
        const porTexto = alvo.includes(termo);
        const porNumero = numero && (telCampo.includes(numero) || telIndice.includes(numero));
        return porTexto || porNumero;
      }

      if (inicio && data < inicio) return false;
      if (fim && data > fim) return false;
      if (filtro === "hoje" && data !== hoje) return false;
      if (filtro === "amanha" && data !== amanha) return false;
      if (filtro === "semana" && !(data >= hoje && data <= fimSem)) return false;
      if (["agendado","confirmado","em_atendimento","concluido","faltou","cancelado"].includes(filtro) && r.status !== filtro) return false;
      return true;
    });

    resultado.sort((a,b) => {
      if (ordem === "data_desc") return String(b.dataAgenda).localeCompare(String(a.dataAgenda));
      if (ordem === "novo") return Number(b.timestamp||0)-Number(a.timestamp||0);
      if (ordem === "antigo") return Number(a.timestamp||0)-Number(b.timestamp||0);
      if (ordem === "nome") return String(a.nome).localeCompare(String(b.nome), "pt-BR");
      return String(a.dataAgenda).localeCompare(String(b.dataAgenda));
    });
    return resultado;
  }

  function cardV27(i){
    const data = String(i.dataAgenda || i.diaKey || "");
    const dataBR = /^\d{4}-\d{2}-\d{2}$/.test(data) ? data.split("-").reverse().join("/") : data;
    const tel = limparTelefone(i.telefoneOriginal || i.telefone || i.telefoneKey || "");
    const nome = String(i.nome || "Cliente");
    const status = String(i.status || "agendado").replace(/[^a-z_]/gi, "") || "agendado";
    const whats = tel ? `https://wa.me/55${tel}?text=${encodeURIComponent(`Olá ${nome}, falando sobre seu agendamento na Passadoria para ${dataBR}.`)}` : "";
    return `<article class="admin-item agenda-admin-item status-${safe(status)}">
      <div class="agenda-admin-topo"><strong>📅 ${safe(dataBR || "Data não informada")}</strong><span>${safe(rotuloStatusAgenda(status))}</span></div>
      <h3>${safe(nome)}</h3>
      <p><strong>📞 Telefone:</strong> ${safe(tel || "Não informado")}</p>
      ${i.pecas ? `<p><strong>🧺 Peças:</strong> ${safe(i.pecas)}</p>` : ""}
      ${i.endereco ? `<p><strong>📍 Endereço:</strong> ${safe(i.endereco)}</p>` : ""}
      ${i.observacoes ? `<p><strong>📝 Observações:</strong> ${safe(i.observacoes)}</p>` : ""}
      <p><strong>🕒 Criado em:</strong> ${safe(dataHoraReserva(i))}</p>
      <p class="indice-registro"><strong>Índice:</strong> ${safe(i.indiceFirebase)}</p>
      <div class="agenda-contato-acoes">
        ${tel ? `<a href="tel:${tel}">📞 Ligar</a><a href="${whats}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ""}
      </div>
      <div class="agenda-admin-acoes">
        <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','confirmado')">Confirmar</button>
        <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','em_atendimento')">Em atendimento</button>
        <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','concluido')">Concluído</button>
        <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','faltou')">Não veio</button>
        <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','cancelado')">Cancelar</button>
        <button class="excluir" type="button" onclick="excluirAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}')">Excluir</button>
      </div>
    </article>`;
  }

  async function executarBuscaV27({rolar=false}={}){
    listaEl.classList.remove("hidden");
    listaEl.innerHTML = '<div class="admin-ajuda-pdf">⏳ Lendo todos os agendamentos diretamente do Firebase...</div>';
    try {
      const todos = await lerAgendaDiretoV27();
      const encontrados = filtrarV27(todos);
      if (!todos.length) {
        listaEl.innerHTML = '<div class="vazio"><strong>📭 A pasta agendamentos está vazia.</strong></div>';
      } else if (!encontrados.length) {
        listaEl.innerHTML = `<div class="admin-ajuda-pdf">📚 ${todos.length} registro(s) lido(s) do Firebase.</div><div class="vazio"><strong>🔎 Nenhum resultado para esta pesquisa.</strong><br><small>Toque em LIMPAR PESQUISA para exibir todos.</small></div>`;
      } else {
        listaEl.innerHTML = `<div class="admin-ajuda-pdf">✅ ${encontrados.length} de ${todos.length} registro(s) encontrado(s).</div>${encontrados.map(cardV27).join("")}`;
      }
      if (rolar) setTimeout(() => listaEl.scrollIntoView({behavior:"smooth", block:"start"}), 100);
    } catch (erro) {
      console.error("AGENDA V27:", erro);
      listaEl.innerHTML = `<div class="vazio"><strong>❌ Erro ao ler agendamentos.</strong><br><small>${safe(erro?.message || erro)}</small></div>`;
    }
  }

  window.carregarAgendamentosAdmin = () => executarBuscaV27();

  // Captura antes dos listeners antigos e garante uma única ação visível.
  btnBuscar?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const filtro = document.getElementById("filtroAgendamentoAdm");
    const inicio = document.getElementById("dataInicioAgendamentoAdm");
    const fim = document.getElementById("dataFimAgendamentoAdm");
    if (filtro) filtro.value = "todos";
    if (inicio) inicio.value = "";
    if (fim) fim.value = "";
    executarBuscaV27({rolar:true});
  }, true);

  buscaEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopImmediatePropagation();
      executarBuscaV27({rolar:true});
    }
  }, true);

  btnVer?.addEventListener("click", () => {
    listaEl.classList.remove("hidden");
    executarBuscaV27({rolar:true});
  }, true);
  btnAtualizar?.addEventListener("click", () => executarBuscaV27({rolar:true}), true);
  btnLimpar?.addEventListener("click", () => {
    if (buscaEl) buscaEl.value = "";
    setTimeout(() => executarBuscaV27({rolar:true}), 0);
  }, true);

  // Mostra a lista automaticamente ao entrar no painel.
  db.ref("agendamentos").on("value", () => {
    if (!document.getElementById("adminPainel")?.classList.contains("hidden")) executarBuscaV27();
  });
})();

// ================= V28 — DUAS BUSCAS DE AGENDAMENTO RECONSTRUÍDAS =================
// Corrige: (1) consulta do cliente abaixo da agenda e (2) pesquisa/lista no ADM.
(function instalarBuscasAgendaV28(){
  const somenteDigitos = (v) => String(v || '').replace(/\D/g, '');
  const semAcento = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  async function lerTodosV28(){
    const snap = await db.ref('agendamentos').once('value');
    const raiz = snap.val() || {};
    const lista = [];
    Object.keys(raiz).forEach((dataKey) => {
      const grupo = raiz[dataKey];
      if (!grupo || typeof grupo !== 'object') return;
      Object.keys(grupo).forEach((telefoneKey) => {
        const d = grupo[telefoneKey];
        if (!d || typeof d !== 'object') return;
        const telefoneOriginal = somenteDigitos(d.telefoneOriginal || d.celular || d.phone || telefoneKey || d.telefone);
        lista.push({
          ...d,
          diaKey: dataKey,
          telefoneKey,
          dataAgenda: normalizarDataAgenda(d.dataAgenda || d.data || d.dia, dataKey) || dataKey,
          nome: String(d.nome || d.nomeCompleto || d.cliente || 'Cliente'),
          telefoneOriginal: telefoneOriginal || somenteDigitos(telefoneKey),
          status: String(d.status || 'agendado'),
          indiceFirebase: `agendamentos/${dataKey}/${telefoneKey}`
        });
      });
    });
    return lista;
  }

  function substituirElemento(id){
    const antigo = document.getElementById(id);
    if (!antigo || !antigo.parentNode) return antigo;
    const novo = antigo.cloneNode(true);
    antigo.parentNode.replaceChild(novo, antigo);
    return novo;
  }

  // ---------- CONSULTA DO CLIENTE ----------
  const campoCliente = substituirElemento('consultarAgendaTelefone');
  const botaoCliente = substituirElemento('btnConsultarAgenda');
  const painelCliente = document.getElementById('meuAgendamentoPainel');

  async function consultarClienteV28(){
    const telefone = somenteDigitos(campoCliente?.value);
    if (!painelCliente) return;
    painelCliente.classList.remove('hidden');
    if (telefone.length < 10) {
      painelCliente.innerHTML = '<p>⚠️ Digite o telefone completo com DDD.</p>';
      return;
    }
    painelCliente.innerHTML = '<p>⏳ Buscando seu agendamento...</p>';
    try {
      const todos = await lerTodosV28();
      const encontrados = todos.filter((r) => {
        const peloIndice = somenteDigitos(r.telefoneKey) === telefone;
        const peloCampo = somenteDigitos(r.telefoneOriginal || r.telefone) === telefone;
        return (peloIndice || peloCampo) && !['cancelado','concluido','faltou'].includes(r.status);
      }).sort((a,b) => String(a.dataAgenda).localeCompare(String(b.dataAgenda)) || Number(b.timestamp||0)-Number(a.timestamp||0));

      if (!encontrados.length) {
        painelCliente.innerHTML = '<p>📭 Nenhum agendamento ativo encontrado para este telefone.</p>';
        return;
      }
      painelCliente.innerHTML = encontrados.map(montarResumoMeuAgendamento).join('<hr class="agenda-separador">');
      telefoneAgendaConsultado = telefone;
      await carregarAgendaMes();
      painelCliente.scrollIntoView({behavior:'smooth', block:'start'});
    } catch (erro) {
      console.error('CONSULTA CLIENTE V28:', erro);
      painelCliente.innerHTML = `<p>❌ Não foi possível buscar agora.<br><small>${safe(erro?.message || erro)}</small></p>`;
    }
  }
  botaoCliente?.addEventListener('click', consultarClienteV28);
  campoCliente?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); consultarClienteV28(); } });

  // ---------- PESQUISA E LISTA DO ADM ----------
  const campoAdm = substituirElemento('buscarAgendamentoAdm');
  const botaoAdm = substituirElemento('btnBuscarAgendamentos');
  const botaoVer = substituirElemento('btnVerAgendamentos');
  const botaoAtualizar = substituirElemento('btnAtualizarAgendamentos');
  const botaoLimpar = substituirElemento('btnLimparBuscaAgendamentos');
  const listaAdm = document.getElementById('adminAgendamentos');

  function cardAdmV28(i){
    const data = String(i.dataAgenda || i.diaKey || '');
    const dataBR = /^\d{4}-\d{2}-\d{2}$/.test(data) ? data.split('-').reverse().join('/') : data;
    const tel = somenteDigitos(i.telefoneOriginal || i.telefoneKey || i.telefone);
    const nome = String(i.nome || 'Cliente');
    const status = String(i.status || 'agendado').replace(/[^a-z_]/gi, '') || 'agendado';
    const whats = tel ? `https://wa.me/55${tel}?text=${encodeURIComponent(`Olá ${nome}, falando sobre seu agendamento na Passadoria para ${dataBR}.`)}` : '';
    return `<article class="admin-item agenda-admin-item status-${safe(status)}">
      <div class="agenda-admin-topo"><strong>📅 ${safe(dataBR || 'Data não informada')}</strong><span>${safe(rotuloStatusAgenda(status))}</span></div>
      <h3>${safe(nome)}</h3>
      <p><strong>📞 Telefone:</strong> ${safe(tel || 'Não informado')}</p>
      ${i.pecas ? `<p><strong>🧺 Peças:</strong> ${safe(i.pecas)}</p>` : ''}
      ${i.endereco ? `<p><strong>📍 Endereço:</strong> ${safe(i.endereco)}</p>` : ''}
      ${i.observacoes ? `<p><strong>📝 Observações:</strong> ${safe(i.observacoes)}</p>` : ''}
      <p><strong>🕒 Criado em:</strong> ${safe(dataHoraReserva(i))}</p>
      <p class="indice-registro"><strong>Índice Firebase:</strong> ${safe(i.indiceFirebase)}</p>
      <div class="agenda-contato-acoes">${tel ? `<a href="tel:${tel}">📞 Ligar</a><a href="${whats}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}</div>
      <div class="agenda-admin-acoes">
        <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','confirmado')">Confirmar</button>
        <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','em_atendimento')">Em atendimento</button>
        <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','concluido')">Concluído</button>
        <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','faltou')">Não veio</button>
        <button type="button" onclick="alterarStatusAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}','cancelado')">Cancelar</button>
        <button class="excluir" type="button" onclick="excluirAgendamento('${safe(i.diaKey)}','${safe(i.telefoneKey)}')">Excluir</button>
      </div>
    </article>`;
  }

  async function buscarAdmV28({mostrarTodos=false, rolar=true}={}){
    if (!listaAdm) return;
    listaAdm.classList.remove('hidden');
    listaAdm.innerHTML = '<div class="admin-ajuda-pdf">⏳ Buscando diretamente em agendamentos/data/telefone...</div>';
    try {
      const todos = await lerTodosV28();
      const original = String(campoAdm?.value || '').trim();
      const termo = semAcento(original);
      const numero = somenteDigitos(original);
      let encontrados = todos;

      if (!mostrarTodos && (termo || numero)) {
        encontrados = todos.filter((r) => {
          const data = String(r.dataAgenda || r.diaKey || '');
          const dataBR = /^\d{4}-\d{2}-\d{2}$/.test(data) ? data.split('-').reverse().join('/') : data;
          const telIndice = somenteDigitos(r.telefoneKey);
          const telCampo = somenteDigitos(r.telefoneOriginal || r.telefone);
          const texto = semAcento([r.nome, data, dataBR, r.endereco, r.observacoes, r.status, r.pecas, r.indiceFirebase, telIndice, telCampo].join(' '));
          return (termo && texto.includes(termo)) || (numero && (telIndice.includes(numero) || telCampo.includes(numero)));
        });
      }

      encontrados.sort((a,b) => String(a.dataAgenda).localeCompare(String(b.dataAgenda)) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
      if (!todos.length) {
        listaAdm.innerHTML = '<div class="vazio"><strong>📭 Nenhum dado existe na pasta agendamentos.</strong></div>';
      } else if (!encontrados.length) {
        listaAdm.innerHTML = `<div class="admin-ajuda-pdf">📚 ${todos.length} registro(s) lido(s) do Firebase.</div><div class="vazio"><strong>🔎 Nenhum resultado encontrado.</strong><br><small>Pesquisa feita em nome, telefone, índice, data, endereço, observações e status.</small></div>`;
      } else {
        listaAdm.innerHTML = `<div class="admin-ajuda-pdf">✅ ${encontrados.length} de ${todos.length} registro(s) encontrado(s).</div>${encontrados.map(cardAdmV28).join('')}`;
      }
      if (rolar) setTimeout(() => listaAdm.scrollIntoView({behavior:'smooth', block:'start'}), 80);
    } catch (erro) {
      console.error('BUSCA ADM V28:', erro);
      listaAdm.innerHTML = `<div class="vazio"><strong>❌ Erro ao ler a pasta agendamentos.</strong><br><small>${safe(erro?.message || erro)}</small></div>`;
    }
  }

  window.carregarAgendamentosAdmin = () => buscarAdmV28({mostrarTodos: !String(campoAdm?.value || '').trim(), rolar:false});
  botaoAdm?.addEventListener('click', (e) => { e.preventDefault(); buscarAdmV28({mostrarTodos:false}); });
  campoAdm?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarAdmV28({mostrarTodos:false}); } });
  botaoVer?.addEventListener('click', () => { if (campoAdm) campoAdm.value=''; buscarAdmV28({mostrarTodos:true}); });
  botaoAtualizar?.addEventListener('click', () => buscarAdmV28({mostrarTodos: !String(campoAdm?.value || '').trim()}));
  botaoLimpar?.addEventListener('click', () => { if (campoAdm) campoAdm.value=''; buscarAdmV28({mostrarTodos:true}); });

  db.ref('agendamentos').on('value', () => {
    if (!document.getElementById('adminPainel')?.classList.contains('hidden') && listaAdm && !listaAdm.classList.contains('hidden')) {
      buscarAdmV28({mostrarTodos: !String(campoAdm?.value || '').trim(), rolar:false});
    }
  });
})();

// ================= V29 — BUSCAS DE AGENDAMENTO COM LEITURA GARANTIDA =================
// Usa o SDK do Firebase com limite de tempo e, se necessário, leitura REST direta.
(function instalarBuscasAgendaV29(){
  const digits = (v) => String(v || '').replace(/\D/g, '');
  const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const htmlSafe = (v) => typeof safe === 'function' ? safe(v) : String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function cloneById(id){
    const el = document.getElementById(id);
    if (!el || !el.parentNode) return el;
    const novo = el.cloneNode(true);
    el.parentNode.replaceChild(novo, el);
    return novo;
  }

  async function lerRaizAgendamentosV29(){
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo limite do Firebase SDK')), 5500));
    try {
      const snap = await Promise.race([db.ref('agendamentos').once('value'), timeout]);
      return snap?.val?.() || {};
    } catch (erroSdk) {
      console.warn('V29: usando leitura REST de contingência.', erroSdk);
      const base = String(firebaseConfig.databaseURL || '').replace(/\/$/, '');
      const resposta = await fetch(`${base}/agendamentos.json?ts=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {'Accept':'application/json'}
      });
      if (!resposta.ok) throw new Error(`Firebase REST respondeu ${resposta.status}`);
      return (await resposta.json()) || {};
    }
  }

  function achatarAgendamentosV29(raiz){
    const lista = [];
    Object.entries(raiz || {}).forEach(([dataKey, grupo]) => {
      if (!grupo || typeof grupo !== 'object') return;
      Object.entries(grupo).forEach(([telefoneKey, bruto]) => {
        if (!bruto || typeof bruto !== 'object') return;
        const telefoneOriginal = digits(bruto.telefoneOriginal || bruto.celular || bruto.phone || telefoneKey || bruto.telefone);
        const dataAgenda = /^\d{4}-\d{2}-\d{2}$/.test(String(bruto.dataAgenda || ''))
          ? String(bruto.dataAgenda)
          : (/^\d{4}-\d{2}-\d{2}$/.test(dataKey) ? dataKey : String(bruto.dataAgenda || bruto.data || dataKey || ''));
        lista.push({
          ...bruto,
          diaKey: dataKey,
          telefoneKey,
          dataAgenda,
          nome: String(bruto.nome || bruto.nomeCompleto || bruto.cliente || 'Cliente'),
          telefoneOriginal: telefoneOriginal || digits(telefoneKey),
          status: String(bruto.status || 'agendado').toLowerCase(),
          indiceFirebase: `agendamentos/${dataKey}/${telefoneKey}`
        });
      });
    });
    return lista;
  }

  async function lerTodosV29(){
    return achatarAgendamentosV29(await lerRaizAgendamentosV29());
  }

  function dataBR(v){
    const s = String(v || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s;
  }

  function cardClienteV29(r){
    const status = String(r.status || 'agendado').replace(/[^a-z_]/gi, '') || 'agendado';
    const rotulo = typeof rotuloStatusAgenda === 'function' ? rotuloStatusAgenda(status) : status;
    const criado = typeof dataHoraReserva === 'function' ? dataHoraReserva(r) : String(r.criadoEm || '');
    const data = dataBR(r.dataAgenda || r.diaKey);
    const tel = digits(r.telefoneOriginal || r.telefoneKey || r.telefone);
    const nome = String(r.nome || 'Cliente');
    return `<article class="meu-agendamento-card cliente-status-${htmlSafe(status)}">
      <div class="meu-agendamento-topo">
        <div class="meu-agendamento-data">
          <span class="meu-agendamento-icone">📅</span>
          <div><small>Data agendada</small><strong>${htmlSafe(data || 'Não informada')}</strong></div>
        </div>
        <span class="meu-agendamento-status">${htmlSafe(rotulo)}</span>
      </div>
      <div class="meu-agendamento-cliente">
        <span class="avatar-agendamento">👤</span>
        <div><small>Cliente</small><h3>${htmlSafe(nome)}</h3></div>
      </div>
      <div class="meu-agendamento-grid">
        <div class="agendamento-dado"><span>📞</span><div><small>Telefone</small><strong>${htmlSafe(tel || 'Não informado')}</strong></div></div>
        ${r.pecas ? `<div class="agendamento-dado"><span>🧺</span><div><small>Quantidade</small><strong>${htmlSafe(r.pecas)} peças</strong></div></div>` : ''}
        ${r.endereco ? `<div class="agendamento-dado agendamento-dado-largo"><span>📍</span><div><small>Endereço</small><strong>${htmlSafe(r.endereco)}</strong></div></div>` : ''}
        ${r.observacoes ? `<div class="agendamento-dado agendamento-dado-largo"><span>📝</span><div><small>Observações</small><strong>${htmlSafe(r.observacoes)}</strong></div></div>` : ''}
        ${criado ? `<div class="agendamento-dado agendamento-dado-largo"><span>🕒</span><div><small>Registrado em</small><strong>${htmlSafe(criado)}</strong></div></div>` : ''}
      </div>
      <div class="agendamento-confirmado-aviso">✅ Reserva localizada e vinculada a este telefone.</div>
    </article>`;
  }

  function cardAdmV29(r){
    const status = String(r.status || 'agendado').replace(/[^a-z_]/gi, '') || 'agendado';
    const tel = digits(r.telefoneOriginal || r.telefoneKey || r.telefone);
    const nome = String(r.nome || 'Cliente');
    const dia = dataBR(r.dataAgenda || r.diaKey);
    const rotulo = typeof rotuloStatusAgenda === 'function' ? rotuloStatusAgenda(status) : status;
    const criado = typeof dataHoraReserva === 'function' ? dataHoraReserva(r) : String(r.criadoEm || '');
    const whats = tel ? `https://wa.me/55${tel}?text=${encodeURIComponent(`Olá ${nome}, falando sobre seu agendamento na Passadoria para ${dia}.`)}` : '';
    return `<article class="admin-item agenda-admin-item status-${htmlSafe(status)}">
      <div class="agenda-admin-topo"><strong>📅 ${htmlSafe(dia || 'Data não informada')}</strong><span>${htmlSafe(rotulo)}</span></div>
      <h3>${htmlSafe(nome)}</h3>
      <p><strong>📞 Telefone:</strong> ${htmlSafe(tel || 'Não informado')}</p>
      ${r.pecas ? `<p><strong>🧺 Peças:</strong> ${htmlSafe(r.pecas)}</p>` : ''}
      ${r.endereco ? `<p><strong>📍 Endereço:</strong> ${htmlSafe(r.endereco)}</p>` : ''}
      ${r.observacoes ? `<p><strong>📝 Observações:</strong> ${htmlSafe(r.observacoes)}</p>` : ''}
      ${criado ? `<p><strong>🕒 Criado em:</strong> ${htmlSafe(criado)}</p>` : ''}
      <p class="indice-registro"><strong>Índice Firebase:</strong> ${htmlSafe(r.indiceFirebase)}</p>
      <div class="agenda-contato-acoes">${tel ? `<a href="tel:${tel}">📞 Ligar</a><a href="${whats}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}</div>
      <div class="agenda-admin-acoes">
        <button type="button" onclick="alterarStatusAgendamento('${htmlSafe(r.diaKey)}','${htmlSafe(r.telefoneKey)}','confirmado')">Confirmar</button>
        <button type="button" onclick="alterarStatusAgendamento('${htmlSafe(r.diaKey)}','${htmlSafe(r.telefoneKey)}','em_atendimento')">Em atendimento</button>
        <button type="button" onclick="alterarStatusAgendamento('${htmlSafe(r.diaKey)}','${htmlSafe(r.telefoneKey)}','concluido')">Concluído</button>
        <button type="button" onclick="alterarStatusAgendamento('${htmlSafe(r.diaKey)}','${htmlSafe(r.telefoneKey)}','faltou')">Não veio</button>
        <button type="button" onclick="alterarStatusAgendamento('${htmlSafe(r.diaKey)}','${htmlSafe(r.telefoneKey)}','cancelado')">Cancelar</button>
        <button class="excluir" type="button" onclick="excluirAgendamento('${htmlSafe(r.diaKey)}','${htmlSafe(r.telefoneKey)}')">Excluir</button>
      </div>
    </article>`;
  }

  // Consulta do cliente
  const campoCliente = cloneById('consultarAgendaTelefone');
  const btnCliente = cloneById('btnConsultarAgenda');
  const painelCliente = document.getElementById('meuAgendamentoPainel');

  async function consultarCliente(){
    const telefone = digits(campoCliente?.value);
    if (!painelCliente) return;
    painelCliente.classList.remove('hidden');
    if (telefone.length < 10) {
      painelCliente.innerHTML = '<p>⚠️ Digite o telefone completo com DDD.</p>';
      return;
    }
    painelCliente.innerHTML = '<p>⏳ Consultando o Firebase...</p>';
    try {
      const todos = await lerTodosV29();
      const encontrados = todos.filter(r => {
        const telIndice = digits(r.telefoneKey);
        const telCampo = digits(r.telefoneOriginal || r.telefone);
        return telIndice === telefone || telCampo === telefone;
      }).sort((a,b) => String(a.dataAgenda).localeCompare(String(b.dataAgenda)));
      painelCliente.innerHTML = encontrados.length
        ? `<div class="consulta-resumo">✅ ${encontrados.length} agendamento(s) encontrado(s).</div>${encontrados.map(cardClienteV29).join('')}`
        : `<p>📭 Nenhum agendamento encontrado para o telefone <strong>${htmlSafe(telefone)}</strong>.</p>`;
      painelCliente.scrollIntoView({behavior:'smooth', block:'start'});
    } catch (erro) {
      console.error('V29 consulta cliente:', erro);
      painelCliente.innerHTML = `<p>❌ Erro ao consultar o Firebase.<br><small>${htmlSafe(erro?.message || erro)}</small></p>`;
    }
  }
  btnCliente?.addEventListener('click', consultarCliente);
  campoCliente?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); consultarCliente(); } });

  // Lista e busca ADM
  const campoAdm = cloneById('buscarAgendamentoAdm');
  const btnAdm = cloneById('btnBuscarAgendamentos');
  const btnVer = cloneById('btnVerAgendamentos');
  const btnAtualizar = cloneById('btnAtualizarAgendamentos');
  const btnLimpar = cloneById('btnLimparBuscaAgendamentos');
  const listaAdm = document.getElementById('adminAgendamentos');

  async function buscarAdm(mostrarTodos = false){
    if (!listaAdm) return;
    listaAdm.classList.remove('hidden');
    listaAdm.innerHTML = '<div class="admin-ajuda-pdf">⏳ Consultando diretamente a pasta <strong>agendamentos</strong>...</div>';
    try {
      const todos = await lerTodosV29();
      const original = String(campoAdm?.value || '').trim();
      const termo = norm(original);
      const numero = digits(original);
      let encontrados = todos;
      if (!mostrarTodos && original) {
        encontrados = todos.filter(r => {
          const telIndice = digits(r.telefoneKey);
          const telCampo = digits(r.telefoneOriginal || r.telefone);
          const texto = norm([r.nome, r.dataAgenda, dataBR(r.dataAgenda), r.endereco, r.observacoes, r.status, r.pecas, r.indiceFirebase, telIndice, telCampo].join(' '));
          return (numero && (telIndice.includes(numero) || telCampo.includes(numero))) || (termo && texto.includes(termo));
        });
      }
      encontrados.sort((a,b) => String(a.dataAgenda).localeCompare(String(b.dataAgenda)) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
      if (!todos.length) {
        listaAdm.innerHTML = '<div class="vazio">📭 A pasta <strong>agendamentos</strong> está vazia.</div>';
      } else if (!encontrados.length) {
        listaAdm.innerHTML = `<div class="admin-ajuda-pdf">📚 ${todos.length} registro(s) lido(s) do Firebase.</div><div class="vazio">🔎 Nenhum registro corresponde a <strong>${htmlSafe(original)}</strong>.</div>`;
      } else {
        listaAdm.innerHTML = `<div class="admin-ajuda-pdf">✅ ${encontrados.length} de ${todos.length} registro(s) encontrado(s).</div>${encontrados.map(cardAdmV29).join('')}`;
      }
      listaAdm.scrollIntoView({behavior:'smooth', block:'start'});
    } catch (erro) {
      console.error('V29 busca ADM:', erro);
      listaAdm.innerHTML = `<div class="vazio">❌ Não foi possível consultar os agendamentos.<br><small>${htmlSafe(erro?.message || erro)}</small></div>`;
    }
  }

  window.carregarAgendamentosAdmin = () => buscarAdm(!String(campoAdm?.value || '').trim());
  btnAdm?.addEventListener('click', e => { e.preventDefault(); buscarAdm(false); });
  campoAdm?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); buscarAdm(false); } });
  btnVer?.addEventListener('click', () => { if (campoAdm) campoAdm.value = ''; buscarAdm(true); });
  btnAtualizar?.addEventListener('click', () => buscarAdm(!String(campoAdm?.value || '').trim()));
  btnLimpar?.addEventListener('click', () => { if (campoAdm) campoAdm.value = ''; buscarAdm(true); });
})();
