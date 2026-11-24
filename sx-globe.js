import {geoOrthographic,geoPath,geoGraticule10,geoInterpolate} from './vendor/d3-geo.js';

const rad = Math.PI/180;
const sphere = {type:'Sphere'};
const grid = geoGraticule10();
const worldScale = 166;
const maxScale = 4600;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
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

function mapDetails(svg, { roads, borders, cities }, projection, path) {
  const roadsPath = svg.querySelector('.sx-map-roads');
  const bordersPath = svg.querySelector('.sx-map-borders');
  const labels = svg.querySelectorAll('.sx-map-cities text');
  const lineLayers = [borders, roads].map(lines => lines.map(line => {
    const latitudes = line.map(point => point[1]);
    return { line, south: Math.min(...latitudes), north: Math.max(...latitudes) };
  }));
  const places = cities.map(([name, , , lat, lng]) => ({ name, lng: lng / 100, lat: lat / 100 }));
  const compact = svg.classList.contains('sx-map-backdrop');
  const maxLabels = compact ? 4 : labels.length;
  return (camera, zoom, cityNames) => {
    const reach = Math.asin(Math.min(1, 280 / zoom)) / rad;
    for (const [index, layer] of [bordersPath, roadsPath].entries()) {
      const lines = zoom < (index === 0 ? 240 : 680) ? [] : lineLayers[index]
        .filter(({south,north}) => north >= camera[1] - reach && south <= camera[1] + reach)
        .map(({line}) => line);
      layer.setAttribute('d', path({type:'MultiLineString', coordinates:lines}) || '');
    }
    const shown = [];
    if (zoom >= 900) {
      const candidates = [];
      for (const {name,lng,lat} of places) {
        // At regional zoom the visible map is much smaller than a hemisphere.
        if (Math.abs(lat - camera[1]) > reach || Math.abs(wrap(lng - camera[0])) > 90) continue;
        const [x,y] = projection([lng,lat]);
        if (y < 40 || y > 350 || x < (compact ? 224 : 122) || x > (compact ? 418 : 518)) continue;
        candidates.push({name,x,y, priority:cityNames.includes(name), distance:Math.hypot(x - 320, y - 198)});
      }
      candidates.sort((a,b) => b.priority - a.priority || a.distance - b.distance);
      for (const candidate of candidates) {
        if (shown.some(p => Math.abs(p.x - candidate.x) < 88 && Math.abs(p.y - candidate.y) < 24)) continue;
        shown.push(candidate);
        if (shown.length === maxLabels) break;
      }
    }
    labels.forEach((label,index) => {
      const place = shown[index];
      label.toggleAttribute('hidden', !place);
      if (!place) return;
      label.textContent = place.name;
      label.setAttribute('x', compact ? place.x + 16 : place.x);
      label.setAttribute('y', place.y + (compact ? 5 : 19));
    });
  };
}

export function createGlobe(svg, land, { regional = false, fitRadius = 137 } = {}) {
  const projection = geoOrthographic().translate([320,198]).scale(worldScale).clipAngle(90).precision(.8);
  const path = geoPath(projection);
  const water = svg.querySelector('.sx-globe-water');
  const graticule = svg.querySelector('.sx-globe-grid');
  const landPath = svg.querySelector('.sx-map-land');
  const roadPath = svg.querySelector('.sx-map-road-route');
  const dots = svg.querySelectorAll('.sx-map-dot');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let center, scale = worldScale, target, frame, points;
  let idle = false, manual = false, renderDetails;
  let cityNames = [], roadLine;

  function hideRoute() {
    roadPath.setAttribute('hidden', '');
    dots.forEach(dot => dot.setAttribute('hidden', ''));
  }
  function paint(camera, zoom, locations) {
    center = camera;
    scale = zoom;
    projection.rotate([-camera[0], -camera[1]]).scale(zoom);
    water.setAttribute('d', path(sphere) || '');
    graticule.setAttribute('d', path(grid) || '');
    landPath.setAttribute('d', path(land) || '');
    renderDetails?.(camera, zoom, cityNames);
    if (!locations) return;

    const visible = locations.map(point => geoInterpolate(camera, point).distance <= Math.PI / 2 + 1e-8);
    const [a, b] = locations.map(projection);
    if (visible.every(Boolean) && Math.hypot(b[0] - a[0], b[1] - a[1]) < 17) {
      const offset = a[0] <= b[0] ? 7 : -7;
      a[0] -= offset;
      b[0] += offset;
    }
    for (const [index, point] of [a, b].entries()) {
      dots[index].setAttribute('transform', `translate(${point.join(' ')})`);
      dots[index].toggleAttribute('hidden', !visible[index]);
    }
    const projectedRoad = roadLine ? path({type:'LineString', coordinates:roadLine}) : '';
    roadPath.setAttribute('d', projectedRoad || '');
    roadPath.toggleAttribute('hidden', !projectedRoad);
  }
  function cancelFlight() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  }
  function stop() {
    cancelFlight();
    center = target = points = undefined;
    scale = worldScale;
    idle = manual = false;
    cityNames = [];
    roadLine = undefined;
    hideRoute();
  }
  function focusPair() {
    cancelFlight();
    manual = false;
    const to = globeCenter(...points);
    const separation = Math.sin(geoInterpolate(...points).distance / 2);
    // Leave room for both markers even when the locations are on opposite sides of Earth.
    const zoom = regional ? clamp(fitRadius / separation, worldScale, 3900) : worldScale;
    if (!regional || motion.matches) {
      paint(to, zoom, points);
      return;
    }
    hideRoute();
    const firstView = !center;
    const from = center || [wrap(to[0] - 145), 0];
    const initialScale = scale;
    const turn = wrap(to[0] - from[0]);
    const duration = firstView ? 1750 : 700;
    paint(from, initialScale);
    let started;
    const spin = timestamp => {
      started ??= timestamp;
      const progress = Math.min((timestamp - started) / duration, 1);
      if (progress === 1) {
        frame = undefined;
        paint(to, zoom, points);
        return;
      }
      const rotation = 1 - (1 - Math.min(progress / .72, 1)) ** 3;
      const approach = Math.max(0, (progress - .38) / .62);
      const easedZoom = approach ** 2 * (3 - 2 * approach);
      paint([from[0] + turn * rotation, from[1] + (to[1] - from[1]) * rotation],
        initialScale * (zoom / initialScale) ** easedZoom);
      frame = requestAnimationFrame(spin);
    };
    frame = requestAnimationFrame(spin);
  }
  function show(a, b) {
    idle = false;
    const locations = [a, b].map(point => [point.lngE2 / 100, point.latE2 / 100]);
    const names = [a.cidade, b.cidade].filter(Boolean);
    const key = JSON.stringify([locations, names]);
    if (target === key) return;
    target = key;
    points = locations;
    cityNames = names;
    if (manual) paint(center, scale, points);
    else focusPair();
  }
  function move(dx, dy, zoomFactor = 1) {
    if (!regional) return;
    cancelFlight();
    manual = true;
    const [longitude, latitude] = center || [15, 0];
    const rate = 1 / (scale * rad);
    const longitudeRate = rate / Math.max(.3, Math.cos(latitude * rad));
    paint([wrap(longitude - dx * longitudeRate), clamp(latitude + dy * rate, -89.9, 89.9)],
      clamp(scale * zoomFactor, worldScale, maxScale), points);
  }
  function showIdle() {
    if (idle) return;
    stop();
    paint([15, 0], worldScale);
    center = undefined;
    idle = true;
  }
  function setDetails(data) {
    renderDetails = mapDetails(svg, data, projection, path);
    if (center) renderDetails(center, scale, cityNames);
  }
  function setRoadRoute(coordinates) {
    if (roadLine === coordinates) return;
    roadLine = coordinates;
    if (center && points && frame === undefined) paint(center, scale, points);
  }
  return {show, stop, showIdle, move, focusPair, setDetails, setRoadRoute};
}
