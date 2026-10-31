import { HarvestPrices } from "./pricesPanel/HarvestPrices";
import { PieceworkStagesPrices } from "./pricesPanel/PieceworkStagesPrices";
import { OvertimeDayConfig } from "./pricesPanel/OvertimeDayConfig";
import { PieceworkPrices } from "./pricesPanel/PieceworkPrices";
import { NormalDayPrices } from "./pricesPanel/NormalDayPrices";

// Precios por día de la labor activa: cada barra se muestra solo para su tipo
// de labor y cuando el ciclo tiene días.
export function PricesPanel() {
  return (
    <>
      <HarvestPrices />

      <PieceworkStagesPrices />

      <OvertimeDayConfig />

      <PieceworkPrices />

      <NormalDayPrices />
    </>
  );
}
