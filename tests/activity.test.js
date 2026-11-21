import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activityRequest,createActivityCursor} from '../activity.js';
test('activity input is a reference, accepts known kinds and rejects invalid paths',()=>{
 assert.deepEqual(activityRequest('mood','uid_day_manha',100),{activity:{type:'mood',id:'uid_day_manha',revision:100}});
 for(const args of [['unknown','x',1],['mood','../private',1],['status','x',NaN]])assert.throws(()=>activityRequest(...args));
});
test('activity cursor skips history, cache and duplicate updates, but notices a new shared revision',()=>{
 const cursor=createActivityCursor(()=>1000000);const row={id:'a',ts:999990};
 assert.deepEqual(cursor.consume([row],{fromCache:true}),[]);assert.deepEqual(cursor.consume([row]),[]);
 assert.deepEqual(cursor.consume([{...row,ts:1000000}]),[{...row,ts:1000000}]);assert.deepEqual(cursor.consume([{...row,ts:1000000}]),[]);
 assert.deepEqual(cursor.consume([{id:'old',ts:100}]),[]);
});
