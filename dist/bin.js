import { main } from "./main.js";
// The step's log line; a thrown error fails the step with its message, as any crash of the action should.
process.stdout.write(`${await main(process.env)}\n`);
