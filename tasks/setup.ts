import { task } from "hardhat/config";
import { setUpFunctionalSystem, setUpMinimalFunctionalSystem } from "../utils/SystemSetup";

export function load(){
    task("initialize")
      .setAction(async (args, hre) => {
          await setUpFunctionalSystem(hre, 1, false);
    });

    task("initialize:small")
        .setAction(async (args, hre) => {
            await setUpMinimalFunctionalSystem(hre);
    });

}