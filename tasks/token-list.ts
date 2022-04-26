import { TokenList, schema, TokenInfo, Version } from "@uniswap/token-lists";
import Ajv, { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ERC20 } from "../typechain/ERC20";
import { BlindexLogoUrl, EXTERNAL_USD_STABLE, SECONDARY_EXTERNAL_USD_STABLE, tokenLogoUrl, wBTC_address, wETH_address } from "../utils/Constants";
import { getAllBDStables, getBdx, getERC20 } from "../utils/DeployedContractsHelpers";

export function load() {
  task("print:amm:tokenList").setAction(async (args, hre) => {
    const tokenList: TokenList = await generateTokenList(hre);
    const { isValid, errors } = validateTokenList(tokenList);

    if (isValid) {
      console.log(tokenList);
    } else {
      console.log("The token list is invalid", errors);
    }
  });
}

function validateTokenList(tokenList: TokenList): { isValid: boolean; errors: undefined | ErrorObject[] } {
  const ajv = new Ajv({ allErrors: true, verbose: true });
  addFormats(ajv);
  const validator = ajv.compile(schema);
  const isValid = validator(tokenList);

  let errors;
  if (validator.errors) {
    errors = validator.errors.map(error => {
      delete error.data;
      return error;
    });
  }

  return { isValid, errors };
}

async function generateTokenList(hre: HardhatRuntimeEnvironment): Promise<TokenList> {
  if (!hre.network.config.chainId) {
    throw new Error("chainId is missing in hardhat config");
  }
  const chainId = hre.network.config.chainId;

  const bdStables = await getAllBDStables(hre);
  const [bdx, wrappedNativeToken, wrappedSecondaryToken, externalUsdStable, secondaryExternalUsdStable] = await Promise.all([
    getBdx(hre),
    getERC20(hre, wETH_address[hre.network.name]),
    getERC20(hre, wBTC_address[hre.network.name]),
    getERC20(hre, EXTERNAL_USD_STABLE[hre.network.name].address),
    getERC20(hre, SECONDARY_EXTERNAL_USD_STABLE[hre.network.name].address)
  ]);

  const tokens = await Promise.all(
    [...bdStables, bdx, wrappedNativeToken, wrappedSecondaryToken, externalUsdStable, secondaryExternalUsdStable].map(token =>
      getTokenInfo(token, chainId)
    )
  );

  const tokenList: TokenList = {
    name: "Blindex Token List",
    timestamp: new Date().toISOString(),
    version: getVersion(),
    tokens,
    logoURI: BlindexLogoUrl
  };

  return tokenList;
}

async function getTokenInfo(token: ERC20, chainId: number): Promise<TokenInfo> {
  const [name, decimals, symbol] = await Promise.all([token.name(), token.decimals(), token.symbol()]);
  const tokenInfo: TokenInfo = {
    chainId,
    address: token.address,
    name,
    decimals,
    symbol,
    logoURI: tokenLogoUrl[symbol]
  };

  return tokenInfo;
}

/*
List versions must follow the rules:
- Increment major version when tokens are removed
- Increment minor version when tokens are added
- Increment patch version when tokens already on the list have minor details changed (name, symbol, logo URL, decimals)
- Changing a token address or chain ID is considered both a remove and an add, and should be a major version update
*/
function getVersion(): Version {
  const version = {
    major: 0,
    minor: 0,
    patch: 1
  };

  return version;
}
