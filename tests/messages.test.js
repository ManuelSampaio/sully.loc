import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeMessages,messageState,createDraftStore} from '../messages.js';
import {parseInvite} from '../pairing.js';
test('a mesma mensagem mantém o ID ao passar de pendente para enviada e ao juntar páginas',()=>{
 const one={id:'a',from:'u',kind:'text',text:'Olá',ts:1,pending:true},two={id:'b',from:'v',kind:'text',text:'Tudo bem?',ts:2};
 const merged=mergeMessages([two,one],[{...one,pending:false}]);assert.equal(merged.length,2);assert.equal(merged[0].id,'a');assert.equal(merged[0].pending,false);assert.equal(messageState(merged[0]),'Enviada');assert.equal(messageState({...one,failed:true}),'Não enviada');
});
test('rascunhos não passam entre contas nem entre espaços e são limpos ao sair',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i],get length(){return map.size;}};
 const drafts=createDraftStore(storage);drafts.write('a','one','Mensagem por terminar');drafts.write('b','one','Outra mensagem');
 assert.equal(drafts.read('a','one'),'Mensagem por terminar');assert.equal(drafts.read('a','two'),'');drafts.clear('a');assert.equal(drafts.read('a','one'),'');assert.equal(drafts.read('b','one'),'Outra mensagem');
});
test('convites aceitam código ou link Sully e recusam links externos e entradas incompletas',()=>{
 const code='abcdef0123456789abcdef0123456789';assert.equal(parseInvite(code.toUpperCase()),code);assert.equal(parseInvite(`https://manuelsampaio.github.io/sully.loc/?invite=${code}`),code);
 for(const value of ['abc',`https://evil.test/?invite=${code}`,`http://manuelsampaio.github.io/sully.loc/?invite=${code}`])assert.throws(()=>parseInvite(value));
});
