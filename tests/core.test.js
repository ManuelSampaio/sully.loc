import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, period, moodsForPeriod, effectiveStatus, waterAdd, validEvent, isDrawing } from '../core.js';
test('períodos mudam às 6h, ao meio-dia e às 18h, usando a data local',()=>{assert.equal(period(new Date(2026,10,17,5,59)),'noite');assert.equal(period(new Date(2026,10,17,6)),'manha');assert.equal(period(new Date(2026,10,17,11,59)),'manha');assert.equal(period(new Date(2026,10,17,12)),'tarde');assert.equal(period(new Date(2026,10,17,18)),'noite');assert.equal(dayKey(new Date(2026,0,2,23)),'2026-01-02');});
test('sesta expira sem depender de um temporizador aberto',()=>{assert.equal(effectiveStatus({status:'sesta',until:1000},999),'sesta');assert.equal(effectiveStatus({status:'sesta',until:1000},1000),'disponivel');assert.equal(effectiveStatus({status:'dormir',until:0,ts:1},9999),'dormir');});
test('água reinicia num novo dia e não modifica o registo anterior',()=>{const old={day:'2026-11-16',count:8};assert.deepEqual(waterAdd(old,'2026-11-17'),{day:'2026-11-17',count:1});assert.equal(old.count,8);assert.equal(waterAdd({day:'2026-11-17',count:2},'2026-11-17').count,3);});
const event={id:'test',from:'a',kind:'text',text:'Olá',ts:100};
test('mensagens e coordenadas inválidas não entram na conversa',()=>{assert.ok(validEvent(event));assert.ok(!validEvent({...event,text:'x'.repeat(2001)}));assert.ok(!validEvent({...event,kind:'location',lat:91,lng:13}));assert.ok(!validEvent({...event,kind:'location',lat:-8,lng:NaN}));assert.ok(validEvent({...event,kind:'location',lat:-8.8,lng:13.2}));assert.ok(!validEvent({...event,ts:NaN}));});
test('desenhos só permitem PNG em data URL limitado',()=>{assert.ok(isDrawing('data:image/png;base64,aGVsbG8='));assert.ok(!isDrawing('data:image/svg+xml,<svg onload=alert(1)>'));assert.ok(!isDrawing('https://example.com/pixel.png'));assert.ok(!isDrawing('data:image/png;base64,'+'a'.repeat(180000)));assert.ok(!validEvent({...event,kind:'drawing',image:'javascript:alert(1)'}));});

test('moods variam por período e preservam a escolha anterior sem a duplicar',()=>{
  assert.ok(moodsForPeriod('manha').some(m=>m[0]==='energia'));
  assert.ok(!moodsForPeriod('tarde').some(m=>m[0]==='energia'));
  assert.ok(moodsForPeriod('noite').some(m=>m[0]==='paz'));
  assert.equal(moodsForPeriod('manha','radiante').filter(m=>m[0]==='radiante').length,1);
  assert.equal(moodsForPeriod('noite','bem').filter(m=>m[0]==='bem').length,1);
  assert.equal(moodsForPeriod('noite','desconhecido').length,6);
});

test('estado legado fica por escolher exatamente ao fim de 24 horas',()=>{const old={status:'trabalhar',ts:100,until:0};assert.equal(effectiveStatus(old,86400099),'trabalhar');assert.equal(effectiveStatus(old,86400100),'sem estado');});
test('estado explícito volta a Disponível por 24 h sem escrever', () => {
  const state={status:'treinar',ts:1000,until:2000};
  assert.equal(effectiveStatus(state,1999),'treinar');
  assert.equal(effectiveStatus(state,2000),'disponivel');
  assert.equal(effectiveStatus(state,2000+86400000-1),'disponivel');
  assert.equal(effectiveStatus(state,2000+86400000),'sem estado');
  assert.equal(effectiveStatus(undefined,2000),'sem estado');
});
