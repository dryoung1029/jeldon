// The kit's registered doctor checks. `jeldon doctor` runs these after the
// Domain Pack checks (Helix finding #10). Add project-specific checks by
// appending `{ id, run }` objects to the array.
import { kitChecks } from '@jeldon/kit-local-business/node';

export default [...kitChecks()];
