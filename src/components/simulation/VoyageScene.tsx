import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { CustomLayerInterface, GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import * as THREE from 'three';
import type { FeatureCollection, LineString } from 'geojson';
import type { SimulatedPosition, VoyageSceneProps } from '../../../shared/simulation';
import { sampleVoyage } from '../../../shared/maritimeRoutes';
import { createShipModel, disposeScene, type ShipModel } from './shipModel';
import { createOcean } from './ocean';
import { routeData } from './routeGeometry';
import 'maplibre-gl/dist/maplibre-gl.css';
import './VoyageScene.css';

// V6 uses an ESM worker; Vite must bundle its shared-module dependency too.
maplibregl.setWorkerUrl(mapWorkerUrl);

const FOLLOW_ZOOM = 16.4;
const FOLLOW_PITCH = 62;
const emptyLines: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] };
const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    land: { type: 'geojson', data: '/data/land.geojson' },
    satellite: {
      // The imagery service returns a gray watermark tile over open sea at high zoom.
      // Its complete global coverage ends at z12; overzoom those real ocean/coast tiles.
      type: 'raster', tileSize: 256, maxzoom: 12,
      tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    },
    routes: { type: 'geojson', data: emptyLines },
    traveled: { type: 'geojson', data: emptyLines },
  },
  layers: [
    { id: 'ocean-background', type: 'background', paint: { 'background-color': '#153943' } },
    { id: 'land-fallback', type: 'fill', source: 'land', paint: { 'fill-color': '#536357' } },
    { id: 'land-edge', type: 'line', source: 'land', paint: { 'line-color': '#85958b', 'line-width': .8 } },
    { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-saturation': -.22, 'raster-brightness-max': .83, 'raster-fade-duration': 300 } },
    { id: 'route-casing', type: 'line', source: 'routes', paint: { 'line-color': '#071d2c', 'line-width': 5, 'line-opacity': .4 } },
    { id: 'route-line', type: 'line', source: 'routes', paint: { 'line-color': '#f986c2', 'line-width': 1.5, 'line-dasharray': [3, 3], 'line-opacity': .7 } },
    { id: 'traveled-line', type: 'line', source: 'traveled', paint: { 'line-color': '#9ae9e3', 'line-width': 2.5, 'line-opacity': .9 } },
  ],
};

/** Equivalent longitude in the world copy nearest the current camera. */
function nearestWorldLongitude(longitude: number, reference: number) { return longitude + 360 * Math.round((reference - longitude) / 360); }

function shortestAngle(from: number, to: number) { return ((to - from + 540) % 360) - 180; }

type AnimatedShip = ShipModel & { distance: number; heading: number; marker: maplibregl.Marker; element: HTMLButtonElement; position: SimulatedPosition };
type SceneRuntime = { map: maplibregl.Map; updateRoutes: () => void; updateCamera: (instant?: boolean) => void; };

export function VoyageScene(props: VoyageSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const runtime = useRef<SceneRuntime | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [tileWarning, setTileWarning] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    let destroyed = false;
    let frame = 0;
    let map: maplibregl.Map;
    let renderer: THREE.WebGLRenderer | undefined;
    let lastFrame = performance.now();
    let waveTime = 0;
    let tileErrors = 0;
    let ready = false;
    let routeTime = 0;
    let lastSelected = latest.current.selectedImo;
    let lastCameraMode = latest.current.cameraMode;
    let cameraTransitionEnd = 0;
    let manualCamera = false;
    let renderedWorldOffset = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const ships = new Map<string, AnimatedShip>();
    const ocean = createOcean();
    scene.add(ocean.mesh);
    const sun = new THREE.DirectionalLight('#fff1dc', 3.1);
    sun.position.set(-400, -350, 800);
    scene.add(sun);
    const fill = new THREE.DirectionalLight('#a5d7ed', 1.6);
    fill.position.set(350, 500, 450);
    scene.add(fill);
    const ambient = new THREE.HemisphereLight('#d0edff', '#203e4c', 2.0);
    ambient.position.set(0, 0, 1);
    scene.add(ambient);
    const selected = () => latest.current.fleet.find(v => v.vessel.imo === latest.current.selectedImo) ?? latest.current.fleet[0];
    const start = selected()?.position ?? { longitude: 129, latitude: 34, heading: 180 };
    let origin = maplibregl.MercatorCoordinate.fromLngLat([start.longitude, start.latitude]);
    let scale = origin.meterInMercatorCoordinateUnits();
    const fail = (message: string) => {
      if (destroyed) return;
      setError(message);
      setStatus('error');
    };
    setStatus('loading');
    setTileWarning(false);
    try {
      map = new maplibregl.Map({
        container: host,
        style: mapStyle,
        center: [start.longitude, start.latitude],
        zoom: FOLLOW_ZOOM,
        pitch: FOLLOW_PITCH,
        bearing: start.heading - 40,
        maxPitch: 78,
        minZoom: 0,
        maxZoom: 18,
        canvasContextAttributes: { antialias: true, preserveDrawingBuffer: false },
        pixelRatio: Math.min(window.devicePixelRatio || 1, 1.75),
        attributionControl: { compact: true },
        renderWorldCopies: true,
        fadeDuration: 100,
      });
    } catch {
      disposeScene(scene);
      fail('이 브라우저에서 3D 그래픽을 시작할 수 없습니다. 하드웨어 가속을 켠 뒤 다시 시도해 주세요.');
      return;
    }

    function syncShips() {
      for (const vessel of latest.current.fleet) {
        if (ships.has(vessel.vessel.imo)) continue;
        const model = createShipModel(vessel.vessel.name, ships.size);
        scene.add(model.group);
        const element = document.createElement('button');
        element.className = 'voyage-scene__marker';
        element.type = 'button';
        element.setAttribute('aria-label', `${vessel.vessel.name} 선박 선택`);
        element.dataset.imo = vessel.vessel.imo;
        const dot = document.createElement('span');
        dot.className = 'voyage-scene__marker-dot';
        const label = document.createElement('span');
        label.className = 'voyage-scene__marker-label';
        label.textContent = vessel.vessel.name;
        element.append(dot, label);
        element.addEventListener('click', event => { event.stopPropagation(); latest.current.onSelectVessel(vessel.vessel.imo); });
        const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([vessel.position.longitude, vessel.position.latitude]).addTo(map);
        ships.set(vessel.vessel.imo, { ...model, marker, element, distance: vessel.position.progress * vessel.track.distanceNm, heading: vessel.position.heading, position: vessel.position });
      }
    }

    function updateRoutes() {
      if (!ready) return;
      const vessel = selected();
      (map.getSource('routes') as GeoJSONSource)?.setData(routeData(vessel));
      (map.getSource('traveled') as GeoJSONSource)?.setData(routeData(vessel, true));
      for (const id of ['route-casing', 'route-line', 'traveled-line']) {
        map.setLayoutProperty(id, 'visibility', latest.current.showRoutes ? 'visible' : 'none');
      }
    }

    function stopCameraTransition() {
      if (cameraTransitionEnd > performance.now()) map.stop();
      cameraTransitionEnd = 0;
    }

    function updateCamera(instant = false) {
      if (!ready) return;
      const vessel = selected();
      if (!vessel) return;
      const state = latest.current;
      if (state.cameraMode === 'overview') {
        manualCamera = false;
        const bounds = new maplibregl.LngLatBounds();
        vessel.track.coordinates.forEach(coordinate => bounds.extend(coordinate));
        const centerLongitude = bounds.getCenter().lng;
        const offset = nearestWorldLongitude(centerLongitude, map.getCenter().lng) - centerLongitude;
        bounds.setSouthWest([bounds.getWest() + offset, bounds.getSouth()]);
        bounds.setNorthEast([bounds.getEast() + offset, bounds.getNorth()]);
        const wide = host!.clientWidth > 900;
        cameraTransitionEnd = performance.now() + (instant ? 0 : 1200);
        map.fitBounds(bounds, { padding: { top: Math.min(110, host!.clientHeight * .2), bottom: Math.min(150, host!.clientHeight * .25), left: wide ? 290 : 30, right: wide ? 290 : 30 }, pitch: 0, bearing: 0, duration: instant ? 0 : 1200, maxZoom: 7.5 });
      } else if (state.cameraMode === 'follow') {
        manualCamera = false;
        const target = ships.get(vessel.vessel.imo)?.position ?? vessel.position;
        cameraTransitionEnd = performance.now() + (instant ? 0 : 950);
        map.easeTo({ center: [nearestWorldLongitude(target.longitude, map.getCenter().lng), target.latitude], zoom: FOLLOW_ZOOM, pitch: FOLLOW_PITCH, bearing: target.heading - 40, duration: instant ? 0 : 950 });
      } else {
        manualCamera = true;
        stopCameraTransition();
      }
    }
    runtime.current = { map, updateRoutes, updateCamera };

    const layer: CustomLayerInterface = {
      id: 'vessel-simulation-3d', type: 'custom', renderingMode: '3d',
      onAdd(_map, gl) {
        try {
          renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
          renderer.autoClear = false;
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.1;
          syncShips();
          ready = true;
          setStatus('ready');
        } catch {
          fail('3D 렌더링을 시작하지 못했습니다. 브라우저의 하드웨어 가속 설정을 확인해 주세요.');
        }
      },
      render(_gl, args) {
        if (!renderer || destroyed) return;
        const view = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
        const local = new THREE.Matrix4().makeTranslation(origin.x + renderedWorldOffset, origin.y, 0).scale(new THREE.Vector3(scale, -scale, scale));
        camera.projectionMatrix.copy(view.multiply(local));
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        renderer.resetState();
        renderer.render(scene, camera);
        renderer.resetState();
      },
    };

    map.on('load', () => {
      if (destroyed) return;
      try {
        map.addLayer(layer);
        updateRoutes();
        updateCamera(true);
      } catch {
        fail('3D 장면을 불러오지 못했습니다. 다시 시도해 주세요.');
      }
    });
    map.on('error', event => {
      if ('sourceId' in event && event.sourceId === 'satellite') {
        tileErrors++;
        if (tileErrors >= 4 && !destroyed) setTileWarning(true);
      }
    });
    map.on('sourcedata', event => {
      if (event.sourceId === 'satellite' && event.isSourceLoaded && tileErrors < 4 && !destroyed) setTileWarning(false);
    });
    const beginManualCamera = () => {
      manualCamera = true;
      // Called before native pointer gestures start, so cancelling a fit cannot reset them.
      stopCameraTransition();
      if (latest.current.cameraMode === 'follow') latest.current.onCameraModeChange('free');
    };
    const interaction = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) beginManualCamera();
    };
    // MapLibre's wheel handler consumes deltaY only. Preserve vertical zoom and
    // pinch zoom, while horizontal trackpad scrolling pans the repeated world.
    const horizontalWheel = (event: WheelEvent) => {
      if (latest.current.cameraMode === 'follow' || event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      event.stopPropagation();
      beginManualCamera();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? host!.clientWidth : 1;
      map.panBy([event.deltaX * unit, 0], { duration: 0 });
    };
    const canvas = map.getCanvas();
    const manualPointer = () => beginManualCamera();
    canvas.addEventListener('pointerdown', manualPointer, true);
    canvas.addEventListener('wheel', horizontalWheel, { capture: true, passive: false });
    map.on('dragstart', interaction);
    map.on('rotatestart', interaction);
    map.on('pitchstart', interaction);
    map.on('zoomstart', interaction);
    const contextLost = (event: Event) => {
      event.preventDefault();
      fail('그래픽 연결이 중단되었습니다. 다시 시작하면 현재 항로에서 이어집니다.');
    };
    map.getCanvas().addEventListener('webglcontextlost', contextLost);
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(host);

    function animate(now: number) {
      if (destroyed) return;
      const dt = Math.min((now - lastFrame) / 1000, .1);
      lastFrame = now;
      if (ready) {
        syncShips();
        const state = latest.current;
        if (state.playing) waveTime += dt;
        const selectedShip = selected();
        const changed = lastSelected !== state.selectedImo;
        if (changed) {
          const position = selectedShip?.position;
          if (position) {
            origin = maplibregl.MercatorCoordinate.fromLngLat([position.longitude, position.latitude]);
            scale = origin.meterInMercatorCoordinateUnits();
          }
        }
        // Rebasing at the observed ship prevents floating-point jitter on long voyages.
        if (selectedShip) {
          const projected = maplibregl.MercatorCoordinate.fromLngLat([selectedShip.position.longitude, selectedShip.position.latitude]);
          if (Math.hypot(projected.x - origin.x, projected.y - origin.y) / scale > 20000) {
            origin = projected;
            scale = origin.meterInMercatorCoordinateUnits();
          }
        }
        const viewLongitude = map.getCenter().lng;
        renderedWorldOffset = Math.round((viewLongitude - origin.toLngLat().lng) / 360);
        for (const vessel of state.fleet) {
          const ship = ships.get(vessel.vessel.imo)!;
          const target = vessel.position.progress * vessel.track.distanceNm;
          // Scrubs/reset/wrapped routes land immediately; ordinary motion is smoothed along sea waypoints.
          const seek = !state.playing || target < ship.distance || Math.abs(target - ship.distance) > Math.max(30, vessel.track.distanceNm * .02);
          ship.distance = seek ? target : ship.distance + (target - ship.distance) * (1 - Math.exp(-dt * 14));
          ship.position = sampleVoyage(vessel.track, ship.distance);
          ship.heading += shortestAngle(ship.heading, ship.position.heading) * (seek ? 1 : 1 - Math.exp(-dt * 4));
          const coordinate = maplibregl.MercatorCoordinate.fromLngLat([ship.position.longitude, ship.position.latitude]);
          const vesselWorldOffset = Math.round((viewLongitude - ship.position.longitude) / 360);
          ship.group.position.set((coordinate.x + vesselWorldOffset - origin.x - renderedWorldOffset) / scale, -(coordinate.y - origin.y) / scale, Math.sin(waveTime * 1.3) * .12);
          const size = coordinate.meterInMercatorCoordinateUnits() / scale;
          ship.group.scale.setScalar(size);
          ship.group.rotation.set(Math.sin(waveTime * .75) * .002, Math.cos(waveTime * .9) * .002, -ship.heading * Math.PI / 180);
          ship.wake.uniforms.uTime.value = waveTime;
          ship.wake.uniforms.uStrength.value = Math.min(1, vessel.speedKnots / 10);
          ship.element.dataset.selected = String(vessel.vessel.imo === state.selectedImo);
          const closeView = map.getZoom() >= 11;
          ship.group.visible = closeView;
          ship.element.style.display = closeView ? 'none' : 'flex';
          ship.marker.setLngLat([nearestWorldLongitude(ship.position.longitude, viewLongitude), ship.position.latitude]);
          const dot = ship.element.firstElementChild as HTMLElement;
          dot.style.transform = `rotate(${ship.position.heading - map.getBearing()}deg)`;
        }
        const focus = ships.get(state.selectedImo);
        if (focus) {
          ocean.mesh.position.x = focus.group.position.x;
          ocean.mesh.position.y = focus.group.position.y;
          ocean.material.uniforms.uOffset.value.set((origin.x / scale + focus.group.position.x) % 65536, (-origin.y / scale + focus.group.position.y) % 65536);
          ocean.material.uniforms.uTime.value = waveTime;
          ocean.material.uniforms.uOpacity.value = THREE.MathUtils.clamp((map.getZoom() - 10) / 3, 0, 1) * .94;
          ocean.mesh.visible = map.getZoom() > 10;
          if (sceneRef.current) {
            sceneRef.current.dataset.longitude = focus.position.longitude.toFixed(7);
            sceneRef.current.dataset.latitude = focus.position.latitude.toFixed(7);
            sceneRef.current.dataset.heading = focus.heading.toFixed(2);
            sceneRef.current.dataset.renderedShips = String(ships.size);
          }
          if (state.cameraMode === 'follow' && !manualCamera && !changed && now > cameraTransitionEnd) {
            const current = map.getCenter();
            const amount = 1 - Math.exp(-dt * 9);
            map.jumpTo({ center: [current.lng + (nearestWorldLongitude(focus.position.longitude, current.lng) - current.lng) * amount, current.lat + (focus.position.latitude - current.lat) * amount], bearing: map.getBearing() + shortestAngle(map.getBearing(), focus.heading - 40) * (1 - Math.exp(-dt * 2.4)) });
          }
        }
        if (changed || lastCameraMode !== state.cameraMode) updateCamera();
        if (sceneRef.current) {
          const center = map.getCenter();
          sceneRef.current.dataset.cameraLongitude = center.lng.toFixed(7);
          sceneRef.current.dataset.cameraLatitude = center.lat.toFixed(7);
          sceneRef.current.dataset.cameraZoom = map.getZoom().toFixed(4);
          sceneRef.current.dataset.cameraBearing = map.getBearing().toFixed(3);
          sceneRef.current.dataset.cameraPitch = map.getPitch().toFixed(3);
          sceneRef.current.dataset.worldCopies = String(map.getRenderWorldCopies());
        }
        lastSelected = state.selectedImo;
        lastCameraMode = state.cameraMode;
        if (now - routeTime > 250 || changed) { updateRoutes(); routeTime = now; }
        map.triggerRepaint();
      }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    const loadingTimer = window.setTimeout(() => {
      // Tile failures must not prevent the local sea surface and vessels from starting.
      if (!ready && !destroyed) {
        if (map.isStyleLoaded()) {
          try { map.addLayer(layer); updateRoutes(); updateCamera(true); } catch { fail('지도를 불러오는 시간이 길어지고 있습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.'); }
        } else fail('지도를 준비하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.');
      }
    }, 12000);
    return () => {
      destroyed = true;
      runtime.current = null;
      window.clearTimeout(loadingTimer);
      cancelAnimationFrame(frame);
      resize.disconnect();
      canvas.removeEventListener('wheel', horizontalWheel, true);
      canvas.removeEventListener('pointerdown', manualPointer, true);
      map.getCanvas().removeEventListener('webglcontextlost', contextLost);
      ships.forEach(ship => ship.marker.remove());
      renderer?.dispose();
      disposeScene(scene);
      map.remove();
    };
  }, [retry]);

  useEffect(() => { runtime.current?.updateRoutes(); }, [props.showRoutes]);

  return <div ref={sceneRef} className="voyage-scene" data-testid="voyage-scene" data-scene-status={status} data-camera-mode={props.cameraMode} aria-label="3D voyage simulation">
    <div ref={containerRef} className="voyage-scene__map" />
    <div className="voyage-scene__atmosphere" aria-hidden="true" />
    <span className="voyage-scene__sr" role="status">{status === 'ready' ? '3D 항해 시뮬레이션 준비 완료' : status === 'loading' ? '3D 항해 장면 준비 중' : '3D 장면 오류'}</span>
    {status === 'loading' && <div className="voyage-scene__loading">3D 항해 장면을 준비하고 있습니다</div>}
    {status === 'error' && <div className="voyage-scene__error" role="alert"><strong>3D 장면을 시작할 수 없습니다</strong><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>다시 시작</button></div>}
    {tileWarning && status === 'ready' && <div className="voyage-scene__tile-warning">위성 영상을 불러올 수 없어 기본 해안 지도를 표시합니다.</div>}
  </div>;
}
