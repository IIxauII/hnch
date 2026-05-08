import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { observeSessionEnd } from './session-end-observer.js';

function flushSetImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('observeSessionEnd', () => {
  it('fires once at registration when sessionEndedAt already set (snapshot-borne F11)', async () => {
    const doc = new Y.Doc();
    // Pre-populate BEFORE registering the observer — simulates snapshot delivered before join
    doc.getMap('meta').set('sessionEndedAt', 1000);

    const onEnded = vi.fn();
    observeSessionEnd({ doc, localParticipantId: 'p1', onEnded });

    // No extra writes — handler() at registration fires via setImmediate
    await flushSetImmediate();
    expect(onEnded).toHaveBeenCalledOnce();
    expect(onEnded.mock.calls[0][0].timestamp).toBe(1000);
  });

  it('fires when snapshot is applied via Y.applyUpdate after observer registered', async () => {
    // Build a separate doc with sessionEndedAt set, encode it as a snapshot
    const sourceDoc = new Y.Doc();
    sourceDoc.getMap('meta').set('sessionEndedAt', 7000);
    const update = Y.encodeStateAsUpdate(sourceDoc);

    // Fresh doc — no sessionEndedAt yet
    const doc = new Y.Doc();
    const onEnded = vi.fn();
    observeSessionEnd({ doc, localParticipantId: 'p1', onEnded });

    // Simulate relay delivering snapshot after observer is registered
    Y.applyUpdate(doc, update);
    await flushSetImmediate();
    expect(onEnded).toHaveBeenCalledOnce();
    expect(onEnded.mock.calls[0][0].timestamp).toBe(7000);
  });

  it('does not fire again on duplicate write of same value', async () => {
    const doc = new Y.Doc();
    const onEnded = vi.fn();

    observeSessionEnd({ doc, localParticipantId: 'p1', onEnded });

    doc.getMap('meta').set('sessionEndedAt', 2000);
    await flushSetImmediate();
    expect(onEnded).toHaveBeenCalledOnce();

    doc.getMap('meta').set('sessionEndedAt', 2000);
    await flushSetImmediate();
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it('re-fires on a new (later) timestamp value', async () => {
    const doc = new Y.Doc();
    const onEnded = vi.fn();

    observeSessionEnd({ doc, localParticipantId: 'p1', onEnded });

    doc.getMap('meta').set('sessionEndedAt', 3000);
    await flushSetImmediate();
    expect(onEnded).toHaveBeenCalledOnce();

    doc.getMap('meta').set('sessionEndedAt', 4000);
    await flushSetImmediate();
    expect(onEnded).toHaveBeenCalledTimes(2);
    expect(onEnded.mock.calls[1][0].timestamp).toBe(4000);
  });

  it('onEnded is invoked after the synchronous write completes (setImmediate scheduling)', async () => {
    const doc = new Y.Doc();
    let syncCounter = 0;
    const callOrder: string[] = [];

    const onEnded = vi.fn(async () => {
      callOrder.push(`onEnded:syncCounter=${syncCounter}`);
    });

    observeSessionEnd({ doc, localParticipantId: 'p1', onEnded });

    doc.getMap('meta').set('sessionEndedAt', 5000);
    syncCounter++;
    callOrder.push(`write:syncCounter=${syncCounter}`);

    await flushSetImmediate();

    expect(onEnded).toHaveBeenCalledOnce();
    expect(callOrder[0]).toBe('write:syncCounter=1');
    expect(callOrder[1]).toContain('onEnded:syncCounter=1');
  });

  it('dispose prevents further callbacks', async () => {
    const doc = new Y.Doc();
    const onEnded = vi.fn();

    const dispose = observeSessionEnd({ doc, localParticipantId: 'p1', onEnded });
    dispose();

    doc.getMap('meta').set('sessionEndedAt', 6000);
    await flushSetImmediate();
    expect(onEnded).not.toHaveBeenCalled();
  });
});
