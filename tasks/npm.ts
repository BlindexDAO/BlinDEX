import { task } from "hardhat/config";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import * as rimraf from "rimraf";
import * as fsExtra from "fs-extra";
import { default as klaw } from "klaw-sync";
import semver from "semver";
import { typechainOutDir } from "../hardhat.compile.config";

export function load() {
  task("blindex-npm-package", "Packages type definitions and abis into npm package")
    .addParam("newVersion", "A valid semver version greater than the current one set for the package")
    .setAction(async ({ newVersion }) => {
      const packageName = "@blindex/interfaces";
      const typesSubFolder = "types";
      const abisFolder = `${packageName}/abis`;
      const packageJson = `${packageName}/package.json`;

      if (!semver.valid(newVersion)) {
        throw new Error(`You new version '${newVersion} is not a valid semver format`);
      }

      let currentVersion;
      try {
        currentVersion = JSON.parse(readFileSync(packageJson) as unknown as string).version;
      } catch (e) {
        throw new Error(`Something went wrong, you should have the file ${packageJson} in your github repo - ${e}`);
      }

      if (!semver.gt(newVersion, currentVersion)) {
        throw new Error(`New version '${newVersion}' must be greater than the existing version '${currentVersion}'`);
      }

      try {
        rimraf.sync(packageName);
      } catch {
        console.log("Couldn't sync folder using 'rimraf.sync'");
      }

      mkdirSync(packageName);
      fsExtra.copySync(typechainOutDir, `${packageName}/${typesSubFolder}`);
      const contracts = klaw("./artifacts/contracts")
        .filter((x: { path: string }) => x.path.endsWith(".json") && !x.path.endsWith(".dbg.json"))
        .map((x: { path: string }) => {
          const { abi, contractName: name } = fsExtra.readJsonSync(x.path);
          return { abi, name };
        });
      mkdirSync(abisFolder);
      for (const contract of contracts) {
        writeFileSync(`${abisFolder}/${contract.name}.json`, JSON.stringify(contract.abi), {
          encoding: "utf8"
        });
      }
      fsExtra.writeJsonSync(packageJson, {
        name: packageName,
        version: newVersion
      });
    });
}
