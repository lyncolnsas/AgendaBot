# Guia de Instalação Completa - AgendaBot 🤖

Este guia fornece as instruções passo a passo para instalar e configurar o **AgendaBot** no seu servidor (Raspberry Pi ou similar) usando Docker.

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter instalado:

1.  **Docker & Docker Compose**: O sistema é totalmente baseado em containers.
2.  **Git**: Para clonar o repositório.
3.  **Conta Google Cloud**: Necessária para as credenciais do Google Calendar API.

---

## 🚀 Instalação Rápida (Recomendada)

O projeto inclui scripts automatizados para facilitar o processo:

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/lyncolnsas/AgendaBot.git
    cd AgendaBot
    ```

2.  **Execute o script de instalação:**
    ```bash
    bash scripts/install.sh
    ```

O script irá criar as pastas necessárias, gerar arquivos de configuração básicos e subir os containers.

---

## ⚙️ Configuração Manual (Obrigatória)

Para que o bot funcione corretamente, você **precisa** configurar os seguintes arquivos:

### 1. Credenciais do Google (`credentials/`)
- Coloque seu arquivo JSON de **Service Account** do Google Cloud dentro da pasta `credentials/`.
- Certifique-se de que o arquivo tenha a extensão `.json`.

### 2. IDs das Agendas (`calendar_id.txt`)
- Abra o arquivo `calendar_id.txt`.
- Adicione os e-mails das agendas que o bot deve monitorar (um por linha).
- **Importante**: Você deve compartilhar as agendas no Google Calendar com o e-mail da *Service Account* criada no passo anterior.

### 3. Notificações (`notification.json`)
- Edite o arquivo `notification.json` para definir o número do WhatsApp que receberá as notificações administrativas (lembretes, alertas de sistema).
- Exemplo: `{"whatsappNumber": "5511999999999@s.whatsapp.net"}`

---

## 📱 Conectando o WhatsApp

Após iniciar o sistema, você precisará ler o QR Code para vincular seu WhatsApp:

1.  Abra os logs do container:
    ```bash
    docker logs -f agendabot_pi
    ```
2.  Escaneie o QR Code que aparecerá no terminal com o seu celular (Menu > Aparelhos Conectados).

---

## 🧹 Manutenção e Limpeza

### Reiniciar o Sistema
Para reiniciar e aplicar atualizações de código:
```bash
bash scripts/start.sh
```

### Limpeza Completa (Instalação Limpa)
Se precisar remover tudo e começar do zero (incluindo imagens docker e caches):
```bash
bash scripts/clean.sh
```
*Este script perguntará se você deseja remover também a sessão do WhatsApp e as credenciais.*

---

## 🛑 Troubleshooting (Solução de Problemas)

-   **Memória no Raspberry Pi**: O build do TypeScript pode consumir muita RAM. O sistema está configurado para o limite de 512MB (`--max-old-space-size=512`). Se falhar, certifique-se de que o Pi não tem outros processos pesados rodando.
-   **Logs**: Sempre verifique os logs em tempo real para entender erros de conexão:
    `docker logs -f agendabot_pi`
-   **Sessão do WhatsApp**: Se o bot parar de responder, execute o `clean.sh` para remover a pasta `auth_info_baileys` e reconecte via QR Code.

---
*Dúvidas? Consulte o repositório original.*
