import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CareerEvent,
  GameScreen,
  GameSettings,
  KeyBindings,
  LiveRaceSnapshot,
  PlayerProgress,
  RaceResultsData,
} from './types/game';
import { VEHICLES } from './data/vehicles';
import { TRACKS } from './data/tracks';
import { loadProgress, saveProgress } from './utils/storage';
import { RaceEngine } from './engine/RaceEngine';
import { RaceHUD } from './components/RaceHUD';
import { MenuOverlay } from './components/MenuScreens';
import { soundEngine } from './audio/SoundEngine';

export const App: React.FC = () => {
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RaceEngine | null>(null);

  const [progress, setProgress] = useState<PlayerProgress>(() => loadProgress());
  const [screen, setScreen] = useState<GameScreen>('MENU');
  const [hudSnapshot, setHudSnapshot] = useState<LiveRaceSnapshot | null>(null);
  const [lastResults, setLastResults] = useState<RaceResultsData | null>(null);

  // Race setup parameters
  const [raceLaps, setRaceLaps] = useState<number>(3);
  const [aiCount, setAiCount] = useState<number>(6);
  const [aiDifficulty, setAiDifficulty] = useState<number>(0.96);
  const [activeCareerEventId, setActiveCareerEventId] = useState<string | null>(null);

  const screenRef = useRef<GameScreen>(screen);
  screenRef.current = screen;

  const progressRef = useRef<PlayerProgress>(progress);
  progressRef.current = progress;

  const selectedVehicle = useMemo(
    () =>
      VEHICLES.find((v) => v.id === progress.selectedVehicleId) || VEHICLES[0],
    [progress.selectedVehicleId]
  );

  const selectedTrack = useMemo(
    () => TRACKS.find((t) => t.id === progress.selectedTrackId) || TRACKS[0],
    [progress.selectedTrackId]
  );

  const handleRaceComplete = useCallback((results: RaceResultsData) => {
    const curr = progressRef.current;
    const newFans = curr.fans + results.fansBreakdown.totalEarned;

    const unlockedSet = new Set(curr.unlockedVehicles);
    const newlyUnlocked: string[] = [];

    for (const v of VEHICLES) {
      if (newFans >= v.unlockFans && !unlockedSet.has(v.id)) {
        unlockedSet.add(v.id);
        newlyUnlocked.push(v.name);
      }
    }

    const updatedCompleted = { ...curr.completedEvents };
    if (results.careerEventId) {
      const prev = updatedCompleted[results.careerEventId];
      const playerRow = results.standings.find((r) => r.isPlayer);
      const timeMs = playerRow?.finishTime || 999999;
      updatedCompleted[results.careerEventId] = {
        bestPosition: prev
          ? Math.min(prev.bestPosition, results.playerPosition)
          : results.playerPosition,
        bestTimeMs: prev ? Math.min(prev.bestTimeMs, timeMs) : timeMs,
      };
    }

    const playerRow = results.standings.find((r) => r.isPlayer);
    const updatedProgress: PlayerProgress = {
      ...curr,
      fans: newFans,
      unlockedVehicles: Array.from(unlockedSet),
      completedEvents: updatedCompleted,
      careerStats: {
        racesCompleted: curr.careerStats.racesCompleted + 1,
        wins:
          curr.careerStats.wins + (results.playerPosition === 1 ? 1 : 0),
        totalPowerUpHits:
          curr.careerStats.totalPowerUpHits +
          (playerRow ? playerRow.stats.powerUpHits : 0),
        totalDrifts:
          curr.careerStats.totalDrifts +
          (playerRow ? Math.round(playerRow.stats.driftScore) : 0),
      },
    };

    saveProgress(updatedProgress);
    setProgress(updatedProgress);
    setLastResults({
      ...results,
      newlyUnlockedVehicles: newlyUnlocked,
    });
    setScreen('RESULTS');
  }, []);

  const handlePauseToggle = useCallback(() => {
    if (!engineRef.current) return;
    if (screenRef.current === 'RACING') {
      engineRef.current.setPaused(true);
      setScreen('PAUSED');
    } else if (screenRef.current === 'PAUSED') {
      engineRef.current.setPaused(false);
      setScreen('RACING');
    }
  }, []);

  // Initialize Three.js RaceEngine once
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const engine = new RaceEngine(
      canvasContainerRef.current,
      progressRef.current.settings,
      progressRef.current.keyBindings,
      (snapshot) => setHudSnapshot(snapshot),
      handleRaceComplete,
      handlePauseToggle
    );

    engineRef.current = engine;
    const initVehicle =
      VEHICLES.find((v) => v.id === progressRef.current.selectedVehicleId) ||
      VEHICLES[0];
    engine.enterShowroom(initVehicle);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [handleRaceComplete, handlePauseToggle]);

  const handleSelectVehicle = (vehicleId: string) => {
    const spec = VEHICLES.find((v) => v.id === vehicleId);
    if (!spec) return;
    const next: PlayerProgress = {
      ...progress,
      selectedVehicleId: vehicleId,
    };
    setProgress(next);
    saveProgress(next);
    engineRef.current?.updateShowroomVehicle(spec);
  };

  const handleSelectTrack = (trackId: string) => {
    const next: PlayerProgress = {
      ...progress,
      selectedTrackId: trackId,
    };
    setProgress(next);
    saveProgress(next);
  };

  const handleUpdateSettings = (settings: GameSettings) => {
    const next: PlayerProgress = {
      ...progress,
      settings,
    };
    setProgress(next);
    saveProgress(next);
    engineRef.current?.updateConfig(settings, next.keyBindings);
  };

  const handleUpdateKeyBindings = (keyBindings: KeyBindings) => {
    const next: PlayerProgress = {
      ...progress,
      keyBindings,
    };
    setProgress(next);
    saveProgress(next);
    engineRef.current?.updateConfig(next.settings, keyBindings);
  };

  const launchRace = (
    trackId: string,
    laps: number,
    opponents: number,
    difficulty: number,
    careerEventId: string | null
  ) => {
    soundEngine.init();
    const track = TRACKS.find((t) => t.id === trackId) || selectedTrack;
    setActiveCareerEventId(careerEventId);
    setRaceLaps(laps);
    setAiCount(opponents);
    setAiDifficulty(difficulty);
    setScreen('RACING');
    engineRef.current?.startRace(
      track,
      selectedVehicle,
      laps,
      opponents,
      difficulty,
      careerEventId
    );
  };

  const handleStartQuickRace = () => {
    launchRace(selectedTrack.id, raceLaps, aiCount, aiDifficulty, null);
  };

  const handleStartCareerEvent = (ev: CareerEvent) => {
    handleSelectTrack(ev.trackId);
    launchRace(ev.trackId, ev.laps, ev.aiCount, ev.aiDifficulty, ev.id);
  };

  const handleRestartRace = () => {
    launchRace(
      selectedTrack.id,
      raceLaps,
      aiCount,
      aiDifficulty,
      activeCareerEventId
    );
  };

  const handleQuitToMenu = () => {
    engineRef.current?.enterShowroom(selectedVehicle);
    setScreen('MENU');
  };

  return (
    <div className="game-viewport-wrapper">
      {/* Persistent Full-Screen Three.js WebGL Canvas */}
      <div ref={canvasContainerRef} className="webgl-canvas-mount" />

      {/* Live Race HUD Overlay */}
      {(screen === 'RACING' || screen === 'PAUSED') && engineRef.current && (
        <RaceHUD
          snapshot={hudSnapshot}
          settings={progress.settings}
          keyBindings={progress.keyBindings}
          onPause={handlePauseToggle}
          onToggleMute={() =>
            handleUpdateSettings({
              ...progress.settings,
              muted: !progress.settings.muted,
            })
          }
          mobileInput={engineRef.current.mobileInput}
          onTriggerPowerUp={() => engineRef.current?.triggerMobilePowerUp()}
          onSwitchPowerUp={() => engineRef.current?.triggerMobileSwitchSlot()}
        />
      )}

      {/* Menus, Garage, Career, Setup, Pause, & Results Overlay */}
      <MenuOverlay
        screen={screen}
        progress={progress}
        selectedVehicle={selectedVehicle}
        selectedTrack={selectedTrack}
        raceLaps={raceLaps}
        aiCount={aiCount}
        aiDifficulty={aiDifficulty}
        lastResults={lastResults}
        onNavigate={(nextScreen) => setScreen(nextScreen)}
        onSelectVehicle={handleSelectVehicle}
        onSelectTrack={handleSelectTrack}
        onChangeRaceConfig={(l, c, d) => {
          setRaceLaps(l);
          setAiCount(c);
          setAiDifficulty(d);
        }}
        onStartQuickRace={handleStartQuickRace}
        onStartCareerEvent={handleStartCareerEvent}
        onUpdateSettings={handleUpdateSettings}
        onUpdateKeyBindings={handleUpdateKeyBindings}
        onResumeRace={handlePauseToggle}
        onRestartRace={handleRestartRace}
        onQuitToMenu={handleQuitToMenu}
      />
    </div>
  );
};
