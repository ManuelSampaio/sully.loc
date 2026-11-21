// Deploy with access MYSELF. Every request also checks the signed-in owner.
function owner_() {
  const owner = PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL');
  const signedIn = Session.getActiveUser().getEmail();
  if (!owner || !signedIn || owner.trim().toLowerCase() !== signedIn.toLowerCase()) {
    throw new Error('Acesso reservado ao administrador.');
  }
}

function doGet() {
  owner_();
  return HtmlService.createHtmlOutputFromFile('Painel').setTitle('Sully · Administração')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}

function post_(url, body) {
  const response = UrlFetchApp.fetch(url, {
    method:'post', contentType:'application/json', payload:JSON.stringify(body),
    headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions:true
  });
  if (response.getResponseCode() !== 200) throw new Error('Verifica as permissões Google do projeto Sully.');
  return JSON.parse(response.getContentText());
}

function getMetrics() {
  owner_();
  const project = 'sully-97787';
  let accounts = 0, recent = 0, page = '';
  const cutoff = Date.now() - 7 * 86400000;
  do {
    const url = 'https://identitytoolkit.googleapis.com/v1/projects/' + project +
      '/accounts:batchGet?maxResults=1000&fields=users(createdAt),nextPageToken' +
      (page ? '&nextPageToken=' + encodeURIComponent(page) : '');
    const result = JSON.parse(UrlFetchApp.fetch(url, {
      headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()}
    }).getContentText());
    const rows = result.users || [];
    accounts += rows.length;
    recent += rows.filter(row => Number(row.createdAt) >= cutoff).length;
    page = result.nextPageToken;
  } while (page);
  const now = Date.now();
  const presence = post_('https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents:runAggregationQuery', {
    structuredAggregationQuery:{
      structuredQuery:{from:[{collectionId:'presence'}],where:{fieldFilter:{
        field:{fieldPath:'seenAt'},op:'GREATER_THAN_OR_EQUAL',
        value:{timestampValue:new Date(now - 300000).toISOString()}
      }}}, aggregations:[{alias:'active',count:{}}]
    }
  });
  const aggregate = presence.find(row => row.result);
  if (!aggregate || !aggregate.result.aggregateFields.active) throw new Error('Contagem indisponível.');
  return {accounts,recent, active:Number(aggregate.result.aggregateFields.active.integerValue), updated:now};
}
