'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const source = read('public', 'highway-drive-preset.js');
const loader = read('public', 'js', 'index-loader.js');
const core = read('public', 'js', 'modules', '00-state', '00-core-stores.js');
const presets = read('public', 'js', 'modules', '07-fx', '00-preset-archive-data.js');
const presetGrid = read('public', 'js', 'modules', '07-fx', '04-preset-grid-uniforms.js');
const mainLoop = read('public', 'js', 'modules', '11-main-loop.js');
const shelfManager = read('public', 'js', 'modules', '04-shelf', '01-manager-core.js');
const liveQa = read('scripts', 'check-highway-drive-live.js');
const planetAssetDir = path.join(root, 'public', 'assets', 'highway-planets');
const planetAssetNames = ['moon.jpg', 'mars.jpg', 'jupiter.jpg', 'saturn.jpg', 'saturn-ring.png', 'neptune.jpg', 'venus.jpg', 'mercury.jpg'];

const context = { window: {} };
vm.runInNewContext(source, context, { filename: 'highway-drive-preset.js' });
const runtime = context.window.MineradioHighwayDrive;
assert(runtime, 'highway runtime must register globally');
assert.strictEqual(runtime.INDEX, 9, 'highway must occupy preset index 9');

const api = runtime._test;
assert.strictEqual(api.constants.bandCount, 8, 'road surface must expose all eight sonic bands');
assert(api.constants.segmentCount <= 128, 'road mesh must remain bounded');
assert((api.constants.segmentCount + 1) * api.constants.columnCount <= 2200, 'road vertex budget must remain bounded');
assert(api.constants.lightPairCount <= 32, 'roadside light instance budget must remain bounded');
assert(api.constants.maxCameraRoll <= 0.015, 'camera banking must stay below a motion-comfort limit');
assert(api.constants.cameraRollResponse <= 1.5, 'camera banking must ease in instead of snapping to each curve');
assert(api.constants.sceneryInstanceCount <= 32, 'each natural scenery pool must remain bounded');
assert.strictEqual(api.constants.biomeNames.length, 6, 'the road must cross six natural environment families');
assert.deepStrictEqual(
  Array.from(api.constants.biomeNames),
  ['mountains', 'river', 'hills', 'desert', 'beach', 'grassland'],
  'natural environments must cover mountains, rivers, hills, desert, beach, and grassland'
);
assert.deepStrictEqual(
  Array.from(api.constants.weatherNames),
  ['clear-day', 'golden-hour', 'rain', 'snow', 'starry-night', 'aurora'],
  'the sky cycle must cover daylight, golden hour, rain, snow, stars, and aurora'
);
assert.deepStrictEqual(
  Array.from(api.constants.celestialNames),
  ['moon', 'mars', 'jupiter', 'saturn', 'neptune', 'venus', 'mercury'],
  'night skies must rotate through seven recognizable celestial bodies'
);
assert(api.constants.precipitationCount <= 512, 'rain and snow must share one bounded particle pool');
assert(api.constants.landmarkNames.length >= 8 && api.constants.landmarkNames.length <= 10, 'the roadside landmark series must be varied and bounded');
assert(api.constants.landmarkNames.includes('Eiffel Tower') && api.constants.landmarkNames.includes('Taj Mahal'), 'globally recognizable landmarks must be present');
assert.strictEqual(api.roadBandForSide(0), 0, 'sub-bass must live near the road center');
assert.strictEqual(api.roadBandForSide(0.999), 7, 'air band must reach the road edge');

const seed = 314.159;
const firstRun = [];
const secondRun = [];
let leftTurns = 0;
let rightTurns = 0;
let last = api.roadCenterAt(0, seed);
let maxCurveStep = 0;
let maxCurveAcceleration = 0;
let previous = last;
for (let distance = 0; distance <= 1200; distance += 12) {
  const value = api.roadCenterAt(distance, seed);
  const repeated = api.roadCenterAt(distance, seed);
  assert(Number.isFinite(value), 'road curve must remain finite');
  maxCurveStep = Math.max(maxCurveStep, Math.abs(value - last));
  if (distance >= 24) maxCurveAcceleration = Math.max(maxCurveAcceleration, Math.abs(value - 2 * last + previous));
  if (value > last + 0.08) rightTurns += 1;
  if (value < last - 0.08) leftTurns += 1;
  firstRun.push(value);
  secondRun.push(repeated);
  previous = last;
  last = value;
}
assert.deepStrictEqual(firstRun, secondRun, 'a generated road seed must be deterministic');
assert(leftTurns > 8 && rightTurns > 8, 'the endless road must bend in both directions');
assert(maxCurveStep < 3.2, 'road lateral movement must stay broad and gradual');
assert(maxCurveAcceleration < 1.2, 'road direction changes must not oscillate sharply');

for (let zone = 0; zone < api.constants.biomeNames.length; zone += 1) {
  assert.strictEqual(api.biomeIndexAtDistance(zone * api.constants.biomeZoneLength, 0), zone, 'natural zones must progress deterministically');
}
const weatherSamples = [
  { zone: 0, name: 'snow' },
  { zone: 1, name: 'rain' },
  { zone: 2, name: 'clear-day' },
  { zone: 3, name: 'golden-hour' },
  { zone: 5, name: 'starry-night' },
  { zone: 6, name: 'aurora' },
];
weatherSamples.forEach(sample => {
  const weather = api.weatherStateAtDistance(sample.zone * api.constants.biomeZoneLength, 0);
  assert.strictEqual(weather.name, sample.name, `weather zone ${sample.zone} must activate ${sample.name}`);
  assert.strictEqual(weather.blend, 0, 'a weather zone must begin without a stale transition blend');
});
const celestialNightZones = [5, 6, 11, 17, 18, 23, 29];
const celestialTour = celestialNightZones.map(zone => api.celestialIndexForZone(zone, 0));
assert.strictEqual(new Set(celestialTour).size, api.constants.celestialNames.length, 'seven night zones must cover every celestial body without random repeats');
assert.strictEqual(
  api.constants.celestialNames[api.celestialIndexForZone(5, 0)],
  'saturn',
  'the first deterministic starry-night QA zone must expose a recognizable ringed body'
);
const transitioningWeather = api.weatherStateAtDistance(
  api.constants.biomeZoneLength * (1 + api.constants.weatherTransitionStart + 0.12),
  0,
);
const nextWeather = api.weatherStateAtDistance(api.constants.biomeZoneLength * 2, 0);
assert(transitioningWeather.blend > 0 && transitioningWeather.blend < 1, 'weather must crossfade near the end of a biome');
assert.strictEqual(transitioningWeather.nextName, nextWeather.name, 'weather crossfades must meet the next zone continuously');
for (let landmark = 0; landmark < api.constants.landmarkNames.length; landmark += 1) {
  assert.strictEqual(api.landmarkIndexAtDistance(landmark * api.constants.landmarkSpacing), landmark, 'roadside landmarks must progress deterministically');
}

const sceneryBeforePass = api.recycledWorldPlacement(
  0,
  api.constants.scenerySpacing,
  api.constants.sceneryInstanceCount,
  8,
  13.9,
  api.constants.sceneryPassDistance,
);
const sceneryAfterPass = api.recycledWorldPlacement(
  0,
  api.constants.scenerySpacing,
  api.constants.sceneryInstanceCount,
  8,
  14.1,
  api.constants.sceneryPassDistance,
);
assert(sceneryBeforePass.ahead < 0, 'roadside scenery must remain visible after passing the camera plane');
assert.strictEqual(sceneryBeforePass.worldDistance, 8, 'roadside scenery recycled before it passed the camera');
assert(sceneryAfterPass.worldDistance > sceneryBeforePass.worldDistance, 'roadside scenery must recycle only after the pass distance');
assert(sceneryAfterPass.ahead > api.constants.sceneryPassDistance, 'recycled scenery must return beyond the visible near field');

const landmarkBeforePass = api.recycledWorldPlacement(
  0,
  api.constants.landmarkSpacing,
  api.constants.landmarkNames.length,
  58,
  69.9,
  api.constants.landmarkPassDistance,
);
const landmarkAfterPass = api.recycledWorldPlacement(
  0,
  api.constants.landmarkSpacing,
  api.constants.landmarkNames.length,
  58,
  70.1,
  api.constants.landmarkPassDistance,
);
assert(landmarkBeforePass.ahead < 0, 'landmarks must visibly pass the camera before recycling');
assert.strictEqual(landmarkBeforePass.worldDistance, 58, 'landmark recycled while it was still beside the road');
assert(landmarkAfterPass.worldDistance > landmarkBeforePass.worldDistance, 'landmark must recycle after clearing the camera');

const detailed = api.readAudio({
  sonicDetailed: true,
  subBass: 0.9,
  bass: 0.8,
  lowMid: 0.7,
  mid: 0.6,
  highMid: 0.5,
  presence: 0.4,
  brilliance: 0.3,
  air: 0.2,
  energy: 0.75,
  kickEnvelope: 0.82,
  triggerPulse: 0.94
});
assert.deepStrictEqual(Array.from(detailed.bands), [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2]);
assert(detailed.trigger >= 0.94, 'shared sonic trigger pulse must reach the road runtime');
const idleSpeed = api.targetRoadSpeed({ energy: 0 }, { speed: 1 }, 0, 0, 0);
const beatSpeed = api.targetRoadSpeed({ energy: 0.8 }, { speed: 1 }, 0.85, 0.9, 0.9);
assert(beatSpeed > idleSpeed + 20, 'strong music beats must produce a material speed increase');

assert(loader.includes("'highway-drive-preset.js'"), 'highway runtime must load before the main loop');
assert(/MAX_VISUAL_PRESET_INDEX = 10/.test(core) && /HIGHWAY_PRESET_INDEX = 9/.test(core), 'preset 9 must survive startup and persistence clamps after later presets');
assert(presets.includes("name: '无尽公路'") && /presetDisplayOrder = \[0, 6, 7, 8, 9/.test(presets), 'highway card must be directly visible with the sonic presets');
assert(/MineradioHighwayDrive\.onPresetChange/.test(presetGrid), 'preset changes must notify the highway runtime');
assert(/MineradioHighwayDrive\.update/.test(mainLoop) && /visual\.highway-drive/.test(mainLoop), 'main loop must drive and measure the highway runtime');
assert(/!highwayPresetActiveEarly/.test(mainLoop), 'base cover particles must hide behind the highway scene');
assert(/setVisualSuppressed\(highwayPresetActiveEarly \|\| niulaiPresetActiveEarly\)/.test(mainLoop) && /setVisualSuppressed: function/.test(shelfManager), 'highway mode must reveal the vanishing point without changing the persisted shelf mode');
assert(/syncShelfSuppression\(active\)/.test(source), 'the highway runtime must keep the shelf hidden after later scene updates');
assert(/splash\.style\.display !== 'none'/.test(mainLoop), 'a hidden splash must never keep the main scene behind its warm-render gate');
assert(/dismissSplash\(\{ instant: true \}\)/.test(liveQa) && !/splash\.style\.display\s*=/.test(liveQa), 'live QA must dismiss startup through the app lifecycle instead of mutating splash styles');
assert(/basePresetRestored/.test(liveQa), 'live QA must verify that leaving Highway Drive restores ordinary visual layers');
assert(/capture\.snapshot\.celestial/.test(liveQa), 'live QA must verify celestial identity in rendered night skies');
assert(/celestialSeries/.test(liveQa) && /celestial3D/.test(liveQa), 'live QA must inspect every textured 3D celestial body');
assert(/InstancedMesh/.test(source) && /highway-landscape-root/.test(source), 'natural scenery must use bounded instanced geometry beside the road');
assert(/highway-landmark-root/.test(source) && /lateral = 9\.5/.test(source), 'landmarks must stay outside the road lanes');
assert(/highway-dynamic-sky/.test(source) && /new THREE\.Points/.test(source), 'weather must use one procedural sky and one shared precipitation pool');
assert(/new THREE\.SphereGeometry\(1, 48, 32\)/.test(source), 'night skies must render a true 3D sphere instead of a shader disc');
assert(/new THREE\.RingGeometry\(1\.26, 2\.16, 96, 2\)/.test(source), 'Saturn must have independent 3D ring geometry');
assert(/new THREE\.TextureLoader\(\)/.test(source) && /assets\/highway-planets\//.test(source), '3D planets must use packaged surface textures without runtime network access');
assert(!/celestialBody\(vec2 uv,float body\)/.test(source), 'the old flat procedural celestial disc must stay removed');
assert(/state\.celestialRoot\.position\.set\(0, 23, -76\)/.test(source), '3D planets must stay inside the camera-visible upper sky band');
let planetAssetBytes = 0;
planetAssetNames.forEach(name => {
  const assetPath = path.join(planetAssetDir, name);
  assert(fs.existsSync(assetPath), `packaged planet texture is missing: ${name}`);
  planetAssetBytes += fs.statSync(assetPath).size;
});
assert(planetAssetBytes < 1024 * 1024, 'packaged planet textures must stay below a 1 MB runtime budget');
assert(fs.readFileSync(path.join(planetAssetDir, 'LICENSE.txt'), 'utf8').includes('CC BY 4.0'), 'planet texture attribution must ship with the assets');

console.log('[OK] Highway Drive has stable scenery, comfortable curves, six dynamic skies, seven textured 3D celestial bodies, bounded precipitation, landmarks, eight-band response, and beat-linked speed.');
