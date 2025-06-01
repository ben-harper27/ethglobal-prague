/**
 * Logger utility with color-coded console outputs
 */
import chalk from 'chalk';

// Define types for the logger
type LoggerMessage = string | number | boolean | object;
type LoggerArgs = any[];
type LogFunction = (message: LoggerMessage, ...args: LoggerArgs) => void;

interface Logger {
  info: LogFunction;
  success: LogFunction;
  warn: LogFunction;
  error: LogFunction;
  debug: LogFunction;
  system: LogFunction;
  auth: LogFunction;
  ws: LogFunction;
  nitro: LogFunction;
  game: LogFunction;
  data: (label: string, data: unknown) => void;
}

// Log level colors
const colors = {
  info: chalk.blue,
  success: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
  debug: chalk.magenta,
  system: chalk.cyan,
  auth: chalk.hex('#FF8800'),
  ws: chalk.hex('#00AAFF'),
  nitro: chalk.hex('#9900FF'),
  game: chalk.hex('#00FF99')
};

// Timestamp generator
const timestamp = (): string => {
  const now = new Date();
  return chalk.gray(`[${now.toISOString().split('T')[1].slice(0, -1)}]`);
};

// Logger implementation
export const logger: Logger = {
  info: (message: LoggerMessage, ...args: LoggerArgs) => console.log(timestamp(), colors.info('INFO'), message, ...args),
  success: (message: LoggerMessage, ...args: LoggerArgs) => console.log(timestamp(), colors.success('SUCCESS'), message, ...args),
  warn: (message: LoggerMessage, ...args: LoggerArgs) => console.warn(timestamp(), colors.warn('WARNING'), message, ...args),
  error: (message: LoggerMessage, ...args: LoggerArgs) => console.error(timestamp(), colors.error('ERROR'), message, ...args),
  debug: (message: LoggerMessage, ...args: LoggerArgs) => console.debug(timestamp(), colors.debug('DEBUG'), message, ...args),
  system: (message: LoggerMessage, ...args: LoggerArgs) => console.log(timestamp(), colors.system('SYSTEM'), message, ...args),
  auth: (message: LoggerMessage, ...args: LoggerArgs) => console.log(timestamp(), colors.auth('AUTH'), message, ...args),
  ws: (message: LoggerMessage, ...args: LoggerArgs) => console.log(timestamp(), colors.ws('WEBSOCKET'), message, ...args),
  nitro: (message: LoggerMessage, ...args: LoggerArgs) => console.log(timestamp(), colors.nitro('NITROLITE'), message, ...args),
  game: (message: LoggerMessage, ...args: LoggerArgs) => console.log(timestamp(), colors.game('GAME'), message, ...args),
  
  // Special format for objects/data
  data: (label: string, data: unknown) => {
    console.log(
      timestamp(), 
      chalk.hex('#888888')('DATA'), 
      chalk.cyan(label + ':'),
      typeof data === 'object' ? '\n' + JSON.stringify(data, null, 2) : data
    );
  }
};

export default logger;