// Configuração pública da aplicação. Nunca colocar service accounts ou chaves privadas aqui.
export const cloudConfig = {
  enabled: false,
  firebase: { apiKey: '', authDomain: '', projectId: '', appId: '' },
  members: [{ uid: 'UID_MANUEL', name: 'Manuel' }, { uid: 'UID_PAR', name: 'O meu par' }]
};
