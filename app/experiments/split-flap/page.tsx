"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ExperimentLayout from "@/components/ExperimentLayout";
import SplitFlapBoard from "./components/SplitFlapBoard";
import ControlPanel from "./components/ControlPanel";
import { sanitizeText } from "./engine/characters";
import { THEMES } from "./engine/types";
import type { BoardCell, BoardConfig, ThemeConfig, SceneConfig, SceneId } from "./engine/types";
import {
  createEmptyBoard,
  buildDateTimeScene,
  buildWeatherScene,
  buildNewsScene,
  buildStocksScene,
  MOCK_STOCKS,
} from "./engine/scenes";
import type { WeatherData, NewsItem, StockData } from "./engine/scenes";
import { getLocation } from "./engine/location";
import type { Location } from "./engine/location";

/** Get the clock cell positions for a given config */
function getClockCells(
  config: BoardConfig
): { row: number; startCol: number } | null {
  if (!config.showClock) return null;
  const clockLen = 5; // HH:MM
  const pos = config.clockPosition;
  const row = pos.startsWith("top") ? 0 : config.rows - 1;
  const startCol = pos.endsWith("right") ? config.cols - clockLen : 0;
  return { row, startCol };
}

/** Check if a cell is occupied by the clock */
function isClockCell(
  row: number,
  col: number,
  clockCells: { row: number; startCol: number } | null
): boolean {
  if (!clockCells) return false;
  return (
    row === clockCells.row &&
    col >= clockCells.startCol &&
    col < clockCells.startCol + 5
  );
}

/** Apply clock overlay to a BoardCell[][] board */
function applyClockOverlay(
  board: BoardCell[][],
  config: BoardConfig
): BoardCell[][] {
  if (!config.showClock) return board;
  const clockCells = getClockCells(config);
  if (!clockCells) return board;

  const now = new Date();
  const time = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const newBoard = board.map((row) => [...row]);
  for (let i = 0; i < 5 && i < time.length; i++) {
    const col = clockCells.startCol + i;
    if (col < config.cols && clockCells.row < config.rows) {
      // Clock uses theme defaults (no override)
      newBoard[clockCells.row][col] = { char: time[i] };
    }
  }
  return newBoard;
}

/** Convert a text message to a BoardCell[][] board */
function messageToBoard(
  text: string,
  config: BoardConfig
): BoardCell[][] {
  const board = createEmptyBoard(config.rows, config.cols);
  const totalCells = config.rows * config.cols;
  const clockCells = getClockCells(config);
  const sanitized = sanitizeText(text, totalCells);

  let charIdx = 0;
  for (let r = 0; r < config.rows; r++) {
    for (let c = 0; c < config.cols; c++) {
      if (isClockCell(r, c, clockCells)) continue;
      if (charIdx < sanitized.length) {
        board[r][c] = { char: sanitized[charIdx] };
        charIdx++;
      }
    }
  }

  return board;
}

const WELCOME_MESSAGE = "HELLO WORLD";

export default function SplitFlapPage() {
  const [config, setConfig] = useState<BoardConfig>({
    rows: 6,
    cols: 22,
    flipDuration: 100,
    cascadeDelay: 30,
    showClock: true,
    clockPosition: "top-right",
    sound: false,
  });

  const [theme, setTheme] = useState<ThemeConfig>(THEMES.classic);
  const [board, setBoard] = useState<BoardCell[][]>(() =>
    createEmptyBoard(6, 22)
  );

  const [sceneConfig, setSceneConfig] = useState<SceneConfig>({
    enabled: ['datetime', 'weather', 'news', 'stocks'],
    rotationInterval: 15,
    autoRotate: true,
  });

  const [currentScene, setCurrentScene] = useState<SceneId>('datetime');
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsIndex, setNewsIndex] = useState(0);
  const [stocksData, setStocksData] = useState<StockData[]>([]);
  const [location, setLocation] = useState<Location | null>(null);

  const lastMessageRef = useRef<string>(WELCOME_MESSAGE);
  const initializedRef = useRef(false);

  // ─── Data fetching ───────────────────────────────────────────────

  // Geolocation on mount
  useEffect(() => {
    getLocation().then((loc) => {
      setLocation(loc);
    });
  }, []);

  // Fetch weather when location is available
  useEffect(() => {
    if (!location) return;

    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `/api/weather?lat=${location.lat}&lon=${location.lon}`
        );
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const current = data.current;
        const daily = data.daily;
        setWeatherData({
          temperature: current?.temperature_2m ?? 0,
          weatherCode: current?.weather_code ?? 0,
          windSpeed: current?.wind_speed_10m ?? 0,
          humidity: current?.relative_humidity_2m ?? 0,
          location: location.name,
          high: daily?.temperature_2m_max?.[0] ?? 0,
          low: daily?.temperature_2m_min?.[0] ?? 0,
          isDay: current?.is_day === 1,
        });
      } catch {
        // Weather unavailable — leave null
        setWeatherData(null);
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [location]);

  // Fetch news
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch('/api/news');
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          setNewsItems(data.items);
        }
      } catch {
        // News unavailable
      }
    };

    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch stocks
  useEffect(() => {
    const fetchStocks = async () => {
      try {
        const res = await fetch('/api/stocks');
        const data = await res.json();
        if (data.stocks && data.stocks.length > 0) {
          setStocksData(data.stocks);
        } else {
          // Use mock data as fallback
          setStocksData(MOCK_STOCKS);
        }
      } catch {
        setStocksData(MOCK_STOCKS);
      }
    };

    fetchStocks();
    const interval = setInterval(fetchStocks, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ─── Scene rotation ──────────────────────────────────────────────

  useEffect(() => {
    if (!sceneConfig.autoRotate || sceneConfig.enabled.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentScene((prev) => {
        const idx = sceneConfig.enabled.indexOf(prev);
        const nextIdx = (idx + 1) % sceneConfig.enabled.length;
        return sceneConfig.enabled[nextIdx];
      });
    }, sceneConfig.rotationInterval * 1000);

    return () => clearInterval(interval);
  }, [sceneConfig]);

  // Advance news index when news scene is shown
  useEffect(() => {
    if (currentScene === 'news' && newsItems.length > 0) {
      setNewsIndex((prev) => (prev + 1) % newsItems.length);
    }
  }, [currentScene, newsItems.length]);

  // ─── Build board from current scene ──────────────────────────────

  const buildSceneBoard = useCallback(
    (scene: SceneId, cfg: BoardConfig): BoardCell[][] => {
      switch (scene) {
        case 'datetime':
          return buildDateTimeScene(cfg);

        case 'weather':
          if (weatherData) {
            return buildWeatherScene(cfg, weatherData);
          } else {
            // Fallback
            const board = createEmptyBoard(cfg.rows, cfg.cols);
            const msg = messageToBoard('WEATHER UNAVAILABLE', cfg);
            return msg;
          }

        case 'news':
          if (newsItems.length > 0) {
            const idx = newsIndex % newsItems.length;
            return buildNewsScene(cfg, newsItems[idx]);
          } else {
            return messageToBoard('NEWS UNAVAILABLE', cfg);
          }

        case 'stocks':
          if (stocksData.length > 0) {
            return buildStocksScene(cfg, stocksData);
          } else {
            return messageToBoard('STOCKS UNAVAILABLE', cfg);
          }

        case 'message':
          return messageToBoard(lastMessageRef.current, cfg);

        default:
          return createEmptyBoard(cfg.rows, cfg.cols);
      }
    },
    [weatherData, newsItems, newsIndex, stocksData]
  );

  // Update board when scene or data changes
  useEffect(() => {
    const sceneBoard = buildSceneBoard(currentScene, config);
    const withClock = applyClockOverlay(sceneBoard, config);
    setBoard(withClock);
  }, [currentScene, buildSceneBoard, config]);

  // Clock tick — update every second
  useEffect(() => {
    if (!config.showClock) return;

    const update = () => {
      setBoard((prev) => applyClockOverlay(prev, config));
    };

    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [config]);

  // DateTime scene needs per-second updates
  useEffect(() => {
    if (currentScene !== 'datetime') return;

    const update = () => {
      const sceneBoard = buildDateTimeScene(config);
      const withClock = applyClockOverlay(sceneBoard, config);
      setBoard(withClock);
    };

    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [currentScene, config]);

  // Initialize with welcome message then switch to datetime
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      const timeout = setTimeout(() => {
        setCurrentScene('message');
        const msgBoard = messageToBoard(WELCOME_MESSAGE, config);
        const withClock = applyClockOverlay(msgBoard, config);
        setBoard(withClock);

        // After 3 seconds, start auto-rotating
        const startRotation = setTimeout(() => {
          if (sceneConfig.autoRotate && sceneConfig.enabled.length > 0) {
            setCurrentScene(sceneConfig.enabled[0]);
          }
        }, 3000);
        return () => clearTimeout(startRotation);
      }, 300);
      return () => clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Handlers ────────────────────────────────────────────────────

  const handleSend = useCallback(
    (text: string) => {
      lastMessageRef.current = text;
      setCurrentScene('message');
      setSceneConfig((prev) => ({ ...prev, autoRotate: false }));
      const msgBoard = messageToBoard(text, config);
      const withClock = applyClockOverlay(msgBoard, config);
      setBoard(withClock);
    },
    [config]
  );

  const handleResumeAutoRotate = useCallback(() => {
    setSceneConfig((prev) => ({ ...prev, autoRotate: true }));
    if (sceneConfig.enabled.length > 0) {
      setCurrentScene(sceneConfig.enabled[0]);
    }
  }, [sceneConfig.enabled]);

  const handleNextScene = useCallback(() => {
    setCurrentScene((prev) => {
      const idx = sceneConfig.enabled.indexOf(prev);
      const nextIdx = (idx + 1) % sceneConfig.enabled.length;
      return sceneConfig.enabled[nextIdx];
    });
  }, [sceneConfig.enabled]);

  const handleConfigChange = useCallback(
    (newConfig: BoardConfig) => {
      const sizeChanged =
        newConfig.rows !== config.rows || newConfig.cols !== config.cols;

      setConfig(newConfig);

      if (sizeChanged) {
        // Rebuild board with new dimensions
        const sceneBoard = buildSceneBoard(currentScene, newConfig);
        const withClock = applyClockOverlay(sceneBoard, newConfig);
        setBoard(withClock);
      }
    },
    [config.rows, config.cols, buildSceneBoard, currentScene]
  );

  const handleRefreshWeather = useCallback(() => {
    if (!location) return;
    fetch(`/api/weather?lat=${location.lat}&lon=${location.lon}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) return;
        const current = data.current;
        const daily = data.daily;
        setWeatherData({
          temperature: current?.temperature_2m ?? 0,
          weatherCode: current?.weather_code ?? 0,
          windSpeed: current?.wind_speed_10m ?? 0,
          humidity: current?.relative_humidity_2m ?? 0,
          location: location.name,
          high: daily?.temperature_2m_max?.[0] ?? 0,
          low: daily?.temperature_2m_min?.[0] ?? 0,
          isDay: current?.is_day === 1,
        });
      })
      .catch(() => {});
  }, [location]);

  const maxChars = config.rows * config.cols;
  const clockChars = 5;

  return (
    <ExperimentLayout title="Split-Flap Display">
      <div className="flex flex-col lg:flex-row h-auto lg:h-full pt-12">
        {/* Board area */}
        <div className="h-[60vh] lg:h-auto lg:flex-1 min-h-0">
          <SplitFlapBoard board={board} config={config} theme={theme} />
        </div>

        {/* Control panel */}
        <ControlPanel
          config={config}
          onConfigChange={handleConfigChange}
          theme={theme}
          onThemeChange={setTheme}
          onSend={handleSend}
          maxChars={maxChars}
          clockChars={clockChars}
          sceneConfig={sceneConfig}
          onSceneConfigChange={setSceneConfig}
          currentScene={currentScene}
          onNextScene={handleNextScene}
          onResumeAutoRotate={handleResumeAutoRotate}
          location={location}
          onRefreshWeather={handleRefreshWeather}
        />
      </div>
    </ExperimentLayout>
  );
}
