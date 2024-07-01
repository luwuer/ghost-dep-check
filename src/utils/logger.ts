export enum LogLevel {
  DEBUG,
  INFO,
  WARNING,
  ERROR,
}

export interface LoggerConfig {
  prefix?: string;
  level: LogLevel;
}

export class Logger {
  private config: LoggerConfig;

  constructor(config: LoggerConfig = { level: LogLevel.INFO }) {
    this.config = config;
  }

  setConfig(config: LoggerConfig) {
    Object.keys(config).forEach(key => {
      this.config[key] = config[key];
    });
  }

  log(level: LogLevel, message: any, ...optionalParams: any[]) {
    if (level >= this.config.level) {
      const levelName = this.getLogLevelName(level);
      console[levelName](`${this.config.prefix ? `[${this.config.prefix}] ` : ''}${message}`, ...optionalParams);
    }
  }

  debug(message: any, ...optionalParams: any[]) {
    this.log(LogLevel.DEBUG, message, ...optionalParams);
  }

  info(message: any, ...optionalParams: any[]) {
    this.log(LogLevel.INFO, message, ...optionalParams);
  }

  warning(message: any, ...optionalParams: any[]) {
    this.log(LogLevel.WARNING, message, ...optionalParams);
  }

  error(message: any, ...optionalParams: any[]) {
    this.log(LogLevel.ERROR, message, ...optionalParams);
  }

  private getLogLevelName(level: LogLevel): 'log' | 'info' | 'warn' | 'error' {
    switch (level) {
      case LogLevel.DEBUG:
        return 'log';
      case LogLevel.INFO:
        return 'info';
      case LogLevel.WARNING:
        return 'warn';
      case LogLevel.ERROR:
        return 'error';
      default:
        return 'log';
    }
  }
}

export default new Logger({ prefix: 'custom-logger', level: LogLevel.DEBUG });
