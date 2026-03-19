# 📘 Guia de Instalação Detalhado - AgendaBot

## ⚡ Instalação Super Rápida (One-Liner)

Se você quer apenas começar agora no seu Raspberry Pi, execute estes dois comandos:

### 1. Limpeza total (Wipe do Raspberry Pi):
```bash
# Rode isso direto no terminal do Raspberry para zerar TUDO
bash scripts/formatar.sh
```

### 2. Instalação Recomendada (Via Windows):
Se você está no Windows, o jeito **mais seguro e rápido** (evita erros de memória no Pi) é:
1. Abra o PowerShell na pasta do projeto.
2. Execute: `./install.ps1`

---

Este guia fornece o passo a passo completo para configurar o **AgendaBot** do zero, desde as credenciais do Google até a conexão final com o WhatsApp.

### Limpeza Profunda do Sistema (Wipe Total)
Se a sua Raspberry Pi já tem outros projetos e você quer "formatar" o ambiente Docker e limpar logs de sistema para começar o AgendaBot do zero absoluto:
```bash
# CUIDADO: Isso remove TODOS os containers e imagens Docker da máquina!
bash scripts/pi-clean.sh
```

---

## 🛑 Troubleshooting (Solução de Problemas)

---

## 🛠️ Passo 1: Configuração no Google Cloud Console

Para que o bot possa ler e escrever na sua agenda, precisamos de uma **Service Account**.

1.  Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2.  **Crie um novo projeto** (ou selecione um existente).
3.  No menu lateral, vá em **APIs e Serviços > Painel**.
4.  Clique em **+ ATIVAR APIS E SERVIÇOS**.
5.  Pesquise por **Google Calendar API** e clique em **Ativar**.
6.  Agora, vá em **IAM e Admin > Contas de Serviço**.
7.  Clique em **+ CRIAR CONTA DE SERVIÇO**.
    - Nomeie como `agendabot-service`.
    - Siga os passos (não precisa de permissões de papel específicas aqui).
8.  Na lista de contas, clique na conta criada e vá na aba **Chaves (Keys)**.
9.  Clique em **Adicionar Chave > Criar nova chave**.
10. Selecione o formato **JSON** e clique em **Criar**.
    - O download de um arquivo `.json` será feito. **Guarde este arquivo!**
11. **Copie o e-mail** da Service Account (ex: `agendabot-service@projeto-id.iam.gserviceaccount.com`). Você precisará dele no próximo passo.

---

## 🗓️ Passo 2: Configuração no Google Calendar (Agenda)

O bot não tem acesso às suas agendas pessoais por padrão. Você deve "convidá-lo".

1.  Abra o [Google Calendar](https://calendar.google.com/).
2.  Encontre a agenda que deseja monitorar na lateral esquerda.
3.  Passe o mouse sobre ela, clique nos três pontos e selecione **Configurações e Compartilhamento**.
4.  Na seção **Compartilhar com pessoas específicas**, clique em **+ Adicionar pessoas**.
5.  Cole o **e-mail da Service Account** que você copiou no Passo 1.
6.  Em "Permissões", selecione **Fazer alterações nos eventos**.
7.  Clique em **Enviar**.
8.  Role a página para baixo até **Integrar agenda** e copie o **ID da agenda** (geralmente é o seu e-mail ou algo como `xyz@group.calendar.google.com`).

---

## 🖥️ Passo 3: Preparação do Servidor (Linux / Raspberry Pi)

Certifique-se de que o Docker está instalado. Se não estiver, use:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Reinicie sua sessão após o comando acima
```

1.  **Clone o projeto:**
    ```bash
    git clone https://github.com/lyncolnsas/AgendaBot.git
    cd AgendaBot
    ```

2.  **Organize as credenciais:**
    - Crie a pasta `credentials` se não existir: `mkdir -p credentials`
    - Mova o arquivo `.json` baixado no Passo 1 para dentro desta pasta.

3.  **Configure IDs das Agendas:**
    - Abra o arquivo `calendar_id.txt`.
    - Cole o **ID da agenda** (passo 2.8) lá dentro. Se tiver mais de uma, coloque uma por linha.

4.  **Configure o Celular para Notificações:**
    - Abra o arquivo `notification.json`.
    - Ajuste o número que receberá alertas: `{"whatsappNumber": "5511999999999@s.whatsapp.net"}`

---

## 🚀 Passo 4: Executando o Sistema

Agora use o script automatizado para subir tudo:

```bash
bash scripts/install.sh
```

> [!IMPORTANT]
> **COMPILAÇÃO LOCAL:** Para evitar erros de "Out of Memory" no Raspberry Pi, a compilação do TypeScript agora é feita no seu computador local (Windows) através do script `install.ps1`. O Raspberry Pi apenas executa o resultado pronto.

---

## 📱 Passo 5: Conexão WhatsApp (O Momento do QR Code)

Após o script terminar, o bot estará rodando, mas esperando conexão.

1.  Veja os logs em tempo real:
    ```bash
    docker logs -f agendabot_pi
    ```
2.  Aguarde até que o terminal mostre um **QR Code ASCII**.
3.  No seu WhatsApp (celular), vá em: **Aparelhos Conectados > Conectar um aparelho**.
4.  Aponte para a tela e escaneie o código.
5.  Quando o terminal disser `WhatsApp conectado com sucesso!`, você pode sair dos logs apertando `CTRL+C`.

---

## 🛠️ Comandos de Manutenção

-   **Ver logs**: `docker logs -f agendabot-agendabot-1`
-   **Reiniciar**: `bash scripts/start.sh`
-   **Resetar (Clean Install)**: `bash scripts/clean.sh`
-   **Formatação Total (Wipe)**: `bash scripts/formatar.sh`
-   **Atualizar código**: `git pull` e em seguida `bash scripts/start.sh`

---

## 💡 Dicas e Cuidados

> [!TIP]
> **Fuso Horário**: O sistema está configurado por padrão para `America/Sao_Paulo`. Se você estiver em outro fuso, ajuste a variável `TZ` no `Dockerfile`.

> [!WARNING]
> **Segurança**: Nunca compartilhe seu arquivo JSON de credenciais ou a pasta `auth_info_baileys` publicamente. O `.gitignore` já está configurado para proteger esses arquivos no GitHub.
