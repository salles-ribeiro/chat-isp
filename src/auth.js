const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');

let prisma;
function setPrisma(p) { prisma = p; }

const JWT_SECRET = process.env.JWT_SECRET || 'troque-isso-em-producao';

function limparCPF(cpf) { return (cpf||'').replace(/\D/g, ''); }

function validarCPF(cpf) {
  const c = limparCPF(cpf);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(c[i]) * (10 - i);
  let r = (s * 10) % 11; if (r >= 10) r = 0;
  if (r !== parseInt(c[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(c[i]) * (11 - i);
  r = (s * 10) % 11; if (r >= 10) r = 0;
  return r === parseInt(c[10]);
}

// ── Login por CPF ──────────────────────────────────────────────────────────────
async function login({ cpf, senha }) {
  if (!cpf || !senha) return { erro: 'Preencha CPF e senha.' };
  const cpfLimpo = limparCPF(cpf);
  const usuario = await prisma.usuario.findUnique({ where: { id: cpfLimpo } });
  if (!usuario) return { erro: 'CPF não encontrado.' };
  const ok = await bcrypt.compare(senha, usuario.senhaHash);
  if (!ok) return { erro: 'Senha incorreta.' };
  const token = jwt.sign(
    { cpf: cpfLimpo, nome: usuario.nomeExibicao, admin: usuario.admin, gestor: usuario.gestor },
    JWT_SECRET, { expiresIn: '7d' }
  );
  return { ok: true, token, nome: usuario.nomeExibicao, admin: usuario.admin, cpf: cpfLimpo };
}

// ── Criar usuário ──────────────────────────────────────────────────────────────
async function criarUsuario({ nomeCompleto, cpf, email, nomeExibicao, equipe, gestor, admin, senha }) {
  if (!nomeCompleto || nomeCompleto.trim().length < 3) return { erro: 'Nome completo inválido.' };
  if (!cpf || !validarCPF(cpf))                       return { erro: 'CPF inválido.' };
  if (!email || !email.includes('@'))                  return { erro: 'E-mail inválido.' };
  if (!nomeExibicao || nomeExibicao.trim().length < 2) return { erro: 'Nome de exibição inválido.' };
  if (!senha || senha.length < 6)                      return { erro: 'Senha deve ter pelo menos 6 caracteres.' };

  const cpfLimpo   = limparCPF(cpf);
  const emailLimpo = email.trim().toLowerCase();
  const nomeLimpo  = nomeExibicao.trim().substring(0, 40);

  const existeCPF = await prisma.usuario.findUnique({ where: { id: cpfLimpo } });
  if (existeCPF) return { erro: 'CPF já cadastrado.' };
  const existeEmail = await prisma.usuario.findUnique({ where: { email: emailLimpo } });
  if (existeEmail) return { erro: 'E-mail já cadastrado.' };
  const existeNome = await prisma.usuario.findUnique({ where: { nomeExibicao: nomeLimpo } });
  if (existeNome) return { erro: 'Nome de exibição já em uso.' };

  const senhaHash = await bcrypt.hash(senha, 10);
  await prisma.usuario.create({
    data: { id: cpfLimpo, nomeCompleto: nomeCompleto.trim(), email: emailLimpo, nomeExibicao: nomeLimpo, equipe: (equipe||'').trim().substring(0,30), gestor: Boolean(gestor), admin: Boolean(admin), senhaHash },
  });
  return { ok: true, cpf: cpfLimpo };
}

// ── Editar usuário ─────────────────────────────────────────────────────────────
async function editarUsuario({ cpfAlvo, dados, quemEdita }) {
  const alvo = await prisma.usuario.findUnique({ where: { id: cpfAlvo } });
  if (!alvo) return { erro: 'Usuário não encontrado.' };

  const update = {};

  const ehGestor = quemEdita.gestor && !quemEdita.admin;

  if (quemEdita.admin) {
    if (dados.nomeCompleto !== undefined) {
      if (!dados.nomeCompleto.trim()) return { erro: 'Nome completo inválido.' };
      update.nomeCompleto = dados.nomeCompleto.trim();
    }
    if (dados.email !== undefined) {
      const emailLimpo = dados.email.trim().toLowerCase();
      if (!emailLimpo.includes('@')) return { erro: 'E-mail inválido.' };
      const dup = await prisma.usuario.findFirst({ where: { email: emailLimpo, id: { not: cpfAlvo } } });
      if (dup) return { erro: 'E-mail já cadastrado.' };
      update.email = emailLimpo;
    }
    if (dados.equipe !== undefined) {
      update.equipe = dados.equipe.trim().substring(0, 30);
    }
    if (dados.nomeExibicao !== undefined) {
      const nomeLimpo = dados.nomeExibicao.trim().substring(0, 40);
      if (nomeLimpo.length < 2) return { erro: 'Nome de exibição inválido.' };
      const dup = await prisma.usuario.findFirst({ where: { nomeExibicao: nomeLimpo, id: { not: cpfAlvo } } });
      if (dup) return { erro: 'Nome de exibição já em uso.' };
      update.nomeExibicao = nomeLimpo;
    }
    if (dados.admin !== undefined) {
      if (alvo.id === quemEdita.cpf && !dados.admin) return { erro: 'Não pode remover seu próprio acesso de admin.' };
      update.admin = Boolean(dados.admin);
    }
    if (dados.gestor !== undefined) {
      update.gestor = Boolean(dados.gestor);
    }
    if (dados.senha !== undefined && dados.senha !== '') {
      if (dados.senha.length < 6) return { erro: 'Senha deve ter pelo menos 6 caracteres.' };
      if (alvo.id === quemEdita.cpf) {
        if (!dados.senhaAtual) return { erro: 'Informe a senha atual.' };
        const ok = await bcrypt.compare(dados.senhaAtual, alvo.senhaHash);
        if (!ok) return { erro: 'Senha atual incorreta.' };
      }
      update.senhaHash = await bcrypt.hash(dados.senha, 10);
    }
  } else {
    if (alvo.id !== quemEdita.cpf) return { erro: 'Sem permissão.' };
    if (dados.senha !== undefined && dados.senha !== '') {
      if (!dados.senhaAtual) return { erro: 'Informe a senha atual.' };
      const ok = await bcrypt.compare(dados.senhaAtual, alvo.senhaHash);
      if (!ok) return { erro: 'Senha atual incorreta.' };
      if (dados.senha.length < 6) return { erro: 'Nova senha deve ter pelo menos 6 caracteres.' };
      update.senhaHash = await bcrypt.hash(dados.senha, 10);
    }
    if (dados.avatar !== undefined) update.avatar = dados.avatar || null;
  }

  if (Object.keys(update).length === 0) return { erro: 'Nenhum dado para atualizar.' };
  await prisma.usuario.update({ where: { id: alvo.id }, data: update });
  return { ok: true };
}

async function buscarPerfil(cpf) {
  return prisma.usuario.findUnique({
    where: { id: limparCPF(cpf) },
    select: { id: true, nomeCompleto: true, email: true, nomeExibicao: true, equipe: true, avatar: true, admin: true, gestor: true, criadoEm: true },
  });
}

async function listarUsuarios() {
  return prisma.usuario.findMany({
    select: { id: true, nomeCompleto: true, email: true, nomeExibicao: true, equipe: true, avatar: true, admin: true, gestor: true, criadoEm: true },
    orderBy: { criadoEm: 'asc' },
  });
}

async function removerUsuario(cpf) {
  const cpfLimpo = limparCPF(cpf);
  const u = await prisma.usuario.findUnique({ where: { id: cpfLimpo } });
  if (!u)      return { erro: 'Usuário não encontrado.' };
  if (u.admin) return { erro: 'Não é possível remover o administrador.' };
  await prisma.usuario.delete({ where: { id: cpfLimpo } });
  return { ok: true };
}

function verificarToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

module.exports = { login, criarUsuario, editarUsuario, buscarPerfil, listarUsuarios, removerUsuario, verificarToken, setPrisma, limparCPF };
