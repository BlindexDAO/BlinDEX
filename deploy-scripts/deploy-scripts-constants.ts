import { chainIds } from "../utils/Constants";
import { TokenDeploymentData } from "./interfaces/deploy-scripts.interface";

const deploymentScriptsFolder = "deploy-scripts";

export const chainsDeployScriptsFolders = {
  [chainIds.rsk]: [`${deploymentScriptsFolder}/rsk`],
  // Our local development is based ont he deployment scripts of RSK, being the native chain of Blindex.
  // The deployment files there have different conditions basked on the chain
  [chainIds.mainnetFork]: [`${deploymentScriptsFolder}/rsk`],
  [chainIds.arbitrumTestnet]: [`${deploymentScriptsFolder}/arbitrum-testnet`]
};

// Since we're deploying the same tokens on multiple chains, having this data in a constant file will prevent mistakes of typos between chains
export const tokensDetails: TokenDeploymentData = {
  bdx: {
    symbol: "BDX",
    name: "Blindex Shares",
    contract: "BDXShares"
  }
};
