import { lazy, Suspense, useState, type CSSProperties } from "react";
import {
  Anchor,
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  Crosshair,
  Expand,
  Info,
  Layers2,
  LoaderCircle,
  MapPin,
  Move,
  Navigation,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Ship,
  Timer,
  TriangleAlert,
  Waves,
} from "lucide-react";
import type { CameraMode } from "../../shared/simulation";
import type { SimulationModel } from "../services/useSimulation";
import { coordinate } from "../services/format";
import "../simulation.css";

const VoyageScene = lazy(() =>
  import("./simulation/VoyageScene").then((module) => ({
    default: module.VoyageScene,
  })),
);

function elapsedLabel(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = Math.floor(seconds % 60);
  return `${days ? `${days}d ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function distanceLabel(distance: number) {
  return distance.toLocaleString("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
}

export function SimulationDashboard({ model }: { model: SimulationModel }) {
  const [cameraMode, setCameraMode] = useState<CameraMode>("follow");
  const [showRoutes, setShowRoutes] = useState(true);
  const {
    fleet,
    selected,
    selectedImo,
    loading,
    error,
    playing,
    elapsedSeconds,
    durationSeconds,
  } = model;
  const nextStop = selected?.track.stops.find(
    (stop) => stop.distanceNm > selected.distanceNm + 0.05,
  );
  const arrived = selected
    ? selected.distanceNm >= selected.track.distanceNm
    : false;
  const remaining = selected
    ? Math.max(0, selected.track.distanceNm - selected.distanceNm)
    : 0;

  return (
    <div className="simulation-dashboard">
      <div className="simulation-heading">
        <div>
          <div className="simulation-kicker">
            <Box size={13} /> VOYAGE EXPERIENCE<span>01 / OCEAN VIEW</span>
          </div>
          <h1>
            Your fleet. <span>In motion.</span>
          </h1>
          <p>해상 항로를 따라 펼쳐지는, 생생한 3D 항해.</p>
        </div>
        <div className="simulation-disclosure">
          <span className="simulation-mode-badge">
            <span /> SIMULATION
          </span>
          <span>가상 위치 · 샘플 항해 일정</span>
        </div>
      </div>
      {error ? (
        <div className="simulation-error" role="alert">
          <TriangleAlert size={20} />
          <div>
            <strong>We couldn’t prepare the fleet.</strong>
            <span>{error}</span>
          </div>
          <button onClick={model.retry} disabled={loading}>
            Try again <ArrowRight size={14} />
          </button>
        </div>
      ) : null}
      {loading || !selected ? (
        <div className="simulation-loading" role="status">
          <div className="simulation-loading-icon">
            <Ship size={38} />
          </div>
          <span className="simulation-kicker">PREPARING YOUR VOYAGE</span>
          <h2>
            {error
              ? "The ocean can wait a moment."
              : "Setting a course for the open sea."}
          </h2>
          <p>
            {error
              ? "Please retry to load the vessel itineraries."
              : "선박과 해상 항로를 준비하고 있습니다."}
          </p>
          {!error ? <LoaderCircle className="is-spinning" size={20} /> : null}
        </div>
      ) : (
        <>
          <section
            className="simulation-viewport"
            aria-label="3D vessel simulation"
          >
            <div className="simulation-scene">
              <Suspense
                fallback={
                  <div className="scene-loading">
                    <LoaderCircle size={22} className="is-spinning" />
                    <span>Loading the 3D ocean…</span>
                  </div>
                }
              >
                <VoyageScene
                  fleet={fleet}
                  selectedImo={selectedImo}
                  cameraMode={cameraMode}
                  onCameraModeChange={setCameraMode}
                  onSelectVessel={model.selectVessel}
                  showRoutes={showRoutes}
                  playing={playing}
                  elapsedSeconds={elapsedSeconds}
                />
              </Suspense>
            </div>

            <aside
              className="simulation-fleet glass-panel"
              aria-label="Simulation fleet"
            >
              <div className="sim-panel-heading">
                <div>
                  <Radio size={14} />
                  <h2>Your fleet</h2>
                </div>
                <span>{String(fleet.length).padStart(2, "0")} VESSELS</span>
              </div>
              <div className="simulation-fleet-list">
                {fleet.map((item, index) => (
                  <button
                    className={`simulation-fleet-item ${item.vessel.imo === selectedImo ? "is-selected" : ""}`}
                    key={item.vessel.imo}
                    aria-label={`Select ${item.vessel.name}`}
                    aria-pressed={item.vessel.imo === selectedImo}
                    onClick={() => model.selectVessel(item.vessel.imo)}
                  >
                    <span className="sim-fleet-index">0{index + 1}</span>
                    <span className="sim-fleet-detail">
                      <strong>{item.vessel.name}</strong>
                      <span>
                        {item.position.progress >= 1 ? "Arrived" : "Under way"}
                        <i />
                        {item.speedKnots.toFixed(1)} kn
                      </span>
                      <span className="sim-fleet-progress">
                        <span
                          style={{ width: `${item.position.progress * 100}%` }}
                        />
                      </span>
                    </span>
                    <span className="sim-fleet-percent">
                      {Math.round(item.position.progress * 100)}
                      <small>%</small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="sim-fleet-footer">
                <Waves size={14} />
                <span>One ocean. Four journeys.</span>
                <span
                  className={`sim-play-indicator ${playing ? "is-playing" : ""}`}
                />
              </div>
            </aside>

            <div
              className="simulation-camera-controls"
              role="group"
              aria-label="Camera mode"
            >
              <button
                aria-label="Follow vessel"
                aria-pressed={cameraMode === "follow"}
                onClick={() => setCameraMode("follow")}
              >
                <Crosshair size={15} />
                <span>Follow vessel</span>
              </button>
              <button
                aria-label="Route overview"
                aria-pressed={cameraMode === "overview"}
                onClick={() => setCameraMode("overview")}
              >
                <Expand size={15} />
                <span>Overview</span>
              </button>
              <button
                aria-label="Free camera"
                aria-pressed={cameraMode === "free"}
                onClick={() => setCameraMode("free")}
              >
                <Move size={15} />
                <span>Free camera</span>
              </button>
            </div>

            <aside
              className="simulation-instruments glass-panel"
              aria-label="Selected simulated vessel"
            >
              <div className="sim-instrument-title">
                <span className="sim-label">VESSEL TELEMETRY</span>
                <span className="sim-synthetic-label">SYNTHETIC</span>
              </div>
              <h2>{selected.vessel.name}</h2>
              <div className="sim-vessel-subtitle">
                <Ship size={12} />
                Container vessel<span>IMO {selected.vessel.imo}</span>
              </div>
              <div className="sim-main-instruments">
                <div>
                  <span className="sim-label">SPEED</span>
                  <strong>
                    {selected.speedKnots.toFixed(1)}
                    <small>kn</small>
                  </strong>
                </div>
                <div>
                  <span className="sim-label">HEADING</span>
                  <strong>
                    {Math.round(selected.position.heading)}
                    <small>°</small>
                  </strong>
                </div>
              </div>
              <div
                className="sim-position"
                data-testid="simulation-position"
                data-imo={selected.vessel.imo}
                data-lat={selected.position.latitude}
                data-lng={selected.position.longitude}
                data-distance={selected.distanceNm}
                data-progress={selected.position.progress}
              >
                <MapPin size={13} />
                <span>
                  {coordinate(selected.position.latitude, "N", "S")}
                  <i />
                  {coordinate(selected.position.longitude, "E", "W")}
                </span>
              </div>
              <div className="sim-next-stop">
                <span className="sim-label">
                  {arrived ? "VOYAGE COMPLETE" : "NEXT PORT APPROACH"}
                </span>
                <strong>
                  <Anchor size={16} />
                  {nextStop?.portName ??
                    selected.track.stops.at(-1)?.portName ??
                    "Destination"}
                  <ArrowRight size={15} />
                </strong>
                <span>
                  {arrived
                    ? "The vessel has reached its final approach."
                    : `${distanceLabel(Math.max(0, (nextStop?.distanceNm ?? selected.track.distanceNm) - selected.distanceNm))} nm to the next approach`}
                </span>
              </div>
              <div className="sim-voyage-progress">
                <div>
                  <span className="sim-label">VOYAGE PROGRESS</span>
                  <strong>
                    {(selected.position.progress * 100).toFixed(1)}%
                  </strong>
                </div>
                <div className="sim-progress-track">
                  <span
                    style={{ width: `${selected.position.progress * 100}%` }}
                  />
                </div>
                <span>{distanceLabel(remaining)} nm remaining</span>
              </div>
            </aside>

            <div className="simulation-scene-caption">
              <span>
                <span
                  className={`sim-play-indicator ${playing ? "is-playing" : ""}`}
                />
                {arrived
                  ? "AT DESTINATION"
                  : playing
                    ? "SIMULATION RUNNING"
                    : "SIMULATION PAUSED"}
              </span>
              <span>3D vessels · Offshore waypoints</span>
            </div>
            <button
              className="simulation-routes-toggle"
              aria-label="Toggle sea routes"
              aria-pressed={showRoutes}
              onClick={() => setShowRoutes((value) => !value)}
            >
              <Layers2 size={15} />
              <span>Sea routes</span>
              <span className="sim-toggle-dot" />
            </button>

            <div
              className="simulation-playback glass-panel"
              aria-label="Simulation playback"
            >
              <div className="sim-playback-buttons">
                <button
                  className="sim-play-button"
                  aria-label={playing ? "Pause simulation" : "Play simulation"}
                  onClick={model.togglePlaying}
                  disabled={!playing && elapsedSeconds >= durationSeconds}
                >
                  {playing ? (
                    <Pause size={17} fill="currentColor" />
                  ) : (
                    <Play size={17} fill="currentColor" />
                  )}
                </button>
                <button
                  className="sim-restart-button"
                  aria-label="Restart simulation"
                  title="Restart simulation"
                  onClick={model.restart}
                >
                  <RotateCcw size={16} />
                </button>
              </div>
              <div className="sim-timeline">
                <div>
                  <span className="sim-label">
                    FLEET TIMELINE <span>· One shared clock</span>
                  </span>
                  <span>
                    <time
                      data-testid="simulation-time"
                      data-elapsed={elapsedSeconds}
                    >
                      {elapsedLabel(elapsedSeconds)}
                    </time>
                    <span> / {elapsedLabel(durationSeconds)}</span>
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Simulation timeline"
                  aria-valuetext={`${elapsedLabel(elapsedSeconds)} elapsed for all vessels`}
                  min="0"
                  max={durationSeconds}
                  step="1"
                  value={elapsedSeconds}
                  onChange={(event) => model.seek(Number(event.target.value))}
                  style={
                    {
                      "--timeline-progress": `${(elapsedSeconds / durationSeconds) * 100}%`,
                    } as CSSProperties
                  }
                />
              </div>
              <div className="sim-speed-selector">
                <label htmlFor="simulation-speed">
                  <Timer size={12} />
                  TIME SCALE
                </label>
                <div>
                  <select
                    id="simulation-speed"
                    aria-label="Simulation speed"
                    value={model.speed}
                    onChange={(event) =>
                      model.changeSpeed(Number(event.target.value))
                    }
                  >
                    <option value="1">1× real time</option>
                    <option value="60">60×</option>
                    <option value="600">600×</option>
                    <option value="3600">3,600×</option>
                  </select>
                  <ChevronDown size={13} />
                </div>
              </div>
            </div>
          </section>

          <section
            className="simulation-itinerary"
            aria-label="Simulated voyage itinerary"
          >
            <div className="sim-itinerary-intro">
              <span className="sim-label">THE VOYAGE AHEAD</span>
              <h2>
                {selected.vessel.name}
                <span> / {selected.track.stops.length} approaches</span>
              </h2>
              <p>항만 외해 접근점 · 샘플 일정</p>
            </div>
            <div className="sim-port-stops">
              {selected.track.stops.map((stop, index) => {
                const reached = selected.distanceNm >= stop.distanceNm;
                return (
                  <div
                    className={`sim-port-stop ${reached ? "is-reached" : ""} ${nextStop?.portCode === stop.portCode ? "is-next" : ""}`}
                    key={`${stop.portCode}-${index}`}
                  >
                    <span className="sim-port-node">
                      {reached ? <Check size={12} /> : index + 1}
                    </span>
                    <strong>{stop.portName}</strong>
                    <span>
                      {stop.portCode} <small>APPROACH</small>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
          <div className="simulation-footnote">
            <span>
              <Info size={13} />
              시뮬레이션 / 실제 운항용 아님. 가상 위치는 AIS 수신 위치와 별도로
              계산됩니다.
            </span>
            <span>
              <Navigation size={12} />
              Drag to orbit · Scroll to zoom
            </span>
          </div>
        </>
      )}
    </div>
  );
}
