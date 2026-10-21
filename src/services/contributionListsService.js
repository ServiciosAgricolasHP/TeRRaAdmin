import { createService } from "./firestoreBase";

// Listas de imposiciones (`contributionLists`): una por empleador y mes, con
// los días imponibles de cada persona por faena, para el contador.

export const contributionListsService = createService("contributionList", "contributionLists");

// Las listas, de la más nueva a la más antigua, en caché 10 minutos.
export const CONTRIBUTION_LISTS = { order: ["month", "desc"], cache: true, ttl: 10 * 60 * 1000 };
