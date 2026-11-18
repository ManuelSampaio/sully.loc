import { validEvent } from './core.js?rev=period-moods';

// Empty room resets and initial cached/server snapshots are history, not arrivals.
export function createEventCursor(){
  let ready=false;const seen=new Set();
  return{
    reset(){ready=false;seen.clear();},
    consume(rows,viewer,{baseline=false,reset=false}={}){
      if(reset){this.reset();return [];}
      const fresh=ready&&!baseline?rows.filter(e=>validEvent(e)&&e.from!==viewer&&!seen.has(e.id)):[];
      for(const row of rows)seen.add(row.id);
      ready=true;
      return fresh.sort((a,b)=>a.ts-b.ts);
    }
  };
}

// Session-only display queue. Dismissing an alert never changes chat/read state.
export function createTouchInbox(limit=20){
  let waiting=[],current=null;
  const seen=new Set();
  return{
    receive(event,viewer,muted=false){
      if(!viewer||!validEvent(event)||event.kind!=='quick'||event.from===viewer||seen.has(event.id))return false;
      seen.add(event.id);
      if(muted)return false;
      waiting.push({...event});
      if(waiting.length>limit)waiting.shift();
      return true;
    },
    take(){if(current)return null;current=waiting.shift()||null;return current;},
    finish(){current=null;},
    reset(){waiting=[];current=null;seen.clear();},
    get current(){return current;}
  };
}
