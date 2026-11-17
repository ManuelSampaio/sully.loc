# sully.loc · o nosso lugar

Um site pensado para dois e primeiro para telemóvel. HTML, CSS e JavaScript, sem build nem dependências locais.

## Versão 0.1

- Check-in de humor de manhã, tarde e noite, com frase opcional e atualização do mesmo período.
- Estados disponível, ocupado/a, dormir e sesta temporizada.
- Mensagens rápidas editáveis, chat de texto, notas e desenhos com rato ou toque.
- Partilha pontual de localização mediante confirmação e permissão do navegador.
- Contador pessoal de água e lembretes enquanto o site está aberto.
- Histórico de check-ins e notas; exportação JSON.
- Manifest e service worker para abrir a interface offline após a primeira visita.

**Por omissão está em modo local de teste. Não há comunicação entre telemóveis até configurar o Firebase.** Os dois perfis em Ajustes servem apenas para experimentar neste navegador. Não representam autenticação. Não existem respostas ou estados simulados do outro.

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
- A integração online e as regras precisam de validação com as duas contas num projeto Firebase real antes de usar dados pessoais. Não foi criada infraestrutura Firebase neste repositório.

MANUEL SAMPAIO01
