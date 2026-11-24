import {geoOrthographic,geoPath,geoGraticule10,geoInterpolate} from './vendor/d3-geo.js';

const rad = Math.PI/180;
const sphere = {type:'Sphere'};
const grid = geoGraticule10();
const wrap = degrees => ((degrees+540)%360)-180;

export function globeCenter(a,b) {
  const vector = ([lng,lat]) => [Math.cos(lat*rad)*Math.cos(lng*rad),
    Math.cos(lat*rad)*Math.sin(lng*rad),Math.sin(lat*rad)];
  const v = vector(a), w = vector(b);
  let [x,y,z] = v.map((value,index) => value+w[index]);
  if (Math.hypot(x,y,z)<1e-9) {
    // Antipodes share the horizon of any hemisphere centred on a perpendicular.
    [x,y,z] = Math.abs(v[2])>.9 ? [0,v[2],-v[1]] : [-v[1],v[0],0];
  }
  return [Math.atan2(y,x)/rad,Math.atan2(z,Math.hypot(x,y))/rad];
}

export function createGlobe(svg,land) {
  const projection = geoOrthographic().translate([320,198]).scale(166).clipAngle(90).precision(.8);
  const path = geoPath(projection);
  const draw = (selector,d) => svg.querySelector(selector).setAttribute('d',d || '');
  const dots = svg.querySelectorAll('.sx-map-dot');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let center, target, frame, coordinates, connector, idle = false;

  function paint(camera, settled) {
    center = camera;
    projection.rotate([-camera[0],-camera[1]]);
    draw('.sx-globe-water',path(sphere));
    draw('.sx-globe-grid',path(grid));
    draw('.sx-map-land',path(land));
    draw('.sx-map-connection',settled ? path(connector) : '');
    if (!settled) {
      dots.forEach(dot => dot.setAttribute('hidden',''));
      return;
    }
    const points = coordinates.map(projection);
    const overlap = Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1]) < 17;
    dots.forEach((dot,index) => {
      const [x,y] = points[index];
      dot.setAttribute('transform',`translate(${x} ${y})`);
      dot.firstElementChild.setAttribute('cx',overlap ? (index===0?-6:6) : 0);
      dot.removeAttribute('hidden');
    });
  }
  function stop() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    center = target = frame = undefined;
    idle = false;
  }
  function show(a,b,onSettled) {
    idle = false;
    coordinates = [a,b].map(point => [point.lngE2/100,point.latE2/100]);
    const key = coordinates.flat().join(',');
    if (target === key) return;
    if (frame !== undefined) cancelAnimationFrame(frame);
    target = key;
    const to = globeCenter(...coordinates);
    const arc = geoInterpolate(...coordinates);
    connector = {type:'LineString',coordinates:Array.from({length:40},(_,i) => {
      if (arc.distance < Math.PI-1e-8) return arc(i/39);
      const half = i/39*2;
      return half < 1 ? geoInterpolate(coordinates[0],to)(half) : geoInterpolate(to,coordinates[1])(half-1);
    })};
    const duration = center ? 500 : 1850;
    const from = center || [wrap(to[0]-145),0];
    if (motion.matches) { paint(to,true); onSettled(); return; }
    paint(from,false);
    const change = wrap(to[0]-from[0]);
    let started;
    const spin = timestamp => {
      started ??= timestamp;
      const progress = Math.min((timestamp-started)/duration,1);
      if (progress === 1) {
        frame = undefined;
        paint(to,true);
        onSettled();
        return;
      }
      const ease = 1-(1-progress)**3;
      paint([from[0]+change*ease,from[1]+(to[1]-from[1])*ease],false);
      frame = requestAnimationFrame(spin);
    };
    frame = requestAnimationFrame(spin);
  }
  function showIdle() {
    if (idle) return;
    stop();
    paint([15,0],false);
    center = undefined;
    idle = true;
  }
  return {show,stop,showIdle};
}
