# Colocar o sully.loc a funcionar

## 1. GitHub Pages

No repositório: **Settings → Pages → Build and deployment → Deploy from a branch → main → / (root) → Save**.

O endereço esperado após o primeiro deploy é `https://manuelsampaio.github.io/sully.loc/`. O domínio só funciona depois de o Pages ser ativado e o deploy terminar. O código usa caminhos relativos para este subdiretório.

## 2. Ligar os dois telemóveis

Apenas o site não consegue sincronizar os dados. Esta versão inclui um adaptador Firebase, desativado até concluir estes passos. Não colocar palavras-passe nem chaves de administração no GitHub.

1. Criar um projeto na [consola Firebase](https://console.firebase.google.com/). Não é necessário Analytics.
2. Registar uma aplicação Web e copiar o objeto público de configuração para `firebase` em `config.js`.
3. Ativar **Authentication → Email/Password**. Criar manualmente as duas contas na consola. Não existe registo público na interface.
4. Copiar os UIDs dessas duas contas para `members` em `config.js` e substituir `UID_MANUEL` e `UID_PAR` em `firestore.rules` pelos mesmos UIDs. Personalizar os nomes.
5. Criar uma base **Cloud Firestore**, em modo de produção. Publicar integralmente as regras de `firestore.rules` no separador Rules. Nunca ativar acesso público temporário.
6. Adicionar `manuelsampaio.github.io` aos domínios autorizados do Authentication se necessário.
7. Só depois definir `enabled: true` em `config.js` e guardar as alterações no GitHub.
8. Cada pessoa entra pela sua conta em Ajustes. A escolha de dispositivo de confiança recarrega o site antes do primeiro login para inicializar a cache; depois introduzir a palavra-passe novamente.

O objeto Firebase de configuração Web é público por natureza. As regras do Firestore, e não esconder esse objeto, controlam o acesso aos documentos.

## 3. Verificação antes de uso privado

- Usar duas sessões independentes com as duas contas autorizadas; confirmar ida e volta de texto, desenho, humor e estado.
- Criar uma terceira conta de teste e confirmar que a interface a rejeita e as regras recusam leitura e escrita. Confirmar também recusa sem login no simulador de regras.
- No simulador, tentar escrever `from` com UID do outro: deve falhar. Tentar alterar uma mensagem existente: deve falhar.
- Desligar a rede numa conta, enviar uma mensagem e confirmar «em espera». Voltar a ligar e verificar «sincronizada» nos dois lados. Não significa que foi lida.
- Em dispositivo de confiança, recarregar offline após uma sessão online; confirmar que a interface abre e a fila é retomada ao voltar a rede. O SDK Firebase também precisa de ter sido carregado previamente pelo navegador; o service worker só garante a interface local, não os módulos externos.
- Terminar sessão e confirmar que o histórico fica oculto e a cache é limpa. Se houver outros separadores abertos, fechá-los e repetir.
- Negar localização: deve mostrar mensagem e permitir continuar. Autorizar: deve enviar só uma posição. Confirmar que não há pedidos de localização ao abrir o site.

## 4. Instalação e avisos

Usar «Adicionar ao ecrã principal» no navegador. O manifest inclui um ícone SVG; alguns dispositivos podem usar um ícone genérico até serem adicionados ícones PNG dedicados.

Ativar avisos em Ajustes é opcional. Os lembretes de água são pessoais neste dispositivo. O outro pode enviar um carinho sobre água, mas não alterar o teu contador.

**Ainda não há Web Push em segundo plano.** Para receber mensagens com o site fechado será necessário configurar um emissor de push seguro e a subscrição de cada dispositivo. Não colocar credenciais de envio no JavaScript público. No iPhone, Web Push requer instalação no ecrã principal e suporte do sistema.

## Referências oficiais

- [Firebase Web via CDN](https://firebase.google.com/docs/web/alt-setup)
- [Persistência offline do Firestore](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Regras de segurança do Firestore](https://firebase.google.com/docs/firestore/security/get-started)
