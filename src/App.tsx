import { useEffect, useRef, useState } from 'react';
import { Activity, Anchor, ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp, Clock3, Compass, ExternalLink, Globe2, Info, LoaderCircle, MapPin, Radio, RefreshCw, Ship, TriangleAlert, Waves, X } from 'lucide-react';
import type { FleetResponse, Vessel } from '../shared/types';
import { VesselMap, type MapFocus } from './components/VesselMap';
import { VesselIllustration } from './components/VesselIllustration';
import { coordinate, formatUtc, relativeTime } from './services/format';
import { useVessels } from './services/useVessels';
import { useSimulation } from './services/useSimulation';
import { SimulationDashboard } from './components/SimulationDashboard';

function InformationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return <dialog ref={dialog} className="information-dialog" onClose={onClose} aria-labelledby="about-title" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <div className="dialog-content">
      <div className="dialog-top"><span className="dialog-icon"><Compass size={24} /></span><button className="icon-button" aria-label="Close information" onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      <span className="eyebrow magenta-text">A LITTLE CONTEXT</span><h2 id="about-title">A clearer view of the voyage.</h2>
      <p className="dialog-intro">An independent MVP for exploring ONE vessel positions and upcoming port calls in one place.</p>
      <div className="dialog-detail"><span><Ship size={18} /></span><div><h3>Know your data</h3><p>Demo mode uses sample vessel positions. When the server is connected to AISStream, received positions are labeled AIS. Port itineraries and estimated times are always sample data.</p></div></div>
      <div className="dialog-detail"><span><Radio size={18} /></span><div><h3>Coverage varies at sea</h3><p>AIS reception is not continuous. Always check the position timestamp; a warning appears after 30 minutes. The tracker checks for updates every 15 seconds.</p></div></div>
      <div className="dialog-detail"><span><MapPin size={18} /></span><div><h3>See the connections</h3><p>The 3D simulation moves synthetic vessels along curated offshore waypoints. It uses a shared clock and never changes AIS positions. Both views show illustrative routes and offshore port approaches, not certified navigation guidance or actual vessel tracks.</p></div></div>
      <div className="dialog-footer"><span>Not an official ONE service.</span><a href="https://aisstream.io/" target="_blank" rel="noreferrer">About AISStream <ExternalLink size={13} /></a></div>
    </div>
  </dialog>;
}

function VesselOverview({ fleet, vessel, selectedImo, onSelect, now }: { fleet: FleetResponse; vessel: Vessel; selectedImo: string; onSelect: (imo: string) => void; now: number }) {
  const position = vessel.position;
  const previous = [...vessel.route].reverse().find((port) => port.status === 'departed');
  const next = vessel.route.find((port) => port.status === 'next');
  const isStale = position ? now - new Date(position.updatedAt).getTime() > 30 * 60_000 : false;
  return <aside className="overview-panel" aria-label="Selected vessel overview">
    <div className="overview-heading"><div className="panel-title"><Ship size={17} /><h2>{vessel.name}</h2></div><span className="small-count">{String(fleet.vessels.length).padStart(2, '0')} vessels</span></div>
    <div className="vessel-selector-wrap"><label htmlFor="vessel-selector" className="eyebrow">TRACKED VESSEL</label><div className="select-shell"><select id="vessel-selector" aria-label="Select vessel" value={selectedImo} onChange={(event) => onSelect(event.target.value)}>{fleet.vessels.map((item) => <option key={item.imo} value={item.imo}>{item.name}</option>)}</select><ChevronDown size={18} aria-hidden="true" /></div></div>
    <div className="vessel-profile"><div className="vessel-kind"><span>CONTAINER VESSEL</span><span>{vessel.flag}</span></div><VesselIllustration /><div className="vessel-identifiers"><span>IMO <strong>{vessel.imo}</strong></span><span>MMSI <strong>{vessel.mmsi}</strong></span></div></div>
    <div className="vessel-stats"><div><span className="stat-label"><Waves size={14} /> Speed</span><strong>{position?.speed?.toFixed(1) ?? '—'}<small>kn</small></strong><span className="stat-detail">Speed over ground</span></div><div><span className="stat-label"><Compass size={14} /> Course</span><strong>{position?.course === undefined ? '—' : Math.round(position.course)}<small>°</small></strong><span className="stat-detail">Heading {position?.heading === undefined ? 'unavailable' : `${Math.round(position.heading)}°`}</span></div></div>
    <div className="voyage-preview">
      <div className="port-connection"><span className="connection-dot" /><div><span className="eyebrow">PREVIOUS PORT</span><strong>{previous?.portName ?? 'Not available'}<small>{previous?.portCode}</small></strong></div><span className="departed-label">Departed</span></div>
      <div className="port-connection next-port"><span className="connection-dot" /><div><span className="eyebrow">NEXT PORT</span><strong>{next?.portName ?? 'Not available'}<small>{next?.portCode}</small></strong></div><ArrowDown size={16} /></div>
      <div className="eta-row"><span>Sample ETA</span><strong>{formatUtc(next?.eta)}<small>UTC</small></strong></div>
    </div>
    <div className={`position-update ${isStale ? 'position-update--stale' : ''}`}><div className="position-update-top"><span className="eyebrow">{vessel.source === 'demo' ? 'SAMPLE POSITION TIMESTAMP' : 'LAST AIS RECEIVED'}</span><Clock3 size={13} /></div>{position ? <><strong>{relativeTime(position.updatedAt, now)}{isStale ? <TriangleAlert size={13} /> : <span className="fresh-dot" />}</strong><time dateTime={position.updatedAt}>{formatUtc(position.updatedAt, true)} UTC</time>{isStale ? <span className="stale-note">Position is older than 30 minutes.</span> : null}</> : <><strong>Waiting for AIS</strong><span className="waiting-note">A position will appear when a signal is received.</span></>}</div>
  </aside>;
}

function PortItinerary({ vessel, onFocusPort }: { vessel: Vessel; onFocusPort: (portCode: string) => void }) {
  return <section className="itinerary-section" aria-labelledby="itinerary-title">
    <div className="section-heading"><div><div className="section-title"><h2 id="itinerary-title">Port itinerary</h2><span className="number-tag">{String(vessel.route.length).padStart(2, '0')}</span></div><p>The next chapters of this voyage.</p></div><span className="schedule-badge"><Info size={13} /> Sample schedule<span className="badge-divider" />All times UTC</span></div>
    <div className="itinerary-table-wrap"><table className="itinerary-table"><caption className="sr-only">Sample port itinerary for {vessel.name}</caption><thead><tr><th scope="col">PORT OF CALL</th><th scope="col">STATUS</th><th scope="col">ESTIMATED ARRIVAL <span>UTC</span></th><th scope="col">ESTIMATED DEPARTURE <span>UTC</span></th><th scope="col"><span className="sr-only">View on map</span></th></tr></thead><tbody>{vessel.route.map((port, index) => <tr key={port.portCode} className={port.status === 'next' ? 'itinerary-next' : ''}><td><button className="port-cell" onClick={() => onFocusPort(port.portCode)} title={`Locate ${port.portName} on map`}><span className={`port-order port-order--${port.status}`}>{port.status === 'departed' ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</span><span className="port-cell-name"><strong>{port.portName}<small>{port.portCode}</small></strong><span>{port.country}</span></span></button></td><td><span className={`port-status port-status--${port.status}`}>{port.status === 'departed' ? <Check size={11} /> : port.status === 'next' ? <span className="status-dot" /> : <span className="scheduled-dot" />}{port.status === 'next' ? 'Next port' : port.status === 'departed' ? 'Departed' : 'Scheduled'}</span></td><td>{formatUtc(port.eta, true)}</td><td>{formatUtc(port.etd, true)}</td><td><button className="port-locate-button" aria-label={`Locate ${port.portName} on map`} onClick={() => onFocusPort(port.portCode)}><ArrowUpRight size={17} /></button></td></tr>)}</tbody></table></div>
    <div className="itinerary-note"><Info size={13} /><span>Sample itinerary with offshore port approaches. Illustrated sea routes are not certified navigation guidance.</span></div>
  </section>;
}

function App() {
  const [view, setView] = useState<'simulation' | 'tracker'>(() => new URLSearchParams(window.location.search).get('view') === 'tracker' ? 'tracker' : 'simulation');
  const simulation = useSimulation(view === 'simulation');
  const { fleet, selectedImo, vessel, error, isRefreshing, lastChecked, refresh, selectVessel } = useVessels();
  const [informationOpen, setInformationOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [mapFocus, setMapFocus] = useState<MapFocus>();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const isDemo = vessel ? vessel.source === 'demo' : fleet?.mode === 'demo';
  const streamUnhealthy = vessel && ['error', 'reconnecting'].includes(vessel.streamStatus);

  const focusPort = (portCode: string) => {
    setMapFocus((previous) => ({ portCode, sequence: (previous?.sequence ?? 0) + 1 }));
    if (window.matchMedia('(max-width: 780px)').matches) document.querySelector('.map-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return <>
    <a className="skip-link" href="#main-content">Skip to vessel tracker</a>
    <header className="site-header"><div className="header-inner"><a className="brand" href="#main-content" aria-label="ONE Vessel Tracker home"><span className="one-wordmark">ONE</span><span className="brand-divider" /><span className="brand-title">Vessel Tracker<span>OCEAN NETWORK EXPRESS</span></span></a><nav aria-label="Main navigation" className="view-navigation"><button className={`nav-link ${view === 'simulation' ? 'is-active' : ''}`} aria-pressed={view === 'simulation'} onClick={() => setView('simulation')}><Compass size={16} />3D simulation</button><button className={`nav-link ${view === 'tracker' ? 'is-active' : ''}`} aria-pressed={view === 'tracker'} onClick={() => setView('tracker')}><Radio size={16} />AIS tracker</button></nav><div className="header-tools"><span className="timezone-label"><Globe2 size={14} /> UTC</span><button className="icon-button help-button" aria-label="About this tracker" onClick={() => setInformationOpen(true)}><CircleHelp size={19} /></button></div></div></header>
    <main id="main-content" className={view === 'simulation' ? 'simulation-main' : 'main-content'}>
      {view === 'simulation' ? <SimulationDashboard model={simulation} /> : <>
      <div className="page-intro"><div><div className="page-eyebrow"><span className="eyebrow-line" /> THE WORLD, CONNECTED</div><h1>Every voyage. <span>In view.</span></h1><p>A little clarity for a world in motion. Follow your vessel’s next move.</p></div><div className="page-actions"><span className={`environment-badge ${isDemo ? '' : 'environment-badge--live'}`}><span className="status-dot" />{isDemo ? 'Demo workspace' : vessel || fleet?.mode === 'live' ? 'AIS workspace' : 'Connecting'}</span><button className="refresh-button" aria-label="Refresh vessel data" disabled={isRefreshing} onClick={refresh}><RefreshCw size={15} className={isRefreshing ? 'is-spinning' : ''} /><span>{isRefreshing ? 'Refreshing' : 'Refresh'}</span></button></div></div>
      {error ? <div className="error-notice" role="alert"><TriangleAlert size={17} /><div><strong>{vessel ? 'Couldn’t refresh the latest data.' : 'Couldn’t load the tracker.'}</strong><span>{error}{vessel ? ' Your last received data is still displayed.' : ''}</span></div><button onClick={refresh} disabled={isRefreshing}>Try again <ArrowRight size={14} /></button></div> : null}
      {streamUnhealthy ? <div className="stream-notice" role="status"><Radio size={16} />AIS connection interrupted. Reconnecting automatically; the last received position is retained.</div> : null}
      {!vessel && fleet ? <div className="loading-toolbar"><div><label className="eyebrow" htmlFor="pending-vessel-selector">TRACKED VESSEL</label><div className="select-shell"><select id="pending-vessel-selector" aria-label="Select vessel" value={selectedImo} onChange={(event) => selectVessel(event.target.value)}>{fleet.vessels.map((item) => <option key={item.imo} value={item.imo}>{item.name}</option>)}</select><ChevronDown size={18} aria-hidden="true" /></div></div><span>{error ? 'Choose another vessel, or try refreshing.' : 'Loading the selected vessel…'}</span></div> : null}
      {vessel && fleet ? <>
        <div className="tracker-grid"><VesselOverview fleet={fleet} vessel={vessel} selectedImo={selectedImo} onSelect={(imo) => { setMapFocus(undefined); selectVessel(imo); }} now={now} /><VesselMap vessel={vessel} focus={mapFocus} /></div>
        <div className="tracking-context"><span><span className="status-dot" />{isDemo ? 'Sample position · demo mode' : vessel.source === 'waiting' ? 'Waiting for first AIS signal' : 'Position from AISStream'}<span className="context-divider" />{vessel.position ? `${coordinate(vessel.position.latitude, 'N', 'S')}  /  ${coordinate(vessel.position.longitude, 'E', 'W')}` : 'Position unavailable'}</span><span><Activity size={12} /> Checks every 15 seconds{lastChecked ? ` · Last checked ${lastChecked.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' })} UTC` : ''}</span></div>
        <PortItinerary vessel={vessel} onFocusPort={focusPort} />
      </> : !error ? <div className="loading-state" role="status"><span className="loading-ship"><Ship size={28} /></span><h2>Finding your next horizon.</h2><p>Loading vessels and port itineraries…</p><LoaderCircle size={20} className="is-spinning" /></div> : <div className="empty-state"><Waves size={40} /><h2>A momentary change of course.</h2><p>Check your connection and try refreshing the tracker.</p></div>}
      <footer className="site-footer"><span className="footer-brand"><span className="one-wordmark">ONE</span> Oceans of possibility.</span><span>Independent tracking MVP <span>·</span> Made for a world in motion <Waves size={15} /></span></footer>
      </>}
    </main>
    <InformationModal open={informationOpen} onClose={() => setInformationOpen(false)} />
  </>;
}

export default App;
