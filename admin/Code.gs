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
  let accounts = 0, page = '';
  const now = Date.now();
  const days = Array.from({length:7}, (_, index) => ({
    date:Utilities.formatDate(new Date(now - (6-index)*86400000),'Africa/Luanda','yyyy-MM-dd'), count:0
  }));
  const byDate = new Map(days.map(day => [day.date, day]));
  do {
    const url = 'https://identitytoolkit.googleapis.com/v1/projects/' + project +
      '/accounts:batchGet?maxResults=1000&fields=users(createdAt),nextPageToken' +
      (page ? '&nextPageToken=' + encodeURIComponent(page) : '');
    const result = JSON.parse(UrlFetchApp.fetch(url, {
      headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project':project}
    }).getContentText());
    const rows = result.users || [];
    accounts += rows.length;
    for (const row of rows) {
      const created = Number(row.createdAt);
      if (!created) continue;
      const day = byDate.get(Utilities.formatDate(new Date(created),'Africa/Luanda','yyyy-MM-dd'));
      if (day) day.count++;
    }
    page = result.nextPageToken;
  } while (page);
  const recent = days.reduce((sum, day) => sum + day.count, 0);
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
  return {accounts,recent,days, active:Number(aggregate.result.aggregateFields.active.integerValue), updated:now};
}
