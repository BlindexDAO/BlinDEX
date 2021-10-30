import { task } from "hardhat/config";
import { updateOracles } from "../utils/SystemSetup";

export function load(){
    task("update:oracles")
    .setAction(async (args, hre) => {
        await updateOracles(hre);
  });
}