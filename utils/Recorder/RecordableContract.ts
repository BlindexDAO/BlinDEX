import { Contract } from "ethers";
import { Recorder } from "./Recorder";

//todo ag refactor (investigate 'self')
// Extended Contract class that allows for simple transaction recording to Recorder class
// to record a transaction call recordableContract.record.METHOD_NAME(parameters)
export class RecordableContract<T extends Contract> extends Contract {
  record = {
    self: this
  } as unknown as T;

  // Recorder that transactions are recorded on
  private recorder: Recorder;

  constructor(contract: T, recorder_: Recorder) {
    super(contract.address, contract.interface, contract.provider !== undefined ? contract.provider : contract.signer);

    if (contract.address === undefined) {
      throw "contract.address undefined";
    }
    this.recorder = recorder_;

    const fnKeys: string[] = Object.keys(this.functions);
    for (let i = 0; i < fnKeys.length; i++) {
      if (fnKeys[i] === "self") {
        throw "contract has a function with name that is protected";
      }

      /* eslint-disable  @typescript-eslint/no-explicit-any */
      (this.record as any)[fnKeys[i]] = async function (...args: any[]) {
        console.log(`recording with args ${args}`);
        const toRecord = await this.self.populateTransaction[fnKeys[i]](...args);
        this.self.recorder.record(toRecord);
      };
    }
  }
}
