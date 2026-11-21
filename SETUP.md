# Ativar contas e ligar os dois telemóveis

## 1. GitHub Pages

No repositório: **Settings → Pages → Deploy from a branch → main → / (root) → Save**.

Endereço: `https://manuelsampaio.github.io/sully.loc/`.

## 2. Configurar o Firebase uma vez

1. Criar um projeto na [consola Firebase](https://console.firebase.google.com/). Não é necessário Analytics.
2. Registar uma aplicação Web. Copiar o objeto público de configuração para `firebase` em `config.js`.
3. Ativar **Authentication → Email/Password**. As pessoas vão criar as suas próprias contas no site; já não é preciso criar contas manualmente nem colocar UIDs no código.
4. Criar a base **Cloud Firestore**, em modo de produção. Publicar as regras atuais de `firestore.rules` no separador Rules, antes de ativar o modo online.
5. Adicionar `manuelsampaio.github.io` aos domínios autorizados de Authentication, se necessário.
6. Definir `enabled: true` em `config.js` e guardar as alterações no GitHub.

O objeto de configuração Web é público por natureza. Não colocar palavras-passe, service accounts ou credenciais administrativas no repositório. As regras do Firestore controlam o acesso.

A opção de dispositivo de confiança guarda a sessão. A cache persistente de dados passa a ser inicializada na próxima abertura do site; na primeira entrada os dados ficam em memória. A palavra-passe não é guardada pelo código do site.

## 3. Criar os dois perfis

1. Cada pessoa abre o site no seu telemóvel e escolhe **Criar a minha conta**.
2. Introduz o seu próprio nome, e-mail e palavra-passe. A palavra-passe é tratada pelo Firebase Authentication, não guardada em documentos Firestore.
3. Uma das pessoas vai a **Perfil → O nosso espaço → Criar convite**.
4. Envia o código de 32 caracteres ou o link copiado ao seu par por um canal privado.
5. O outro cola-o em **Recebeste um convite? → Aceitar convite**.
6. Cada pessoa vai a **O que quero partilhar** e ativa apenas as opções que pretende.

Se ambos criaram convites, é possível tocar em **Cancelar o meu convite** ou colar o convite recebido e usar **Cancelar o meu convite e aceitar este**. A substituição é atómica: se o código recebido for inválido, o convite anterior é conservado. Um código cancelado deixa de poder ser aceite. Uma ligação já aceite não pode ser desfeita por estes botões.

Cada espaço admite duas contas. Um código aceite deixa de admitir outra pessoa. Não há pesquisa/listagem pública de perfis ou convites. Uma conta não recebe dados de outra só por se registar.

## 4. Partilha e privacidade

Humor, estado e localização começam com a partilha desligada. Mensagens e notas enviadas na conversa são partilhadas com o par depois da ligação.

- O autor pode registar o seu humor sem o tornar visível ao par.
- O par só pode ler humores/estados se o autor autorizar nas suas preferências.
- Localização: é preciso ativar a opção e tocar em **Partilhar onde estou**. A posição atual substitui a anterior; não há rastreio nem histórico de movimentos.
- Ao desligar localização, a última posição deixa de ser lida pelo par e desaparece da interface. Informação anteriormente vista, fotografada ou exportada não pode ser retirada do dispositivo do outro.
- Os dados não têm encriptação ponta a ponta; o proprietário do projeto Firebase tem acesso administrativo.
- Nesta versão, não existe interface para desfazer uma ligação de casal ou eliminar uma conta. Para reorganizar uma ligação, é necessária intervenção do proprietário na consola; revogar partilha de humor, estado e localização continua disponível no site.
- A conversa carrega 40 mensagens de cada vez e permite carregar as anteriores. Os check-ins mostram os 90 mais recentes de cada pessoa. Exportar inclui os dados atualmente carregados e autorizados.

## 5. Teste antes de dados pessoais

Executar `npm test` e `npm run test:rules`. O segundo inicia um emulador local com projeto `demo-sully-loc`, sem ligar ao projeto real. Requer Java 21 e as dependências de desenvolvimento (`npm install`).

Depois testar num projeto real, com contas de teste:

1. Criar duas contas em sessões independentes; confirmar que antes do convite não há acesso ao perfil ou dados da outra.
2. Aceitar um convite; tentar reutilizá-lo numa terceira conta e confirmar recusa.
3. Confirmar mensagens, desenhos, humores e estados de ida e volta.
4. Desligar a partilha de humor, estado e localização em cada lado; confirmar que os dados deixam de aparecer no outro. Não confundir dados guardados no próprio aparelho com nova leitura autorizada do servidor.
5. Negar a permissão de localização do navegador e continuar a conversar.
6. Desligar a rede, enviar texto e voltar a ligar. «Sincronizada» confirma gravação, não leitura pelo par.
7. Terminar sessão e confirmar que o site volta ao ecrã de entrada. Se a limpeza da cache pedir, fechar os outros separadores e repetir.

## 6. iPhone e Android

- iPhone: Safari → Partilhar → Adicionar ao ecrã principal.
- Android: Chrome → menu ⋮ → Instalar ou Adicionar ao ecrã principal.

Verificar escrita, teclado, botão Enviar e desenho nos dois aparelhos. Há ícones PNG de 192/512 px e apple-touch-icon de 180 px.

**Web Push está ligado ao Worker Cloudflare/D1.** Depois de ligarem as contas, cada um abre **Perfil → Notificações → Ativar neste dispositivo** e autoriza o pedido do sistema. No iPhone, requer iOS 16.4+ e abertura pelo ícone instalado no ecrã principal. O texto das mensagens fica oculto nos avisos. Os lembretes periódicos de água e mood continuam a funcionar apenas com o site aberto. Consultar [notifications/README.md](./notifications/README.md) para limites e teste físico.

A interface local pode abrir offline depois de uma primeira visita. O modo de conta depende também de o SDK Firebase externo ter sido carregado e da escolha de persistência feita no login.

## Referências oficiais

- [Contas por e-mail e palavra-passe](https://firebase.google.com/docs/auth/web/password-auth)
- [Regras com getAfter e operações atómicas](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Persistência offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline)

O Perfil organiza os controlos por categoria. A criação/aceitação de convites fica em **O nosso espaço** e as permissões em **Privacidade**. Avisos de check-in, estado e localização usam a versão do Worker que devolve `activities:true`; ver os passos de publicação em `notifications/README.md`.
