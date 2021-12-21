/**
 * This function takes an object, stringify it and then "cleans" the output from any escape characters so the output could be later on used to paste in JS/TS code directly
 * @param {object} objectToClean - An object to stringify and then clean.
 */
export function cleanStringify(objectToClean: object): string {
  return JSON.stringify(objectToClean).replace(/"([^"]+)":/g, "$1:");
}
