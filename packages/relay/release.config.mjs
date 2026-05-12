import { buildReleaserc } from '../../scripts/release/build-releaserc.mjs';

export default buildReleaserc({
  pkg: 'relay',
  deployWorkflow: 'deploy-relay.yml',
});
