import {randomBytes} from "node:crypto";
export function generateLineLinkCode(){return randomBytes(6).toString("hex").toUpperCase().slice(0,8)}
