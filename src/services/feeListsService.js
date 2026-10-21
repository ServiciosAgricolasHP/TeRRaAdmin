import { createService } from "./firestoreBase";
import { DEFAULT_FEE_CONFIG } from "../utils/feeLists";

// Listas de honorarios (`feeLists`) y la configuración de contratos y
// honorarios (`employmentConfig/main`: la tarifa líquida por día y la
// retención).

export const feeListsService = createService("feeList", "feeLists");
export const employmentConfigService = createService("employmentConfig", "employmentConfig");

// Las listas, de la más nueva a la más antigua, en caché 10 minutos.
export const FEE_LISTS = { order: ["from", "desc"], cache: true, ttl: 10 * 60 * 1000 };

export async function getEmploymentConfig() {
  const doc = await employmentConfigService.getById("main");
  return { ...DEFAULT_FEE_CONFIG, ...(doc || {}) };
}

export const saveEmploymentConfig = (patch) => employmentConfigService.upsert("main", patch);
