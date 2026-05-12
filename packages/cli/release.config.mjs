import { buildReleaserc } from '../../scripts/release/build-releaserc.mjs';

export default buildReleaserc({ pkg: 'cli', npmPublish: true });
