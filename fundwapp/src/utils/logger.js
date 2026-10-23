import config from '../config/index.js';

const stamp = () => new Date().toISOString();
const fmt = (level, msg, meta) => {
  const extra = meta === undefined ? '' : ` ${meta instanceof Error ? meta.stack || meta.message : JSON.stringify(meta)}`;
  return `${stamp()} ${level.padEnd(5)} ${msg}${extra}`;
};

export const logger = {
  debug: (msg, meta) => { if (!config.isProd) console.debug(fmt('DEBUG', msg, meta)); },
  info: (msg, meta) => console.log(fmt('INFO', msg, meta)),
  warn: (msg, meta) => console.warn(fmt('WARN', msg, meta)),
  error: (msg, meta) => console.error(fmt('ERROR', msg, meta)),
};
