const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const canais = [
    { slug: 'geral',          nome: 'geral',          titulo: 'Geral',          descricao: 'Canal geral da equipe',          aberto: true },
    { slug: 'infraestrutura', nome: 'infraestrutura', titulo: 'Infraestrutura', descricao: 'Rede, servidores e equipamentos', aberto: true },
    { slug: 'alertas',        nome: 'alertas',        titulo: 'Alertas',        descricao: 'Notificações e incidentes',       aberto: true },
    { slug: 'suporte',        nome: 'suporte',        titulo: 'Suporte',        descricao: 'Atendimento a clientes',          aberto: true },
  ];
  for (const c of canais) {
    await prisma.canal.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }

  const cpfAdmin = '05879077381';
  const existe = await prisma.usuario.findUnique({ where: { id: cpfAdmin } });
  if (!existe) {
    const senhaHash = await bcrypt.hash('admin123', 10);
    await prisma.usuario.create({
      data: { id: cpfAdmin, nomeCompleto: 'Administrador', email: 'admin@isp.local', nomeExibicao: 'admin', senhaHash, admin: true },
    });
    console.log('Admin criado — CPF:', cpfAdmin, '| Senha: admin123');
  } else {
    console.log('Admin já existe.');
  }
  console.log('Seed concluído.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
