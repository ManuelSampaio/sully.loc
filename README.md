# sully.loc · o nosso lugar

Um site pensado para dois e primeiro para telemóvel. HTML, CSS e JavaScript, sem build nem dependências locais.

## Versão 0.3

- Check-in de humor de manhã, tarde e noite, com frase opcional e atualização do mesmo período.
- Estados disponível, ocupado/a, dormir e sesta temporizada.
- Mensagens rápidas editáveis, chat de texto, notas e desenhos com rato ou toque.
- Partilha pontual de localização mediante confirmação e permissão do navegador.
- Contador pessoal de água e lembretes enquanto o site está aberto.
- Histórico de check-ins e notas; exportação JSON.
- Manifest e service worker para abrir a interface offline após a primeira visita.

**O site abre sem assumir a identidade de ninguém.** Inclui registo, login, recuperação de palavra-passe, perfil próprio, convite para ligar duas contas e escolhas individuais de partilha. Estes fluxos reais dependem da configuração Firebase em `config.js` e da publicação das regras.

Por omissão, `enabled: false`: só se pode explorar uma demonstração local com nome escolhido pela pessoa. Essa demonstração não cria contas nem comunica entre telefones. Não existem respostas simuladas do outro.

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
- A integração online precisa de validação com contas de teste num projeto Firebase real antes de usar dados pessoais. Não foi criada infraestrutura Firebase neste repositório. As regras têm testes próprios num emulador local.

## Interface

Interface inicial reduzida a estado do par, estado pessoal, humor e mensagens rápidas. Três destinos na navegação: Hoje, Conversa e Ajustes. Desenhos ficam na conversa e o histórico tem acesso no ecrã Hoje; água e lembretes ficam em Ajustes.

Inclui ícones PNG 192/512 e apple-touch-icon 180, campos de texto com 16 px para evitar zoom automático no iPhone, margens seguras e altura da conversa adaptada à área visível.

Verificação em navegador Chromium com áreas de 390×844 e 360×800, sem transbordamento horizontal; navegação, chat e contador de água exercitados. Isto não constitui teste físico em iOS/Safari ou Android/Chrome. A sincronização entre dispositivos continua pendente da configuração Firebase. Os novos fluxos de perfil e partilha também foram exercitados na demonstração local.

## Testes de acesso

`npm run test:rules` exercita no emulador Firestore: recusa sem login, perfis independentes, convite atómico, limite de duas contas, privacidade e revogação do humor, autorização de localização e bloqueio de remetentes forjados. As dependências são apenas de desenvolvimento; o site continua estático e sem build.

O esquema v0.3 usa `profiles/{uid}` e `pairs/{convite}/…`. As coleções da v0.1 não são migradas nem apagadas; ficam inacessíveis pelas novas regras. A configuração antiga com UIDs fixos deixa de se aplicar.

MANUEL SAMPAIO01
