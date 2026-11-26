# Sully · passagem de projeto para o Claude

Atualizado em 26 de novembro de 2026. Este ficheiro reúne o ponto de partida, as decisões de produto, a arquitetura e o trabalho pendente. Podes retomar a Sully a partir daqui e do GitHub.

## Começa aqui

- **Projeto** — Sully, «o nosso lugar», uma aplicação web privada para duas pessoas, pensada primeiro para telemóvel. O dono do projeto é Manuel Sampaio. Escreve a interface em português, com frases curtas como «Quero falar», «O meu check-in» e «Próximo encontro».
- **Repositório** — [ManuelSampaio/sully.loc](https://github.com/ManuelSampaio/sully.loc).
- **Produção** — [Sully no GitHub Pages](https://manuelsampaio.github.io/sully.loc/). Tem de funcionar no subcaminho `/sully.loc/`.
- **Base verificada no GitHub** — `main` apontava para [7e8d994](https://github.com/ManuelSampaio/sully.loc/commit/7e8d9945b347c31cd4323ac46b0d6de0f77462f1), «Unifica a distância do percurso no Hoje e no globo». Versão do produto 0.3.0. A produção servia a cache `sully-shell-v25-distancia-unica`. Confirma o `origin/main` ao retomar, pois pode ter avançado.
- **Primeira tarefa quando o Manuel pedir para avançar** — implementar os toques diretos com o texto do botão na notificação. Depois, simplificar o check-in. O postal vem a seguir. O alinhamento destas tarefas foi feito na conversa, sem publicação de código para elas.
- **Princípios** — manter o Hoje pequeno e útil, preservar o modelo de consentimento entre dois utilizadores, respeitar movimento reduzido, testar com dados sintéticos e manter os planos gratuitos enquanto der. Qualquer novo custo, serviço ou mudança de permissões precisa de ser explicado antes de avançar.

## O que está feito

| Área | Estado atual |
| --- | --- |
| Contas e ligação | Firebase Authentication com e-mail e palavra-passe, recuperação de acesso, perfis independentes e convites por código ou link. Um espaço agrega duas contas. O convite pendente pode ser cancelado e substituído. O modo local é separado. |
| Hoje | Estado do par, resumo da distância, Próximo encontro e dois botões rápidos, «Tenho saudades» e «Quero falar». «Mais toques» abre uma folha com os restantes. Os botões atuais ainda abrem o compositor de mensagens rápidas. |
| Conversa | Texto, notas, desenhos e interface de anexos recolhida no botão «+». Paginação de 40 mensagens, rascunhos separados por conta e espaço, estados de envio e nova tentativa com o mesmo ID. O aviso de envio confirmado refere-se ao Firestore. O produto não oferece confirmações de leitura. |
| Check-in | Pergunta e opções por período, Manhã, Tarde e Noite, com frase opcional e histórico. O mesmo dia e período podem ser atualizados. O envio fica pendente enquanto sincroniza; uma falha preserva a escolha e a nota no ecrã para nova tentativa. O Manuel ainda não está convencido pelo fluxo atual. |
| Estados e lembretes | Estados com duração e expiração. A dormir e A descansar silenciam os avisos. Contador de água pessoal. Lembretes dependem da página aberta. Ao desligar o lembrete de água ou de check-in, há 9 segundos para desfazer. |
| Perfil | Conta, O nosso espaço, Notificações, Privacidade, Aparência e Cuidados pessoais. Tema claro, escuro ou automático, cor de destaque e nome de carinho privado, guardado por conta e parceiro neste navegador. |
| Datas | Datas importantes são partilhadas, incluindo reencontros, aniversários e repetição anual. O cartão Próximo encontro abre o planeamento. A futura melhoria é dar mais destaque à data, à contagem e a uma pequena nota sobre o plano. |
| Localização e mapa | Partilha opcional de posições aproximadas e hora local. O Hoje mostra o mapa costeiro e permite abrir um globo com rotação, zoom, gestos e recentragem. Há skeleton enquanto o globo carrega. A cartografia é servida pela própria Sully. Os pontos do par são desenhados no dispositivo. |
| Web Push | O cliente e o Worker já suportam mensagens, notas, desenhos, toques e atividades partilhadas, incluindo check-in, estado e localização pontual. A ativação é individual por dispositivo. O texto atual é genérico por categoria, inclusive para toques. Cada utilizador pode retirar o consentimento e a subscrição é revogada ao sair. |
| Administração | Existe um painel privado opcional em `admin/` com Google Apps Script. O repositório contém instruções de instalação. A implantação do painel não foi verificada nesta passagem. |

### Distância e rota · decisões que convém preservar

- A rota disponível é **Luanda ↔ Benguela pela EN100**, com cerca de **540 km por estrada**. O tempo de **8 h 12 min** exibido no globo é uma estimativa fornecida pelo Manuel. É uma referência entre centros de cidades, sem trânsito em tempo real nem navegação passo a passo.
- O cartão Hoje e o globo mostram o mesmo valor quando a EN100 se aplica. As duas referências em linha reta, cerca de **390 km** entre posições aproximadas em alguns casos e **419 km** entre as cidades, foram retiradas dessa vista para evitar confusão.
- Quando falta uma rota adequada, mostra-se a distância em linha reta identificada como tal, junto aos dois pontos. Foi eliminada a curva tracejada que parecia sugerir um percurso pelo mar.
- O reconhecimento da EN100 abrange posições aproximadas nas imediações de ambas as cidades. A última regressão foi testada com uma posição sintética a cerca de 30 km de Benguela. Deve continuar a cair para a distância em linha reta se uma das posições deixar de corresponder ao corredor.
- A base usa Natural Earth para terra, fronteiras, estradas de referência e cidades, com costa angolana refinada. O traçado da EN100 foi calculado a partir de dados OpenStreetMap da Geofabrik, é servido localmente e tem atribuição. Consultar o `README.md` antes de substituir os dados.
- Foram discutidos mapas externos como possibilidade, mas a implementação atual usa o próprio site. Não enviar coordenadas privadas a serviços externos de mapas ou rotas por conveniência. A localização depende da autorização de cada pessoa e pode ser revogada.

## Próximas tarefas, por ordem

### 1. Toques diretos e notificações com o nome do botão

**Pedido do Manuel.** Ao carregar em **Tenho saudades** ou **Quero falar**, o gesto envia o toque imediatamente, sem abrir uma caixa para escrever. A notificação do par mostra exatamente **«Tenho saudades»** ou **«Quero falar»**, consoante o botão. O remetente vê **«Toque enviado»** após a confirmação do envio; em espera, usar uma indicação de estado pendente.

**Onde começar.** Em `app.js`, os atalhos são criados a partir de `QUICK` e chamam `compose('quick', …)`. `sx-today.js` organiza o Hoje e os restantes toques. `alerts.js` trata os avisos dentro da Sully. `push.js`, `sw.js` e `notifications/worker-source.js` controlam a notificação do sistema. Rever o formato atual antes de decidir se basta especializar o tipo `quick` ou se é necessário um novo tipo de evento.

**Critérios.**
- Usar um identificador estável por envio e nomes aprovados numa lista fixa. A notificação deve ser derivada de um tipo validado e de um evento verificado, preservando a deduplicação e a privacidade do ecrã bloqueado.
- Manter o compositor nos outros toques que precisem de texto editável até haver uma decisão sobre eles. Ver com o Manuel se os novos toques diretos também merecem um registo próprio na Conversa; a ação principal deve funcionar como aviso imediato.
- Preservar o silêncio em descanso, a validação de remetente e par e o comportamento sem notificações autorizadas. Distinguir «a enviar» e «enviado» de entrega efetiva ao telemóvel do destinatário.
- Testar com a aplicação aberta e instalada/fechada, sem rede e após a reconexão. Preparar o deploy do Worker em coordenação com o site se o contrato mudar.

### 2. Check-in mais simples e avisos com intenção

- Proposta alinhada para o Hoje: **«Como estás agora?»**, poucas opções, uma frase opcional e um passo explícito para partilhar. Manhã, Tarde e Noite passam a ter maior peso na organização do histórico. Preservar os registos existentes e confirmar como editar uma entrada anterior antes de mudar o esquema.
- Se o utilizador partilhar, o par pode receber uma notificação como **«Manuel partilhou como se sente»**. O humor e a frase ficam para leitura dentro da Sully. Guardar uma escolha ou rascunho não deve gerar aviso.
- **Estados.** Proposta de oferecer **«Avisar o meu par»** para quem quiser notificar ao mudar de estado. Hoje o serviço já pode emitir avisos quando o autor permite a partilha. Para tornar o aviso explícito por alteração, rever os dois caminhos, o aviso dentro da aplicação e a chamada Web Push, preservando a atual apresentação do estado no cartão.
- Testar a intenção de partilha, estados privados, toque repetido e check-ins antigos. Apresentar uma versão simples ao Manuel antes de expandir as opções.

### 3. Postal privado com foto e legenda

- Na **Conversa**, no menu de anexos, escolher foto, adicionar uma frase opcional, pré-visualizar e enviar. O **Hoje** mostra uma prévia pequena do postal mais recente. Tocar abre a Conversa, onde ficam os anteriores.
- O postal pertence ao espaço de duas contas. Verificar autorização real do ficheiro e dos metadados, evitando URLs públicas permanentes. Confirmar quotas e opções sem custo antes de escolher o armazenamento. Prever limite de tamanho, falha recuperável e reenvio com o mesmo ID.
- Testes de aceitação com duas contas e uma conta externa: só o par abre a imagem, a prévia aparece no Hoje e uma nova tentativa não duplica o evento.
- **Depois do postal:** mensagens de voz com pré-escuta e estado de envio. Depois, melhorar o cartão **Próximo encontro** com data, contagem e uma nota curta sobre o plano.

### Melhorias de experiência que ficaram para depois

- Prioridade prática: ampliar áreas de toque onde faça falta, rever margens seguras, permitir gesto para fechar folhas simples como Mais toques, e testar Voltar do navegador. Preservar o suporte a movimento reduzido em transições.
- Já existe: skeleton do mapa, números tabulares nas distâncias, confirmação otimista de check-in com sincronização e desfazer de lembretes. Saltar reimplementações destes comportamentos.
- Avaliar conforme o uso: cache stale-while-revalidate para recursos públicos, pré-renderização da entrada, títulos equilibrados, cantos, menu de comandos e atalhos para desktop. BlurHash pode fazer sentido com postais. Preenchimento automático de códigos fica para uma eventual autenticação por código. O triângulo de menus do rato só faz sentido se surgirem submenus densos no desktop.

## Arquitetura e pontos de entrada

| Ficheiros | Responsabilidade |
| --- | --- |
| `index.html`, `style.css`, `app.js` | Interface base, navegação, estados, funções de envio e rascunhos. Site estático sem build de frontend. |
| `sx-ui.js`, `sx-today.js`, `sx-today.css` | Composição e estilos do Hoje, check-in, folhas, cartões e controlos. |
| `core.js`, `messages.js`, `pairing.js`, `alerts.js`, `activity.js` | Validações, regras de comportamento, mensagens, convites e avisos. |
| `config.js`, `cloud.js`, `firestore.rules` | Firebase Auth e Firestore, subscrições e escritas, permissões. O esquema atual usa perfis e dados separados por par. Alguns caminhos de localização, relógios e datas têm módulos próprios. |
| `sx-location.js`, `sx-location-store.js`, `sx-map.js`, `sx-globe.js` | Consentimento, sincronização da localização, distância, dados do mapa, seleção da rota e renderização. |
| `sx-dates.js`, `sx-date-store.js` | Datas partilhadas, recorrência e próximo encontro. |
| `push.js`, `sw.js`, `notifications/` | Ativação e fila de push, service worker, código-fonte e bundle do Worker Cloudflare. |
| `README.md`, `SETUP.md`, `notifications/README.md`, `admin/README.md` | Instruções do projeto, ambiente, testes e publicação de cada componente. |

**Infraestrutura.** GitHub Pages serve o frontend. Firebase `sully-97787` fornece Auth e Firestore. O Worker Cloudflare `sully-notifications` usa D1 `sully-push` pelo binding `DB`. Web Push depende da ativação em cada dispositivo; no iPhone, seguir o fluxo de instalação no ecrã principal documentado no repositório. Não confundir uma escrita confirmada no Firestore com entrega da notificação. Os dados têm regras de acesso, sem encriptação ponta a ponta. Não incluir tokens, chaves privadas ou dados pessoais em commits, testes ou logs.

## Como retomar e validar

```sh
git clone https://github.com/ManuelSampaio/sully.loc.git
cd sully.loc
git status --short --branch
git log -5 --oneline
npm ci
npm test
npm run dev
```

- O servidor local abre em `http://localhost:3000`. A configuração no repositório aponta para Firebase real. Para testes que escrevam dados, usar o emulador ou um projeto de teste separado.
- Regras Firestore: `npm run test:rules` com Java 21 e o projeto de emulação `demo-sully-loc`.
- Worker: dentro de `notifications/`, executar `npm ci`, `npm test` e `npm run build` quando o código-fonte mudar. Publicar o bundle `notifications/worker.js` na Cloudflare em coordenação com o site. O GitHub Pages não publica o Worker ou as regras Firebase.
- Frontend: ao mudar recursos da PWA, atualizar a versão da cache e os parâmetros de versão nos imports e na lista do `sw.js`, mantendo o escopo `/sully.loc/`. Após o deploy, conferir que o Pages serve a versão nova.
- A última sessão de desenvolvimento validou o fluxo de distância com duas contas no emulador, incluindo a EN100 e o caso sem rota. Os 29 testes do frontend foram executados novamente nesta passagem e passaram. O teste físico do mapa em iPhone e a entrega real das futuras notificações com o nome do toque ainda ficam por validar. Os scripts temporários de integração usados nas sessões anteriores estavam fora do Git; os testes que se encontram na pasta `tests/` e em `notifications/test/` são os disponíveis num clone normal.

**Frase para abrir a próxima conversa.** «Lê este ficheiro, confirma o estado do repositório e começa pela fase 1. Quero que Tenho saudades e Quero falar enviem um toque direto e que a notificação do meu par mostre exatamente o nome do botão.»
