# AgendaBot - WhatsApp Bridge (TS Version) 🚀

Sistema completo para integração de WhatsApp com Google Calendar, permitindo agendamentos automáticos, lembretes proativos e gestão via painel web.

## 📂 Estrutura do Projeto

- `src/`: Código fonte em TypeScript.
- `public/`: Dashboard Web (HTML/JS/CSS).
- `credentials/`: Contas de serviço do Google (.json).
- `auth_info_baileys/`: Sessão ativa do WhatsApp.
- `notification.json`: Configurações de destino de notificações.
- `calendar_id.txt`: IDs das agendas monitoradas.

## 🚀 Como Executar

1. Instale as dependências: `npm install`
2. Inicie em modo desenvolvimento: `npm run dev`
3. Acesse: `http://localhost:3001`

## 🐳 Docker

O projeto está pronto para Docker:

```bash
docker-compose up -d --build
```

## 📱 Comandos WhatsApp

- `#` - Menu de ajuda
- `#agenda` - Ver agenda dos próximos 30 dias
- `#hoje` - Ver agenda de hoje
- `#ip` - Ver IP do servidor e link do painel
- `#config` - Verificar status das conexões
- `agendar reunião amanhã às 14h` - Agendamento via linguagem natural

---
*Projeto totalmente auto-contido e portável.*
