# sully.loc · o nosso lugar

Sully: um site pensado para dois e primeiro para telemóvel. HTML, CSS e JavaScript, sem build nem dependências locais.

## Versão 0.3

- Aspeto pessoal no Perfil: Automático (claro das 6h às 18h), Claro ou Escuro e quatro cores de destaque. Preferência por conta neste navegador, sem alterar o parceiro.
- Faixa de sol e lua acompanhando a hora local, sem localização. Ciclo ilustrativo: sol das 6h às 18h, lua à noite.
- Check-in com moods e perguntas próprios de manhã, tarde e noite, frase opcional e atualização do mesmo período. Os registos antigos continuam legíveis e editáveis; rascunhos por período são mantidos em memória durante a sessão.
- Estados disponível, a trabalhar, a estudar, ocupado/a, em deslocação, a dormir e a descansar com duração. Dormir e descansar silenciam os avisos.
- Toques recebidos com o site aberto aparecem num cartão sem resposta direta, até fechar. A fila espera enquanto escreves ou usas outro diálogo; dormir e descansar silenciam os avisos. Não confirma leitura nem envia alertas antigos ao entrar.
- Mensagens rápidas editáveis, chat de texto, notas e desenhos com rato ou toque.
- Partilha pontual de localização mediante confirmação e permissão do navegador.
- Contador pessoal de água e lembretes enquanto o site está aberto.
- Histórico de check-ins e notas; exportação JSON.
- Nome do perfil editável e nome de carinho privado para o par, no Perfil. O nome de carinho fica apenas neste navegador, separado por conta e parceiro; não é enviado ao Firebase nem sincronizado entre dispositivos. Pode ser removido para voltar ao nome do perfil.
- Manifest e service worker para abrir a interface offline após a primeira visita.

**O site abre sem assumir a identidade de ninguém.** Inclui registo, login, recuperação de palavra-passe, perfil próprio, convite para ligar duas contas e escolhas individuais de partilha. O Firebase real está configurado em `config.js`, com Authentication por e-mail/palavra-passe e regras publicadas no Firestore.

O modo online está ativo (`enabled: true`). Cada pessoa cria a sua conta e liga-se ao par por convite. A demonstração local anterior fica separada dos dados online.

## Executar e testar

```sh
npm test
npm run dev
```

Abrir `http://localhost:3000`. Para publicar no GitHub Pages e ligar os dois, seguir [SETUP.md](./SETUP.md).

## Limites conhecidos

- Web Push usa o Worker Cloudflare e exige ativação individual em cada dispositivo. No iPhone, requer a instalação no ecrã principal. Lembretes de água e mood continuam a depender do site aberto. A entrega e a apresentação dependem do sistema operativo. O envio push é iniciado pelo remetente após confirmação do Firestore; fechar a página nesse intervalo pode impedir o aviso, sem perder a mensagem.
- Localização é uma posição guardada na conversa, nunca rastreio contínuo. Não existe sobreposição automática noutras aplicações.
- Os dados não têm encriptação ponta a ponta. Firebase usa autenticação e regras de acesso; o proprietário do projeto tem acesso administrativo.
- A conversa carrega as 40 mensagens mais recentes e permite carregar páginas anteriores de 40. Check-ins mantêm o limite de 90 por membro. Os documentos anteriores continuam no Firebase.
- Dados offline privados só são persistidos após a escolha de dispositivo de confiança. Sair limpa a cache Firestore; fechar outros separadores pode ser necessário.
- A integração online precisa de validação com contas de teste num projeto Firebase real antes de usar dados pessoais. O projeto Sully está no plano Spark, com Firestore Standard em africa-south1. As regras têm testes próprios num emulador local.

## Interface

Interface inicial reduzida a estado do par, estado pessoal, humor e mensagens rápidas. Três destinos na navegação: Hoje, Conversa e Perfil. Desenhos ficam na conversa e o histórico tem acesso no ecrã Hoje; água e lembretes ficam no Perfil.

Inclui ícones PNG 192/512 e apple-touch-icon 180, campos de texto com 16 px para evitar zoom automático no iPhone, margens seguras e altura da conversa adaptada à área visível.

Verificação em navegador Chromium com áreas de 390×844 e 360×800, sem transbordamento horizontal; navegação, chat e contador de água exercitados. Isto não constitui teste físico em iOS/Safari ou Android/Chrome. O serviço de contas e a base de dados estão ligados ao projeto Firebase real. Os novos fluxos de perfil e partilha também foram exercitados na demonstração local.

## Testes de acesso

`npm run test:rules` exercita no emulador Firestore: recusa sem login, perfis independentes, convite atómico, limite de duas contas, privacidade e revogação do humor, autorização de localização e bloqueio de remetentes forjados. As dependências são apenas de desenvolvimento; o site continua estático e sem build.

O esquema v0.3 usa `profiles/{uid}` e `pairs/{convite}/…`. As coleções da v0.1 não são migradas nem apagadas; ficam inacessíveis pelas novas regras. A configuração antiga com UIDs fixos deixa de se aplicar.

MANUEL SAMPAIO01


## Carregamento e rede (versão 0.3 mantida)

Nome apresentado corrigido para Sully. O carregamento inicial, o login, o registo, a gravação do perfil e a ligação por convite usam um indicador em forma de S. Envios pendentes e recuperação de rede usam o S pequeno no estado da ligação; sem rede, aparece tracejado, sem bloquear a demonstração. A animação respeita a preferência de movimento reduzido.

Uma operação demorada permite ocultar o indicador enquanto aguarda. Os ecrãs de conta continuam a informar quando o serviço real não está configurado; a demonstração não cria contas.


Validação da ativação: registo e login de duas contas temporárias, convite, mensagens nos dois sentidos e regras de partilha verificados contra o serviço real. As contas usadas no teste são eliminadas no fim; os documentos de teste não contêm dados pessoais.

## Quatro fluxos prioritários — 21/11/2026

Versão mantida em 0.3.0. Sem migração de fornecedor ou nova integração de analytics.

- Conversa: escrita fixa na área visível, altura adaptável, histórico com paginação, preservação da posição de leitura, rascunho por conta e espaço durante a sessão, estados de envio e nova tentativa com o mesmo identificador. “Enviada” significa confirmação do Firestore, não leitura pelo parceiro.
- Notificações: cliente ligado ao Worker/D1 existente, autorização explícita, texto genérico, silêncio por descanso, subscrição revogada ao sair e fila de tentativas sem conteúdo privado. Detalhes em [notifications/README.md](./notifications/README.md).
- Navegação: Hoje, Conversa e Perfil; anexos recolhidos no botão + da conversa; configurações técnicas ocultas do percurso normal.
- Contas e ligação: cada pessoa mantém a sua identidade; código ou link de convite, cancelamento do próprio convite pendente e substituição atómica ao aceitar outro. Códigos cancelados ficam revogados; ligações já aceites não são desfeitas por esse fluxo.

Validação desta alteração: 22 testes de lógica/cliente, 9 do serviço push e 15 de regras Firestore aprovados. Os testes de regras usam o emulador e as funções de transação usadas em produção. Regras publicadas no projeto Firebase. Interface exercitada em navegador com dados fictícios a 390 e 360 px e altura reduzida de 460 px, incluindo envio, rascunho, histórico e cancelamento. Isto não substitui teste físico do teclado Safari/iOS e Chrome/Android nem uma entrega push real entre os dois telemóveis.

Estrutura preservada por conta e por espaço, sem UIDs fixos. As regras limitam cada espaço a duas pessoas e isolam os pares. A paginação evita descarregar toda a conversa. Os planos gratuitos têm quotas: esta alteração não promete utilização ilimitada nem elimina a futura necessidade de rever custos e capacidade.

## Perfil organizado e avisos de atividades

O Perfil passa a apresentar seis categorias: Conta, O nosso espaço, Notificações, Privacidade, Aparência e Cuidados pessoais. Abre-se apenas uma categoria de cada vez; explicações e instalação ficam recolhidas em ajuda expansível. Os controlos anteriores e respetivos dados foram preservados.

Além das mensagens, notas, desenhos e toques, o emissor atualizado suporta check-ins novos ou atualizados, estados e localização pontual, sempre que o autor permite a respetiva partilha. O aviso identifica a categoria sem apresentar conteúdo privado. O mood só avisa quando a pessoa confirma em Partilhar. Não há avisos de rascunhos, histórico ou personalização local. A implementação mantém as limitações de entrega do sistema operativo e do envio iniciado pelo cliente descritas acima.

Validação desta alteração: 26 testes do cliente/lógica e 12 do emissor. Os testes adicionais verificam privacidade, referência ao documento original, revisão confirmada pelo servidor, atualização de mood, deduplicação e silêncio do destinatário. As regras Firestore não foram alargadas nem alteradas nesta revisão. O emissor Cloudflare precisa do bundle atualizado antes de suportar os novos tipos de aviso; `activities:true` na resposta de saúde confirma essa publicação.

### Lista local de cidades

`sx-cities.json` usa [Natural Earth 1:10m Populated Places Simple v5.1.2](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/), dados de domínio público. A lista é servida pelo próprio Sully e só é pedida quando alguém ativa a localização. A aproximação procura uma cidade da lista até 300 km. A cidade e o país podem ser corrigidos no Perfil.

O fundo de `sx-map-land.json` usa [Natural Earth 1:110m Land](https://www.naturalearthdata.com/downloads/110m-physical-vectors/). O mapa só pede esse ficheiro ao abrir. As posições são desenhadas no dispositivo, sem enviar as coordenadas para um serviço de mapas.
