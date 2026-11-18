# sully.loc · o nosso lugar

Sully: um site pensado para dois e primeiro para telemóvel. HTML, CSS e JavaScript, sem build nem dependências locais.

## Versão 0.3

- Faixa de sol e lua acompanhando a hora local, sem localização. Ciclo ilustrativo: sol das 6h às 18h, lua à noite.
- Check-in com moods e perguntas próprios de manhã, tarde e noite, frase opcional e atualização do mesmo período. Os registos antigos continuam legíveis e editáveis; rascunhos por período são mantidos em memória durante a sessão.
- Estados disponível, a trabalhar, a estudar, ocupado/a, em deslocação, a dormir e a descansar com duração. Dormir e descansar silenciam os avisos.
- Mensagens rápidas editáveis, chat de texto, notas e desenhos com rato ou toque.
- Partilha pontual de localização mediante confirmação e permissão do navegador.
- Contador pessoal de água e lembretes enquanto o site está aberto.
- Histórico de check-ins e notas; exportação JSON.
- Nome do perfil editável e nome de carinho privado para o par, em Ajustes. O nome de carinho fica apenas neste navegador, separado por conta e parceiro; não é enviado ao Firebase nem sincronizado entre dispositivos. Pode ser removido para voltar ao nome do perfil.
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

- Notificações e lembretes dependem de o site continuar aberto; não há servidor de Web Push nesta versão. Navegadores podem suspender temporizadores em segundo plano.
- Localização é uma posição guardada na conversa, nunca rastreio contínuo. Não existe sobreposição automática noutras aplicações.
- Os dados não têm encriptação ponta a ponta. Firebase usa autenticação e regras de acesso; o proprietário do projeto tem acesso administrativo.
- O modo online apresenta as 150 mensagens e 180 check-ins mais recentes. Os documentos anteriores continuam no Firebase.
- Dados offline privados só são persistidos após a escolha de dispositivo de confiança. Sair limpa a cache Firestore; fechar outros separadores pode ser necessário.
- A integração online precisa de validação com contas de teste num projeto Firebase real antes de usar dados pessoais. O projeto Sully está no plano Spark, com Firestore Standard em africa-south1. As regras têm testes próprios num emulador local.

## Interface

Interface inicial reduzida a estado do par, estado pessoal, humor e mensagens rápidas. Três destinos na navegação: Hoje, Conversa e Ajustes. Desenhos ficam na conversa e o histórico tem acesso no ecrã Hoje; água e lembretes ficam em Ajustes.

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
