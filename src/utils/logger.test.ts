import logger from './logger';

describe('logger', () => {
  const originalLogLevel = process.env.LOG_LEVEL;

  afterEach(() => {
    process.env.LOG_LEVEL = originalLogLevel;
    jest.resetModules();
  });

  it('should be created with default log level of "info"', () => {
    delete process.env.LOG_LEVEL;
    const logger = require('./logger').default;
    expect(logger.level).toBe('info');
  });

  it('should be created with specified log level', () => {
    process.env.LOG_LEVEL = 'debug';
    const logger = require('./logger').default;
    expect(logger.level).toBe('debug');
  });
});
