"use client";

import { useState } from "react";
import type { BoardConfig, ThemeConfig, ColorTheme, SceneConfig, SceneId } from "../engine/types";
import { THEMES } from "../engine/types";
import type { Location } from "../engine/location";

const SCENE_LABELS: Record<SceneId, string> = {
  message: 'Message',
  datetime: 'Date/Time',
  weather: 'Weather',
  news: 'News',
  stocks: 'Stocks',
};

const TOGGLEABLE_SCENES: SceneId[] = ['datetime', 'weather', 'news', 'stocks'];

interface ControlPanelProps {
  config: BoardConfig;
  onConfigChange: (config: BoardConfig) => void;
  theme: ThemeConfig;
  onThemeChange: (theme: ThemeConfig) => void;
  onSend: (message: string) => void;
  maxChars: number;
  clockChars: number;
  sceneConfig: SceneConfig;
  onSceneConfigChange: (config: SceneConfig) => void;
  currentScene: SceneId;
  onNextScene: () => void;
  onResumeAutoRotate: () => void;
  location: Location | null;
  onRefreshWeather: () => void;
}

export default function ControlPanel({
  config,
  onConfigChange,
  theme,
  onThemeChange,
  onSend,
  maxChars,
  clockChars,
  sceneConfig,
  onSceneConfigChange,
  currentScene,
  onNextScene,
  onResumeAutoRotate,
  location,
  onRefreshWeather,
}: ControlPanelProps) {
  const [message, setMessage] = useState("");
  const availableChars = maxChars - (config.showClock ? clockChars : 0);

  const handleSend = () => {
    onSend(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const updateConfig = (partial: Partial<BoardConfig>) => {
    onConfigChange({ ...config, ...partial });
  };

  const selectTheme = (name: ColorTheme) => {
    if (name === "custom") {
      onThemeChange({ ...theme, theme: "custom" });
    } else {
      onThemeChange(THEMES[name]);
    }
  };

  const toggleScene = (scene: SceneId) => {
    const enabled = sceneConfig.enabled.includes(scene)
      ? sceneConfig.enabled.filter((s) => s !== scene)
      : [...sceneConfig.enabled, scene];
    onSceneConfigChange({ ...sceneConfig, enabled });
  };

  return (
    <div className="lg:w-80 xl:w-96 bg-neutral-950 border-t lg:border-t-0 lg:border-l border-neutral-800 overflow-y-auto pb-8 lg:pb-0 touch-manipulation">
      <div className="p-4 space-y-5">
        {/* Scenes */}
        <div>
          <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">
            Scenes
          </label>

          {/* Current scene indicator */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-neutral-300 text-sm">
                {SCENE_LABELS[currentScene] || currentScene}
              </span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={onNextScene}
                className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs rounded transition-colors"
              >
                Next
              </button>
              {!sceneConfig.autoRotate && (
                <button
                  onClick={onResumeAutoRotate}
                  className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-xs rounded transition-colors"
                >
                  Resume
                </button>
              )}
            </div>
          </div>

          {/* Scene toggles */}
          <div className="grid grid-cols-2 gap-1 mb-3">
            {TOGGLEABLE_SCENES.map((scene) => (
              <button
                key={scene}
                onClick={() => toggleScene(scene)}
                className={`px-2 py-1.5 text-xs rounded transition-colors ${
                  sceneConfig.enabled.includes(scene)
                    ? "bg-neutral-700 text-white"
                    : "bg-neutral-900 text-neutral-600 hover:text-neutral-400"
                }`}
              >
                {SCENE_LABELS[scene]}
              </button>
            ))}
          </div>

          {/* Auto-rotate toggle */}
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={sceneConfig.autoRotate}
              onChange={(e) =>
                onSceneConfigChange({
                  ...sceneConfig,
                  autoRotate: e.target.checked,
                })
              }
              className="accent-neutral-500"
            />
            <span className="text-neutral-400 text-sm">Auto-rotate</span>
          </label>

          {/* Rotation interval */}
          {sceneConfig.autoRotate && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-neutral-500 text-xs">Interval</span>
                <span className="text-neutral-600 text-xs font-mono">
                  {sceneConfig.rotationInterval}s
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={60}
                step={5}
                value={sceneConfig.rotationInterval}
                onChange={(e) =>
                  onSceneConfigChange({
                    ...sceneConfig,
                    rotationInterval: Number(e.target.value),
                  })
                }
                className="w-full accent-neutral-500"
              />
            </div>
          )}
        </div>

        {/* Weather info (when weather scene is enabled) */}
        {sceneConfig.enabled.includes('weather') && (
          <div>
            <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">
              Weather
            </label>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 text-sm">
                {location ? location.name : 'Locating...'}
              </span>
              <button
                onClick={onRefreshWeather}
                className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs rounded transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        )}

        {/* Message Input */}
        <div>
          <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">
            Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={3}
            className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 resize-none focus:outline-none focus:border-neutral-600 font-mono"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-neutral-600 text-xs">
              {message.length}/{availableChars}
            </span>
            <button
              onClick={handleSend}
              className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm rounded transition-colors"
            >
              Send
            </button>
          </div>
          {currentScene === 'message' && !sceneConfig.autoRotate && (
            <p className="text-neutral-600 text-xs mt-1">
              Auto-rotate paused. Press Resume to continue.
            </p>
          )}
        </div>

        {/* Theme */}
        <div>
          <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">
            Theme
          </label>
          <div className="flex gap-1">
            {(["classic", "vestaboard", "custom"] as const).map((t) => (
              <button
                key={t}
                onClick={() => selectTheme(t)}
                className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors capitalize ${
                  theme.theme === t
                    ? "bg-neutral-700 text-white"
                    : "bg-neutral-900 text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Custom colour pickers */}
          {theme.theme === "custom" && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-500 text-xs mb-1">
                  Flap BG
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.flapBg}
                    onChange={(e) =>
                      onThemeChange({ ...theme, flapBg: e.target.value })
                    }
                    className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                  />
                  <span className="text-neutral-600 text-xs font-mono">
                    {theme.flapBg}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-neutral-500 text-xs mb-1">
                  Text
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.flapText}
                    onChange={(e) =>
                      onThemeChange({ ...theme, flapText: e.target.value })
                    }
                    className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                  />
                  <span className="text-neutral-600 text-xs font-mono">
                    {theme.flapText}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Flip Speed */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-neutral-400 text-xs uppercase tracking-wider">
              Flip Speed
            </label>
            <span className="text-neutral-600 text-xs font-mono">
              {config.flipDuration}ms
            </span>
          </div>
          <input
            type="range"
            min={50}
            max={300}
            step={10}
            value={config.flipDuration}
            onChange={(e) =>
              updateConfig({ flipDuration: Number(e.target.value) })
            }
            className="w-full accent-neutral-500"
          />
        </div>

        {/* Cascade Delay */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-neutral-400 text-xs uppercase tracking-wider">
              Cascade Delay
            </label>
            <span className="text-neutral-600 text-xs font-mono">
              {config.cascadeDelay}ms
            </span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={config.cascadeDelay}
            onChange={(e) =>
              updateConfig({ cascadeDelay: Number(e.target.value) })
            }
            className="w-full accent-neutral-500"
          />
        </div>

        {/* Board Size */}
        <div>
          <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">
            Board Size
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-neutral-500 text-xs">Rows</span>
                <span className="text-neutral-600 text-xs font-mono">
                  {config.rows}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={8}
                value={config.rows}
                onChange={(e) =>
                  updateConfig({ rows: Number(e.target.value) })
                }
                className="w-full accent-neutral-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-neutral-500 text-xs">Cols</span>
                <span className="text-neutral-600 text-xs font-mono">
                  {config.cols}
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={40}
                value={config.cols}
                onChange={(e) =>
                  updateConfig({ cols: Number(e.target.value) })
                }
                className="w-full accent-neutral-500"
              />
            </div>
          </div>
        </div>

        {/* Clock */}
        <div>
          <label className="block text-neutral-400 text-xs uppercase tracking-wider mb-2">
            Clock
          </label>
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.showClock}
                onChange={(e) =>
                  updateConfig({ showClock: e.target.checked })
                }
                className="accent-neutral-500"
              />
              <span className="text-neutral-400 text-sm">Show clock</span>
            </label>

            {config.showClock && (
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    "top-left",
                    "top-right",
                    "bottom-left",
                    "bottom-right",
                  ] as const
                ).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => updateConfig({ clockPosition: pos })}
                    className={`px-2 py-1.5 text-xs rounded transition-colors ${
                      config.clockPosition === pos
                        ? "bg-neutral-700 text-white"
                        : "bg-neutral-900 text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    {pos.replace("-", " ")}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sound */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.sound}
              onChange={(e) => updateConfig({ sound: e.target.checked })}
              className="accent-neutral-500"
            />
            <span className="text-neutral-400 text-sm">Sound</span>
            <span className="text-neutral-700 text-xs">(coming soon)</span>
          </label>
        </div>
      </div>
    </div>
  );
}
