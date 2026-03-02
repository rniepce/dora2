# Documentação Técnica - Dora 2

## 1. Visão Geral

O projeto **Dora 2** é uma aplicação web interativa que funciona como um assistente de IA. A principal funcionalidade do sistema é receber entradas de áudio do usuário, transcrevê-las para texto e, em seguida, usar um modelo de linguagem (LLM) para gerar respostas coesas e contextuais.

O propósito de negócio parece ser a criação de uma interface conversacional inteligente, que pode ser adaptada para diversas finalidades, como assistentes virtuais, ferramentas de suporte ao cliente, ou plataformas de transcrição e análise de áudio em tempo real. A aplicação permite exportar as conversas em formatos como `.txt`, `.pdf` e `.docx`.

## 2. Stack Tecnológica

A seleção de tecnologias indica uma abordagem moderna para o desenvolvimento web, com foco em performance, escalabilidade e integração com serviços de IA.

| Categoria | Tecnologia | Versão | Justificativa |
| :--- | :--- | :--- | :--- |
| **Linguagem Principal**| TypeScript | `~5` | Adiciona tipagem estática ao JavaScript, aumentando a robustez, a manutenibilidade e a clareza do código. |
| **Framework Web** | Next.js | `16.1.6` | Framework React para produção, oferecendo renderização no lado do servidor (SSR), geração de sites estáticos (SSG) e otimizações de performance. |
| **Biblioteca UI** | React | `19.2.3` | Biblioteca declarativa para construir interfaces de usuário interativas e componentizadas. |
| **Estilização** | Tailwind CSS | `^4` | Framework CSS "utility-first" que permite estilizar componentes diretamente no HTML, agilizando o desenvolvimento da UI. |
| **Componentes UI** | Shadcn UI | `^3.8.5` | Coleção de componentes de UI reutilizáveis, construídos sobre Radix UI e Tailwind CSS, para criar interfaces consistentes. |
| **Backend & DB** | Supabase | `^2.97.0` | Plataforma "Backend-as-a-Service" (BaaS) que oferece banco de dados, autenticação e APIs. O uso do `@supabase/ssr` indica integração com renderização no servidor. |
| **IA (LLM)** | Azure AI SDK | `^3.0.34`| Kit de desenvolvimento para integrar a aplicação com os serviços de IA da Microsoft Azure, provavelmente para acessar modelos de linguagem. |
| **IA (Transcrição)** | Deepgram SDK | `^4.11.3` | SDK para integração com a API de transcrição de áudio da Deepgram, convertendo a fala do usuário em texto. |
| **Manipulação de Áudio** | FFmpeg | `^0.12.15` | Utilizado para processar e manipular arquivos de áudio/vídeo, provavelmente para converter o áudio gravado em um formato compatível com a API de transcrição. |

## 3. Arquitetura

A arquitetura do sistema é baseada em uma **aplicação web monolítica com renderização no lado do servidor (SSR)**, construída com o framework Next.js. A estrutura segue o padrão de organização do Next.js, separando o código de front-end, back-end (API routes) e configurações.

- **Frontend:** Construído com componentes React, estilizados com Tailwind CSS e Shadcn UI. A interface é reativa e interage com o backend através de chamadas de API.
- **Backend:** As rotas de API do Next.js (localizadas em `src/app/api`) atuam como um "Backend-for-Frontend" (BFF), orquestrando as chamadas para os serviços externos de IA (Azure e Deepgram) e interagindo com o Supabase.
- **Serviços Externos:**
  - **Supabase:** Funciona como a camada de persistência (banco de dados) e possivelmente autenticação.
  - **Deepgram:** Serviço especializado para a transcrição de áudio.
  - **Azure AI:** Serviço que fornece o modelo de linguagem para gerar as respostas.

Este modelo arquitetural simplifica o deploy e o desenvolvimento, ao mesmo tempo que aproveita a escalabilidade dos serviços de nuvem para as tarefas mais pesadas (IA e banco de dados).

## 4. Fluxo de Dados Principal

O fluxo crítico da aplicação é o processo de conversação por áudio:

1.  **Captura de Áudio:** O usuário clica no botão de gravação na interface. O navegador utiliza a `MediaRecorder API` para capturar o áudio do microfone.
2.  **Processamento do Áudio:** Ao finalizar a gravação, o áudio (provavelmente em formato `webm` ou `ogg`) é enviado para uma API route no backend da aplicação Next.js.
3.  **Transcrição:** A API route encaminha o áudio para a API da **Deepgram**. A Deepgram processa o áudio e retorna a transcrição em formato de texto.
4.  **Geração de Resposta:** O texto transcrito é então enviado para o serviço da **Azure AI** (via outra API route ou na mesma). O modelo de linguagem da Azure gera uma resposta com base no texto recebido.
5.  **Exibição na UI:** A resposta gerada pelo modelo de IA é retornada ao frontend e exibida na interface de chat para o usuário.
6.  **Persistência (Opcional):** A conversa (transcrição e resposta) pode ser salva no banco de dados **Supabase** para histórico.

## 5. Guia de Setup

Para executar o projeto localmente, siga os passos abaixo.

### Pré-requisitos

- Node.js (versão 20 ou superior)
- npm ou um gerenciador de pacotes compatível
- Contas e chaves de API para:
  - Supabase
  - Deepgram
  - Azure AI

### Passos

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/rniepce/dora2.git
    cd dora2
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configure as variáveis de ambiente:**
    Crie um arquivo chamado `.env.local` na raiz do projeto e adicione as seguintes variáveis com suas respectivas chaves de API:
    ```env
    # Supabase
    NEXT_PUBLIC_SUPABASE_URL=SUA_URL_DO_SUPABASE
    NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_DO_SUPABASE

    # Deepgram
    DEEPGRAM_API_KEY=SUA_CHAVE_DE_API_DO_DEEPGRAM

    # Azure AI
    AZURE_API_KEY=SUA_CHAVE_DE_API_DA_AZURE
    AZURE_ENDPOINT=SEU_ENDPOINT_DA_AZURE
    AZURE_DEPLOYMENT_NAME=NOME_DO_SEU_DEPLOYMENT_NA_AZURE
    ```

4.  **Execute o servidor de desenvolvimento:**
    ```bash
    npm run dev
    ```

5.  **Acesse a aplicação:**
    Abra seu navegador e acesse [http://localhost:3000](http://localhost:3000).

## 6. Principais Módulos e Responsabilidades

A estrutura de pastas segue as convenções do Next.js App Router.

| Pasta/Arquivo | Responsabilidade |
| :--- | :--- |
| `src/app/` | Contém a estrutura de rotas principal da aplicação. A lógica de UI para a página inicial está em `src/app/page.tsx`. |
| `src/app/api/` | **(CRÍTICO)** Diretório onde residem as API routes do Next.js. Contém a lógica de backend para se comunicar com Deepgram e Azure. |
| `src/components/` | Contém os componentes React reutilizáveis da aplicação (botões, cards, etc.), seguindo a filosofia do Shadcn UI. |
| `src/lib/` | Módulos de utilidades e configurações. `src/lib/utils.ts` provavelmente contém funções auxiliares, e `src/lib/ai.ts` deve conter a configuração e a lógica para interagir com o Azure AI SDK. |
| `src/hooks/` | **(CRÍTICO)** Contém os hooks React customizados, como `useRecorder`, que encapsula a complexidade da gravação, processamento e envio de áudio. |
| `public/` | Armazena arquivos estáticos, como imagens e ícones, que são servidos diretamente pelo servidor. |
| `supabase/` | Contém migrações e configurações do banco de dados Supabase, permitindo o versionamento do schema do banco. |
| `package.json` | Arquivo de manifesto do projeto Node.js, que define os scripts e as dependências. |
| `next.config.ts` | Arquivo de configuração do Next.js. |

## 7. Pontos de Atenção e Recomendações

- **Gerenciamento de Chaves:** As chaves de API estão sendo gerenciadas por variáveis de ambiente, o que é uma boa prática. É crucial garantir que o arquivo `.env.local` nunca seja enviado para o repositório Git.
- **Tratamento de Erros:** É importante revisar o código das API routes e do frontend para garantir que há um tratamento robusto de erros (ex: falhas na API da Deepgram ou Azure, problemas de rede).
- **Débito Técnico:** A versão do Next.js (`16.1.6`) parece ser uma versão futura ou alfa. Pode ser uma customização ou um erro de digitação no `package.json`. Se for uma versão instável, pode haver bugs ou mudanças significativas. Recomenda-se usar a versão estável mais recente (`14.x` na data desta análise).
- **Otimização de Custos:** Chamadas para serviços de IA podem ser caras. Recomenda-se implementar um sistema de caching para respostas comuns e monitorar o uso das APIs para evitar custos inesperados.
