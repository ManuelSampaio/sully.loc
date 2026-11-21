# Serviço de notificações Sully

Backend separado do site GitHub Pages. Mantém a versão do produto em 0.3.0. O bundle inclui o módulo partilhado `activity.js`; não é preciso carregar esse ficheiro separadamente na Cloudflare.

## Publicar pelo painel da Cloudflare

1. Worker `sully-notifications`, no plano Free.
2. D1 `sully-push` ligado ao Worker pelo binding **DB**.
3. Em **Edit code**, substituir todo o conteúdo de `worker.js` pelo ficheiro `notifications/worker.js` deste repositório e clicar **Deploy**. O ficheiro já inclui as bibliotecas; não requer imports externos nem flags Node.
4. Abrir a raiz do Worker. O resultado esperado é `{"service":"Sully notifications","database":"connected","configured":true,"activities":true}`. Isto confirma o código e o binding; ainda não confirma uma entrega push.
5. No site GitHub Pages, cada pessoa entra na sua conta, liga o seu par e abre **Perfil → Notificações do teu par → Ativar neste dispositivo**. No iPhone, abrir a Sully instalada no ecrã principal (iOS 16.4+). Autorizar no pedido do sistema. Repetir no outro telemóvel.
6. Com a Sully fechada no destinatário, enviar uma mensagem ou toque no outro telemóvel. Verificar o aviso, abrir pelo aviso, testar A dormir/Sesta e testar Terminar sessão. A apresentação e o som dependem do sistema operativo.

As tabelas são criadas automaticamente no primeiro pedido autenticado. Não executar SQL manualmente nem copiar chaves privadas para o site. As chaves VAPID são geradas no próprio Worker e persistidas apenas no D1. O endpoint autenticado `/v1/key` devolve exclusivamente a chave pública. Administradores da conta Cloudflare podem consultar o D1; guardar a conta e cópias da base com as mesmas precauções de outros segredos do servidor.

## Contrato do cliente

- Origem permitida: `https://manuelsampaio.github.io`.
- Todos os endpoints `/v1/*` exigem `Authorization: Bearer <Firebase ID token>` de `sully-97787` e duas contas já associadas. Pedidos que modificam dados exigem também essa origem e JSON.
- `GET /v1/key`: `{publicKey}` para PushManager.
- `POST /v1/subscriptions`: `{subscription,preview:false}` ativa apenas o dispositivo autenticado; devolve `{enabled,id,quietUntil}`. O cliente envia sempre `preview:false`: o texto fica oculto no ecrã bloqueado.
- `DELETE /v1/subscriptions`: `{id}` remove apenas uma subscrição da própria conta. O cliente deve também executar `PushSubscription.unsubscribe()` ao desativar avisos ou terminar sessão, incluindo se o serviço estiver indisponível.
- `POST /v1/preferences`: `{}` sincroniza o estado de descanso a partir do Firestore com o token do próprio utilizador, mesmo que o estado esteja privado para o parceiro. `{id,preview:true|false}` atualiza opcionalmente a pré-visualização de um dispositivo próprio.
- Sincronizar preferências ao entrar, ao regressar ao site e depois da confirmação de gravação de cada estado. Se falhar, informar que o silêncio dos avisos externos não ficou confirmado. `quietUntil=-1` significa descanso sem prazo; um prazo positivo expira automaticamente.
- `POST /v1/send`: `{eventId}` depois de o Firestore confirmar a gravação do evento. O serviço lê o evento, autor, par e destinatário no Firestore com o token do remetente; não aceita destinatário ou texto arbitrários. Aceita eventos criados há até 5 minutos, usando o `createTime` do servidor. Não envia localização, imagem ou mood privado.
- O cliente deve tentar novamente uma falha transitória de envio dentro desse prazo, usando o mesmo ID. A entrega é deduplicada por evento e dispositivo. O envio é iniciado pelo cliente remetente: fechar a página antes da chamada pode impedir o aviso, embora a mensagem continue guardada no Firestore.
- O service worker identifica o tipo de novidade com texto fixo, sem conteúdo privado nem resposta direta. Ignora o texto e destinos recebidos no payload e aceita apenas categorias conhecidas; só abre o âmbito `/sully.loc/`. Confirma a subscrição atual contra o identificador do dispositivo, a sessão local e o silêncio antes de mostrar o aviso. A saída limpa os avisos apresentados e revoga a subscrição antes de terminar a sessão Firebase. Mensagens recebidas pelo Firestore só produzem avisos dentro do site, para evitar duplicação dos avisos de sistema.

## Segurança e limites

O Firestore valida os Firebase ID tokens e aplica as regras existentes. O serviço não usa Firebase Admin, chaves de conta de serviço ou acesso que contorne as regras. A leitura de claims serve apenas para escolher o caminho do perfil; a identidade só é aceite depois da verificação do token completo pelo Firestore.

Destinos push restritos a HTTPS nos serviços de Apple, Google, Mozilla e Windows. Redirecionamentos proibidos, chaves da subscrição validadas, máximo de 5 dispositivos por conta e 30 pedidos autenticados/minuto. Não registar tokens, mensagens, endpoints ou chaves nos logs. As subscrições que devolvem 404/410 são removidas; registos de entrega antigos são limpos. Usar apenas os planos Free/Spark; sem upgrade de faturação.

O silêncio do destinatário é uma preferência enviada pelo cliente autenticado; o Worker não consulta estados privados do parceiro com credenciais de administrador. Os lembretes periódicos de água com o site fechado não fazem parte deste serviço.

## Desenvolvimento

Node 22 ou superior:

```sh
cd notifications
npm ci
npm test
npm run build
```

Biblioteca Web Push `@block65/webcrypto-web-push` 2.0.0, com RFC 8291 aes128gcm e VAPID. Licenças MIT preservadas no bundle. Os testes usam SQLite real com um adaptador D1, um verificador Firestore simulado e um recetor independente `http_ece` para desencriptar os payloads. Também verificam a assinatura VAPID. Não substituem os testes em Cloudflare, Firebase real, iOS e Android.

## Avisos de atividades partilhadas

`POST /v1/send` aceita, em alternativa a `eventId`, `{activity:{type,id,revision}}`, com `type` igual a `mood`, `status` ou `location` e `revision` igual ao `ts` do documento gravado. Não recebe conteúdo, destinatário, mood, frase ou coordenadas. O Worker lê apenas o documento do autor autenticado, verifica a opção atual de partilha e a revisão. Usa o `updateTime` do Firestore para limitar a idade a cinco minutos e deduplicar o envio por revisão e dispositivo. Um check-in atualizado pode assim gerar outro aviso, sem duplicar a mesma gravação.

O cliente pede o aviso só depois da confirmação do Firestore. Escolher um mood sem tocar em Partilhar não envia aviso. Com a Sully aberta, as subscrições de dados autorizados avisam de novas revisões, sem voltar a avisar de histórico, cache inicial ou partilha que acabou de ser reativada. Estados privados, rascunhos, aparência e contador pessoal de água não notificam o parceiro. Dormir e descansar silenciam também estas categorias.

Para confirmar que a nova versão do emissor foi instalada, a raiz do Worker deve devolver `activities:true`. O GitHub Pages não publica automaticamente o Worker da conta Cloudflare: é preciso fazer Deploy do bundle atualizado em `notifications/worker.js`.
