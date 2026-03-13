import type { BoardCell, BoardConfig } from './types';

export interface SceneData {
  board: BoardCell[][];
}

/** Create an empty board of BoardCells */
export function createEmptyBoard(rows: number, cols: number): BoardCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ char: ' ' }))
  );
}

/** Write text to a specific row, starting at a column */
function writeRow(
  board: BoardCell[][],
  row: number,
  col: number,
  text: string,
  opts?: { flapBg?: string; flapText?: string }
): void {
  for (let i = 0; i < text.length && col + i < (board[0]?.length ?? 0); i++) {
    if (row >= 0 && row < board.length) {
      board[row][col + i] = {
        char: text[i].toUpperCase(),
        flapBg: opts?.flapBg,
        flapText: opts?.flapText,
      };
    }
  }
}

// ─── Date/Time helpers ───────────────────────────────────────────────

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getDayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

// ─── Scene: Date/Time ────────────────────────────────────────────────

export function buildDateTimeScene(config: BoardConfig): BoardCell[][] {
  const board = createEmptyBoard(config.rows, config.cols);
  const now = new Date();

  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dayName = now.toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase();
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();

  const weekNum = getWeekNumber(now);
  const dayOfYear = getDayOfYear(now);

  // Layout (6 rows × 22 cols):
  // Row 0: right-aligned time HH:MM:SS
  // Row 1: (empty)
  // Row 2: day name (WEDNESDAY)
  // Row 3: date (12 MARCH 2025)
  // Row 4: (empty)
  // Row 5: WEEK 11    DAY 071

  writeRow(board, 0, config.cols - time.length, time);
  writeRow(board, 2, 0, dayName);
  writeRow(board, 3, 0, date);
  writeRow(board, 5, 0, `WEEK ${String(weekNum).padStart(2, '0')}    DAY ${String(dayOfYear).padStart(3, '0')}`);

  return board;
}

// ─── Scene: Weather ──────────────────────────────────────────────────

export interface WeatherData {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  humidity: number;
  location: string;
  high: number;
  low: number;
  isDay: boolean;
}

// WMO weather codes → description + colour scheme
function getWeatherInfo(code: number): {
  description: string;
  iconType: 'sun' | 'cloud' | 'sun-cloud' | 'rain' | 'snow' | 'thunder' | 'fog';
  textColor: string;
  iconColor: string;
} {
  if (code === 0) return { description: 'CLEAR SKY', iconType: 'sun', textColor: '#ffcc00', iconColor: '#ffcc00' };
  if (code <= 3) return {
    description: code === 1 ? 'MAINLY CLEAR' : code === 2 ? 'PARTLY CLOUDY' : 'OVERCAST',
    iconType: code <= 2 ? 'sun-cloud' : 'cloud',
    textColor: '#cccccc',
    iconColor: '#cccccc',
  };
  if (code === 45 || code === 48) return { description: 'FOG', iconType: 'fog', textColor: '#999999', iconColor: '#999999' };
  if (code >= 51 && code <= 55) return { description: 'DRIZZLE', iconType: 'rain', textColor: '#6699cc', iconColor: '#6699cc' };
  if (code >= 61 && code <= 65) return { description: code <= 63 ? 'RAIN' : 'HEAVY RAIN', iconType: 'rain', textColor: '#4488cc', iconColor: '#4488cc' };
  if (code >= 71 && code <= 75) return { description: 'SNOW', iconType: 'snow', textColor: '#aaddff', iconColor: '#aaddff' };
  if (code >= 80 && code <= 82) return { description: 'SHOWERS', iconType: 'rain', textColor: '#4488cc', iconColor: '#4488cc' };
  if (code >= 95) return { description: 'THUNDERSTORM', iconType: 'thunder', textColor: '#ff6600', iconColor: '#ffcc00' };
  return { description: 'UNKNOWN', iconType: 'cloud', textColor: '#cccccc', iconColor: '#cccccc' };
}

// Temperature colour: cold=blue, mild=white, warm=orange, hot=red
function getTempColor(temp: number): string {
  if (temp <= 0) return '#88bbff';
  if (temp <= 10) return '#aaccee';
  if (temp <= 20) return '#ffffff';
  if (temp <= 30) return '#ffaa44';
  return '#ff4444';
}

// ASCII weather icons (6 rows × 6 cols each)
const WEATHER_ICONS: Record<string, { rows: string[]; color: string; secondaryColor?: string }> = {
  'sun': {
    rows: [
      '\\  /  ',
      ' .-. ',
      '/ _ \\',
      '\\ _ /',
      ' \'-\' ',
      '/  \\  ',
    ],
    color: '#ffcc00',
  },
  'cloud': {
    rows: [
      '      ',
      ' .--. ',
      '(    )',
      '(____)',
      '      ',
      '      ',
    ],
    color: '#cccccc',
  },
  'sun-cloud': {
    rows: [
      '  \\ / ',
      '- .-. ',
      ' (   )',
      ' (___)',
      '      ',
      '      ',
    ],
    color: '#cccccc',
    secondaryColor: '#ffcc00',
  },
  'rain': {
    rows: [
      ' .--. ',
      '(    )',
      '(____)',
      ' , , ,',
      '  , , ',
      '      ',
    ],
    color: '#cccccc',
    secondaryColor: '#4488cc',
  },
  'snow': {
    rows: [
      ' .--. ',
      '(    )',
      '(____)',
      ' * * *',
      '  * * ',
      '      ',
    ],
    color: '#cccccc',
    secondaryColor: '#aaddff',
  },
  'thunder': {
    rows: [
      ' .--. ',
      '(    )',
      '(____)',
      '  /   ',
      ' /    ',
      '      ',
    ],
    color: '#666666',
    secondaryColor: '#ffcc00',
  },
  'fog': {
    rows: [
      '      ',
      '------',
      ' ---- ',
      '------',
      ' ---- ',
      '      ',
    ],
    color: '#999999',
  },
};

export function buildWeatherScene(config: BoardConfig, weather: WeatherData): BoardCell[][] {
  const board = createEmptyBoard(config.rows, config.cols);
  const info = getWeatherInfo(weather.weatherCode);
  const icon = WEATHER_ICONS[info.iconType] || WEATHER_ICONS['cloud'];

  // Draw ASCII icon on the left side (cols 0-5, rows 0-5)
  const iconRows = icon.rows;
  for (let r = 0; r < Math.min(iconRows.length, config.rows); r++) {
    const line = iconRows[r];
    for (let c = 0; c < Math.min(line.length, 6); c++) {
      if (line[c] !== ' ') {
        let cellColor = icon.color;
        if (icon.secondaryColor) {
          if (r >= 3 && (line[c] === ',' || line[c] === '*' || line[c] === '/')) {
            cellColor = icon.secondaryColor;
          }
          if (info.iconType === 'sun-cloud' && r <= 1 && (line[c] === '\\' || line[c] === '/' || line[c] === '-')) {
            cellColor = icon.secondaryColor;
          }
        }
        board[r][c] = { char: line[c], flapText: cellColor };
      }
    }
  }

  // Right side: weather data (starting at col 7)
  const dataCol = 7;
  const tempColor = getTempColor(weather.temperature);

  // Row 0: Location + time
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const locText = weather.location.toUpperCase().substring(0, config.cols - dataCol - 6);
  writeRow(board, 0, dataCol, locText);
  writeRow(board, 0, config.cols - 5, time);

  // Row 1: Weather description (coloured)
  writeRow(board, 1, dataCol, info.description, { flapText: info.textColor });

  // Row 2: Temperature (coloured by temp)
  const tempStr = `${Math.round(weather.temperature)}C`;
  writeRow(board, 2, dataCol, tempStr, { flapText: tempColor });
  writeRow(board, 2, dataCol + tempStr.length + 1, `WIND ${Math.round(weather.windSpeed)}KMH`);

  // Row 3: High/Low
  const highColor = getTempColor(weather.high);
  const lowColor = getTempColor(weather.low);
  writeRow(board, 3, dataCol, 'HIGH ');
  writeRow(board, 3, dataCol + 5, `${Math.round(weather.high)}`, { flapText: highColor });
  const highLen = `${Math.round(weather.high)}`.length;
  writeRow(board, 3, dataCol + 5 + highLen + 1, 'LOW ');
  writeRow(board, 3, dataCol + 5 + highLen + 5, `${Math.round(weather.low)}`, { flapText: lowColor });

  // Row 4: Humidity
  writeRow(board, 4, dataCol, `HUMIDITY ${weather.humidity}%`);

  return board;
}

// ─── Scene: News ─────────────────────────────────────────────────────

export interface NewsItem {
  title: string;
  source: string;
}

export function buildNewsScene(config: BoardConfig, news: NewsItem): BoardCell[][] {
  const board = createEmptyBoard(config.rows, config.cols);

  // Row 0: Source + time
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  writeRow(board, 0, 0, news.source.toUpperCase().substring(0, config.cols - 6));
  writeRow(board, 0, config.cols - 5, time);

  // Rows 2+: Headline text, word-wrapped
  const words = news.title.toUpperCase().split(' ');
  let row = 2;
  let col = 0;

  for (const word of words) {
    if (col + word.length > config.cols && col > 0) {
      row++;
      col = 0;
    }
    if (row >= config.rows) break;

    writeRow(board, row, col, word);
    col += word.length + 1;
  }

  return board;
}

// ─── Scene: Stocks ───────────────────────────────────────────────────

export interface StockData {
  symbol: string;
  price: number;
  changePercent: number;
}

export function buildStocksScene(config: BoardConfig, stocks: StockData[]): BoardCell[][] {
  const board = createEmptyBoard(config.rows, config.cols);

  // Row 0: Header
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  writeRow(board, 0, 0, 'MARKETS');
  writeRow(board, 0, config.cols - 5, time);

  // Rows 1-5: Stock tickers
  for (let i = 0; i < Math.min(stocks.length, config.rows - 1); i++) {
    const stock = stocks[i];
    const row = i + 1;
    const isUp = stock.changePercent >= 0;
    const color = isUp ? '#44cc44' : '#cc4444';
    const arrow = isUp ? '+' : '';

    // Symbol (white)
    writeRow(board, row, 0, stock.symbol.padEnd(6));

    // Price (white)
    const priceStr = stock.price.toFixed(2);
    writeRow(board, row, 7, priceStr);

    // Change % (coloured green/red)
    const changeStr = `${arrow}${stock.changePercent.toFixed(1)}%`;
    writeRow(board, row, config.cols - changeStr.length, changeStr, { flapText: color });
  }

  return board;
}

// ─── Mock data fallbacks ─────────────────────────────────────────────

export const MOCK_STOCKS: StockData[] = [
  { symbol: 'AAPL', price: 189.42, changePercent: 1.2 },
  { symbol: 'GOOGL', price: 176.50, changePercent: -0.3 },
  { symbol: 'MSFT', price: 415.20, changePercent: 0.8 },
  { symbol: 'TSLA', price: 248.91, changePercent: 3.7 },
  { symbol: 'AMZN', price: 185.60, changePercent: 0.5 },
];
