import { mapSleeperPlayer } from '@roster-loom/core';

// Smoke check: prove the workspace symlink + Jest moduleNameMapper resolve
// @roster-loom/core from inside the mobile app. If this regresses, every
// import of shared logic from mobile breaks.
describe('@roster-loom/core', () => {
  it('is importable from the mobile package', () => {
    expect(typeof mapSleeperPlayer).toBe('function');
  });
});
