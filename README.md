# ISP Chat — v2.1 (PostgreSQL + Chat Privado)

## O que há de novo
- Mensagens diretas (DM) entre usuários
- Badge de não lidas na sidebar
- Proteção contra nome duplicado no login
- Histórico de DMs persistido no banco

## Como rodar (primeira vez)

### Windows (PowerShell)
```powershell
# 1. Instalar dependências
npm install

# 2. Criar o .env  (NÃO use cp no PowerShell)
Copy-Item .env.example .env
# Depois edite o .env com seu editor e preencha DATABASE_URL

# 3. Criar as tabelas
npm run db:migrate

# 4. Popular canais
npm run db:seed

# 5. Iniciar
npm run dev
```

### Linux / Mac
```bash
npm install
cp .env.example .env   # edite o arquivo com seus dados
npm run db:migrate
npm run db:seed
npm run dev
```

## Se já tinha a versão anterior rodando
As tabelas de canais e mensagens já existem. Rode apenas:
```bash
npm run db:migrate   # vai criar só as tabelas novas (conversas_privadas, mensagens_privadas)
npm install          # para pegar o @prisma/client atualizado
```

## Configurar o .env
```
DATABASE_URL="postgresql://postgres:SUASENHA@localhost:5432/chat_isp"
PORT=3000
```

## Docker (alternativa rápida para o Postgres)
```bash
docker run --name chat-pg -e POSTGRES_PASSWORD=123456 -p 5432:5432 -d postgres
# Então no .env: postgresql://postgres:123456@localhost:5432/chat_isp
```

## Comandos disponíveis
| Comando | O que faz |
|---|---|
| `npm run dev` | Inicia com hot-reload |
| `npm run db:migrate` | Aplica migrations ao banco |
| `npm run db:seed` | Cria/atualiza canais iniciais |
| `npm run db:studio` | Interface visual do banco |

## Modelo de dados
```
Canal → Mensagem          (canais públicos)
ConversaPrivada → MensagemPrivada  (DMs entre dois usuários)
```

## Próxima etapa
Etapa 3 — Autenticação com senha (bcrypt + JWT)
