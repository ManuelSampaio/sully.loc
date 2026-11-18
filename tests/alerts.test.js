import test from 'node:test';
import assert from 'node:assert/strict';
import {createTouchInbox,createEventCursor} from '../alerts.js';
const touch=(id,extra={})=>({id,from:'partner',kind:'quick',text:'Tenho saudades tuas.',ts:1,...extra});
test('toques próprios, sem conta, inválidos e em silêncio não abrem cartões',()=>{
 const inbox=createTouchInbox();
 assert.equal(inbox.receive(touch('own',{from:'me'}),'me'),false);
 assert.equal(inbox.receive(touch('guest'),null),false);
 assert.equal(inbox.receive(touch('bad',{text:'x'.repeat(2001)}),'me'),false);
 assert.equal(inbox.receive(touch('text',{kind:'text'}),'me'),false);
 assert.equal(inbox.receive(touch('sleep'),'me',true),false);
 assert.equal(inbox.take(),null);
});
test('toques chegam em fila, só um fica aberto e duplicados não reaparecem',()=>{
 const inbox=createTouchInbox();
 assert.equal(inbox.receive(touch('first'),'me'),true);
 assert.equal(inbox.receive(touch('first'),'me'),false);
 inbox.receive(touch('second'),'me');
 assert.equal(inbox.take().id,'first');assert.equal(inbox.take(),null);
 inbox.finish();assert.equal(inbox.take().id,'second');
 inbox.reset();assert.equal(inbox.current,null);assert.equal(inbox.take(),null);
});
test('reset vazio e snapshots iniciais não confundem histórico com novos envios',()=>{
 const cursor=createEventCursor(),old=touch('old');
 assert.deepEqual(cursor.consume([],'me',{reset:true}),[]);
 assert.deepEqual(cursor.consume([old],'me',{baseline:true}),[]);
 assert.deepEqual(cursor.consume([old,touch('server-history')],'me',{baseline:true}),[]);
 const rows=[touch('later',{ts:3}),old,touch('earlier',{ts:2}),touch('own',{from:'me'}),touch('server-history')];
 assert.deepEqual(cursor.consume(rows,'me').map(e=>e.id),['earlier','later']);
 assert.deepEqual(cursor.consume(rows,'me'),[]);
 cursor.reset();assert.deepEqual(cursor.consume(rows,'other-account',{baseline:true}),[]);
});
test('fila limitada não altera as mensagens originais',()=>{
 const inbox=createTouchInbox(2),event=touch('one');
 inbox.receive(event,'me');inbox.receive(touch('two'),'me');inbox.receive(touch('three'),'me');
 assert.equal(inbox.take().id,'two');assert.equal(event.text,'Tenho saudades tuas.');
});
