const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { PrismaClient } = require("@prisma/client");
const {
  login,
  criarUsuario,
  editarUsuario,
  buscarPerfil,
  listarUsuarios,
  removerUsuario,
  verificarToken,
  setPrisma,
  limparCPF,
} = require("./auth");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const prisma = new PrismaClient();
setPrisma(prisma);

const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "../public")));

// ── Upload de arquivos ────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "../public/uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const nome =
      Date.now() + "_" + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, nome);
  },
});

const TIPOS_PERMITIDOS = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (TIPOS_PERMITIDOS.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de arquivo não permitido."));
  },
});

function tipoArquivo(mimetype) {
  if (mimetype.startsWith("image/")) return "imagem";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  return "documento";
}

function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ erro: "Não autorizado." });
  const payload = verificarToken(token);
  if (!payload) return res.status(401).json({ erro: "Sessão inválida." });
  req.usuario = payload;
  next();
}
function podeGerenciar(req, res, next) {
  if (!req.usuario?.admin && !req.usuario?.gestor)
    return res.status(403).json({ erro: "Sem permissão." });
  next();
}
function apenasAdmin(req, res, next) {
  if (!req.usuario?.admin)
    return res.status(403).json({ erro: "Acesso negado." });
  next();
}

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.post("/auth/login", async (req, res) => {
  const r = await login(req.body);
  if (r.erro) return res.status(401).json(r);
  res.json(r);
});

app.post("/auth/renovar-token", autenticar, async (req, res) => {
  const u = await buscarPerfil(req.usuario.cpf);
  if (!u) return res.status(404).json({ erro: "Não encontrado." });
  const jwt = require("jsonwebtoken");
  const SECRET = process.env.JWT_SECRET || "troque-isso-em-producao";
  const token = jwt.sign(
    { cpf: u.id, nome: u.nomeExibicao, admin: u.admin, gestor: u.gestor },
    SECRET,
    { expiresIn: "7d" },
  );
  res.json({ token, nome: u.nomeExibicao, admin: u.admin, gestor: u.gestor });
});

app.get("/perfil/por-cpf/:cpf", autenticar, async (req, res) => {
  const u = await prisma.usuario.findUnique({
    where: { id: req.params.cpf },
    select: {
      nomeCompleto: true,
      nomeExibicao: true,
      email: true,
      equipe: true,
      avatar: true,
      admin: true,
      gestor: true,
      criadoEm: true,
    },
  });
  if (!u) return res.status(404).json({ erro: "Usuário não encontrado." });
  res.json(u);
});

app.get("/perfil/me", autenticar, async (req, res) => {
  const u = await buscarPerfil(req.usuario.cpf);
  if (!u) return res.status(404).json({ erro: "Não encontrado." });
  res.json(u);
});

app.get("/perfil/ver/:nomeExibicao", autenticar, async (req, res) => {
  const u = await prisma.usuario.findUnique({
    where: { nomeExibicao: req.params.nomeExibicao },
    select: {
      nomeCompleto: true,
      nomeExibicao: true,
      email: true,
      equipe: true,
      avatar: true,
      admin: true,
      gestor: true,
      criadoEm: true,
    },
  });
  if (!u) return res.status(404).json({ erro: "Usuário não encontrado." });
  res.json(u);
});

app.patch("/perfil/me", autenticar, async (req, res) => {
  const r = await editarUsuario({
    cpfAlvo: req.usuario.cpf,
    dados: req.body,
    quemEdita: req.usuario,
  });
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});

app.get("/admin/usuarios", autenticar, apenasAdmin, async (req, res) => {
  res.json(await listarUsuarios());
});

app.post("/admin/usuarios", autenticar, apenasAdmin, async (req, res) => {
  const { canais: canaisParaAdicionar, gestor, ...dadosUsuario } = req.body;
  const r = await criarUsuario({ ...dadosUsuario, gestor: gestor || false });
  if (r.erro) return res.status(400).json(r);

  // Sempre adiciona aos canais, mesmo que array vazio
  if (Array.isArray(canaisParaAdicionar) && canaisParaAdicionar.length > 0) {
    for (const slug of canaisParaAdicionar) {
      try {
        await prisma.membroCanal.create({
          data: { cpf: r.cpf, canalSlug: slug },
        });
      } catch (e) {
        // Ignora se já existe ou erro de validação
      }
    }
  }

  res.json({ ok: true, cpf: r.cpf });
});

app.get("/admin/usuarios/:cpf", autenticar, apenasAdmin, async (req, res) => {
  const u = await buscarPerfil(req.params.cpf);
  if (!u) return res.status(404).json({ erro: "Não encontrado." });
  res.json(u);
});

app.patch("/admin/usuarios/:cpf", autenticar, apenasAdmin, async (req, res) => {
  const r = await editarUsuario({
    cpfAlvo: limparCPF(req.params.cpf),
    dados: req.body,
    quemEdita: req.usuario,
  });
  if (r.erro) return res.status(400).json(r);
  res.json(r);
});

app.delete(
  "/admin/usuarios/:cpf",
  autenticar,
  apenasAdmin,
  async (req, res) => {
    const r = await removerUsuario(req.params.cpf);
    if (r.erro) return res.status(400).json(r);
    res.json(r);
  },
);

// ── Upload ────────────────────────────────────────────────────────────────────
app.post("/upload", autenticar, (req, res) => {
  upload.single("arquivo")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE")
        return res
          .status(400)
          .json({ erro: "Arquivo muito grande. Máximo 20MB." });
      return res.status(400).json({ erro: err.message || "Erro no upload." });
    }
    if (!req.file)
      return res.status(400).json({ erro: "Nenhum arquivo enviado." });
    const url = "/uploads/" + req.file.filename;
    const tipo = tipoArquivo(req.file.mimetype);
    const nome = req.file.originalname;
    res.json({ url, tipo, nome });
  });
});

// ── Canais ────────────────────────────────────────────────────────────────────
app.post("/canais", autenticar, podeGerenciar, async (req, res) => {
  const { slug, titulo, descricao } = req.body;
  if (!slug || !/^[a-zA-Z0-9-_]+$/.test(slug))
    return res
      .status(400)
      .json({ erro: "Slug inválido. Use letras, números e hífens." });
  const slugLower = slug.toLowerCase();
  const existe = await prisma.canal.findUnique({ where: { slug: slugLower } });
  if (existe) return res.status(400).json({ erro: "Canal já existe." });
  const canal = await prisma.canal.create({
    data: {
      slug: slugLower,
      nome: slugLower,
      titulo: titulo || slug,
      descricao: descricao || "",
      aberto: false,
    },
  });
  await prisma.membroCanal.create({
    data: { cpf: req.usuario.cpf, canalSlug: slugLower },
  });
  io.emit("canal_criado", canal);
  res.json({ ok: true, canal });
});

app.patch("/canais/:slug", autenticar, podeGerenciar, async (req, res) => {
  const { titulo, descricao } = req.body;
  const canal = await prisma.canal.findUnique({
    where: { slug: req.params.slug },
  });
  if (!canal) return res.status(404).json({ erro: "Canal não encontrado." });
  const update = {};
  if (titulo !== undefined) update.titulo = titulo.trim();
  if (descricao !== undefined) update.descricao = descricao.trim();
  if (Object.keys(update).length === 0)
    return res.status(400).json({ erro: "Nada para atualizar." });
  const atualizado = await prisma.canal.update({
    where: { slug: req.params.slug },
    data: update,
  });
  io.emit("canal_atualizado", atualizado);
  res.json({ ok: true, canal: atualizado });
});

app.get(
  "/canais-do-usuario/:cpf",
  autenticar,
  apenasAdmin,
  async (req, res) => {
    const membros = await prisma.membroCanal.findMany({
      where: { cpf: limparCPF(req.params.cpf) },
      include: { canal: { select: { slug: true, titulo: true } } },
    });
    res.json(membros.map((m) => m.canal));
  },
);

app.get("/canais", autenticar, apenasAdmin, async (req, res) => {
  const canais = await prisma.canal.findMany({
    orderBy: { id: "asc" },
    select: { slug: true, titulo: true, descricao: true },
  });
  res.json(canais);
});

app.get(
  "/canais/:slug/membros",
  autenticar,
  podeGerenciar,
  async (req, res) => {
    const membros = await prisma.membroCanal.findMany({
      where: { canalSlug: req.params.slug },
      include: {
        usuario: {
          select: { id: true, nomeExibicao: true, equipe: true, avatar: true },
        },
      },
    });
    res.json(membros.map((m) => m.usuario));
  },
);

app.get(
  "/canais/:slug/nao-membros",
  autenticar,
  podeGerenciar,
  async (req, res) => {
    const membros = await prisma.membroCanal.findMany({
      where: { canalSlug: req.params.slug },
    });
    const cpfsMembros = membros.map((m) => m.cpf);
    const naoMembros = await prisma.usuario.findMany({
      where: { id: { notIn: cpfsMembros } },
      select: { id: true, nomeExibicao: true, equipe: true, avatar: true },
    });
    res.json(naoMembros);
  },
);

app.post(
  "/canais/:slug/membros",
  autenticar,
  podeGerenciar,
  async (req, res) => {
    const { cpf } = req.body;
    const canal = await prisma.canal.findUnique({
      where: { slug: req.params.slug },
    });
    if (!canal) return res.status(404).json({ erro: "Canal não encontrado." });
    const ja = await prisma.membroCanal.findUnique({
      where: {
        cpf_canalSlug: { cpf: limparCPF(cpf), canalSlug: req.params.slug },
      },
    });
    if (ja) return res.status(400).json({ erro: "Já é membro." });
    await prisma.membroCanal.create({
      data: { cpf: limparCPF(cpf), canalSlug: req.params.slug },
    });
    const sid = nomeOnline.get(await nomeAtual(limparCPF(cpf)));
    if (sid) {
      io.to(sid).emit("adicionado_ao_canal", canal);
      const s = sockets.get(sid);
      if (s) io.sockets.sockets.get(sid)?.join(canal.slug);
    }
    res.json({ ok: true });
  },
);

app.delete(
  "/canais/:slug/membros/:cpf",
  autenticar,
  podeGerenciar,
  async (req, res) => {
    await prisma.membroCanal.deleteMany({
      where: { cpf: limparCPF(req.params.cpf), canalSlug: req.params.slug },
    });
    res.json({ ok: true });
  },
);

// ── Não lidas ─────────────────────────────────────────────────────────────────
app.get("/nao-lidas", autenticar, async (req, res) => {
  const cpf = req.usuario.cpf;
  const canaisDoUsuario = await canaisPermitidos(cpf);
  const naoLidasCanais = {};
  for (const canal of canaisDoUsuario) {
    const uv = await prisma.ultimaVisita
      .findUnique({ where: { cpf_canalSlug: { cpf, canalSlug: canal.slug } } })
      .catch(() => null);
    const desde = uv?.visitadoEm || new Date(0);
    const count = await prisma.mensagem.count({
      where: {
        canalId: canal.id,
        criadaEm: { gt: desde },
        tipo: "usuario",
        NOT: { autorCpf: cpf },
      },
    });
    if (count > 0) naoLidasCanais[canal.slug] = count;
  }
  const convs = await prisma.conversaPrivada.findMany({
    where: { OR: [{ participante1: cpf }, { participante2: cpf }] },
    include: { mensagens: { where: { lida: false, NOT: { autorCpf: cpf } } } },
  });
  const naoLidasDMs = {};
  for (const conv of convs) {
    if (conv.id.startsWith("self|")) continue;
    if (conv.mensagens.length > 0) {
      const outroCpf =
        conv.participante1 === cpf ? conv.participante2 : conv.participante1;
      const outro = await prisma.usuario.findUnique({
        where: { id: outroCpf },
        select: { nomeExibicao: true },
      });
      if (outro) naoLidasDMs[outro.nomeExibicao] = conv.mensagens.length;
    }
  }
  res.json({ canais: naoLidasCanais, dms: naoLidasDMs });
});

// ── Busca ─────────────────────────────────────────────────────────────────────
app.get("/buscar", autenticar, async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q || q.length < 2) return res.json({ canais: [], dms: [] });
  const cpf = req.usuario.cpf;

  // Busca em mensagens de canal (somente canais do usuário)
  const canaisDoUsuario = await canaisPermitidos(cpf);
  const idsCanais = canaisDoUsuario.map((c) => c.id);
  const msgsCanal = await prisma.mensagem.findMany({
    where: {
      canalId: { in: idsCanais },
      texto: { contains: q, mode: "insensitive" },
      tipo: "usuario",
    },
    orderBy: { criadaEm: "desc" },
    take: 20,
    select: {
      id: true,
      texto: true,
      autor: true,
      criadaEm: true,
      canalId: true,
    },
  });
  const canaisResultado = msgsCanal.map((m) => {
    const canal = canaisDoUsuario.find((c) => c.id === m.canalId);
    return {
      id: m.id,
      texto: m.texto,
      autor: m.autor,
      hora: formatHora(m.criadaEm),
      canal: canal?.slug,
      canalTitulo: canal?.titulo || canal?.slug,
    };
  });

  // Busca em mensagens privadas do usuário
  const convs = await prisma.conversaPrivada.findMany({
    where: { OR: [{ participante1: cpf }, { participante2: cpf }] },
  });
  const idsConvs = convs.map((c) => c.id);
  const msgsDM = await prisma.mensagemPrivada.findMany({
    where: {
      conversaId: { in: idsConvs },
      texto: { contains: q, mode: "insensitive" },
    },
    orderBy: { criadaEm: "desc" },
    take: 20,
    select: {
      id: true,
      texto: true,
      autorNome: true,
      criadaEm: true,
      conversaId: true,
    },
  });
  const dmsResultado = await Promise.all(
    msgsDM.map(async (m) => {
      const conv = convs.find((c) => c.id === m.conversaId);
      const isSelf = conv?.id.startsWith("self|");
      let comNome = "(você)";
      if (!isSelf && conv) {
        const outroCpf =
          conv.participante1 === cpf ? conv.participante2 : conv.participante1;
        comNome = await nomeAtual(outroCpf);
      }
      return {
        id: m.id,
        texto: m.texto,
        autor: m.autorNome,
        hora: formatHora(m.criadaEm),
        com: comNome,
      };
    }),
  );

  res.json({ canais: canaisResultado, dms: dmsResultado });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const sockets = new Map();
const cpfOnline = new Map();
const nomeOnline = new Map();
const statusMap = new Map();

function emitirOnline() {
  const lista = [...nomeOnline.entries()].map(([nome, sid]) => {
    const u = sockets.get(sid);
    return { nome, status: u ? statusMap.get(u.cpf) || "online" : "online" };
  });
  io.emit("usuarios_online", lista);
}

function chavePriv(a, b) {
  return [a, b].sort().join("|");
}
function formatHora(d) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}

async function nomeAtual(cpf) {
  const u = await prisma.usuario.findUnique({
    where: { id: cpf },
    select: { nomeExibicao: true },
  });
  return u?.nomeExibicao || cpf;
}

async function canaisPermitidos(cpf) {
  const membros = await prisma.membroCanal.findMany({
    where: { cpf },
    select: { canalSlug: true },
  });
  const slugsMembro = membros.map((m) => m.canalSlug);
  return prisma.canal.findMany({
    where: { slug: { in: slugsMembro } },
    orderBy: { id: "asc" },
  });
}

async function buscarHistorico(canalId, limite = 50) {
  const total = await prisma.mensagem.count({ where: { canalId } });
  const msgs = await prisma.mensagem.findMany({
    where: { canalId },
    orderBy: { criadaEm: "asc" },
    skip: Math.max(0, total - limite),
    take: limite,
  });
  const cpfs = [
    ...new Set(msgs.filter((m) => m.autorCpf).map((m) => m.autorCpf)),
  ];
  const users = await prisma.usuario.findMany({
    where: { id: { in: cpfs } },
    select: { id: true, nomeExibicao: true },
  });
  const map = Object.fromEntries(users.map((u) => [u.id, u.nomeExibicao]));
  return msgs.map((m) => ({
    id: m.id,
    tipo: m.tipo,
    autor: m.autorCpf ? map[m.autorCpf] || m.autor : m.autor,
    autorCpf: m.autorCpf,
    texto: m.texto,
    urlArquivo: m.urlArquivo || null,
    tipoArquivo: m.tipoArquivo || null,
    nomeArquivo: m.nomeArquivo || null,
    hora: formatHora(m.criadaEm),
  }));
}

async function buscarHistoricoPrivado(conversaId, limite = 50) {
  const total = await prisma.mensagemPrivada.count({ where: { conversaId } });
  const msgs = await prisma.mensagemPrivada.findMany({
    where: { conversaId },
    orderBy: { criadaEm: "asc" },
    skip: Math.max(0, total - limite),
    take: limite,
  });
  const cpfs = [...new Set(msgs.map((m) => m.autorCpf))];
  const users = await prisma.usuario.findMany({
    where: { id: { in: cpfs } },
    select: { id: true, nomeExibicao: true },
  });
  const map = Object.fromEntries(users.map((u) => [u.id, u.nomeExibicao]));
  return msgs.map((m) => ({
    id: m.id,
    tipo: "privado",
    autor: map[m.autorCpf] || m.autorNome,
    autorCpf: m.autorCpf,
    texto: m.texto,
    urlArquivo: m.urlArquivo || null,
    tipoArquivo: m.tipoArquivo || null,
    nomeArquivo: m.nomeArquivo || null,
    hora: formatHora(m.criadaEm),
  }));
}

async function contarNaoLidasDM(cpf) {
  const convs = await prisma.conversaPrivada.findMany({
    where: { OR: [{ participante1: cpf }, { participante2: cpf }] },
    include: { mensagens: { where: { lida: false, NOT: { autorCpf: cpf } } } },
  });
  const r = {};
  for (const conv of convs) {
    if (conv.id.startsWith("self|")) continue;
    if (conv.mensagens.length > 0) {
      const outroCpf =
        conv.participante1 === cpf ? conv.participante2 : conv.participante1;
      const outro = await prisma.usuario.findUnique({
        where: { id: outroCpf },
        select: { nomeExibicao: true },
      });
      if (outro) r[outro.nomeExibicao] = conv.mensagens.length;
    }
  }
  return r;
}

// ── Socket ────────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  socket.on("autenticar", async (token) => {
    const payload = verificarToken(token);
    if (!payload) {
      socket.emit("erro_auth", "Sessão inválida.");
      return;
    }
    const u = await prisma.usuario.findUnique({ where: { id: payload.cpf } });
    if (!u) {
      socket.emit("erro_auth", "Usuário não encontrado.");
      return;
    }
    const { id: cpf, nomeExibicao: nome, admin, gestor } = u;
    if (cpfOnline.has(cpf)) {
      socket.emit("erro_auth", "Usuário já conectado em outro dispositivo.");
      return;
    }

    const canais = await canaisPermitidos(cpf);
    for (const c of canais) socket.join(c.slug);

    const convs = await prisma.conversaPrivada.findMany({
      where: { OR: [{ participante1: cpf }, { participante2: cpf }] },
    });
    for (const conv of convs) socket.join(conv.id);

    sockets.set(socket.id, {
      cpf,
      nome,
      tipo: null,
      canalSlug: null,
      chavePrivada: null,
    });
    cpfOnline.set(cpf, socket.id);
    nomeOnline.set(nome, socket.id);
    statusMap.set(cpf, "online");

    socket.emit("canais", canais);
    socket.emit("meu_perfil", { admin, gestor, cpf });

    // DEPOIS (CORRETO - usa CPF e pega nome atual):
    const dmsComMensagens = await Promise.all(
      convs.map(async (conv) => {
        const count = await prisma.mensagemPrivada.count({
          where: { conversaId: conv.id },
        });
        if (count === 0) return null;
        const isSelf = conv.id.startsWith("self|");
        const outroCpf = isSelf
          ? cpf
          : conv.participante1 === cpf
            ? conv.participante2
            : conv.participante1;
        const outroNome = await nomeAtual(outroCpf);
        return { cpf: outroCpf, outro: outroNome };
      }),
    );

    socket.emit("dms_existentes", dmsComMensagens.filter(Boolean));
    emitirOnline();
  });

  socket.on("entrar_canal", async (slug) => {
    socket.join(slug);
  });

  socket.on("abrir_canal", async (slug) => {
    const u = sockets.get(socket.id);
    if (!u) return;
    const canal = await prisma.canal.findUnique({ where: { slug } });
    if (!canal) return;
    const permitido = await prisma.membroCanal.findUnique({
      where: { cpf_canalSlug: { cpf: u.cpf, canalSlug: slug } },
    });
    if (!permitido) return;
    u.tipo = "canal";
    u.canalSlug = slug;
    u.chavePrivada = null;
    const hist = await buscarHistorico(canal.id);
    await prisma.ultimaVisita
      .upsert({
        where: { cpf_canalSlug: { cpf: u.cpf, canalSlug: slug } },
        update: { visitadoEm: new Date() },
        create: { cpf: u.cpf, canalSlug: slug, visitadoEm: new Date() },
      })
      .catch(() => {});
    socket.emit("historico", hist);
  });

  socket.on("abrir_privado", async (nomeDestino) => {
    const u = sockets.get(socket.id);
    if (!u) return;
    const destino = await prisma.usuario.findUnique({
      where: { nomeExibicao: nomeDestino },
    });
    if (!destino) return;
    if (u.tipo === "privado") socket.leave(u.chavePrivada);
    const chave =
      destino.id === u.cpf ? `self|${u.cpf}` : chavePriv(u.cpf, destino.id);
    const conv = await prisma.conversaPrivada.upsert({
      where: { id: chave },
      update: {},
      create: { id: chave, participante1: u.cpf, participante2: destino.id },
    });
    u.tipo = "privado";
    u.chavePrivada = conv.id;
    socket.join(conv.id);
    socket.emit("historico_privado", {
      com: nomeDestino,
      historico: await buscarHistoricoPrivado(conv.id),
    });
  });

  socket.on("marcar_dm_lida", async (nomeDestino) => {
    const u = sockets.get(socket.id);
    if (!u) return;
    const destino = await prisma.usuario.findUnique({
      where: { nomeExibicao: nomeDestino },
    });
    if (!destino) return;
    const chave =
      destino.id === u.cpf ? `self|${u.cpf}` : chavePriv(u.cpf, destino.id);
    await prisma.mensagemPrivada.updateMany({
      where: { conversaId: chave, lida: false, NOT: { autorCpf: u.cpf } },
      data: { lida: true },
    });
    const so = cpfOnline.get(destino.id);
    if (so) io.to(so).emit("nao_lidas_dm", await contarNaoLidasDM(destino.id));
  });

  // ── Mensagem de texto ────────────────────────────────────────────────────────
  socket.on("mensagem", async (payload) => {
    const u = sockets.get(socket.id);
    if (!u) return;
    // Suporta texto puro (string) e objeto { texto, urlArquivo, tipoArquivo, nomeArquivo }
    let texto = "",
      urlArquivo = null,
      tipoArquivo = null,
      nomeArquivo = null;
    if (typeof payload === "string") {
      texto = payload.trim().substring(0, 500);
      if (!texto) return;
    } else {
      texto = (payload.texto || "").trim().substring(0, 500);
      urlArquivo = payload.urlArquivo || null;
      tipoArquivo = payload.tipoArquivo || null;
      nomeArquivo = payload.nomeArquivo || null;
      if (!texto && !urlArquivo) return;
    }

    const nomeAtualizado = await nomeAtual(u.cpf);
    u.nome = nomeAtualizado;
    nomeOnline.set(nomeAtualizado, socket.id);

    if (u.tipo === "canal") {
      const canal = await prisma.canal.findUnique({
        where: { slug: u.canalSlug },
      });
      if (!canal) return;
      const s = await prisma.mensagem.create({
        data: {
          tipo: "usuario",
          autorCpf: u.cpf,
          autor: nomeAtualizado,
          texto,
          canalId: canal.id,
          urlArquivo,
          tipoArquivo,
          nomeArquivo,
        },
      });
      const msg = {
        id: s.id,
        tipo: "usuario",
        autor: nomeAtualizado,
        autorCpf: u.cpf,
        texto,
        urlArquivo,
        tipoArquivo,
        nomeArquivo,
        _canal: u.canalSlug,
        hora: formatHora(s.criadaEm),
      };
      io.to(u.canalSlug).emit("mensagem", msg);
      await prisma.ultimaVisita
        .upsert({
          where: { cpf_canalSlug: { cpf: u.cpf, canalSlug: u.canalSlug } },
          update: { visitadoEm: new Date() },
          create: {
            cpf: u.cpf,
            canalSlug: u.canalSlug,
            visitadoEm: new Date(),
          },
        })
        .catch(() => {});
    } else if (u.tipo === "privado") {
      const s = await prisma.mensagemPrivada.create({
        data: {
          autorCpf: u.cpf,
          autorNome: nomeAtualizado,
          texto,
          conversaId: u.chavePrivada,
          urlArquivo,
          tipoArquivo,
          nomeArquivo,
        },
      });
      const msg = {
        id: s.id,
        tipo: "privado",
        autor: nomeAtualizado,
        autorCpf: u.cpf,
        texto,
        urlArquivo,
        tipoArquivo,
        nomeArquivo,
        hora: formatHora(s.criadaEm),
      };
      io.to(u.chavePrivada).emit("mensagem_privada", msg);
      const conv = await prisma.conversaPrivada.findUnique({
        where: { id: u.chavePrivada },
      });
      if (conv && !conv.id.startsWith("self|")) {
        const outroCpf =
          conv.participante1 === u.cpf
            ? conv.participante2
            : conv.participante1;
        const so = cpfOnline.get(outroCpf);
        if (so) {
          const uo = sockets.get(so);
          if (!uo || uo.chavePrivada !== u.chavePrivada)
            io.to(so).emit("nao_lidas_dm", await contarNaoLidasDM(outroCpf));
        }
      }
    }
  });

  // ── Ocultar mensagem (somente da tela — banco fica intacto) ──────────────────
  socket.on("ocultar_msg", async ({ id, tipo }) => {
    const u = sockets.get(socket.id);
    if (!u) return;
    // Verifica autoria antes de ocultar
    if (tipo === "canal") {
      const msg = await prisma.mensagem.findUnique({
        where: { id },
        select: { autorCpf: true, canalId: true },
      });
      if (!msg || msg.autorCpf !== u.cpf) return;
      // Descobre o slug do canal para emitir apenas para quem está nele
      const mc = await prisma.canal.findUnique({
        where: { id: msg.canalId },
        select: { slug: true },
      });
      if (mc) io.to(mc.slug).emit("msg_ocultada", { id });
    } else if (tipo === "privado") {
      const msg = await prisma.mensagemPrivada.findUnique({
        where: { id },
        select: { autorCpf: true, conversaId: true },
      });
      if (!msg || msg.autorCpf !== u.cpf) return;
      io.to(msg.conversaId).emit("msg_ocultada", { id });
    }
  });

  socket.on("mudar_status", (status) => {
    const u = sockets.get(socket.id);
    if (!u) return;
    if (!["online", "ausente", "ocupado"].includes(status)) return;
    statusMap.set(u.cpf, status);
    emitirOnline();
  });

  socket.on("digitando", (d) => {
    const u = sockets.get(socket.id);
    if (!u) return;
    const sala = u.tipo === "canal" ? u.canalSlug : u.chavePrivada;
    if (sala) socket.to(sala).emit("digitando", { nome: u.nome, digitando: d });
  });

  socket.on("disconnect", () => {
    const u = sockets.get(socket.id);
    if (u) {
      cpfOnline.delete(u.cpf);
      nomeOnline.delete(u.nome);
      statusMap.delete(u.cpf);
      sockets.delete(socket.id);
      emitirOnline();
    }
  });
});

// ── Atualizar lista online periodicamente ──────────────────────────────────────
setInterval(() => {
  emitirOnline();
}, 5000); // A cada 5 segundos

async function iniciar() {
  await prisma.$connect();
  console.log("✓ PostgreSQL conectado");
  server.listen(PORT, () => console.log(`✓ http://localhost:${PORT}\n`));
}
iniciar().catch((e) => {
  console.error("Erro:", e.message);
  process.exit(1);
});
