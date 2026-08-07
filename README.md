# Slither.io Clone - Render Ready

Este é um clone do jogo Slither.io adaptado para rodar em servidores web, especificamente configurado para o **Render**.

## 🚀 Como Rodar Localmente

1.  **Instale as dependências:**
    ```bash
    npm install
    ```

2.  **Inicie o servidor:**
    ```bash
    npm start
    ```

3.  **Acesse no navegador:**
    Abra `http://localhost:3000`

## 🌐 Deploy no Render

Este repositório já contém um arquivo `render.yaml` para facilitar o deploy.

1.  Crie uma conta no [Render](https://render.com/).
2.  Conecte seu GitHub.
3.  Crie um novo **Blueprint Instance** e selecione este repositório.
4.  O Render configurará automaticamente o servidor Node.js e o WebSocket.

## 🛠️ Tecnologias

-   **Node.js**
-   **Express** (Servidor Web)
-   **ws** (WebSockets para multiplayer em tempo real)
-   **HTML5 Canvas** (Renderização do jogo)

## 📝 Build e Run

-   **Build:** O projeto não requer um passo de build complexo, apenas a instalação das dependências via `npm install`.
-   **Run:** O comando principal é `node server.js`, que inicia tanto o servidor de arquivos estáticos quanto o servidor de WebSockets.
