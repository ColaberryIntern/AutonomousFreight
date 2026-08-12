/** Sense Layer barrel — the core imports adapters only through here. */
export * from './contract';
export * from './dat/datAdapter';
export { MockDatEngine } from './dat/mockDatEngine';
export * from './fmcsa/fmcsaAdapter';
export { MockFmcsaEngine } from './fmcsa/mockFmcsaEngine';
export * from './sylectus/sylectusAdapter';
export { MockSylectusEngine } from './sylectus/mockSylectusEngine';
export * from './email/emailAdapter';
export { MockEmailEngine } from './email/mockEmailEngine';
export { GmailApiEmailEngine, mapGmailMessage } from './email/gmailApiEmailEngine';
export { MsGraphEmailEngine, mapGraphMessage } from './email/msGraphEmailEngine';
export { stripHtml } from './email/htmlText';
export { parseEml } from './email/emlParser';
export type { ParsedEml, EmlParseOptions } from './email/emlParser';
