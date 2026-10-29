import { describe, expect, it } from 'vitest';
import { configOf, readConfig } from './config';

describe('readConfig', () => {
  it('runs production defaults when no test var is set', () => {
    expect(readConfig({ JURISDICTION: 'eu' })).toEqual({
      jurisdiction: 'eu',
      roomCap: 20,
      testRoutes: false,
      nonProduction: false,
    });
  });

  it('pins to the EU unless JURISDICTION is exactly "none"', () => {
    expect(readConfig({}).jurisdiction).toBe('eu');
    expect(readConfig({ JURISDICTION: '' }).jurisdiction).toBe('eu');
    expect(readConfig({ JURISDICTION: 'fedramp' }).jurisdiction).toBe('eu');
    expect(readConfig({ JURISDICTION: 'NONE' }).jurisdiction).toBe('eu');
    expect(readConfig({ JURISDICTION: 'none' }).jurisdiction).toBeNull();
  });

  it('lets HNCH_ROOM_CAP only lower the cap', () => {
    expect(readConfig({ HNCH_ROOM_CAP: '3' }).roomCap).toBe(3);
    expect(readConfig({ HNCH_ROOM_CAP: '1' }).roomCap).toBe(1);
    expect(readConfig({ HNCH_ROOM_CAP: '20' }).roomCap).toBe(20);
    expect(readConfig({ HNCH_ROOM_CAP: '21' }).roomCap).toBe(20);
    expect(readConfig({ HNCH_ROOM_CAP: '500' }).roomCap).toBe(20);
  });

  it('treats an invalid HNCH_ROOM_CAP as the production cap', () => {
    for (const bad of ['', '0', '-3', 'abc', '2.5', ' 4', '3x']) {
      expect(readConfig({ HNCH_ROOM_CAP: bad }).roomCap, bad).toBe(20);
    }
  });

  it('mounts the test routes only for HNCH_ENABLE_TEST_ROUTES="1"', () => {
    expect(readConfig({ HNCH_ENABLE_TEST_ROUTES: '1' }).testRoutes).toBe(true);
    for (const off of ['', '0', 'true', 'yes', '01']) {
      expect(readConfig({ HNCH_ENABLE_TEST_ROUTES: off }).testRoutes, off).toBe(false);
    }
  });

  it('flags a lowered cap or mounted test routes as non-production', () => {
    expect(readConfig({ HNCH_ROOM_CAP: '3' }).nonProduction).toBe(true);
    expect(readConfig({ HNCH_ENABLE_TEST_ROUTES: '1' }).nonProduction).toBe(true);
    expect(readConfig({ JURISDICTION: 'none' }).nonProduction).toBe(false);
  });
});

describe('configOf', () => {
  it('parses an env object once', () => {
    const env = { JURISDICTION: 'none' as const };
    expect(configOf(env)).toBe(configOf(env));
  });
});
