// Rango por defecto de las listas de vueltas y de resúmenes.
import { localIsoDate } from "../../utils/dates";

export const DEFAULT_HISTORY_DAYS = 90;

export const isoDateNDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localIsoDate(d);
};
