import { expect } from "chai";

export async function expectToFail(fun: () => any, message: string){
    await expect((async () => {
        await fun();
    })()).to.be.rejectedWith(message);
}