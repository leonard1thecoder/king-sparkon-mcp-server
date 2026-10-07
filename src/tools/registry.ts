/**
 * Tool registry: every tool with its §17 security metadata in one place.
 */

import { adminTools } from "./admin.js";
import { affiliateTools } from "./affiliate.js";
import { artistTools } from "./artist.js";
import { customerTools } from "./customer.js";
import { kscTools } from "./ksc.js";
import { ownerTools } from "./owner.js";
import { withdrawTools } from "./withdraw.js";
import { workerTools } from "./worker.js";
import type { KingSparkonTool } from "./types.js";

export const toolDomains: Array<{ domain: string; tools: KingSparkonTool[] }> = [
  { domain: "customer", tools: customerTools },
  { domain: "ksc", tools: kscTools },
  { domain: "artist", tools: artistTools },
  { domain: "owner", tools: ownerTools },
  { domain: "worker", tools: workerTools },
  { domain: "affiliate", tools: affiliateTools },
  { domain: "withdraw", tools: withdrawTools },
  { domain: "admin", tools: adminTools },
];

export const tools: KingSparkonTool[] = toolDomains.flatMap((entry) => entry.tools);

const duplicates = tools
  .map((tool) => tool.name)
  .filter((name, index, names) => names.indexOf(name) !== index);

if (duplicates.length > 0) {
  throw new Error(`Duplicate MCP tool names: ${duplicates.join(", ")}`);
}
