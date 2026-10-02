// SPDX-License-Identifier: Apache-2.0

import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

import * as CarbonSeal from './managed/carbonseal/contract/index.js';
import { type CarbonSealPrivateState, witnesses } from './witnesses.js';

export * from './managed/carbonseal/contract/index.js';
export * from './witnesses.js';

/** The compiled contract with its witnesses and ZK assets, ready for midnight-js. */
export const CompiledCarbonSealContract = CompiledContract.make<CarbonSeal.Contract<CarbonSealPrivateState>>(
  'CarbonSeal',
  CarbonSeal.Contract<CarbonSealPrivateState>,
).pipe(CompiledContract.withWitnesses(witnesses), CompiledContract.withCompiledFileAssets('./managed/carbonseal'));
