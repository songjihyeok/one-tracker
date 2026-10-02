import { useEffect, useMemo, useRef, useState } from 'react';
import { divIcon, latLngBounds, type LatLngTuple } from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { Anchor, Crosshair, Expand, Layers2, Map, Minus, Plus, Route, Ship } from 'lucide-react';
import type { Vessel } from '../../shared/types';
import { createVoyageTrack } from '../../shared/maritimeRoutes';
import { coordinate, formatUtc } from '../services/format';

export type MapFocus = { portCode: string; sequence: number };

function fitPadding(mapWidth: number) {
  // Reserve room for the permanent vessel label, including on a narrow screen.
  return {
    paddingTopLeft: [Math.min(60, mapWidth * 0.13), 70] as [number, number],
    paddingBottomRight: [Math.min(180, mapWidth * 0.45), 65] as [number, number],
  };
}

function portLabelPlacement(portCode: string) {
  if (['KRPUS', 'DEHAM'].includes(portCode)) return { direction: 'top' as const, offset: [0, -10] as [number, number] };
  if (['NLRTM', 'SGSIN'].includes(portCode)) return { direction: 'bottom' as const, offset: [0, 9] as [number, number] };
  if (['CNSHA', 'LKCMB'].includes(portCode)) return { direction: 'left' as const, offset: [-8, 0] as [number, number] };
  return { direction: 'right' as const, offset: [9, 0] as [number, number] };
}

function MapController({ vessel, focus, plannedPoints }: { vessel: Vessel; focus?: MapFocus; plannedPoints: LatLngTuple[] }) {
  const map = useMap();
  const vesselRef = useRef(vessel);
  vesselRef.current = vessel;

  useEffect(() => {
    const current = vesselRef.current;
    const points: LatLngTuple[] = current.route.slice(0, 3).map((port) => [port.latitude, port.longitude]);
    if (current.position) points.push([current.position.latitude, current.position.longitude]);
    if (points.length) map.fitBounds(latLngBounds(points), { ...fitPadding(map.getSize().x), maxZoom: 7, animate: false });
  }, [map, vessel.imo, Boolean(vessel.position)]);

  useEffect(() => {
    if (!focus) return;
    const port = vesselRef.current.route.find((item) => item.portCode === focus.portCode);
    if (port) map.flyTo([port.latitude, port.longitude], 7, { duration: 0.8 });
  }, [map, focus]);

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  const fitRoute = () => {
    // Include every offshore waypoint, including the Cape detour between port endpoints.
    const points: LatLngTuple[] = [...plannedPoints];
    if (vessel.position) points.push([vessel.position.latitude, vessel.position.longitude]);
    if (points.length) map.fitBounds(latLngBounds(points), { ...fitPadding(map.getSize().x), maxZoom: 7, animate: true });
  };

  return (
    <>
      <div className="map-view-actions" onClick={(event) => event.stopPropagation()}>
        <button className="map-fit-button" onClick={fitRoute} title="Show the complete itinerary"><Expand size={14} /> Fit route</button>
      </div>
      <div className="map-tools" onClick={(event) => event.stopPropagation()}>
        <button aria-label="Center on vessel" title="Center on vessel" disabled={!vessel.position} onClick={() => {
          if (vessel.position) map.flyTo([vessel.position.latitude, vessel.position.longitude], 6, { duration: 0.8 });
        }}><Crosshair size={18} /></button>
        <span className="map-tools-divider" />
        <button aria-label="Zoom in" title="Zoom in" onClick={() => map.zoomIn()}><Plus size={18} /></button>
        <button aria-label="Zoom out" title="Zoom out" onClick={() => map.zoomOut()}><Minus size={18} /></button>
      </div>
    </>
  );
}

function VesselLayers({ vessel, showRoute, plannedPoints }: { vessel: Vessel; showRoute: boolean; plannedPoints: LatLngTuple[] }) {
  const { position, route } = vessel;

  const vesselIcon = useMemo(() => divIcon({
    className: 'vessel-map-marker',
    html: `<span class="vessel-marker-halo"></span><span class="vessel-marker-arrow" style="transform:rotate(${position?.heading ?? position?.course ?? 0}deg)"><svg viewBox="0 0 28 38" width="28" height="38" fill="none"><path d="M14 2L24 15L22 33H6L4 15L14 2Z" fill="#C30979" stroke="white" stroke-width="2.5"/><path d="M14 10V26M9 20H19" stroke="white" stroke-width="1.5" opacity=".85"/></svg></span>`,
    iconSize: [48, 48], iconAnchor: [24, 24],
  }), [position?.heading, position?.course]);

  return (
    <>
      {showRoute && plannedPoints.length > 1 ? <Polyline positions={plannedPoints} pathOptions={{ color: '#BE167A', weight: 2, dashArray: '5 8', opacity: 0.72 }} /> : null}
      {route.map((port) => <Marker key={port.portCode} position={[port.latitude, port.longitude]} icon={divIcon({
        className: `port-map-marker port-map-marker--${port.status}`,
        html: '<span></span>', iconSize: [16, 16], iconAnchor: [8, 8],
      })} title={`${port.portName} — ${port.status}`}>
        <Tooltip permanent {...portLabelPlacement(port.portCode)} className={`port-tooltip port-tooltip--${port.status}`}>
          <span>{port.portName}</span><small>{port.status === 'next' ? 'NEXT PORT' : port.portCode}</small>
        </Tooltip>
        <Popup><div className="map-popup"><span className="eyebrow">{port.portCode} · {port.country}</span><strong>{port.portName}</strong><p>{port.status === 'departed' ? 'Sample departure' : 'Sample arrival'}<br />{formatUtc(port.status === 'departed' ? port.etd : port.eta, true)} UTC</p></div></Popup>
      </Marker>)}
      {position ? <Marker position={[position.latitude, position.longitude]} icon={vesselIcon} zIndexOffset={1000} title={vessel.name}>
        <Tooltip permanent direction="right" offset={[22, -5]} className="vessel-tooltip"><strong>{vessel.name}</strong><span>{position.speed === undefined ? 'Speed unavailable' : `${position.speed.toFixed(1)} kn`}<i />{vessel.source === 'demo' ? 'Sample position' : 'AIS position'}</span></Tooltip>
        <Popup><div className="map-popup"><span className="eyebrow">{vessel.source === 'demo' ? 'DEMO POSITION' : 'AIS POSITION'}</span><strong>{vessel.name}</strong><p>{coordinate(position.latitude, 'N', 'S')} / {coordinate(position.longitude, 'E', 'W')}</p><p>Received {formatUtc(position.updatedAt, true)} UTC</p></div></Popup>
      </Marker> : null}
    </>
  );
}

export function VesselMap({ vessel, focus }: { vessel: Vessel; focus?: MapFocus }) {
  const [showRoute, setShowRoute] = useState(true);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const failedTiles = useRef(0);
  // Reuse the same sea geometry for rendering and bounds. AIS remains independent.
  const plannedPoints = useMemo<LatLngTuple[]>(() => createVoyageTrack(vessel.route).coordinates.map(([longitude, latitude]) => [latitude, longitude]), [vessel.route]);

  return (
    <section className="map-panel" aria-label="Vessel location map">
      <div className="map-panel-heading">
        <div className="panel-title"><Map size={17} /><h2>Voyage map</h2></div>
        <button className={`route-toggle ${showRoute ? 'is-active' : ''}`} aria-pressed={showRoute} onClick={() => setShowRoute((shown) => !shown)}><Layers2 size={14} /><span>Route</span><span className="mini-switch" /></button>
      </div>
      <div className="map-surface">
        <MapContainer center={[21, 117]} zoom={4} minZoom={0} maxZoom={16} zoomControl={false} scrollWheelZoom attributionControl className="vessel-map">
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' eventHandlers={{
            tileerror: () => { failedTiles.current += 1; if (failedTiles.current > 4) setTilesUnavailable(true); },
            tileload: () => { failedTiles.current = 0; setTilesUnavailable(false); },
          }} />
          <VesselLayers vessel={vessel} showRoute={showRoute} plannedPoints={plannedPoints} />
          <MapController vessel={vessel} focus={focus} plannedPoints={plannedPoints} />
        </MapContainer>
        <div className="map-corner-label"><span className={`status-dot ${vessel.source === 'waiting' ? 'status-dot--amber' : ''}`} />{vessel.source === 'demo' ? 'SAMPLE POSITION' : vessel.source === 'waiting' ? 'AWAITING AIS POSITION' : 'AIS POSITION'}</div>
        {!vessel.position ? <div className="map-waiting"><Ship size={22} /><strong>Waiting for a position</strong><span>The itinerary is ready. The vessel will appear when AIS data arrives.</span></div> : null}
        {tilesUnavailable ? <div className="map-tile-notice" role="status">Map tiles are unavailable. Vessel and route data are still shown.</div> : null}
        <div className="map-disclaimer"><Route size={12} /> Illustrative sea route · not for navigation</div>
      </div>
      <div className="map-legend">
        <div><span className="legend-vessel" />Vessel<span className="legend-port" />Port<span className="legend-route" />Planned route</div>
        <span className="map-interaction-hint"><Anchor size={12} /> Select a port for details</span>
      </div>
    </section>
  );
}
