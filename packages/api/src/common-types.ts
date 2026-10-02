// SPDX-License-Identifier: Apache-2.0

import type { CarbonSealPrivateState, Contract, Witnesses } from '@carbonseal/contract';
import type { FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';

export const carbonSealPrivateStateKey = 'carbonsealPrivateState';
export type CarbonSealPrivateStateId = typeof carbonSealPrivateStateKey;

export type CarbonSealContract = Contract<CarbonSealPrivateState, Witnesses<CarbonSealPrivateState>>;

export type CarbonSealCircuitKeys = Exclude<keyof CarbonSealContract['impureCircuits'], number | symbol>;

export type CarbonSealProviders = MidnightProviders<
  CarbonSealCircuitKeys,
  CarbonSealPrivateStateId,
  CarbonSealPrivateState
>;

export type DeployedCarbonSealContract = FoundContract<CarbonSealContract>;
